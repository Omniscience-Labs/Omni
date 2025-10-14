"""
Consolidated Admin API
Handles all administrative operations for user management, system configuration, and agent installations.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
from core.auth import require_admin
from core.services.supabase import DBConnection
from core.utils.logger import logger
from core.utils.pagination import PaginationService, PaginationParams, PaginatedResponse
from collections import defaultdict
from core.utils.config import config, EnvMode
from core.utils.auth_utils import verify_and_get_user_id_from_jwt, verify_admin_api_key
from core.utils.suna_default_agent_service import SunaDefaultAgentService
from dotenv import load_dotenv, set_key, find_dotenv, dotenv_values
import os

router = APIRouter(prefix="/admin", tags=["admin"])

# Unified admin check that works with both standard and enterprise admin systems
async def require_any_admin(user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    """
    Flexible admin check that works with both:
    1. Enterprise admin (ADMIN_EMAILS / OMNI_ADMIN env vars) when ENTERPRISE_MODE is enabled
    2. Standard admin (user_roles table) as fallback
    """
    db = DBConnection()
    client = await db.client
    
    # First, try enterprise admin check if in enterprise mode
    enterprise_mode = getattr(config, 'ENTERPRISE_MODE', False)
    admin_emails = getattr(config, 'ADMIN_EMAILS', None)
    omni_admin = getattr(config, 'OMNI_ADMIN', None)
    
    if enterprise_mode and (admin_emails or omni_admin):
        try:
            user_result = await client.auth.admin.get_user_by_id(user_id)
            if user_result.user and user_result.user.email:
                user_email = user_result.user.email.lower()
                
                # Check OMNI_ADMIN emails
                omni_admin_emails = []
                if omni_admin:
                    omni_admin_emails = [email.strip().lower() for email in omni_admin.split(',') if email.strip()]
                
                # Check regular ADMIN_EMAILS
                admin_emails_list = []
                if admin_emails:
                    admin_emails_list = [email.strip().lower() for email in admin_emails.split(',') if email.strip()]
                
                # If user is in either admin list, grant access
                if user_email in omni_admin_emails or user_email in admin_emails_list:
                    logger.info(f"Enterprise admin access granted for {user_email}")
                    return {"user_id": user_id, "role": "enterprise_admin"}
        except Exception as e:
            logger.warning(f"Enterprise admin check failed: {e}")
    
    # Fall back to standard user_roles table check
    try:
        result = await client.table('user_roles').select('role').eq('user_id', user_id).execute()
        
        if result.data and len(result.data) > 0:
            user_role = result.data[0]['role']
            role_hierarchy = {'user': 0, 'admin': 1, 'super_admin': 2}
            
            if role_hierarchy.get(user_role, -1) >= role_hierarchy.get('admin', 999):
                logger.info(f"Standard admin access granted for user {user_id} with role {user_role}")
                return {"user_id": user_id, "role": user_role}
    except Exception as e:
        logger.error(f"Standard admin check failed: {e}")
    
    # If we get here, user is not an admin in either system
    raise HTTPException(
        status_code=403, 
        detail="Admin access required. You must be either an enterprise admin (email in ADMIN_EMAILS) or have admin role in user_roles table."
    )

# ============================================================================
# MODELS
# ============================================================================

class UserSummary(BaseModel):
    id: str
    email: str
    created_at: datetime
    tier: str
    credit_balance: float
    total_purchased: float
    total_used: float
    subscription_status: Optional[str] = None
    last_activity: Optional[datetime] = None
    trial_status: Optional[str] = None

class UserThreadSummary(BaseModel):
    thread_id: str
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    is_public: bool
    created_at: datetime
    updated_at: datetime

# Note: AdvancedSearchRequest model needs to be defined for this endpoint
class AdvancedSearchRequest(BaseModel):
    email_contains: Optional[str] = None
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None
    subscription_status_in: Optional[List[str]] = None
    tier_in: Optional[List[str]] = None
    trial_status_in: Optional[List[str]] = None
    balance_min: Optional[float] = None
    balance_max: Optional[float] = None
    has_activity_since: Optional[datetime] = None
    sort_by: str = "created_at"
    sort_order: str = "desc"

# ============================================================================
# USER MANAGEMENT ENDPOINTS
# ============================================================================

@router.post("/search/advanced")
async def advanced_user_search(
    request: AdvancedSearchRequest,
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    admin: dict = Depends(require_any_admin)
) -> PaginatedResponse[UserSummary]:
    """Advanced user search with complex filtering options."""
    try:
        db = DBConnection()
        client = await db.client
        
        pagination_params = PaginationParams(page=page, page_size=page_size)
        
        account_ids_to_filter = None
        
        if request.email_contains:
            email_result = await client.schema('basejump').from_('billing_customers').select(
                'account_id'
            ).ilike('email', f'%{request.email_contains}%').limit(1000).execute()
            
            account_ids_to_filter = [item['account_id'] for item in email_result.data or []]
            
            if not account_ids_to_filter:
                return await PaginationService.paginate_with_total_count(
                    items=[],
                    total_count=0,
                    params=pagination_params
                )
        
        base_query = client.schema('basejump').from_('accounts').select(
            '''
            id,
            created_at,
            primary_owner_user_id,
            billing_customers(email),
            billing_subscriptions(status)
            '''
        )
        
        if account_ids_to_filter:
            base_query = base_query.in_('id', account_ids_to_filter)
        
        if request.created_after:
            base_query = base_query.gte('created_at', request.created_after.isoformat())
        
        if request.created_before:
            base_query = base_query.lte('created_at', request.created_before.isoformat())
        
        if request.subscription_status_in:
            base_query = base_query.in_('billing_subscriptions.status', request.subscription_status_in)
        
        data_result = await base_query.execute()
        
        user_ids = [item['id'] for item in data_result.data or []]
        
        credit_accounts = {}
        trial_statuses = {}
        if user_ids:
            credit_result = await client.from_('credit_accounts').select(
                'account_id, balance, tier, lifetime_purchased, lifetime_used, trial_status'
            ).in_('account_id', user_ids).execute()
            
            for credit in credit_result.data or []:
                credit_accounts[credit['account_id']] = credit
                trial_statuses[credit['account_id']] = credit.get('trial_status')
        
        recent_activity = {}
        if request.has_activity_since and user_ids:
            activity_result = await client.from_('agent_runs').select(
                'threads!inner(account_id), created_at'
            ).in_('threads.account_id', user_ids).gte('created_at', request.has_activity_since.isoformat()).execute()
            
            for activity in activity_result.data or []:
                account_id = activity['threads']['account_id']
                if account_id not in recent_activity or activity['created_at'] > recent_activity[account_id]:
                    recent_activity[account_id] = activity['created_at']
        
        filtered_data = []
        for item in data_result.data or []:
            credit_account = credit_accounts.get(item['id'], {})
            balance = float(credit_account.get('balance', 0))
            tier = credit_account.get('tier', 'free')
            trial_status = trial_statuses.get(item['id'])
            
            if request.tier_in and tier not in request.tier_in:
                continue
            
            if request.trial_status_in and trial_status not in request.trial_status_in:
                continue
            
            if request.balance_min is not None and balance < request.balance_min:
                continue
            
            if request.balance_max is not None and balance > request.balance_max:
                continue
            
            if request.has_activity_since and item['id'] not in recent_activity:
                continue
            
            filtered_data.append(item)
        
        def get_sort_value(item):
            credit = credit_accounts.get(item['id'], {})
            if request.sort_by == "balance":
                return float(credit.get('balance', 0))
            elif request.sort_by == "tier":
                return credit.get('tier', 'free')
            elif request.sort_by == "email":
                return item['billing_customers'][0]['email'] if item.get('billing_customers') else ''
            elif request.sort_by == "last_activity":
                return recent_activity.get(item['id'], '')
            else:
                return item.get('created_at', '')
        
        ascending = request.sort_order.lower() == "asc"
        sorted_data = sorted(filtered_data, key=get_sort_value, reverse=not ascending)
        
        total_count = len(sorted_data)
        offset = (pagination_params.page - 1) * pagination_params.page_size
        paginated_data = sorted_data[offset:offset + pagination_params.page_size]
        
        users = []
        for item in paginated_data:
            subscription_status = None
            if item.get('billing_subscriptions'):
                subscription_status = item['billing_subscriptions'][0].get('status')
            
            credit_account = credit_accounts.get(item['id'], {})
            
            email = 'N/A'
            if item.get('billing_customers') and item['billing_customers'][0].get('email'):
                email = item['billing_customers'][0]['email']
            elif item.get('primary_owner_user_id'):
                try:
                    user_email_result = await client.rpc('get_user_email', {'user_id': item['primary_owner_user_id']}).execute()
                    if user_email_result.data:
                        email = user_email_result.data
                except Exception as e:
                    logger.warning(f"Failed to get email for account {item['id']}: {e}")
            
            users.append(UserSummary(
                id=item['id'],
                email=email,
                created_at=datetime.fromisoformat(item['created_at'].replace('Z', '+00:00')),
                tier=credit_account.get('tier', 'free'),
                credit_balance=float(credit_account.get('balance', 0)),
                total_purchased=float(credit_account.get('lifetime_purchased', 0)),
                total_used=float(credit_account.get('lifetime_used', 0)),
                subscription_status=subscription_status,
                trial_status=credit_account.get('trial_status')
            ))
        
        return await PaginationService.paginate_with_total_count(
            items=users,
            total_count=total_count,
            params=pagination_params
        )
        
    except Exception as e:
        logger.error(f"Failed to advanced search users: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve users")

@router.get("/users/list")
async def list_users(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    search_email: Optional[str] = Query(None, description="Search by email"),
    search_name: Optional[str] = Query(None, description="Search by name"),
    tier_filter: Optional[str] = Query(None, description="Filter by tier"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    admin: dict = Depends(require_any_admin)
) -> PaginatedResponse[UserSummary]:
    """List all users with pagination and filtering."""
    try:
        db = DBConnection()
        client = await db.client
        
        pagination_params = PaginationParams(page=page, page_size=page_size)
        
        if search_email:
            email_result = await client.schema('basejump').from_('billing_customers').select(
                'account_id'
            ).ilike('email', f'%{search_email}%').limit(1000).execute()
            
            matching_account_ids = [item['account_id'] for item in email_result.data or []]
            
            if not matching_account_ids:
                return await PaginationService.paginate_with_total_count(
                    items=[],
                    total_count=0,
                    params=pagination_params
                )
            
            base_query = client.schema('basejump').from_('accounts').select(
                '''
                id,
                created_at,
                primary_owner_user_id,
                billing_customers(email),
                billing_subscriptions(status)
                '''
            ).in_('id', matching_account_ids)
            
            total_count = len(matching_account_ids)
        else:
            base_query = client.schema('basejump').from_('accounts').select(
                '''
                id,
                created_at,
                primary_owner_user_id,
                billing_customers(email),
                billing_subscriptions(status)
                '''
            )
            
            count_result = await client.schema('basejump').from_('accounts').select('*', count='exact').execute()
            total_count = count_result.count or 0
        
        sort_column = sort_by
        if sort_by == "email":
            sort_column = "billing_customers.email"
        
        if sort_by not in ["balance", "tier"]:
            ascending = sort_order.lower() == "asc"
            base_query = base_query.order(sort_column, desc=not ascending)
        
        offset = (pagination_params.page - 1) * pagination_params.page_size
        data_result = await base_query.range(offset, offset + pagination_params.page_size - 1).execute()
        
        user_ids = [item['id'] for item in data_result.data or []]
        credit_accounts = {}
        if user_ids:
            credit_result = await client.from_('credit_accounts').select(
                'account_id, balance, tier, lifetime_purchased, lifetime_used, trial_status'
            ).in_('account_id', user_ids).execute()
            
            for credit in credit_result.data or []:
                credit_accounts[credit['account_id']] = credit
        
        if tier_filter:
            filtered_data = []
            for item in data_result.data or []:
                credit_account = credit_accounts.get(item['id'])
                if credit_account and credit_account.get('tier') == tier_filter:
                    filtered_data.append(item)
            data_result.data = filtered_data
            total_count = len(filtered_data)
        
        if sort_by in ["balance", "tier"]:
            def get_sort_value(item):
                credit = credit_accounts.get(item['id'], {})
                if sort_by == "balance":
                    return float(credit.get('balance', 0))
                else:
                    return credit.get('tier', 'free')
            
            ascending = sort_order.lower() == "asc"
            data_result.data = sorted(
                data_result.data or [], 
                key=get_sort_value,
                reverse=not ascending
            )
            if tier_filter:
                paginated_data = data_result.data[offset:offset + pagination_params.page_size]
            else:
                paginated_data = data_result.data
        else:
            paginated_data = data_result.data or []
        
        users = []
        for item in paginated_data:
            subscription_status = None
            if item.get('billing_subscriptions'):
                subscription_status = item['billing_subscriptions'][0].get('status')
            
            credit_account = credit_accounts.get(item['id'], {})
            
            email = 'N/A'
            if item.get('billing_customers') and item['billing_customers'][0].get('email'):
                email = item['billing_customers'][0]['email']
            elif item.get('primary_owner_user_id'):
                try:
                    user_email_result = await client.rpc('get_user_email', {'user_id': item['primary_owner_user_id']}).execute()
                    if user_email_result.data:
                        email = user_email_result.data
                except Exception as e:
                    logger.warning(f"Failed to get email for account {item['id']}: {e}")
            
            users.append(UserSummary(
                id=item['id'],
                email=email,
                created_at=datetime.fromisoformat(item['created_at'].replace('Z', '+00:00')),
                tier=credit_account.get('tier', 'free'),
                credit_balance=float(credit_account.get('balance', 0)),
                total_purchased=float(credit_account.get('lifetime_purchased', 0)),
                total_used=float(credit_account.get('lifetime_used', 0)),
                subscription_status=subscription_status,
                trial_status=credit_account.get('trial_status')
            ))
        
        return await PaginationService.paginate_with_total_count(
            items=users,
            total_count=total_count,
            params=pagination_params
        )
        
    except Exception as e:
        logger.error(f"Failed to list users: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve users")

@router.get("/users/{user_id}")
async def get_user_details(
    user_id: str,
    admin: dict = Depends(require_any_admin)
):
    """Get detailed information about a specific user."""
    try:
        db = DBConnection()
        client = await db.client

        account_result = await client.schema('basejump').from_('accounts').select(
            '''
            id,
            created_at,
            primary_owner_user_id,
            billing_customers(email),
            billing_subscriptions(status, created, current_period_end)
            '''
        ).eq('id', user_id).execute()
        
        if not account_result.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        account = account_result.data[0]
        
        if not account.get('billing_customers') or not account['billing_customers'][0].get('email'):
            if account.get('primary_owner_user_id'):
                try:
                    user_email_result = await client.rpc('get_user_email', {'user_id': account['primary_owner_user_id']}).execute()
                    if user_email_result.data:
                        if not account.get('billing_customers'):
                            account['billing_customers'] = [{}]
                        account['billing_customers'][0]['email'] = user_email_result.data
                except Exception as e:
                    logger.warning(f"Failed to get email for account {user_id}: {e}")
        
        credit_result = await client.from_('credit_accounts').select(
            'balance, tier, lifetime_granted, lifetime_purchased, lifetime_used, last_grant_date'
        ).eq('account_id', user_id).execute()
        
        if credit_result.data:
            account['credit_accounts'] = credit_result.data
        else:
            account['credit_accounts'] = [{
                'balance': '0',
                'tier': 'free',
                'lifetime_granted': '0',
                'lifetime_purchased': '0',
                'lifetime_used': '0',
                'last_grant_date': None
            }]
        
        recent_activity = await client.from_('agent_runs').select(
            'id, created_at, status, thread_id, threads!inner(account_id)'
        ).eq('threads.account_id', user_id).order('created_at', desc=True).limit(10).execute()
        
        return {
            "user": account,
            "recent_activity": recent_activity.data or []
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get user details: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve user details")
