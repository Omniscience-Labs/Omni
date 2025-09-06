#!/usr/bin/env python3
import asyncio
import argparse
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.services.supabase import DBConnection
from core.utils.logger import logger
from core.billing_config import (
    FREE_TIER_INITIAL_CREDITS, 
    get_monthly_credits,
    get_tier_by_name,
    TIERS
)

class CreditBackfillFixer:
    def __init__(self):
        self.db = DBConnection()
        
    async def initialize(self):
        await self.db.initialize()
        self.client = await self.db.client
    
    async def calculate_current_month_usage(self, user_id: str) -> Decimal:
        try:
            now = datetime.now(timezone.utc)
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            
            result = await self.client.from_('credit_ledger')\
                .select('amount')\
                .eq('user_id', user_id)\
                .eq('type', 'usage')\
                .gte('created_at', month_start.isoformat())\
                .execute()
            
            total_usage = Decimal('0')
            for entry in result.data or []:
                amount = Decimal(str(entry['amount']))
                if amount < 0:
                    total_usage += abs(amount)
            
            return total_usage
            
        except Exception as e:
            logger.error(f"Error calculating usage for {user_id}: {e}")
            return Decimal('0')
    
    async def get_tier_limit(self, user_id: str) -> Decimal:
        try:
            sub_result = await self.client.schema('basejump').from_('billing_subscriptions')\
                .select('price_id, status')\
                .eq('account_id', user_id)\
                .in_('status', ['active', 'trialing'])\
                .execute()
            
            if sub_result.data and len(sub_result.data) > 0:
                account_result = await self.client.from_('credit_accounts')\
                    .select('tier')\
                    .eq('user_id', user_id)\
                    .execute()
                
                if account_result.data and len(account_result.data) > 0:
                    tier = account_result.data[0].get('tier', 'free')
                    return get_monthly_credits(tier)
            
            return FREE_TIER_INITIAL_CREDITS
            
        except Exception as e:
            logger.error(f"Error getting tier limit for {user_id}: {e}")
            return FREE_TIER_INITIAL_CREDITS
    
    async def fix_user_credits(self, user_id: str, dry_run: bool = False):
        try:
            account_result = await self.client.from_('credit_accounts')\
                .select('balance, tier')\
                .eq('user_id', user_id)\
                .execute()
            
            if not account_result.data:
                logger.warning(f"No credit account found for user {user_id}")
                return None
            
            current_balance = Decimal(str(account_result.data[0]['balance']))
            current_tier = account_result.data[0]['tier']
            
            tier_limit = await self.get_tier_limit(user_id)
            month_usage = await self.calculate_current_month_usage(user_id)
            correct_balance = tier_limit - month_usage
            
            logger.info(f"\nUser {user_id}:")
            logger.info(f"  Current Tier: {current_tier}")
            logger.info(f"  Tier Limit: ${tier_limit}")
            logger.info(f"  Month Usage: ${month_usage}")
            logger.info(f"  Current Balance: ${current_balance}")
            logger.info(f"  Correct Balance: ${correct_balance}")
            logger.info(f"  Difference: ${correct_balance - current_balance}")
            
            if abs(correct_balance - current_balance) > Decimal('0.01'):
                if not dry_run:
                    await self.client.from_('credit_accounts').update({
                        'balance': str(correct_balance)
                    }).eq('user_id', user_id).execute()
                    
                    adjustment = correct_balance - current_balance
                    await self.client.from_('credit_ledger').insert({
                        'user_id': user_id,
                        'amount': str(adjustment),
                        'balance_after': str(correct_balance),
                        'type': 'adjustment',
                        'description': f'Credit backfill correction: Tier limit (${tier_limit}) - Usage (${month_usage})',
                        'metadata': {
                            'old_balance': str(current_balance),
                            'tier_limit': str(tier_limit),
                            'month_usage': str(month_usage),
                            'correction_type': 'backfill_fix'
                        }
                    }).execute()
                    
                    logger.info(f"  ✅ Fixed! Adjusted by ${adjustment}")
                else:
                    logger.info(f"  🔍 DRY RUN: Would adjust by ${correct_balance - current_balance}")
            else:
                logger.info(f"  ✅ Balance is correct, no adjustment needed")
            
            return {
                'user_id': user_id,
                'tier': current_tier,
                'old_balance': float(current_balance),
                'new_balance': float(correct_balance),
                'adjustment': float(correct_balance - current_balance),
                'tier_limit': float(tier_limit),
                'month_usage': float(month_usage)
            }
            
        except Exception as e:
            logger.error(f"Error fixing credits for user {user_id}: {e}")
            return None
    
    async def fix_all_users(self, dry_run: bool = False):
        try:
            result = await self.client.from_('credit_accounts')\
                .select('user_id, tier, balance')\
                .execute()
            
            if not result.data:
                logger.info("No users to process")
                return
            
            logger.info(f"Processing {len(result.data)} users...")
            
            fixed_count = 0
            total_adjustment = Decimal('0')
            
            for account in result.data:
                fix_result = await self.fix_user_credits(account['user_id'], dry_run)
                if fix_result and abs(fix_result['adjustment']) > 0.01:
                    fixed_count += 1
                    total_adjustment += Decimal(str(fix_result['adjustment']))
            
            logger.info(f"\n{'='*60}")
            logger.info(f"SUMMARY:")
            logger.info(f"  Total users processed: {len(result.data)}")
            logger.info(f"  Users needing correction: {fixed_count}")
            logger.info(f"  Total credit adjustment: ${total_adjustment}")
            if dry_run:
                logger.info(f"  🔍 DRY RUN - No changes made")
            else:
                logger.info(f"  ✅ All corrections applied")
            logger.info(f"{'='*60}\n")
            
        except Exception as e:
            logger.error(f"Error in fix_all_users: {e}")

async def main():
    parser = argparse.ArgumentParser(description='Fix credit backfilling for existing users')
    parser.add_argument('--user-id', help='Fix specific user')
    parser.add_argument('--all', action='store_true', help='Fix all users')
    parser.add_argument('--dry-run', action='store_true', help='Preview changes without applying')
    
    args = parser.parse_args()
    
    if not args.user_id and not args.all:
        parser.print_help()
        print("\nYou must specify either --user-id or --all")
        return
    
    fixer = CreditBackfillFixer()
    await fixer.initialize()
    
    if args.user_id:
        await fixer.fix_user_credits(args.user_id, dry_run=args.dry_run)
    elif args.all:
        await fixer.fix_all_users(dry_run=args.dry_run)

if __name__ == '__main__':
    asyncio.run(main()) 