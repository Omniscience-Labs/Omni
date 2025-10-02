
"""
Enterprise Billing API - User-facing endpoints

When ENTERPRISE_MODE is enabled, these endpoints replace the normal billing endpoints
to show enterprise billing information to users.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, Dict, Any
from datetime import datetime, timezone
import structlog

from core.utils.config import config
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.enterprise_billing import enterprise_billing
from core.services.billing_wrapper import check_billing_status_unified
from core.services.supabase import DBConnection

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])

@router.get("/subscription")
async def get_subscription(
    current_user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get the current subscription status for the user - enterprise version."""
    if not config.ENTERPRISE_MODE:
        # This shouldn't be called if enterprise mode is disabled
        raise HTTPException(status_code=400, detail="Enterprise mode not enabled")
    
    try:
        logger.debug(f"Getting enterprise subscription status for user {current_user_id}")
        
        # Get user's limit and usage
        user_limit = await enterprise_billing.get_user_limit(current_user_id)
        enterprise_balance = await enterprise_billing.get_enterprise_balance()
        
        # Format as subscription-like response for frontend compatibility
        return {
            "status": "active",
            "plan_name": "Enterprise",
            "price_id": "enterprise",
            "current_period_end": None,  # Enterprise doesn't have periods
            "cancel_at_period_end": False,
            "trial_end": None,
            "minutes_limit": 999999,  # Unlimited for enterprise
            "cost_limit": user_limit['monthly_limit'] if user_limit else await enterprise_billing.get_default_monthly_limit(),
            "current_usage": user_limit['current_month_usage'] if user_limit else 0,
            "has_schedule": False,
            "subscription_id": "enterprise",
            "subscription": {
                "id": "enterprise",
                "status": "active",
                "cancel_at_period_end": False,
                "cancel_at": None,
                "current_period_end": None
            },
            "credit_balance": enterprise_balance['credit_balance'] if enterprise_balance else 0,
            "can_purchase_credits": False,  # Enterprise users don't purchase credits
            "enterprise_info": {
                "is_enterprise": True,
                "monthly_limit": user_limit['monthly_limit'] if user_limit else await enterprise_billing.get_default_monthly_limit(),
                "remaining_monthly": (user_limit['monthly_limit'] - user_limit['current_month_usage']) if user_limit else await enterprise_billing.get_default_monthly_limit(),
                "enterprise_balance": enterprise_balance['credit_balance'] if enterprise_balance else 0
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting enterprise subscription: {str(e)}")
        raise HTTPException(status_code=500, detail="Error retrieving subscription status")

@router.get("/check-status")
async def check_status(
    current_user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Check if the user can run agents based on enterprise billing."""
    if not config.ENTERPRISE_MODE:
        raise HTTPException(status_code=400, detail="Enterprise mode not enabled")
    
    try:
        db = DBConnection()
        client = await db.client
        
        # Use the unified billing check
        can_run, message, billing_info = await check_billing_status_unified(client, current_user_id)
        
        # Get user's limit for additional info
        user_limit = await enterprise_billing.get_user_limit(current_user_id)
        enterprise_balance = await enterprise_billing.get_enterprise_balance()
        
        return {
            "can_run": can_run,
            "message": message,
            "subscription": billing_info,
            "credit_balance": enterprise_balance['credit_balance'] if enterprise_balance else 0,
            "can_purchase_credits": False,  # Enterprise users don't purchase credits
            "enterprise_info": {
                "monthly_limit": user_limit['monthly_limit'] if user_limit else await enterprise_billing.get_default_monthly_limit(),
                "current_usage": user_limit['current_month_usage'] if user_limit else 0,
                "remaining": (user_limit['monthly_limit'] - user_limit['current_month_usage']) if user_limit else await enterprise_billing.get_default_monthly_limit()
            }
        }
        
    except Exception as e:
        logger.error(f"Error checking enterprise billing status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/usage-logs")
async def get_usage_logs(
    current_user_id: str = Depends(verify_and_get_user_id_from_jwt),
    page: int = Query(default=0, ge=0),
    items_per_page: int = Query(default=100, ge=1, le=1000),
    days: int = Query(default=30, ge=1, le=365)
):
    """Get hierarchical usage logs for enterprise users (Date → Project/Thread → Usage Details)."""
    if not config.ENTERPRISE_MODE:
        raise HTTPException(status_code=400, detail="Enterprise mode not enabled")
    
    try:
        # Get hierarchical usage data (this replaces the old flat usage logs)
        hierarchical_data = await enterprise_billing.get_user_hierarchical_usage(
            account_id=current_user_id,
            days=days,
            page=page,
            items_per_page=items_per_page
        )
        
        if not hierarchical_data:
            return {
                "hierarchical_usage": {},
                "enterprise_info": {
                    "monthly_limit": await enterprise_billing.get_default_monthly_limit(),
                    "current_usage": 0,
                    "remaining": await enterprise_billing.get_default_monthly_limit()
                },
                "total_cost_period": 0,
                "page": page,
                "items_per_page": items_per_page,
                "days": days,
                "is_hierarchical": True
            }
        
        return {
            "hierarchical_usage": hierarchical_data.get('hierarchical_usage', {}),
            "enterprise_info": {
                "monthly_limit": hierarchical_data.get('monthly_limit', await enterprise_billing.get_default_monthly_limit()),
                "current_usage": hierarchical_data.get('current_month_usage', 0),
                "remaining": hierarchical_data.get('remaining_monthly', await enterprise_billing.get_default_monthly_limit())
            },
            "total_cost_period": hierarchical_data.get('total_cost_period', 0),
            "page": page,
            "items_per_page": items_per_page,
            "days": days,
            "is_hierarchical": True
        }
        
    except Exception as e:
        logger.error(f"Error getting hierarchical usage logs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tool-usage-analytics")
async def get_tool_usage_analytics(
    current_user_id: str = Depends(verify_and_get_user_id_from_jwt),
    days: int = Query(default=30, ge=1, le=365),
    page: int = Query(default=0, ge=0),
    items_per_page: int = Query(default=100, ge=1, le=1000)
):
    """Get tool usage analytics for the current user."""
    if not config.ENTERPRISE_MODE:
        raise HTTPException(status_code=400, detail="Enterprise mode not enabled")
    
    try:
        # Get user's tool usage analytics
        analytics = await enterprise_billing.get_tool_usage_analytics(
            account_id=current_user_id,
            days=days,
            page=page,
            items_per_page=items_per_page
        )
        
        if not analytics:
            return {
                "tool_usage": [],
                "total_logs": 0,
                "page": page,
                "items_per_page": items_per_page,
                "total_cost_period": 0,
                "period_days": days
            }
        
        # Format for frontend compatibility
        formatted_usage = []
        for usage in analytics.get('tool_usage', []):
            formatted_usage.append({
                "account_id": usage.get('account_id'),
                "thread_id": usage.get('thread_id'),
                "message_id": usage.get('message_id'),
                "tool_name": usage.get('tool_name'),
                "tool_cost": usage.get('tool_cost'),
                "created_at": usage.get('created_at'),
                "usage_date": usage.get('usage_date'),
                "usage_hour": usage.get('usage_hour'),
                "usage_month": usage.get('usage_month')
            })
        
        return {
            "tool_usage": formatted_usage,
            "total_logs": analytics.get('total_logs', 0),
            "page": page,
            "items_per_page": items_per_page,
            "total_cost_period": analytics.get('total_cost_period', 0),
            "period_days": days
        }
        
    except Exception as e:
        logger.error(f"Error getting tool usage analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/available-models")
async def get_available_models(
    current_user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get available models for enterprise users - all models are available."""
    if not config.ENTERPRISE_MODE:
        raise HTTPException(status_code=400, detail="Enterprise mode not enabled")
    
    # Enterprise users get access to all models
    return {
        "available_models": [
            "openai/gpt-4o",
            "openai/gpt-4o-mini",
            "anthropic/claude-3-5-sonnet-20241022",
            "anthropic/claude-3-5-haiku-20241022",
            "google/gemini-2.0-flash-exp",
            "google/gemini-1.5-pro",
            "google/gemini-1.5-flash",
            "deepseek/deepseek-chat",
            "xai/grok-2-1212",
            "xai/grok-2-vision-1212"
        ],
        "tier": "enterprise",
        "message": "All models available for enterprise users"
    }

# Stub endpoints that don't apply to enterprise but might be called by frontend
@router.post("/create-checkout-session")
async def create_checkout_session(
    current_user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Checkout not available in enterprise mode."""
    if not config.ENTERPRISE_MODE:
        raise HTTPException(status_code=400, detail="Enterprise mode not enabled")
    
    return {
        "error": "Billing is managed by your enterprise administrator",
        "url": None
    }

@router.post("/create-portal-session")
async def create_portal_session(
    current_user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Portal not available in enterprise mode."""
    if not config.ENTERPRISE_MODE:
        raise HTTPException(status_code=400, detail="Enterprise mode not enabled")
    
    return {
        "error": "Billing is managed by your enterprise administrator",
        "url": None
    }

@router.post("/cancel-subscription")
async def cancel_subscription(
    current_user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Cancellation not available in enterprise mode."""
    if not config.ENTERPRISE_MODE:
        raise HTTPException(status_code=400, detail="Enterprise mode not enabled")
    
    return {
        "error": "Your enterprise account cannot be cancelled by users",
        "success": False
    }

@router.get("/subscription-commitment/{subscription_id}")
async def get_subscription_commitment(
    subscription_id: str,
    current_user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict:
    """Get subscription commitment status - enterprise version.
    
    Enterprise users don't have commitments in the traditional sense,
    so this returns a stub response indicating no commitment.
    """
    if not config.ENTERPRISE_MODE:
        raise HTTPException(status_code=400, detail="Enterprise mode not enabled")
    
    try:
        logger.debug(f"Checking commitment status for enterprise user {current_user_id}")
        
        # Enterprise users don't have traditional commitments
        # They're always on the enterprise plan with no cancellation option
        return {
            'has_commitment': False,
            'can_cancel': False,  # Enterprise users cannot self-cancel
            'commitment_type': 'enterprise',
            'months_remaining': None,
            'commitment_end_date': None,
            'message': 'Your enterprise account is managed by your administrator'
        }
        
    except Exception as e:
        logger.error(f"Error checking commitment status for enterprise user {current_user_id}: {e}")
        # Return safe defaults on error
        return {
            'has_commitment': False,
            'can_cancel': False,
            'commitment_type': None,
            'months_remaining': None,
            'commitment_end_date': None
        }
