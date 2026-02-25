from typing import Dict
import stripe # type: ignore

from core.services.supabase import DBConnection
from core.utils.logger import logger
from core.utils.cache import Cache
from core.billing.external.stripe import StripeAPIWrapper

class SubscriptionSyncHandler:
    @staticmethod
    async def sync_subscription(account_id: str) -> Dict:
        db = DBConnection()
        client = await db.client
        
        credit_result = await client.from_('credit_accounts').select(
            'stripe_subscription_id, tier'
        ).eq('account_id', account_id).execute()

        subscription_id = (credit_result.data[0].get('stripe_subscription_id') if credit_result.data else None)
        current_tier = (credit_result.data[0].get('tier') if credit_result.data else 'none') or 'none'

        # Always use recovery when there is no stored subscription, or when the stored
        # subscription is for a free/no-value tier — the user may have upgraded and the
        # webhook hasn't landed yet (or landed on the wrong subscription).
        if not subscription_id or current_tier in ('none', 'free'):
            logger.info(
                f"[SYNC] account={account_id} tier={current_tier} sub={subscription_id} "
                f"— using recovery path to find best active subscription"
            )
            return await SubscriptionSyncHandler._recover_subscription_from_stripe(
                account_id, client
            )
        
        try:
            logger.info(f"[SYNC] account={account_id} tier={current_tier} — syncing stored subscription {subscription_id}")
            subscription = await StripeAPIWrapper.retrieve_subscription(subscription_id)
            
            from .lifecycle import SubscriptionLifecycleHandler
            await SubscriptionLifecycleHandler.handle_subscription_change(subscription)
            
            await Cache.invalidate(f"subscription_tier:{account_id}")
            await Cache.invalidate(f"credit_balance:{account_id}")
            await Cache.invalidate(f"credit_summary:{account_id}")
            
            return {
                'success': True,
                'message': 'Subscription synced successfully',
                'status': subscription.status
            }
            
        except stripe.error.StripeError as e:
            logger.error(f"Error retrieving subscription {subscription_id}: {e}")
            return {'success': False, 'message': f'Stripe error: {str(e)}'}

    @staticmethod
    async def _recover_subscription_from_stripe(account_id: str, client) -> Dict:
        """
        Recovery path: look up ALL active subscriptions for this Stripe customer and
        apply the highest-value one (prefer paid over free).
        
        This fixes two scenarios:
        1. Webhook never fired — credit_accounts still shows tier='none' / sub=null.
        2. A free-tier subscription was stored first, but the user also has a paid
           subscription (e.g. paid $20 after accidentally clicking 'free').
        """
        try:
            customer_result = await client.schema('basejump').from_('billing_customers')\
                .select('id')\
                .eq('account_id', account_id)\
                .execute()

            if not customer_result.data:
                return {'success': False, 'message': 'No billing customer found. Cannot recover.'}

            stripe_customer_id = customer_result.data[0]['id']
            subs = await StripeAPIWrapper.safe_stripe_call(
                stripe.Subscription.list_async,
                customer=stripe_customer_id,
                status='active',
                limit=10
            )

            if not subs.data:
                return {'success': False, 'message': 'No active Stripe subscription found for this account.'}

            # Pick the subscription with the highest monthly price so we never
            # accidentally apply a free ($0) subscription when a paid one also exists.
            best_subscription = subs.data[0]
            best_amount = -1
            for sub in subs.data:
                try:
                    amount = sub['items']['data'][0]['price'].get('unit_amount', 0) or 0
                    sub_id = sub['id']
                    price_id = sub['items']['data'][0]['price']['id']
                    logger.info(
                        f"[SYNC RECOVERY] Candidate subscription {sub_id} "
                        f"price={price_id} unit_amount={amount}"
                    )
                    if amount > best_amount:
                        best_amount = amount
                        best_subscription = sub
                except (KeyError, IndexError, TypeError):
                    continue

            subscription = best_subscription
            logger.info(
                f"[SYNC RECOVERY] Selected subscription {subscription.id} "
                f"(unit_amount={best_amount}) for account {account_id}"
            )

            from .lifecycle import SubscriptionLifecycleHandler
            await SubscriptionLifecycleHandler.handle_subscription_change(subscription)

            from core.billing.shared.cache_utils import invalidate_account_state_cache
            await invalidate_account_state_cache(account_id)

            return {
                'success': True,
                'message': 'Recovered and synced subscription from Stripe',
                'status': subscription.status
            }

        except stripe.error.StripeError as e:
            logger.error(f"[SYNC RECOVERY] Stripe error for {account_id}: {e}")
            return {'success': False, 'message': f'Stripe error: {str(e)}'}
        except Exception as e:
            logger.error(f"[SYNC RECOVERY] Error recovering subscription for {account_id}: {e}", exc_info=True)
            return {'success': False, 'message': str(e)}