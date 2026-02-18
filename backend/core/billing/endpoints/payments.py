from fastapi import APIRouter, HTTPException, Depends, Query # type: ignore
from typing import Optional, Dict
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from core.services.supabase import DBConnection
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from ..shared.models import PurchaseCreditsRequest
from ..shared.config import CREDITS_PER_DOLLAR
from ..payments import payment_service

router = APIRouter(tags=["billing-payments"])

@router.post("/purchase-credits")
async def purchase_credits_checkout(
    request: PurchaseCreditsRequest,
    account_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict:
    try:
        from ..subscriptions import subscription_service
        result = await payment_service.create_credit_purchase_checkout(
            account_id=account_id,
            amount=request.amount,
            success_url=request.success_url,
            cancel_url=request.cancel_url,
            get_user_subscription_tier_func=subscription_service.get_user_subscription_tier
        )
        return result
    except Exception as e:
        logger.error(f"[BILLING] Error creating credit purchase checkout: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/transactions")
async def get_my_transactions(
    account_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(50, ge=1, le=100, description="Number of transactions to fetch"),
    offset: int = Query(0, ge=0, description="Number of transactions to skip")
) -> Dict:
    try:
        db = DBConnection()
        client = await db.client
        
        transactions_result = await client.from_('credit_ledger')\
            .select('*')\
            .eq('account_id', account_id)\
            .order('created_at', desc=True)\
            .range(offset, offset + limit - 1)\
            .execute()
        
        transactions = []
        if transactions_result.data:
            for txn in transactions_result.data:
                transactions.append({
                    'id': txn['id'],
                    'amount': txn['amount'] * CREDITS_PER_DOLLAR,
                    'type': txn['type'],
                    'description': txn['description'],
                    'created_at': txn['created_at'],
                    'metadata': txn.get('metadata', {})
                })
        
        count_result = await client.from_('credit_ledger')\
            .select('id')\
            .eq('account_id', account_id)\
            .execute()
        
        total_count = len(count_result.data) if count_result.data else 0
        
        return {
            'transactions': transactions,
            'pagination': {
                'limit': limit,
                'offset': offset,
                'total': total_count,
                'has_more': offset + limit < total_count
            }
        }
    except Exception as e:
        logger.error(f"[BILLING] Error fetching transactions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/transactions/summary")
async def get_transactions_summary(
    account_id: str = Depends(verify_and_get_user_id_from_jwt),
    days: int = Query(30, ge=1, le=365, description="Number of days to look back")
) -> Dict:
    try:
        db = DBConnection()
        client = await db.client
        
        since_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        summary_result = await client.from_('credit_ledger')\
            .select('type, amount')\
            .eq('account_id', account_id)\
            .gte('created_at', since_date.isoformat())\
            .execute()
        
        summary = {
            'period_days': days,
            'period_start': since_date.isoformat(),
            'period_end': datetime.now(timezone.utc).isoformat(),
            'total_spent': 0.0,
            'total_added': 0.0,
            'usage_count': 0,
            'purchase_count': 0,
            'by_type': {}
        }
        
        if summary_result.data:
            for txn in summary_result.data:
                txn_type = txn['type']
                amount = float(txn['amount'])
                
                if txn_type not in summary['by_type']:
                    summary['by_type'][txn_type] = {'count': 0, 'total': 0.0}
                
                summary['by_type'][txn_type]['count'] += 1
                summary['by_type'][txn_type]['total'] += amount
                
                if amount < 0:
                    summary['total_spent'] += abs(amount) * CREDITS_PER_DOLLAR
                    if txn_type == 'usage':
                        summary['usage_count'] += 1
                else:
                    summary['total_added'] += amount * CREDITS_PER_DOLLAR
                    if txn_type == 'purchase':
                        summary['purchase_count'] += 1
        
        return summary
        
    except Exception as e:
        logger.error(f"[BILLING] Error getting transaction summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/credit-usage")
async def get_credit_usage(
    account_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(50, ge=1, le=100, description="Number of usage records to fetch"),
    offset: int = Query(0, ge=0, description="Number of usage records to skip")
) -> Dict:
    try:
        db = DBConnection()
        client = await db.client
        
        usage_result = await client.from_('credit_ledger')\
            .select('*')\
            .eq('account_id', account_id)\
            .eq('type', 'usage')\
            .order('created_at', desc=True)\
            .range(offset, offset + limit - 1)\
            .execute()
        
        usage_records = []
        if usage_result.data:
            for record in usage_result.data:
                metadata = record.get('metadata', {})
                usage_records.append({
                    'id': record['id'],
                    'amount': abs(float(record['amount'])) * CREDITS_PER_DOLLAR,
                    'description': record['description'],
                    'created_at': record['created_at'],
                    'message_id': metadata.get('message_id'),
                    'thread_id': metadata.get('thread_id'),
                    'model': metadata.get('model'),
                    'tokens': metadata.get('tokens')
                })
        
        count_result = await client.from_('credit_ledger')\
            .select('id')\
            .eq('account_id', account_id)\
            .eq('type', 'usage')\
            .execute()
        
        total_count = len(count_result.data) if count_result.data else 0
        
        return {
            'usage_records': usage_records,
            'pagination': {
                'limit': limit,
                'offset': offset,
                'total': total_count,
                'has_more': offset + limit < total_count
            }
        }
    except Exception as e:
        logger.error(f"[BILLING] Error fetching credit usage: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/credit-usage-detail")
async def get_credit_usage_detail(
    account_id: str = Depends(verify_and_get_user_id_from_jwt),
    days: Optional[int] = Query(None, ge=1, le=100, description="Number of days to look back"),
    start_date: Optional[str] = Query(None, description="Start date in ISO format"),
    end_date: Optional[str] = Query(None, description="End date in ISO format")
) -> Dict:
    """
    Returns daily usage logs with per-thread breakdown of prompt vs tool usage.
    Used for the "Daily Usage Logs" UI - grouped by date, then by project/thread,
    with expandable rows showing Time, Type (Prompt/Tool), Prompt tokens, Completion,
    Tool cost, Total Cost, Credits.
    """
    from core.utils.config import config

    try:
        db = DBConnection()
        client = await db.client

        if start_date and end_date:
            try:
                start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"Invalid date format: {e}")
        elif days:
            end_dt = datetime.now(timezone.utc)
            start_dt = end_dt - timedelta(days=days)
        else:
            end_dt = datetime.now(timezone.utc)
            start_dt = end_dt - timedelta(days=30)

        if config.ENTERPRISE_MODE:
            usage_result = await client.from_('enterprise_usage').select(
                'id, thread_id, message_id, cost, model_name, tokens_used, '
                'prompt_tokens, completion_tokens, tool_name, tool_cost, usage_type, created_at'
            ).eq('account_id', account_id).gte(
                'created_at', start_dt.isoformat()
            ).lte('created_at', end_dt.isoformat()).order('created_at', desc=True).execute()

            records = usage_result.data or []
            usage_rows = []
            for r in records:
                thread_id = r.get('thread_id')
                if not thread_id:
                    continue
                cost = abs(float(r.get('cost', 0)))
                credits = cost * CREDITS_PER_DOLLAR
                usage_type = r.get('usage_type') or 'token'
                tool_name = r.get('tool_name')
                if usage_type == 'tool':
                    type_display = f"Tool - {tool_name}" if tool_name else "Tool"
                    prompt_tokens = 0
                    completion_tokens = 0
                    tool_cost = cost
                else:
                    type_display = "Prompt"
                    prompt_tokens = r.get('prompt_tokens') or 0
                    completion_tokens = r.get('completion_tokens') or 0
                    tool_cost = 0
                usage_rows.append({
                    'thread_id': thread_id,
                    'created_at': r['created_at'],
                    'type': usage_type,
                    'type_display': type_display,
                    'prompt_tokens': prompt_tokens,
                    'completion_tokens': completion_tokens,
                    'tool_cost': tool_cost,
                    'total_cost': cost,
                    'credits': round(credits),
                    'model_name': r.get('model_name'),
                    'tool_name': tool_name,
                })
        else:
            usage_result = await client.from_('credit_ledger').select(
                'id, amount, description, created_at, metadata'
            ).eq('account_id', account_id).eq('type', 'usage').gte(
                'created_at', start_dt.isoformat()
            ).lte('created_at', end_dt.isoformat()).order('created_at', desc=True).execute()

            records = usage_result.data or []
            usage_rows = []
            for r in records:
                metadata = r.get('metadata') or {}
                thread_id = metadata.get('thread_id') or r.get('thread_id')
                if not thread_id:
                    continue
                amount = abs(float(r.get('amount', 0)))
                cost = amount
                credits = amount * CREDITS_PER_DOLLAR
                desc = (r.get('description') or '')
                if desc.startswith('Tool usage: '):
                    tool_name = desc.replace('Tool usage: ', '', 1)
                    type_display = f"Tool - {tool_name}"
                    prompt_tokens = 0
                    completion_tokens = 0
                    tool_cost = cost
                    row_type = 'tool'
                else:
                    tool_name = None
                    type_display = "Prompt"
                    prompt_tokens = 0
                    completion_tokens = 0
                    tool_cost = 0
                    row_type = 'token'
                usage_rows.append({
                    'thread_id': thread_id,
                    'created_at': r['created_at'],
                    'type': row_type,
                    'type_display': type_display,
                    'prompt_tokens': prompt_tokens,
                    'completion_tokens': completion_tokens,
                    'tool_cost': tool_cost,
                    'total_cost': cost,
                    'credits': round(credits),
                    'model_name': None,
                    'tool_name': tool_name,
                })

        thread_ids = list({r['thread_id'] for r in usage_rows})
        thread_details = {}
        if thread_ids:
            threads_result = await client.from_('threads').select(
                'thread_id, project_id, created_at'
            ).in_('thread_id', thread_ids).execute()
            if threads_result.data:
                project_ids = [t['project_id'] for t in threads_result.data if t.get('project_id')]
                project_names = {}
                if project_ids:
                    proj_result = await client.from_('projects').select(
                        'project_id, name'
                    ).in_('project_id', project_ids).execute()
                    if proj_result.data:
                        project_names = {p['project_id']: p.get('name', '') for p in proj_result.data}
                for t in threads_result.data:
                    thread_details[t['thread_id']] = {
                        'project_id': t.get('project_id'),
                        'project_name': project_names.get(t.get('project_id'), ''),
                        'created_at': t.get('created_at'),
                    }

        from collections import defaultdict
        by_date_thread = defaultdict(lambda: defaultdict(list))
        for row in usage_rows:
            dt = datetime.fromisoformat(row['created_at'].replace('Z', '+00:00'))
            date_key = dt.strftime('%Y-%m-%d')
            thread_id = row['thread_id']
            by_date_thread[date_key][thread_id].append(row)

        daily_usage = []
        for date_key in sorted(by_date_thread.keys(), reverse=True):
            day_data = by_date_thread[date_key]
            dt_first = datetime.strptime(date_key, '%Y-%m-%d')
            date_display = dt_first.strftime('%A, %B %d, %Y')
            threads_list = []
            day_credits = 0
            day_cost = 0
            for thread_id, recs in day_data.items():
                details = thread_details.get(thread_id, {})
                project_name = details.get('project_name', '') or 'Unknown Project'
                total_credits = sum(r['credits'] for r in recs)
                total_cost = sum(r['total_cost'] for r in recs)
                day_credits += total_credits
                day_cost += total_cost
                threads_list.append({
                    'thread_id': thread_id,
                    'project_id': details.get('project_id'),
                    'project_name': project_name,
                    'total_requests': len(recs),
                    'total_credits': total_credits,
                    'total_cost': round(total_cost, 2),
                    'usage_records': [
                        {
                            'time': datetime.fromisoformat(r['created_at'].replace('Z', '+00:00')).strftime('%I:%M:%S %p'),
                            'type_display': r['type_display'],
                            'prompt_tokens': r['prompt_tokens'],
                            'completion_tokens': r['completion_tokens'],
                            'tool_cost': r['tool_cost'],
                            'total_cost': r['total_cost'],
                            'credits': r['credits'],
                        }
                        for r in sorted(recs, key=lambda x: x['created_at'])
                    ],
                })
            daily_usage.append({
                'date': date_key,
                'date_display': date_display,
                'total_credits': day_credits,
                'total_cost': round(day_cost, 2),
                'threads': threads_list,
            })

        total_credits = sum(d['total_credits'] for d in daily_usage)
        total_cost = sum(d['total_cost'] for d in daily_usage)

        return {
            'daily_usage': daily_usage,
            'summary': {
                'total_credits_used': total_credits,
                'total_cost': round(total_cost, 2),
                'start_date': start_dt.isoformat(),
                'end_date': end_dt.isoformat(),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[BILLING] Error getting credit usage detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/credit-usage-by-thread")
async def get_credit_usage_by_thread(
    account_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(50, ge=1, le=100, description="Number of threads to fetch"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    days: Optional[int] = Query(None, ge=1, le=365, description="Number of days to look back"),
    start_date: Optional[str] = Query(None, description="Start date in ISO format"),
    end_date: Optional[str] = Query(None, description="End date in ISO format")
) -> Dict:
    from core.utils.config import config
    
    try:
        db = DBConnection()
        client = await db.client
        
        period_days = None
        
        # Enterprise mode uses enterprise_usage table, SaaS uses credit_ledger
        if config.ENTERPRISE_MODE:
            query = client.from_('enterprise_usage')\
                .select('thread_id, cost, created_at, model_name')\
                .eq('account_id', account_id)
            table_name = 'enterprise_usage'
            amount_field = 'cost'
        else:
            query = client.from_('credit_ledger')\
                .select('thread_id, amount, created_at, description, metadata')\
                .eq('account_id', account_id)\
                .eq('type', 'usage')
            table_name = 'credit_ledger'
            amount_field = 'amount'
        
        # Handle date filtering: prioritize start_date/end_date over days
        if start_date and end_date:
            try:
                start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                query = query.gte('created_at', start_dt.isoformat())
                query = query.lte('created_at', end_dt.isoformat())
                period_days = (end_dt - start_dt).days
                logger.info(f"[BILLING] Filtering credit usage by date range: {start_dt.isoformat()} to {end_dt.isoformat()}")
            except ValueError as e:
                logger.error(f"[BILLING] Invalid date format: {e}")
                raise HTTPException(status_code=400, detail=f"Invalid date format: {e}")
        elif days:
            since_date = datetime.now(timezone.utc) - timedelta(days=days)
            query = query.gte('created_at', since_date.isoformat())
            period_days = days
            logger.info(f"[BILLING] Filtering credit usage by days: {days} days back from now")
        
        usage_result = await query.order('created_at', desc=True).execute()
        logger.info(f"[BILLING] Found {len(usage_result.data) if usage_result.data else 0} credit usage records from {table_name} for account {account_id}")
        
        thread_usage = {}
        total_usage = 0.0
        
        if usage_result.data:
            for record in usage_result.data:
                # thread_id can be in the column OR in metadata (from atomic functions in SaaS mode)
                thread_id = record.get('thread_id')
                if not thread_id and record.get('metadata'):
                    thread_id = record['metadata'].get('thread_id')
                
                # Skip records without thread_id
                if not thread_id:
                    continue
                
                # Enterprise mode uses 'cost', SaaS uses 'amount'
                if config.ENTERPRISE_MODE:
                    amount = abs(float(record.get('cost', 0)))
                else:
                    amount = abs(float(record.get('amount', 0)))
                total_usage += amount
                
                if thread_id not in thread_usage:
                    thread_usage[thread_id] = {
                        'thread_id': thread_id,
                        'total_amount': 0.0,
                        'usage_count': 0,
                        'last_usage': record['created_at']
                    }
                
                thread_usage[thread_id]['total_amount'] += amount
                thread_usage[thread_id]['usage_count'] += 1
        
        sorted_threads = sorted(
            thread_usage.values(), 
            key=lambda x: x['last_usage'], 
            reverse=True
        )
        
        total_threads = len(sorted_threads)
        paginated_threads = sorted_threads[offset:offset + limit]
        
        # Fetch thread details to get project_id and project_name
        thread_ids = [t['thread_id'] for t in paginated_threads]
        thread_details = {}
        if thread_ids:
            threads_result = await client.from_('threads')\
                .select('thread_id, project_id, created_at')\
                .in_('thread_id', thread_ids)\
                .execute()
            
            if threads_result.data:
                for thread in threads_result.data:
                    thread_details[thread['thread_id']] = {
                        'project_id': thread.get('project_id'),
                        'created_at': thread.get('created_at')
                    }
                
                # Fetch project names for threads that have project_id
                project_ids = [t['project_id'] for t in threads_result.data if t.get('project_id')]
                if project_ids:
                    projects_result = await client.from_('projects')\
                        .select('project_id, name')\
                        .in_('project_id', project_ids)\
                        .execute()
                    
                    if projects_result.data:
                        project_names = {p['project_id']: p.get('name', '') for p in projects_result.data}
                        for thread in threads_result.data:
                            if thread.get('project_id') in project_names:
                                thread_details[thread['thread_id']]['project_name'] = project_names[thread['project_id']]
        
        # Transform to match frontend interface
        thread_usage_records = []
        for thread_data in paginated_threads:
            thread_id = thread_data['thread_id']
            details = thread_details.get(thread_id, {})
            
            thread_usage_records.append({
                'thread_id': thread_id,
                'project_id': details.get('project_id'),
                'project_name': details.get('project_name', ''),
                'credits_used': thread_data['total_amount'] * CREDITS_PER_DOLLAR,
                'last_used': thread_data['last_usage'],
                'created_at': details.get('created_at', thread_data['last_usage'])
            })
        
        # Calculate start_date and end_date for summary
        summary_start_date = start_date if start_date else None
        summary_end_date = end_date if end_date else None
        if not summary_start_date and days:
            summary_start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
            summary_end_date = datetime.now(timezone.utc).isoformat()
        
        return {
            'thread_usage': thread_usage_records,
            'pagination': {
                'total': total_threads,
                'limit': limit,
                'offset': offset,
                'has_more': total_threads > offset + limit
            },
            'summary': {
                'total_credits_used': total_usage * CREDITS_PER_DOLLAR,
                'total_threads': total_threads,
                'period_days': period_days,
                'start_date': summary_start_date or '',
                'end_date': summary_end_date or ''
            }
        }
    except Exception as e:
        logger.error(f"[BILLING] Error getting credit usage by thread: {e}")
        raise HTTPException(status_code=500, detail=str(e))
