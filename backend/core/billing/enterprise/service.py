"""
Enterprise Billing Service

This service handles all enterprise mode billing operations:
- Checking billing status (pool balance + user limits)
- Deducting credits from the shared pool
- Getting user usage information
- Managing the enterprise credit pool

All operations use the enterprise_* database tables and functions
created in the migration files.
"""

from decimal import Decimal
from typing import Dict, Optional, Tuple
from core.utils.config import config
from core.utils.logger import logger
from core.services.supabase import DBConnection
from core.billing.credits.calculator import (
    calculate_token_cost,
    calculate_cached_token_cost,
    calculate_cache_write_cost
)


class EnterpriseBillingService:
    """
    Service for enterprise mode billing operations.
    
    Enterprise mode uses a shared corporate credit pool instead of
    individual user subscriptions. Users have monthly spending limits
    that reset on the 1st of each month.
    """

    async def check_billing_status(
        self, 
        account_id: str,
        estimated_cost: Decimal = Decimal('0.01')
    ) -> Tuple[bool, str, Optional[str]]:
        """
        Check if a user can spend credits in enterprise mode.
        
        This checks:
        1. Enterprise pool has sufficient balance
        2. User hasn't exceeded their monthly limit
        3. User is active
        
        Args:
            account_id: The user's account ID
            estimated_cost: Minimum cost to check for (default $0.01)
            
        Returns:
            Tuple of (can_spend: bool, message: str, reservation_id: Optional[str])
        """
        try:
            db = DBConnection()
            client = await db.client
            # Call the check_enterprise_billing_status function
            result = await client.rpc(
                'check_enterprise_billing_status',
                {
                    'p_account_id': account_id,
                    'p_estimated_cost': float(estimated_cost)
                }
            ).execute()
            
            if result.data:
                status = result.data
                
                if status.get('can_spend'):
                    remaining = status.get('user_remaining', 0)
                    return True, f"Enterprise credits available. Remaining this month: ${remaining:.2f}", None
                else:
                    error_code = status.get('error_code', 'UNKNOWN')
                    error_msg = status.get('error', 'Cannot spend credits')
                    
                    if error_code == 'INSUFFICIENT_POOL_BALANCE':
                        return False, "Enterprise credit pool is empty. Please contact your administrator.", None
                    elif error_code == 'MONTHLY_LIMIT_EXCEEDED':
                        remaining = status.get('remaining', 0)
                        limit = status.get('monthly_limit', 100)
                        return False, f"Monthly spending limit of ${limit:.2f} exceeded. Remaining: ${remaining:.2f}", None
                    elif error_code == 'USER_DEACTIVATED':
                        return False, "Your account has been deactivated. Please contact your administrator.", None
                    elif error_code == 'ENTERPRISE_NOT_INITIALIZED':
                        return False, "Enterprise billing not configured. Please contact your administrator.", None
                    else:
                        return False, error_msg, None
            else:
                logger.error(f"[ENTERPRISE] Empty response from check_enterprise_billing_status for {account_id}")
                return False, "Unable to verify enterprise billing status", None
                    
        except Exception as e:
            logger.error(f"[ENTERPRISE] Error checking billing status for {account_id}: {e}")
            return False, f"Error checking enterprise billing: {str(e)}", None

    async def deduct_credits(
        self,
        account_id: str,
        prompt_tokens: int,
        completion_tokens: int,
        model: str,
        message_id: Optional[str] = None,
        thread_id: Optional[str] = None,
        cache_read_tokens: int = 0,
        cache_creation_tokens: int = 0
    ) -> Dict:
        """
        Deduct credits from the enterprise pool for usage.
        
        This calculates the cost using the same pricing as SaaS mode,
        then deducts from the shared enterprise pool and updates
        the user's monthly usage.
        
        Args:
            account_id: The user's account ID
            prompt_tokens: Number of prompt tokens used
            completion_tokens: Number of completion tokens used
            model: The model name used
            message_id: Optional message ID for tracking
            thread_id: Optional thread ID for tracking
            cache_read_tokens: Number of cached read tokens
            cache_creation_tokens: Number of cache creation tokens
            
        Returns:
            Dict with success status, cost, and new balances
        """
        try:
            # Calculate cost using the same logic as SaaS billing
            if cache_read_tokens > 0 or cache_creation_tokens > 0:
                non_cached_prompt_tokens = prompt_tokens - cache_read_tokens - cache_creation_tokens
                
                cached_read_cost = Decimal('0')
                cache_write_cost = Decimal('0')

                if cache_read_tokens > 0:
                    cached_read_cost = calculate_cached_token_cost(cache_read_tokens, model)
                
                if cache_creation_tokens > 0:
                    cache_write_cost = calculate_cache_write_cost(cache_creation_tokens, model, cache_ttl="5m")
                
                non_cached_cost = calculate_token_cost(non_cached_prompt_tokens, completion_tokens, model)
                cost = cached_read_cost + cache_write_cost + non_cached_cost
                
                logger.info(f"[ENTERPRISE] Cost breakdown: cached_read=${cached_read_cost:.6f} + cache_write=${cache_write_cost:.6f} + regular=${non_cached_cost:.6f} = total=${cost:.6f}")
            else:
                cost = calculate_token_cost(prompt_tokens, completion_tokens, model)
            
            if cost <= 0:
                logger.warning(f"[ENTERPRISE] Zero cost calculated for {model} with {prompt_tokens}+{completion_tokens} tokens")
                return {
                    'success': True,
                    'cost': 0,
                    'new_balance': await self._get_pool_balance(),
                    'message': 'Zero cost - no deduction needed'
                }
            
            logger.info(f"[ENTERPRISE] Calculated cost: ${cost:.6f} for {model}")
            
            # Calculate total tokens
            total_tokens = prompt_tokens + completion_tokens
            
            db = DBConnection()
            client = await db.client
            # Call the atomic enterprise credit deduction function
            result = await client.rpc(
                'use_enterprise_credits_simple',
                {
                    'p_account_id': account_id,
                    'p_cost': float(cost),
                    'p_model_name': model,
                    'p_tokens_used': total_tokens,
                    'p_prompt_tokens': prompt_tokens,
                    'p_completion_tokens': completion_tokens,
                    'p_thread_id': thread_id,
                    'p_message_id': message_id
                }
            ).execute()
            
            if result.data:
                response = result.data
                
                if response.get('success'):
                    logger.info(
                        f"[ENTERPRISE] Deducted ${cost:.6f} from pool for user {account_id}. "
                        f"Pool balance: ${response.get('new_pool_balance', 0):.2f}, "
                        f"User usage: ${response.get('new_user_usage', 0):.2f}/{response.get('user_monthly_limit', 100):.2f}"
                    )
                    return {
                        'success': True,
                        'cost': float(cost),
                        'new_balance': response.get('new_pool_balance', 0),
                        'user_usage': response.get('new_user_usage', 0),
                        'user_limit': response.get('user_monthly_limit', 100),
                        'user_remaining': response.get('user_remaining', 0),
                        'usage_id': response.get('usage_id')
                    }
                else:
                    error_code = response.get('error_code', 'UNKNOWN')
                    error_msg = response.get('error', 'Deduction failed')
                    logger.error(f"[ENTERPRISE] Deduction failed for {account_id}: {error_msg}")
                    return {
                        'success': False,
                        'cost': float(cost),
                        'error': error_msg,
                        'error_code': error_code
                    }
            else:
                logger.error(f"[ENTERPRISE] Empty response from use_enterprise_credits_simple for {account_id}")
                return {
                    'success': False,
                    'cost': float(cost),
                    'error': 'Empty response from database'
                }
                    
        except Exception as e:
            logger.error(f"[ENTERPRISE] Error deducting credits for {account_id}: {e}")
            return {
                'success': False,
                'cost': 0,
                'error': str(e)
            }

    async def get_user_status(self, account_id: str) -> Dict:
        """
        Get a user's enterprise billing status.
        
        Args:
            account_id: The user's account ID
            
        Returns:
            Dict with monthly_limit, current_usage, remaining, is_active, etc.
        """
        try:
            db = DBConnection()
            client = await db.client
            result = await client.rpc(
                'get_enterprise_user_status',
                {'p_account_id': account_id}
            ).execute()
            
            if result.data:
                return result.data
            else:
                # Return defaults for new users
                return {
                    'monthly_limit': 100.00,
                    'current_month_usage': 0.00,
                    'remaining': 100.00,
                    'is_active': True,
                    'is_new_user': True
                }
                    
        except Exception as e:
            logger.error(f"[ENTERPRISE] Error getting user status for {account_id}: {e}")
            return {
                'error': str(e),
                'monthly_limit': 100.00,
                'current_month_usage': 0.00,
                'remaining': 100.00,
                'is_active': True
            }

    async def get_pool_status(self) -> Dict:
        """
        Get the enterprise credit pool status.
        
        Returns:
            Dict with credit_balance, total_loaded, total_used, etc.
        """
        try:
            db = DBConnection()
            client = await db.client
            result = await client.rpc('get_enterprise_pool_status', {}).execute()
            
            if result.data:
                return result.data
            else:
                return {
                    'credit_balance': 0,
                    'total_loaded': 0,
                    'total_used': 0,
                    'error': 'Not initialized'
                }
                    
        except Exception as e:
            logger.error(f"[ENTERPRISE] Error getting pool status: {e}")
            return {
                'credit_balance': 0,
                'total_loaded': 0,
                'total_used': 0,
                'error': str(e)
            }

    async def _get_pool_balance(self) -> float:
        """Get just the pool balance as a float."""
        status = await self.get_pool_status()
        return float(status.get('credit_balance', 0))

    async def load_credits(
        self,
        amount: Decimal,
        performed_by: str,
        description: str = "Credit load"
    ) -> Dict:
        """
        Load credits into the enterprise pool.
        
        Args:
            amount: Amount to add (must be positive)
            performed_by: Email or ID of the admin performing the action
            description: Optional description of the load
            
        Returns:
            Dict with success status and new balance
        """
        try:
            db = DBConnection()
            client = await db.client
            result = await client.rpc(
                'load_enterprise_credits',
                {
                    'p_amount': float(amount),
                    'p_performed_by': performed_by,
                    'p_description': description
                }
            ).execute()
            
            if result.data:
                response = result.data
                if response.get('success'):
                    logger.info(f"[ENTERPRISE] Loaded ${amount:.2f} by {performed_by}. New balance: ${response.get('new_balance', 0):.2f}")
                return response
            else:
                return {'success': False, 'error': 'Empty response'}
                    
        except Exception as e:
            logger.error(f"[ENTERPRISE] Error loading credits: {e}")
            return {'success': False, 'error': str(e)}

    async def negate_credits(
        self,
        amount: Decimal,
        performed_by: str,
        description: str = "Credit negation"
    ) -> Dict:
        """
        Negate (remove) credits from the enterprise pool.
        
        Args:
            amount: Amount to remove (must be positive)
            performed_by: Email or ID of the admin performing the action
            description: Optional description of the negation
            
        Returns:
            Dict with success status and new balance
        """
        try:
            db = DBConnection()
            client = await db.client
            result = await client.rpc(
                'negate_enterprise_credits',
                {
                    'p_amount': float(amount),
                    'p_performed_by': performed_by,
                    'p_description': description
                }
            ).execute()
            
            if result.data:
                response = result.data
                if response.get('success'):
                    logger.info(f"[ENTERPRISE] Negated ${amount:.2f} by {performed_by}. New balance: ${response.get('new_balance', 0):.2f}")
                return response
            else:
                return {'success': False, 'error': 'Empty response'}
                    
        except Exception as e:
            logger.error(f"[ENTERPRISE] Error negating credits: {e}")
            return {'success': False, 'error': str(e)}

    async def update_user_limit(
        self,
        account_id: str,
        new_limit: Decimal
    ) -> Dict:
        """
        Update a user's monthly spending limit.
        
        Args:
            account_id: The user's account ID
            new_limit: The new monthly limit
            
        Returns:
            Dict with success status and updated values
        """
        try:
            db = DBConnection()
            client = await db.client
            result = await client.rpc(
                'update_enterprise_user_limit',
                {
                    'p_account_id': account_id,
                    'p_new_limit': float(new_limit)
                }
            ).execute()
            
            if result.data:
                return result.data
            else:
                return {'success': False, 'error': 'Empty response'}
                    
        except Exception as e:
            logger.error(f"[ENTERPRISE] Error updating user limit for {account_id}: {e}")
            return {'success': False, 'error': str(e)}

    async def provision_user(
        self,
        account_id: str,
        monthly_limit: Decimal = Decimal('100.00'),
        is_active: bool = True
    ) -> Dict:
        """
        Provision a new user for enterprise mode.
        
        This creates the enterprise_user_limits record and ensures
        a credit_accounts row exists (with balance 0).
        
        Args:
            account_id: The user's account ID
            monthly_limit: Monthly spending limit (default $100)
            is_active: Whether the user is active
            
        Returns:
            Dict with success status
        """
        try:
            db = DBConnection()
            client = await db.client
            result = await client.rpc(
                'provision_enterprise_user',
                {
                    'p_account_id': account_id,
                    'p_monthly_limit': float(monthly_limit),
                    'p_is_active': is_active
                }
            ).execute()
            
            if result.data:
                logger.info(f"[ENTERPRISE] Provisioned user {account_id} with limit ${monthly_limit:.2f}")
                return result.data
            else:
                return {'success': False, 'error': 'Empty response'}
                    
        except Exception as e:
            logger.error(f"[ENTERPRISE] Error provisioning user {account_id}: {e}")
            return {'success': False, 'error': str(e)}

    async def deactivate_user(self, account_id: str) -> Dict:
        """Deactivate an enterprise user."""
        try:
            db = DBConnection()
            client = await db.client
            result = await client.rpc(
                'deactivate_enterprise_user',
                {'p_account_id': account_id}
            ).execute()
            
            if result.data:
                logger.info(f"[ENTERPRISE] Deactivated user {account_id}")
                return result.data
            else:
                return {'success': False, 'error': 'Empty response'}
                    
        except Exception as e:
            logger.error(f"[ENTERPRISE] Error deactivating user {account_id}: {e}")
            return {'success': False, 'error': str(e)}

    async def reactivate_user(self, account_id: str) -> Dict:
        """Reactivate an enterprise user."""
        try:
            db = DBConnection()
            client = await db.client
            result = await client.rpc(
                'reactivate_enterprise_user',
                {'p_account_id': account_id}
            ).execute()
            
            if result.data:
                logger.info(f"[ENTERPRISE] Reactivated user {account_id}")
                return result.data
            else:
                return {'success': False, 'error': 'Empty response'}
                    
        except Exception as e:
            logger.error(f"[ENTERPRISE] Error reactivating user {account_id}: {e}")
            return {'success': False, 'error': str(e)}


# Singleton instance
enterprise_billing_service = EnterpriseBillingService()
