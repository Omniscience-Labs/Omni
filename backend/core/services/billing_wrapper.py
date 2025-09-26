"""
Billing wrapper service that routes requests between Stripe and Enterprise billing.

This service acts as a unified interface that automatically determines whether to use
the standard Stripe billing system or the enterprise credit-based billing system
based on:
1. ENTERPRISE_MODE configuration flag
2. Account's enterprise membership status

This allows the rest of the codebase to remain unchanged while supporting both
billing systems seamlessly.
"""

from typing import Tuple, Optional, Dict, Any
import asyncio

from core.utils.logger import logger, structlog
from core.utils.config import config

# Import new Suna billing functions (replacing deleted core.services.billing)
from core.billing.subscription_service import subscription_service
from core.billing.credit_manager import credit_manager
from core.billing import is_model_allowed

# Import enterprise billing service
from core.services.enterprise_billing import enterprise_billing


async def check_billing_status_unified(client, account_id: str) -> Tuple[bool, str, Optional[Dict]]:
    """
    Unified billing status check that routes to the appropriate billing system.
    
    When ENTERPRISE_MODE is enabled: ALL accounts use enterprise billing
    When ENTERPRISE_MODE is disabled: All accounts use Stripe billing
    
    Args:
        client: Supabase client (maintained for API compatibility)
        account_id: The basejump account ID to check
        
    Returns:
        Tuple[bool, str, Optional[Dict]]: (can_run, message, subscription_info)
    """
    logger.debug(f"[BILLING WRAPPER] check_billing_status_unified called for account {account_id}")
    
    try:
        # Debug: Check the actual value of ENTERPRISE_MODE
        logger.debug(f"ENTERPRISE_MODE value: {config.ENTERPRISE_MODE} (type: {type(config.ENTERPRISE_MODE)})")
        
        # If enterprise mode is enabled, ALL accounts are enterprise accounts
        if config.ENTERPRISE_MODE:
            logger.debug(f"Enterprise mode enabled, using enterprise billing for account {account_id}")
            result = await enterprise_billing.check_billing_status(account_id)
            logger.debug(f"Enterprise billing result for {account_id}: {result}")
            return result
        else:
            # Enterprise mode disabled, use Suna's new billing system
            logger.debug(f"Enterprise mode disabled, using Suna billing for account {account_id}")
            from core.billing.billing_integration import billing_integration
            
            # Use the new unified billing check (SaaS mode)
            can_run, message, reservation_id = await billing_integration.check_and_reserve_credits(account_id)
            return can_run, message, None  # Return format compatible with old function
            
    except Exception as e:
        logger.error(
            f"Error in unified billing status check for account {account_id}: {e}",
            account_id=account_id,
            error=str(e),
            exc_info=True
        )
        # Fall back to Stripe billing on error
        try:
            logger.debug(f"Falling back to Suna billing for account {account_id} due to error: {e}")
            from core.billing.billing_integration import billing_integration
            can_run, message, reservation_id = await billing_integration.check_and_reserve_credits(account_id)
            return can_run, message, None
        except Exception as fallback_error:
            logger.error(f"Fallback to Suna billing also failed: {fallback_error}")
            return False, f"Billing system error: {str(e)}", None


async def handle_usage_unified(
    client,
    account_id: str,
    token_cost: float,
    thread_id: str = None,
    message_id: str = None,
    model: str = None,
    prompt_tokens: int = None,
    completion_tokens: int = None,
    description: str = None,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0
) -> Tuple[bool, str]:
    """
    Unified usage handling that routes to the appropriate billing system.
    
    When ENTERPRISE_MODE is enabled: ALL accounts use enterprise credits
    When ENTERPRISE_MODE is disabled: All accounts use Stripe billing
    
    Args:
        client: Supabase client (maintained for API compatibility)
        account_id: The basejump account ID
        token_cost: Cost in dollars to charge (already includes cache discounts)
        thread_id: Optional thread ID for tracking
        message_id: Optional message ID for tracking
        model: Optional model name for tracking
        prompt_tokens: Optional prompt tokens count for detailed tracking
        completion_tokens: Optional completion tokens count for detailed tracking
        description: Optional description including cache info
        cache_read_tokens: Number of tokens read from cache (for tracking)
        cache_creation_tokens: Number of tokens used for cache creation (for tracking)
        
    Returns:
        Tuple[bool, str]: (success, message)
    """
    try:
        # If enterprise mode is enabled, ALL accounts use enterprise credits
        if config.ENTERPRISE_MODE:
            cache_info = ""
            if cache_read_tokens > 0:
                cache_info = f" (🎯 cached: {cache_read_tokens} tokens)"
            
            logger.debug(
                f"Enterprise mode enabled, using enterprise credits for account {account_id}{cache_info}",
                account_id=account_id,
                token_cost=token_cost,
                thread_id=thread_id,
                message_id=message_id,
                model=model,
                cache_read_tokens=cache_read_tokens,
                cache_creation_tokens=cache_creation_tokens
            )
            
            # Calculate total tokens for enterprise billing
            total_tokens = (prompt_tokens or 0) + (completion_tokens or 0)
            
            return await enterprise_billing.use_enterprise_credits(
                account_id=account_id,
                amount=token_cost,
                thread_id=thread_id,
                message_id=message_id,
                model_name=model,
                tokens_used=total_tokens if total_tokens > 0 else None
            )
        else:
            # Enterprise mode disabled, use Suna's new billing system
            logger.debug(f"Enterprise mode disabled, using Suna billing for usage tracking")
            from core.billing.billing_integration import billing_integration
            
            # Use the new billing integration deduct_usage method
            result = await billing_integration.deduct_usage(
                account_id=account_id,
                prompt_tokens=prompt_tokens or 0,
                completion_tokens=completion_tokens or 0,
                model=model or "unknown",
                message_id=message_id,
                thread_id=thread_id,
                cache_read_tokens=cache_read_tokens,
                cache_creation_tokens=cache_creation_tokens
            )
            return result
            
    except Exception as e:
        logger.error(
            f"Error in unified usage handling for account {account_id}: {e}",
            account_id=account_id,
            token_cost=token_cost,
            error=str(e),
            exc_info=True
        )
        
        # Fall back to Suna billing on error
        try:
            from core.billing.billing_integration import billing_integration
            return await billing_integration.deduct_usage(
                account_id=account_id,
                prompt_tokens=prompt_tokens or 0,
                completion_tokens=completion_tokens or 0,
                model=model or "unknown",
                message_id=message_id,
                thread_id=thread_id,
                cache_read_tokens=cache_read_tokens,
                cache_creation_tokens=cache_creation_tokens
            )
        except Exception as fallback_error:
            logger.error(f"Fallback to Suna usage handling also failed: {fallback_error}")
            return False, f"Usage tracking error: {str(e)}"


async def can_use_model_unified(client, account_id: str, model_name: str) -> Tuple[bool, str, Optional[list]]:
    """
    Unified model access check that routes to the appropriate billing system.
    
    When ENTERPRISE_MODE is enabled: ALL accounts get full model access
    When ENTERPRISE_MODE is disabled: Standard Stripe-based model access logic
    
    Args:
        client: Supabase client
        account_id: The basejump account ID
        model_name: The model name to check access for
        
    Returns:
        Tuple[bool, str, Optional[list]]: (can_use, message, allowed_models)
    """
    try:
        # If enterprise mode is enabled, ALL accounts get full model access
        if config.ENTERPRISE_MODE:
            logger.debug(f"Enterprise mode enabled - account {account_id} has full model access")
            return True, "Enterprise account - full model access", None
        else:
            # Use Suna's new model access logic
            tier_info = await subscription_service.get_user_subscription_tier(account_id)
            tier_name = tier_info['name']
            
            if is_model_allowed(tier_name, model_name):
                return True, f"Model access granted for tier: {tier_name}", tier_info.get('models', [])
            else:
                return False, f"Model access denied for tier: {tier_name}. Upgrade required.", tier_info.get('models', [])
        
    except Exception as e:
        logger.error(
            f"Error checking model access for account {account_id}: {e}",
            account_id=account_id,
            model_name=model_name,
            error=str(e),
            exc_info=True
        )
        # Fall back to free tier on error
        try:
            # Give free tier access as fallback
            if is_model_allowed('free', model_name):
                return True, "Fallback to free tier access", ['free']
            else:
                return False, f"Model access check error: {str(e)}", []
        except Exception as fallback_error:
            logger.error(f"Fallback model access check also failed: {fallback_error}")
            return False, f"Model access check error: {str(e)}", None


async def get_billing_info_unified(client, account_id: str) -> Dict[str, Any]:
    """
    Get comprehensive billing information for an account.
    
    When ENTERPRISE_MODE is enabled: Returns enterprise billing info for ALL accounts
    When ENTERPRISE_MODE is disabled: Returns Stripe billing info
    
    Args:
        client: Supabase client
        account_id: The basejump account ID
        
    Returns:
        Dict containing billing information
    """
    try:
        billing_info = {
            'account_id': account_id,
            'enterprise_mode_enabled': config.ENTERPRISE_MODE
        }
        
        if config.ENTERPRISE_MODE:
            # ALL accounts use enterprise billing
            user_limit = await enterprise_billing.get_user_limit(account_id)
            enterprise_balance = await enterprise_billing.get_enterprise_balance()
            
            billing_info.update({
                'billing_type': 'enterprise',
                'credit_balance': enterprise_balance['credit_balance'] if enterprise_balance else 0,
                'monthly_limit': user_limit['monthly_limit'] if user_limit else await enterprise_billing.get_default_monthly_limit(),
                'current_usage': user_limit['current_month_usage'] if user_limit else 0,
                'remaining_monthly': (user_limit['monthly_limit'] - user_limit['current_month_usage']) if user_limit else await enterprise_billing.get_default_monthly_limit(),
                'is_active': user_limit['is_active'] if user_limit else True
            })
        else:
            # Use Suna billing
            from core.billing.billing_integration import billing_integration
            can_run, message, reservation_id = await billing_integration.check_and_reserve_credits(account_id)
            billing_info.update({
                'billing_type': 'suna',
                'can_run': can_run,
                'message': message,
                'subscription': None
            })
        
        return billing_info
        
    except Exception as e:
        logger.error(
            f"Error getting unified billing info for account {account_id}: {e}",
            account_id=account_id,
            error=str(e),
            exc_info=True
        )
        return {
            'account_id': account_id,
            'billing_type': 'error',
            'error': str(e)
        }


async def can_user_afford_tool_unified(client, account_id: str, tool_name: str) -> Dict[str, Any]:
    """
    Unified tool affordability check that routes to the appropriate billing system.
    
    When ENTERPRISE_MODE is enabled: Check individual tool costs against enterprise credits and user limits
    When ENTERPRISE_MODE is disabled: Use standard tool credit checking logic
    
    Args:
        client: Supabase client
        account_id: The basejump account ID
        tool_name: The tool name to check affordability for
        
    Returns:
        Dict containing affordability info: {'can_use': bool, 'required_cost': float, 'current_balance': float, 'user_remaining': float}
    """
    try:
        # If enterprise mode is enabled, use enterprise tool affordability check
        if config.ENTERPRISE_MODE:
            logger.info(f"[TOOL_BILLING] Enterprise mode - checking tool affordability: {tool_name} for account {account_id}")
            
            try:
                # Use the enterprise tool affordability function
                logger.debug(f"[TOOL_BILLING] Calling enterprise_can_use_tool RPC with account_id={account_id}, tool_name={tool_name}")
                result = await client.rpc('enterprise_can_use_tool', {
                    'p_account_id': account_id,
                    'p_tool_name': tool_name
                }).execute()
                
                logger.debug(f"[TOOL_BILLING] Enterprise RPC result: {result}")
                
                if result.data and len(result.data) > 0:
                    data = result.data[0]
                    logger.info(f"[TOOL_BILLING] Enterprise tool check successful: can_use={data['can_use']}, cost=${data['required_cost']:.4f}")
                    return {
                        'can_use': data['can_use'],
                        'required_cost': float(data['required_cost']),
                        'current_balance': float(data['current_balance']),
                        'user_remaining': float(data['user_remaining'])
                    }
                else:
                    # No data returned from RPC
                    logger.error(f"[TOOL_BILLING] No data returned from enterprise_can_use_tool for {tool_name}. Result: {result}")
                    return {'can_use': False, 'required_cost': 0.0, 'current_balance': 0.0, 'user_remaining': 0.0}
            except Exception as enterprise_error:
                logger.error(f"[TOOL_BILLING] Enterprise RPC failed for {tool_name}: {enterprise_error}")
                # This will trigger the fallback logic below
                raise enterprise_error
        else:
            # Enterprise mode disabled, use Suna's new billing system
            logger.debug(f"Enterprise mode disabled, using Suna billing for tool checking")
            
            # For SaaS mode, tools don't have separate costs - they use token-based billing
            # Check if user has sufficient credits for general usage
            from core.billing.billing_integration import billing_integration
            can_run, message, reservation_id = await billing_integration.check_and_reserve_credits(account_id)
            
            return {
                'can_use': can_run,
                'required_cost': 0.10,  # Estimated cost for compatibility
                'current_balance': 1.0 if can_run else 0.0,  # Simplified for compatibility
                'user_remaining': 1.0 if can_run else 0.0
            }
        
    except Exception as e:
        logger.error(
            f"Error in unified tool affordability check for account {account_id} and tool {tool_name}: {e}",
            account_id=account_id,
            tool_name=tool_name,
            error=str(e),
            exc_info=True
        )
        # Only fallback to non-enterprise if we're NOT in enterprise mode
        if not config.ENTERPRISE_MODE:
            try:
                # Use simplified Suna billing check as fallback
                from core.billing.billing_integration import billing_integration
                can_run, message, reservation_id = await billing_integration.check_and_reserve_credits(account_id)
                return {
                    'can_use': can_run,
                    'required_cost': 0.10,
                    'current_balance': 1.0 if can_run else 0.0,
                    'user_remaining': 1.0 if can_run else 0.0
                }
            except Exception as fallback_error:
                logger.error(f"Fallback tool affordability check also failed: {fallback_error}")
        
        # If we're in enterprise mode or fallback failed, default to allowing tool use
        logger.warning(f"Tool affordability check failed for {tool_name} in enterprise mode, defaulting to allow")
        return {'can_use': True, 'required_cost': 0.0, 'current_balance': 0.0, 'user_remaining': 0.0}


async def charge_tool_usage_unified(
    client,
    account_id: str,
    tool_name: str,
    thread_id: str = None,
    message_id: str = None
) -> Dict[str, Any]:
    """
    Unified tool usage charging that routes to the appropriate billing system.
    
    When ENTERPRISE_MODE is enabled: Charge individual tool costs from enterprise credits
    When ENTERPRISE_MODE is disabled: Use standard tool credit charging logic
    
    Args:
        client: Supabase client
        account_id: The basejump account ID
        tool_name: The tool name to charge for
        thread_id: Optional thread ID for tracking
        message_id: Optional message ID for tracking
        
    Returns:
        Dict containing charge result: {'success': bool, 'cost_charged': float, 'new_balance': float, 'user_remaining': float}
    """
    try:
        # If enterprise mode is enabled, use enterprise tool charging
        if config.ENTERPRISE_MODE:
            logger.info(f"[TOOL_BILLING] Enterprise mode - charging tool: {tool_name} for account {account_id}")
            
            try:
                # Use the enterprise tool charging function
                logger.debug(f"[TOOL_BILLING] Calling enterprise_use_tool_credits RPC with params: account_id={account_id}, tool_name={tool_name}, thread_id={thread_id}, message_id={message_id}")
                result = await client.rpc('enterprise_use_tool_credits', {
                    'p_account_id': account_id,
                    'p_tool_name': tool_name,
                    'p_thread_id': thread_id,
                    'p_message_id': message_id
                }).execute()
                
                logger.debug(f"[TOOL_BILLING] Enterprise charging RPC result: {result}")
                
                if result.data and len(result.data) > 0:
                    data = result.data[0]
                    logger.info(f"[TOOL_BILLING] Enterprise tool charging successful: success={data['success']}, charged=${data['cost_charged']:.4f}")
                    return {
                        'success': data['success'],
                        'cost_charged': float(data['cost_charged']),
                        'new_balance': float(data['new_balance']),
                        'user_remaining': float(data['user_remaining'])
                    }
                else:
                    logger.error(f"[TOOL_BILLING] No data returned from enterprise_use_tool_credits for {tool_name}. Result: {result}")
                    return {'success': False, 'cost_charged': 0.0, 'new_balance': 0.0, 'user_remaining': 0.0}
            except Exception as enterprise_error:
                logger.error(f"[TOOL_BILLING] Enterprise charging RPC failed for {tool_name}: {enterprise_error}")
                # This will trigger the fallback logic below
                raise enterprise_error
        else:
            # Enterprise mode disabled, use Suna's token-based billing system
            logger.debug(f"Enterprise mode disabled, tools are charged via token usage in Suna system")
            
            # In Suna's system, tools don't have separate charges - they're billed via token usage
            # Return success for compatibility with existing tool billing logic
            return {
                'success': True,
                'cost_charged': 0.0,  # Tools are charged via token billing, not separate charges
                'new_balance': 1.0,   # Simplified for compatibility
                'user_remaining': 1.0
            }
        
    except Exception as e:
        logger.error(
            f"Error in unified tool usage charging for account {account_id} and tool {tool_name}: {e}",
            account_id=account_id,
            tool_name=tool_name,
            error=str(e),
            exc_info=True
        )
        # Only fallback to non-enterprise if we're NOT in enterprise mode
        if not config.ENTERPRISE_MODE:
            try:
                # In Suna's system, return success since tools are charged via token usage
                logger.debug(f"Fallback: Tool charging not needed in Suna system (token-based billing)")
                return {
                    'success': True,
                    'cost_charged': 0.0,  # No separate tool charges in Suna
                    'new_balance': 1.0,
                    'user_remaining': 1.0
                }
            except Exception as fallback_error:
                logger.error(f"Fallback tool charging also failed: {fallback_error}")
        
        # If we're in enterprise mode or fallback failed, default to success
        logger.warning(f"Tool charging failed for {tool_name} in enterprise mode, defaulting to success (no charge)")
        return {'success': True, 'cost_charged': 0.0, 'new_balance': 0.0, 'user_remaining': 0.0}


# Maintain backward compatibility by exposing unified functions with original names
# Note: check_billing_status is NOT aliased here to avoid conflicts with local functions
handle_usage_with_credits = handle_usage_unified
can_use_model = can_use_model_unified
can_user_afford_tool = can_user_afford_tool_unified
charge_tool_usage = charge_tool_usage_unified
