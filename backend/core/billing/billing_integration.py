from decimal import Decimal
from typing import Optional, Dict, Tuple, List
from core.billing.api import calculate_token_cost
from core.billing.credit_manager import credit_manager
from core.utils.config import config, EnvMode
from core.utils.logger import logger
from core.services.supabase import DBConnection

class BillingIntegration:
    @staticmethod
    async def check_and_reserve_credits(account_id: str, estimated_tokens: int = 10000) -> Tuple[bool, str, Optional[str]]:
        if config.ENV_MODE == EnvMode.LOCAL:
            return True, "Local mode", None
        
        # Check if we're in enterprise mode to route appropriately
        if config.ENTERPRISE_MODE:
            # Enterprise mode: use unified billing wrapper
            from core.services.billing_wrapper import check_billing_status_unified
            
            db = DBConnection()
            client = await db.client
            
            can_run, message, subscription = await check_billing_status_unified(client, account_id)
            
            if can_run:
                logger.debug(f"[BILLING] Enterprise credit check passed for user {account_id}: {message}")
                return True, message, None
            else:
                logger.debug(f"[BILLING] Enterprise credit check failed for user {account_id}: {message}")
                return False, message, None
        else:
            # Non-enterprise mode: use original credit manager logic
            balance_info = await credit_manager.get_balance(account_id)
            balance = Decimal(str(balance_info.get('total', 0)))
            # Use a minimum threshold that covers a typical LLM turn (~$0.25). A lower value
            # (e.g. $0.10) allowed a free-loop: user with e.g. $0.14 passes pre-flight,
            # gets one response, deduction fails (no partial deduct), balance unchanged, repeat.
            estimated_cost = Decimal('0.25')
            if balance < estimated_cost:
                return False, f"Insufficient credits. Balance: ${balance:.2f}, Required: ~${estimated_cost:.2f}", None
            return True, f"Credits available: ${balance:.2f}", None
    
    @staticmethod
    async def deduct_usage(
        account_id: str,
        prompt_tokens: int,
        completion_tokens: int,
        model: str,
        message_id: Optional[str] = None,
        thread_id: Optional[str] = None,
        cache_read_tokens: int = 0,
        cache_creation_tokens: int = 0
    ) -> Dict:
        # DEBUG: Log exactly what values we receive
        logger.info(f"🔍 DEDUCT_USAGE CALLED: prompt={prompt_tokens}, completion={completion_tokens}, cache_read={cache_read_tokens}, cache_creation={cache_creation_tokens}, model={model}, message_id={message_id}")
        if config.ENV_MODE == EnvMode.LOCAL:
            return {'success': True, 'cost': 0, 'new_balance': 999999}

        from decimal import Decimal
        
        # Calculate cache creation cost at full input rate (no discount)
        cache_creation_cost = Decimal('0')
        if cache_creation_tokens > 0:
            cache_creation_cost = calculate_token_cost(cache_creation_tokens, 0, model)
        
        if cache_read_tokens > 0:
            # Calculate discounted cache read cost 
            non_cached_prompt_tokens = prompt_tokens - cache_read_tokens
            
            model_lower = model.lower()
            if any(provider in model_lower for provider in ['anthropic', 'claude', 'sonnet']):
                cache_discount = Decimal('0.1')  # 90% discount for Claude
            elif any(provider in model_lower for provider in ['gpt', 'openai', 'gpt-4o']):
                cache_discount = Decimal('0.5')  # 50% discount for OpenAI
            else:
                cache_discount = Decimal('0.5')
            
            cached_cost = calculate_token_cost(cache_read_tokens, 0, model)
            cached_cost = cached_cost * cache_discount
            non_cached_cost = calculate_token_cost(non_cached_prompt_tokens, completion_tokens, model)
            cost = cached_cost + non_cached_cost + cache_creation_cost
            
            logger.info(f"[BILLING] Cost breakdown: cached=${cached_cost:.6f} + regular=${non_cached_cost:.6f} + cache_creation=${cache_creation_cost:.6f} = total=${cost:.6f}")
        else:
            # No cache read, but may have cache creation
            regular_cost = calculate_token_cost(prompt_tokens, completion_tokens, model)
            cost = regular_cost + cache_creation_cost
            
            if cache_creation_tokens > 0:
                logger.info(f"[BILLING] Cost breakdown: regular=${regular_cost:.6f} + cache_creation=${cache_creation_cost:.6f} = total=${cost:.6f}")
            else:
                logger.info(f"[BILLING] Cost: regular=${regular_cost:.6f}")
        
        if cost <= 0:
            logger.warning(f"Zero cost calculated for {model} with {prompt_tokens}+{completion_tokens} tokens")
            return {'success': True, 'cost': 0}
        
        logger.info(f"[BILLING] Calculated cost: ${cost:.6f} for {model}")
        
# Check if we're in enterprise mode to route appropriately
        if config.ENTERPRISE_MODE:
            # Enterprise mode: use unified billing wrapper
            from core.services.billing_wrapper import handle_usage_unified
            
            db = DBConnection()
            client = await db.client
            
            # Create cache-aware description for enterprise billing
            description_parts = [f"{model}: {prompt_tokens}+{completion_tokens} tokens"]
            if cache_read_tokens > 0:
                description_parts.append(f"(cached: {cache_read_tokens})")
            if cache_creation_tokens > 0:
                description_parts.append(f"(cache_creation: {cache_creation_tokens})")
            cache_description = " ".join(description_parts)
            
            success, message = await handle_usage_unified(
                client=client,
                account_id=account_id,
                token_cost=cost,
                thread_id=thread_id,
                message_id=message_id,
                model=model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                description=cache_description,  # Add cache info to description
                cache_read_tokens=cache_read_tokens,  # Pass cache tokens if supported
                cache_creation_tokens=cache_creation_tokens
            )
            
            if success:
                if cache_read_tokens > 0:
                    logger.info(f"[BILLING] Enterprise: Successfully deducted ${cost:.6f} from user {account_id} with 🎯 cache savings (cached: {cache_read_tokens} tokens): {message}")
                else:
                    logger.info(f"[BILLING] Enterprise: Successfully deducted ${cost:.6f} from user {account_id}: {message}")
                
                # Enterprise mode doesn't track individual balance details, use defaults for backward compatibility
                result = {
                    'success': True,
                    'new_total': 0,
                    'from_expiring': 0,
                    'from_non_expiring': 0,
                    'transaction_id': f"enterprise_{account_id}_{message_id}",
                    'cache_read_tokens': cache_read_tokens,
                    'cache_creation_tokens': cache_creation_tokens
                }
            else:
                logger.error(f"[BILLING] Enterprise: Failed to deduct credits for user {account_id}: {message}")
                result = {
                    'success': False,
                    'new_total': 0,
                    'from_expiring': 0,
                    'from_non_expiring': 0,
                    'error': message
                }
        else:
            # Non-enterprise mode: use original credit manager logic with cache-aware description
            description_parts = [f"{model}: {prompt_tokens}+{completion_tokens} tokens"]
            if cache_read_tokens > 0:
                description_parts.append(f"(cached: {cache_read_tokens})")
            if cache_creation_tokens > 0:
                description_parts.append(f"(cache_creation: {cache_creation_tokens})")
            cache_description = " ".join(description_parts)
            
            result = await credit_manager.use_credits(
                account_id=account_id,
                amount=cost,
                description=cache_description,
                thread_id=None,
                message_id=message_id
            )
            
            if result.get('success'):
                if cache_read_tokens > 0:
                    logger.info(f"[BILLING] SAAS: Successfully deducted ${cost:.6f} from user {account_id} with 🎯 cache savings (cached: {cache_read_tokens} tokens). New balance: ${result.get('new_total', 0):.2f} (expiring: ${result.get('from_expiring', 0):.2f}, non-expiring: ${result.get('from_non_expiring', 0):.2f})")
                else:
                    logger.info(f"[BILLING] SAAS: Successfully deducted ${cost:.6f} from user {account_id}. New balance: ${result.get('new_total', 0):.2f} (expiring: ${result.get('from_expiring', 0):.2f}, non-expiring: ${result.get('from_non_expiring', 0):.2f})")
            else:
                logger.error(f"[BILLING] SAAS: Failed to deduct credits for user {account_id}: {result.get('error')}")
        
        # Return in original format for backward compatibility with cache information
        return {
            'success': result.get('success', False),
            'cost': float(cost),
            'new_balance': result.get('new_total', 0),
            'from_expiring': result.get('from_expiring', 0),
            'from_non_expiring': result.get('from_non_expiring', 0),
            'transaction_id': result.get('transaction_id'),
            'cache_read_tokens': cache_read_tokens,
            'cache_creation_tokens': cache_creation_tokens
        }

    @staticmethod
    async def check_model_and_billing_access(
        account_id: str, 
        model_name: str,
        client = None
    ) -> Tuple[bool, str, Dict]:
        """
        Unified function to check both model access and billing status.
        Handles both enterprise and SaaS modes properly.
        
        Args:
            account_id: User's account ID
            model_name: Model to check access for
            client: Optional Supabase client
            
        Returns:
            Tuple of (can_proceed, error_message, context_info)
            context_info contains allowed_models, tier_info, etc.
        """
        # Skip all checks in local development mode
        if config.ENV_MODE == EnvMode.LOCAL:
            logger.debug("Running in local development mode - skipping all billing and model access checks")
            return True, "Local development mode", {"local_mode": True}
        
        try:
            # Handle enterprise mode vs SaaS mode
            if config.ENTERPRISE_MODE:
                logger.debug(f"Enterprise mode enabled for account {account_id}")
                # Use enterprise billing wrapper for both model and billing checks
                from core.services.billing_wrapper import check_billing_status_unified, can_use_model_unified
                
                if not client:
                    db = DBConnection()
                    client = await db.client
                
                # Check model access for enterprise
                can_use, model_message, allowed_models = await can_use_model_unified(client, account_id, model_name)
                if not can_use:
                    return False, model_message, {
                        "allowed_models": allowed_models or [],
                        "error_type": "model_access_denied",
                        "enterprise_mode": True
                    }
                
                # Check billing status for enterprise
                can_run, message, subscription = await check_billing_status_unified(client, account_id)
                if not can_run:
                    return False, f"Enterprise billing check failed: {message}", {
                        "error_type": "insufficient_credits",
                        "enterprise_mode": True
                    }
                
                # All enterprise checks passed
                return True, "Enterprise access granted", {
                    "enterprise_mode": True,
                    "allowed_models": allowed_models
                }
            
            else:
                logger.debug(f"SaaS mode enabled for account {account_id}")
                # Use SaaS billing for model and billing checks
                from core.billing.subscription_service import subscription_service
                from core.billing import is_model_allowed
                
                # Get user's subscription tier
                tier_info = await subscription_service.get_user_subscription_tier(account_id)
                tier_name = tier_info['name']
                
                # Check model access
                if not is_model_allowed(tier_name, model_name):
                    available_models = tier_info.get('models', [])
                    return False, f"Your current subscription plan does not include access to {model_name}. Please upgrade your subscription.", {
                        "allowed_models": available_models,
                        "tier_info": tier_info,
                        "error_type": "model_access_denied"
                    }
                
                # Check billing/credits
                can_run, message, reservation_id = await BillingIntegration.check_and_reserve_credits(account_id)
                if not can_run:
                    return False, f"Billing check failed: {message}", {
                        "tier_info": tier_info,
                        "error_type": "insufficient_credits"
                    }
                
                # All SaaS checks passed
                return True, "Access granted", {
                    "tier_info": tier_info,
                    "reservation_id": reservation_id
                }
            
        except Exception as e:
            logger.error(f"Error in unified billing check for user {account_id}: {e}")
            return False, f"Error checking access: {str(e)}", {"error_type": "system_error"}

billing_integration = BillingIntegration() 