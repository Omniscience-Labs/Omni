"""
Enterprise User Endpoint

Provides user-facing endpoints for enterprise billing:
- Get current user's enterprise usage status
- Check if enterprise mode is enabled

These endpoints are available to all authenticated users in enterprise mode.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from pydantic import BaseModel
from core.auth import get_current_user
from core.utils.config import config
from core.utils.logger import logger

router = APIRouter(prefix="/enterprise", tags=["billing-enterprise"])


class EnterpriseUserStatusResponse(BaseModel):
    """Response model for user's enterprise billing status."""
    enterprise_mode: bool
    monthly_limit: float = 0
    current_month_usage: float = 0
    remaining: float = 0
    is_active: bool = True
    last_reset_at: Optional[str] = None
    usage_percentage: float = 0


@router.get("/user-status", response_model=EnterpriseUserStatusResponse)
async def get_user_enterprise_status(user: dict = Depends(get_current_user)):
    """
    Get the current user's enterprise billing status.
    
    Returns usage information including monthly limit, current usage,
    and remaining credits for the current billing period.
    
    Only available when ENTERPRISE_MODE is enabled.
    """
    # Check if enterprise mode is enabled
    if not config.ENTERPRISE_MODE:
        return EnterpriseUserStatusResponse(
            enterprise_mode=False,
            monthly_limit=0,
            current_month_usage=0,
            remaining=0,
            is_active=False,
            last_reset_at=None,
            usage_percentage=0
        )
    
    try:
        # Import here to avoid circular imports
        from core.billing.enterprise.service import enterprise_billing_service
        
        account_id = user['user_id']
        status = await enterprise_billing_service.get_user_status(account_id)
        
        if status.get('error'):
            logger.warning(f"[ENTERPRISE_USER] Error getting status for {account_id}: {status.get('error')}")
            # Return default status for users not yet provisioned
            return EnterpriseUserStatusResponse(
                enterprise_mode=True,
                monthly_limit=0,
                current_month_usage=0,
                remaining=0,
                is_active=True,  # Assume active until they use credits
                last_reset_at=None,
                usage_percentage=0
            )
        
        monthly_limit = float(status.get('monthly_limit', 0))
        current_usage = float(status.get('current_month_usage', 0))
        remaining = float(status.get('remaining', 0))
        usage_pct = (current_usage / monthly_limit * 100) if monthly_limit > 0 else 0
        
        return EnterpriseUserStatusResponse(
            enterprise_mode=True,
            monthly_limit=monthly_limit,
            current_month_usage=current_usage,
            remaining=remaining,
            is_active=status.get('is_active', True),
            last_reset_at=status.get('last_reset_at'),
            usage_percentage=round(usage_pct, 1)
        )
        
    except Exception as e:
        logger.error(f"[ENTERPRISE_USER] Error getting status for user {user.get('user_id')}: {e}")
        # Return default status on error
        return EnterpriseUserStatusResponse(
            enterprise_mode=True,
            monthly_limit=0,
            current_month_usage=0,
            remaining=0,
            is_active=True,
            last_reset_at=None,
            usage_percentage=0
        )


@router.get("/check")
async def check_enterprise_mode():
    """
    Check if enterprise mode is enabled.
    
    This endpoint is public (no auth required) and returns whether
    the current deployment is running in enterprise mode.
    """
    return {
        "enterprise_mode": config.ENTERPRISE_MODE
    }
