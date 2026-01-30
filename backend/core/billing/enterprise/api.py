"""
Enterprise Admin API

Provides endpoints for managing enterprise billing:
- Pool management (load/negate credits)
- User management (view, update limits, activate/deactivate)
- Usage reporting

These endpoints are protected by enterprise admin email checks
in addition to standard authentication.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from decimal import Decimal
from datetime import datetime
from pydantic import BaseModel, Field
from core.auth import get_current_user
from core.services.supabase import DBConnection
from core.utils.logger import logger
from core.utils.config import config
from .auth import is_enterprise_admin, is_omni_admin, get_admin_status
from .service import enterprise_billing_service


router = APIRouter(prefix="/admin/enterprise", tags=["enterprise-admin"])


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class AdminCheckResponse(BaseModel):
    is_admin: bool
    is_omni: bool
    email: Optional[str] = None
    enterprise_mode: bool = True


class PoolStatusResponse(BaseModel):
    credit_balance: float
    total_loaded: float
    total_used: float
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class LoadCreditsRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Amount to load (must be positive)")
    description: Optional[str] = Field("Credit load", description="Description of the load")


class NegateCreditsRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Amount to negate (must be positive)")
    description: Optional[str] = Field("Credit negation", description="Reason for negation")


class UpdateLimitRequest(BaseModel):
    monthly_limit: float = Field(..., ge=0, description="New monthly limit")


class EnterpriseUserSummary(BaseModel):
    account_id: str
    email: Optional[str] = None
    monthly_limit: float
    current_month_usage: float
    remaining: float
    is_active: bool
    last_reset_at: Optional[datetime] = None
    usage_percentage: float
    created_at: Optional[datetime] = None


class UsageRecord(BaseModel):
    id: str
    cost: float
    model_name: str
    tokens_used: int
    thread_id: Optional[str] = None
    message_id: Optional[str] = None
    created_at: datetime


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def get_user_email(user_id: str) -> Optional[str]:
    """Get user email from auth.users or billing_customers."""
    try:
        async with DBConnection() as client:
            # Try billing_customers first
            result = await client.schema('basejump').from_('billing_customers').select(
                'email'
            ).eq('account_id', user_id).limit(1).execute()
            
            if result.data and result.data[0].get('email'):
                return result.data[0]['email']
            
            # Try get_user_email RPC
            try:
                email_result = await client.rpc('get_user_email', {'user_id': user_id}).execute()
                if email_result.data:
                    return email_result.data
            except Exception:
                pass
            
            return None
    except Exception as e:
        logger.warning(f"Failed to get email for user {user_id}: {e}")
        return None


async def require_enterprise_mode():
    """Dependency to ensure enterprise mode is enabled."""
    if not config.ENTERPRISE_MODE:
        raise HTTPException(
            status_code=403,
            detail="Enterprise mode is not enabled"
        )


async def require_enterprise_admin(user: dict = Depends(get_current_user)) -> dict:
    """Dependency to require enterprise admin access."""
    await require_enterprise_mode()
    
    user_email = await get_user_email(user['user_id'])
    
    if not is_enterprise_admin(user_email):
        raise HTTPException(
            status_code=403,
            detail="Enterprise admin access required"
        )
    
    user['email'] = user_email
    user['is_omni'] = is_omni_admin(user_email)
    return user


async def require_omni_admin(user: dict = Depends(get_current_user)) -> dict:
    """Dependency to require omni admin access (can load/negate credits)."""
    await require_enterprise_mode()
    
    user_email = await get_user_email(user['user_id'])
    
    if not is_omni_admin(user_email):
        raise HTTPException(
            status_code=403,
            detail="Omni admin access required to manage credits"
        )
    
    user['email'] = user_email
    user['is_omni'] = True
    return user


# ============================================================================
# ADMIN CHECK ENDPOINT
# ============================================================================

@router.get("/check-admin", response_model=AdminCheckResponse)
async def check_admin_status(user: dict = Depends(get_current_user)):
    """
    Check if the current user is an enterprise admin.
    
    Returns admin status based on ADMIN_EMAILS and OMNI_ADMIN env vars.
    """
    if not config.ENTERPRISE_MODE:
        return AdminCheckResponse(
            is_admin=False,
            is_omni=False,
            email=None,
            enterprise_mode=False
        )
    
    user_email = await get_user_email(user['user_id'])
    status = get_admin_status(user_email)
    
    return AdminCheckResponse(
        is_admin=status['is_admin'],
        is_omni=status['is_omni'],
        email=user_email,
        enterprise_mode=True
    )


# ============================================================================
# POOL MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/pool-status", response_model=PoolStatusResponse)
async def get_pool_status(admin: dict = Depends(require_enterprise_admin)):
    """
    Get the current enterprise credit pool status.
    
    Shows total balance, lifetime loaded, and lifetime used.
    """
    status = await enterprise_billing_service.get_pool_status()
    
    if status.get('error') and 'Not initialized' in str(status.get('error', '')):
        raise HTTPException(
            status_code=404,
            detail="Enterprise billing not initialized. Please run migrations."
        )
    
    return PoolStatusResponse(
        credit_balance=float(status.get('credit_balance', 0)),
        total_loaded=float(status.get('total_loaded', 0)),
        total_used=float(status.get('total_used', 0)),
        created_at=status.get('created_at'),
        updated_at=status.get('updated_at')
    )


@router.post("/load-credits")
async def load_credits(
    request: LoadCreditsRequest,
    admin: dict = Depends(require_omni_admin)
):
    """
    Load credits into the enterprise pool.
    
    Only omni admins (OMNI_ADMIN env var) can load credits.
    """
    result = await enterprise_billing_service.load_credits(
        amount=Decimal(str(request.amount)),
        performed_by=admin['email'],
        description=request.description or "Credit load"
    )
    
    if not result.get('success'):
        raise HTTPException(
            status_code=400,
            detail=result.get('error', 'Failed to load credits')
        )
    
    logger.info(f"[ENTERPRISE_ADMIN] {admin['email']} loaded ${request.amount:.2f} credits")
    
    return {
        "success": True,
        "message": f"Successfully loaded ${request.amount:.2f} credits",
        "new_balance": result.get('new_balance'),
        "total_loaded": result.get('total_loaded'),
        "load_id": result.get('load_id')
    }


@router.post("/negate-credits")
async def negate_credits(
    request: NegateCreditsRequest,
    admin: dict = Depends(require_omni_admin)
):
    """
    Negate (remove) credits from the enterprise pool.
    
    Only omni admins (OMNI_ADMIN env var) can negate credits.
    """
    result = await enterprise_billing_service.negate_credits(
        amount=Decimal(str(request.amount)),
        performed_by=admin['email'],
        description=request.description or "Credit negation"
    )
    
    if not result.get('success'):
        raise HTTPException(
            status_code=400,
            detail=result.get('error', 'Failed to negate credits')
        )
    
    logger.info(f"[ENTERPRISE_ADMIN] {admin['email']} negated ${request.amount:.2f} credits")
    
    return {
        "success": True,
        "message": f"Successfully negated ${request.amount:.2f} credits",
        "new_balance": result.get('new_balance'),
        "load_id": result.get('load_id')
    }


@router.get("/credit-history")
async def get_credit_history(
    limit: int = Query(50, ge=1, le=200),
    admin: dict = Depends(require_enterprise_admin)
):
    """
    Get the history of credit loads and negations.
    """
    try:
        async with DBConnection() as client:
            result = await client.from_('enterprise_credit_loads').select(
                '*'
            ).order('created_at', desc=True).limit(limit).execute()
            
            return {
                "history": result.data or [],
                "count": len(result.data or [])
            }
    except Exception as e:
        logger.error(f"Failed to get credit history: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve credit history")


# ============================================================================
# USER MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/users", response_model=List[EnterpriseUserSummary])
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search_email: Optional[str] = Query(None),
    active_only: bool = Query(False),
    admin: dict = Depends(require_enterprise_admin)
):
    """
    List all enterprise users with their limits and usage.
    
    Only shows users who have used the system (lazy provisioning).
    """
    try:
        async with DBConnection() as client:
            # Build query for enterprise_user_limits
            query = client.from_('enterprise_user_limits').select('*')
            
            if active_only:
                query = query.eq('is_active', True)
            
            # Get paginated results
            offset = (page - 1) * page_size
            result = await query.order('created_at', desc=True).range(
                offset, offset + page_size - 1
            ).execute()
            
            users = []
            for row in result.data or []:
                # Get user email
                user_email = await get_user_email(row['account_id'])
                
                # Filter by email if search provided
                if search_email:
                    if not user_email or search_email.lower() not in user_email.lower():
                        continue
                
                monthly_limit = float(row.get('monthly_limit', 100))
                current_usage = float(row.get('current_month_usage', 0))
                
                users.append(EnterpriseUserSummary(
                    account_id=row['account_id'],
                    email=user_email,
                    monthly_limit=monthly_limit,
                    current_month_usage=current_usage,
                    remaining=monthly_limit - current_usage,
                    is_active=row.get('is_active', True),
                    last_reset_at=row.get('last_reset_at'),
                    usage_percentage=round((current_usage / monthly_limit * 100) if monthly_limit > 0 else 0, 2),
                    created_at=row.get('created_at')
                ))
            
            return users
            
    except Exception as e:
        logger.error(f"Failed to list enterprise users: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve users")


@router.get("/users/{account_id}")
async def get_user_details(
    account_id: str,
    admin: dict = Depends(require_enterprise_admin)
):
    """
    Get detailed information about a specific enterprise user.
    """
    status = await enterprise_billing_service.get_user_status(account_id)
    user_email = await get_user_email(account_id)
    
    return {
        "account_id": account_id,
        "email": user_email,
        **status
    }


@router.post("/users/{account_id}/limit")
async def update_user_limit(
    account_id: str,
    request: UpdateLimitRequest,
    admin: dict = Depends(require_enterprise_admin)
):
    """
    Update a user's monthly spending limit.
    """
    result = await enterprise_billing_service.update_user_limit(
        account_id=account_id,
        new_limit=Decimal(str(request.monthly_limit))
    )
    
    if not result.get('success'):
        raise HTTPException(
            status_code=400,
            detail=result.get('error', 'Failed to update limit')
        )
    
    user_email = await get_user_email(account_id)
    logger.info(f"[ENTERPRISE_ADMIN] {admin['email']} updated limit for {user_email} to ${request.monthly_limit:.2f}")
    
    return {
        "success": True,
        "message": f"Updated monthly limit to ${request.monthly_limit:.2f}",
        **result
    }


@router.get("/users/{account_id}/usage")
async def get_user_usage_history(
    account_id: str,
    limit: int = Query(50, ge=1, le=200),
    admin: dict = Depends(require_enterprise_admin)
):
    """
    Get usage history for a specific user.
    """
    try:
        async with DBConnection() as client:
            result = await client.from_('enterprise_usage').select(
                '*'
            ).eq('account_id', account_id).order('created_at', desc=True).limit(limit).execute()
            
            usage_records = []
            for row in result.data or []:
                usage_records.append(UsageRecord(
                    id=row['id'],
                    cost=float(row.get('cost', 0)),
                    model_name=row.get('model_name', 'unknown'),
                    tokens_used=row.get('tokens_used', 0),
                    thread_id=row.get('thread_id'),
                    message_id=row.get('message_id'),
                    created_at=row['created_at']
                ))
            
            # Get summary
            user_status = await enterprise_billing_service.get_user_status(account_id)
            user_email = await get_user_email(account_id)
            
            return {
                "account_id": account_id,
                "email": user_email,
                "summary": user_status,
                "usage_records": usage_records,
                "count": len(usage_records)
            }
            
    except Exception as e:
        logger.error(f"Failed to get user usage history: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve usage history")


@router.post("/users/{account_id}/deactivate")
async def deactivate_user(
    account_id: str,
    admin: dict = Depends(require_enterprise_admin)
):
    """
    Deactivate a user (prevent them from spending credits).
    """
    result = await enterprise_billing_service.deactivate_user(account_id)
    
    if not result.get('success'):
        raise HTTPException(
            status_code=400,
            detail=result.get('error', 'Failed to deactivate user')
        )
    
    user_email = await get_user_email(account_id)
    logger.info(f"[ENTERPRISE_ADMIN] {admin['email']} deactivated user {user_email}")
    
    return {
        "success": True,
        "message": f"User {user_email or account_id} has been deactivated"
    }


@router.post("/users/{account_id}/reactivate")
async def reactivate_user(
    account_id: str,
    admin: dict = Depends(require_enterprise_admin)
):
    """
    Reactivate a previously deactivated user.
    """
    result = await enterprise_billing_service.reactivate_user(account_id)
    
    if not result.get('success'):
        raise HTTPException(
            status_code=400,
            detail=result.get('error', 'Failed to reactivate user')
        )
    
    user_email = await get_user_email(account_id)
    logger.info(f"[ENTERPRISE_ADMIN] {admin['email']} reactivated user {user_email}")
    
    return {
        "success": True,
        "message": f"User {user_email or account_id} has been reactivated"
    }


@router.post("/users/{account_id}/provision")
async def provision_user(
    account_id: str,
    monthly_limit: float = Query(100.0, ge=0),
    admin: dict = Depends(require_enterprise_admin)
):
    """
    Manually provision a user for enterprise mode.
    
    Usually not needed as users are provisioned lazily on first use.
    """
    result = await enterprise_billing_service.provision_user(
        account_id=account_id,
        monthly_limit=Decimal(str(monthly_limit)),
        is_active=True
    )
    
    if not result.get('success'):
        raise HTTPException(
            status_code=400,
            detail=result.get('error', 'Failed to provision user')
        )
    
    logger.info(f"[ENTERPRISE_ADMIN] {admin['email']} provisioned user {account_id}")
    
    return {
        "success": True,
        "message": f"User provisioned with ${monthly_limit:.2f} monthly limit",
        **result
    }


# ============================================================================
# SYSTEM MANAGEMENT ENDPOINTS
# ============================================================================

@router.post("/reset-monthly-usage")
async def reset_monthly_usage(
    admin: dict = Depends(require_omni_admin)
):
    """
    Manually trigger monthly usage reset for all users.
    
    Normally runs automatically via pg_cron on the 1st of each month.
    Can be called by external cron if pg_cron is not available.
    """
    try:
        async with DBConnection() as client:
            result = await client.rpc('api_reset_enterprise_monthly_usage', {}).execute()
            
            if result.data:
                logger.info(f"[ENTERPRISE_ADMIN] {admin['email']} triggered monthly reset: {result.data}")
                return result.data
            else:
                return {
                    "success": True,
                    "message": "Monthly usage reset completed"
                }
                
    except Exception as e:
        logger.error(f"Failed to reset monthly usage: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to reset: {str(e)}")


@router.get("/stats")
async def get_enterprise_stats(
    admin: dict = Depends(require_enterprise_admin)
):
    """
    Get enterprise usage statistics.
    """
    try:
        pool_status = await enterprise_billing_service.get_pool_status()
        
        async with DBConnection() as client:
            # Count active users
            active_result = await client.from_('enterprise_user_limits').select(
                'account_id', count='exact'
            ).eq('is_active', True).execute()
            
            # Count total users
            total_result = await client.from_('enterprise_user_limits').select(
                'account_id', count='exact'
            ).execute()
            
            # Get usage stats for current month
            usage_result = await client.from_('enterprise_usage').select(
                'cost'
            ).execute()
            
            total_usage = sum(float(r.get('cost', 0)) for r in usage_result.data or [])
            
            return {
                "pool": {
                    "balance": float(pool_status.get('credit_balance', 0)),
                    "total_loaded": float(pool_status.get('total_loaded', 0)),
                    "total_used": float(pool_status.get('total_used', 0))
                },
                "users": {
                    "total": total_result.count or 0,
                    "active": active_result.count or 0
                },
                "usage": {
                    "total_all_time": total_usage,
                    "transaction_count": len(usage_result.data or [])
                }
            }
            
    except Exception as e:
        logger.error(f"Failed to get enterprise stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve stats")
