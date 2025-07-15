from fastapi import APIRouter, HTTPException, Depends, Request, Body, Query
from fastapi.responses import JSONResponse
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import os
from datetime import datetime, timezone
import croniter
import pytz

from .support.factory import TriggerModuleFactory
from .support.exceptions import TriggerError, ConfigurationError, ProviderError
from .services.trigger_service import TriggerService
from .services.execution_service import TriggerExecutionService
from .services.provider_service import ProviderService
from .endpoints import workflows_router, set_workflows_db_connection
from services.supabase import DBConnection
from utils.auth_utils import get_current_user_id_from_jwt
from utils.logger import logger
from flags.flags import is_enabled
from utils.config import config, EnvMode

router = APIRouter(prefix="/triggers", tags=["triggers"])

workflows_api_router = APIRouter(prefix="/workflows", tags=["workflows"])
workflows_api_router.include_router(workflows_router)

trigger_service: Optional[TriggerService] = None
execution_service: Optional[TriggerExecutionService] = None
provider_service: Optional[ProviderService] = None
db = None


class TriggerCreateRequest(BaseModel):
    provider_id: str
    name: str
    config: Dict[str, Any]
    description: Optional[str] = None


class TriggerUpdateRequest(BaseModel):
    config: Optional[Dict[str, Any]] = None
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class TriggerResponse(BaseModel):
    trigger_id: str
    agent_id: str
    trigger_type: str
    provider_id: str
    name: str
    description: Optional[str]
    is_active: bool
    webhook_url: Optional[str]
    created_at: str
    updated_at: str
    config: Dict[str, Any]


class ProviderResponse(BaseModel):
    provider_id: str
    name: str
    description: str
    trigger_type: str
    webhook_enabled: bool
    setup_required: bool
    config_schema: Dict[str, Any]


class UpcomingRun(BaseModel):
    trigger_id: str
    trigger_name: str
    trigger_type: str
    next_run_time: str
    next_run_time_local: str
    timezone: str
    cron_expression: str
    execution_type: str
    agent_prompt: Optional[str] = None
    workflow_id: Optional[str] = None
    is_active: bool
    human_readable: str


class UpcomingRunsResponse(BaseModel):
    upcoming_runs: List[UpcomingRun]
    total_count: int


def initialize(database: DBConnection):
    global db, trigger_service, execution_service, provider_service
    db = database
    set_workflows_db_connection(database)


async def get_services() -> tuple[TriggerService, TriggerExecutionService, ProviderService]:
    global trigger_service, execution_service, provider_service
    
    if trigger_service is None or execution_service is None or provider_service is None:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not initialized")
        
        trigger_service, execution_service, provider_service = await TriggerModuleFactory.create_trigger_module(db)
    
    return trigger_service, execution_service, provider_service


async def verify_agent_access(agent_id: str, user_id: str):
    client = await db.client
    result = await client.table('agents').select('agent_id').eq('agent_id', agent_id).eq('account_id', user_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Agent not found or access denied")


@router.get("/providers", response_model=List[ProviderResponse])
async def get_providers():
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    try:
        _, _, provider_svc = await get_services()
        providers = await provider_svc.get_available_providers()
        
        return [
            ProviderResponse(
                provider_id=provider.provider_id,
                name=provider.name,
                description=provider.description,
                trigger_type=provider.trigger_type.value,
                webhook_enabled=provider.webhook_enabled,
                setup_required=provider.setup_required,
                config_schema=provider.config_schema
            )
            for provider in providers
        ]
    except Exception as e:
        logger.error(f"Error getting providers: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/providers/{provider_id}/schema")
async def get_provider_schema(provider_id: str):
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    try:
        _, _, provider_svc = await get_services()
        schema = await provider_svc.get_provider_config_schema(provider_id)
        
        if not schema:
            raise HTTPException(status_code=404, detail="Provider not found")
        
        return {"schema": schema}
    except Exception as e:
        logger.error(f"Error getting provider schema: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/agents/{agent_id}/triggers", response_model=List[TriggerResponse])
async def get_agent_triggers(
    agent_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    await verify_agent_access(agent_id, user_id)
    
    try:
        trigger_svc, _, provider_svc = await get_services()
        triggers = await trigger_svc.get_agent_triggers(agent_id)
        
        base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
        
        responses = []
        for trigger in triggers:
            provider_def = await provider_svc.get_provider_definition(trigger.provider_id)
            
            webhook_url = None
            if provider_def and provider_def.webhook_enabled:
                webhook_url = f"{base_url}/api/triggers/{trigger.trigger_id}/webhook"
            
            responses.append(TriggerResponse(
                trigger_id=trigger.trigger_id,
                agent_id=trigger.agent_id,
                trigger_type=trigger.trigger_type.value,
                provider_id=trigger.provider_id,
                name=trigger.config.name,
                description=trigger.config.description,
                is_active=trigger.is_active,
                webhook_url=webhook_url,
                created_at=trigger.metadata.created_at.isoformat(),
                updated_at=trigger.metadata.updated_at.isoformat(),
                config=trigger.config.config
            ))
        
        return responses
    except Exception as e:
        logger.error(f"Error getting agent triggers: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/agents/{agent_id}/upcoming-runs", response_model=UpcomingRunsResponse)
async def get_agent_upcoming_runs(
    agent_id: str,
    limit: int = Query(10, ge=1, le=50),
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    await verify_agent_access(agent_id, user_id)
    
    try:
        trigger_svc, _, _ = await get_services()
        triggers = await trigger_svc.get_agent_triggers(agent_id)
        schedule_triggers = [
            trigger for trigger in triggers 
            if trigger.is_active and trigger.trigger_type.value == "schedule"
        ]
        
        upcoming_runs = []
        now = datetime.now(timezone.utc)
        for trigger in schedule_triggers:
            config = trigger.config.config
            cron_expression = config.get('cron_expression')
            user_timezone = config.get('timezone', 'UTC')
            
            if not cron_expression:
                continue
                
            try:
                next_run = _get_next_run_time(cron_expression, user_timezone)
                if not next_run:
                    continue
                    
                local_tz = pytz.timezone(user_timezone)
                next_run_local = next_run.astimezone(local_tz)
                
                human_readable = _get_human_readable_schedule(cron_expression, user_timezone)
                
                upcoming_runs.append(UpcomingRun(
                    trigger_id=trigger.trigger_id,
                    trigger_name=trigger.config.name,
                    trigger_type=trigger.trigger_type.value,
                    next_run_time=next_run.isoformat(),
                    next_run_time_local=next_run_local.isoformat(),
                    timezone=user_timezone,
                    cron_expression=cron_expression,
                    execution_type=config.get('execution_type', 'agent'),
                    agent_prompt=config.get('agent_prompt'),
                    workflow_id=config.get('workflow_id'),
                    is_active=trigger.is_active,
                    human_readable=human_readable
                ))
                
            except Exception as e:
                logger.warning(f"Error calculating next run for trigger {trigger.trigger_id}: {e}")
                continue
        
        upcoming_runs.sort(key=lambda x: x.next_run_time)
        upcoming_runs = upcoming_runs[:limit]
        
        return UpcomingRunsResponse(
            upcoming_runs=upcoming_runs,
            total_count=len(upcoming_runs)
        )
        
    except Exception as e:
        logger.error(f"Error getting upcoming runs: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


def _get_next_run_time(cron_expression: str, user_timezone: str) -> Optional[datetime]:
    try:
        tz = pytz.timezone(user_timezone)
        now_local = datetime.now(tz)
        
        cron = croniter.croniter(cron_expression, now_local)
        
        next_run_local = cron.get_next(datetime)
        next_run_utc = next_run_local.astimezone(timezone.utc)
        
        return next_run_utc
        
    except Exception as e:
        logger.error(f"Error calculating next run time: {e}")
        return None


def _get_human_readable_schedule(cron_expression: str, user_timezone: str) -> str:
    try:
        patterns = {
            '*/5 * * * *': 'Every 5 minutes',
            '*/10 * * * *': 'Every 10 minutes',
            '*/15 * * * *': 'Every 15 minutes',
            '*/30 * * * *': 'Every 30 minutes',
            '0 * * * *': 'Every hour',
            '0 */2 * * *': 'Every 2 hours',
            '0 */4 * * *': 'Every 4 hours',
            '0 */6 * * *': 'Every 6 hours',
            '0 */12 * * *': 'Every 12 hours',
            '0 0 * * *': 'Daily at midnight',
            '0 9 * * *': 'Daily at 9:00 AM',
            '0 12 * * *': 'Daily at 12:00 PM',
            '0 18 * * *': 'Daily at 6:00 PM',
            '0 9 * * 1-5': 'Weekdays at 9:00 AM',
            '0 9 * * 1': 'Every Monday at 9:00 AM',
            '0 9 * * 2': 'Every Tuesday at 9:00 AM',
            '0 9 * * 3': 'Every Wednesday at 9:00 AM',
            '0 9 * * 4': 'Every Thursday at 9:00 AM',
            '0 9 * * 5': 'Every Friday at 9:00 AM',
            '0 9 * * 6': 'Every Saturday at 9:00 AM',
            '0 9 * * 0': 'Every Sunday at 9:00 AM',
            '0 9 1 * *': 'Monthly on the 1st at 9:00 AM',
            '0 9 15 * *': 'Monthly on the 15th at 9:00 AM',
            '0 9,17 * * *': 'Daily at 9:00 AM and 5:00 PM',
            '0 10 * * 0,6': 'Weekends at 10:00 AM',
        }
        
        if cron_expression in patterns:
            description = patterns[cron_expression]
            if user_timezone != 'UTC':
                description += f" ({user_timezone})"
            return description
        
        parts = cron_expression.split()
        if len(parts) != 5:
            return f"Custom schedule: {cron_expression}"
            
        minute, hour, day, month, weekday = parts

        if minute.isdigit() and hour == '*' and day == '*' and month == '*' and weekday == '*':
            return f"Every hour at :{minute.zfill(2)}"
            
        if minute.isdigit() and hour.isdigit() and day == '*' and month == '*' and weekday == '*':
            time_str = f"{hour.zfill(2)}:{minute.zfill(2)}"
            description = f"Daily at {time_str}"
            if user_timezone != 'UTC':
                description += f" ({user_timezone})"
            return description
            
        if minute.isdigit() and hour.isdigit() and day == '*' and month == '*' and weekday == '1-5':
            time_str = f"{hour.zfill(2)}:{minute.zfill(2)}"
            description = f"Weekdays at {time_str}"
            if user_timezone != 'UTC':
                description += f" ({user_timezone})"
            return description
            
        return f"Custom schedule: {cron_expression}"
        
    except Exception:
        return f"Custom schedule: {cron_expression}"


@router.post("/agents/{agent_id}/triggers", response_model=TriggerResponse)
async def create_agent_trigger(
    agent_id: str,
    request: TriggerCreateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
        
    await verify_agent_access(agent_id, user_id)
    
    try:
        trigger_svc, _, provider_svc = await get_services()
        
        trigger = await trigger_svc.create_trigger(
            agent_id=agent_id,
            provider_id=request.provider_id,
            name=request.name,
            config=request.config,
            description=request.description
        )
        
        provider_def = await provider_svc.get_provider_definition(request.provider_id)
        webhook_url = None
        if provider_def and provider_def.webhook_enabled:
            base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
            webhook_url = f"{base_url}/api/triggers/{trigger.trigger_id}/webhook"
        
        return TriggerResponse(
            trigger_id=trigger.trigger_id,
            agent_id=trigger.agent_id,
            trigger_type=trigger.trigger_type.value,
            provider_id=trigger.provider_id,
            name=trigger.config.name,
            description=trigger.config.description,
            is_active=trigger.is_active,
            webhook_url=webhook_url,
            created_at=trigger.metadata.created_at.isoformat(),
            updated_at=trigger.metadata.updated_at.isoformat(),
            config=trigger.config.config
        )
        
    except (ValueError, ConfigurationError, ProviderError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating trigger: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{trigger_id}", response_model=TriggerResponse)
async def get_trigger(
    trigger_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    try:
        trigger_svc, _, provider_svc = await get_services()
        trigger = await trigger_svc.get_trigger(trigger_id)
        
        if not trigger:
            raise HTTPException(status_code=404, detail="Trigger not found")
        
        await verify_agent_access(trigger.agent_id, user_id)
        
        provider_def = await provider_svc.get_provider_definition(trigger.provider_id)
        
        webhook_url = None
        if provider_def and provider_def.webhook_enabled:
            base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
            webhook_url = f"{base_url}/api/triggers/{trigger_id}/webhook"
        
        return TriggerResponse(
            trigger_id=trigger.trigger_id,
            agent_id=trigger.agent_id,
            trigger_type=trigger.trigger_type.value,
            provider_id=trigger.provider_id,
            name=trigger.config.name,
            description=trigger.config.description,
            is_active=trigger.is_active,
            webhook_url=webhook_url,
            created_at=trigger.metadata.created_at.isoformat(),
            updated_at=trigger.metadata.updated_at.isoformat(),
            config=trigger.config.config
        )
    except Exception as e:
        logger.error(f"Error getting trigger: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/{trigger_id}", response_model=TriggerResponse)
async def update_trigger(
    trigger_id: str,
    request: TriggerUpdateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    try:
        trigger_svc, _, provider_svc = await get_services()
        
        trigger = await trigger_svc.get_trigger(trigger_id)
        if not trigger:
            raise HTTPException(status_code=404, detail="Trigger not found")

        await verify_agent_access(trigger.agent_id, user_id)
        
        updated_trigger = await trigger_svc.update_trigger(
            trigger_id=trigger_id,
            config=request.config,
            name=request.name,
            description=request.description,
            is_active=request.is_active
        )
        
        provider_def = await provider_svc.get_provider_definition(updated_trigger.provider_id)
        
        webhook_url = None
        if provider_def and provider_def.webhook_enabled:
            base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
            webhook_url = f"{base_url}/api/triggers/{trigger_id}/webhook"

        return TriggerResponse(
            trigger_id=updated_trigger.trigger_id,
            agent_id=updated_trigger.agent_id,
            trigger_type=updated_trigger.trigger_type.value,
            provider_id=updated_trigger.provider_id,
            name=updated_trigger.config.name,
            description=updated_trigger.config.description,
            is_active=updated_trigger.is_active,
            webhook_url=webhook_url,
            created_at=updated_trigger.metadata.created_at.isoformat(),
            updated_at=updated_trigger.metadata.updated_at.isoformat(),
            config=updated_trigger.config.config
        )
        
    except (ValueError, ConfigurationError, ProviderError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating trigger: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/{trigger_id}")
async def delete_trigger(
    trigger_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    try:
        trigger_svc, _, _ = await get_services()
        trigger = await trigger_svc.get_trigger(trigger_id)
        if not trigger:
            raise HTTPException(status_code=404, detail="Trigger not found")

        await verify_agent_access(trigger.agent_id, user_id)
        
        success = await trigger_svc.delete_trigger(trigger_id)
        if not success:
            raise HTTPException(status_code=404, detail="Trigger not found")
        
        return {"message": "Trigger deleted successfully"}
        
    except Exception as e:
        logger.error(f"Error deleting trigger: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/{trigger_id}/webhook")
async def trigger_webhook(
    trigger_id: str,
    request: Request
):
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    try:
        trigger_svc, execution_svc, _ = await get_services()
        try:
            raw_data = await request.json()
        except:
            raw_data = {}
        
        result = await trigger_svc.process_trigger_event(trigger_id, raw_data)
        
        if not result.success:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": result.error_message}
            )
        
        if result.should_execute_agent or result.should_execute_workflow:
            trigger = await trigger_svc.get_trigger(trigger_id)
            if trigger:
                logger.info(f"Executing agent {trigger.agent_id} for trigger {trigger_id}")
                
                from .domain.entities import TriggerEvent
                event = TriggerEvent(
                    trigger_id=trigger_id,
                    agent_id=trigger.agent_id,
                    trigger_type=trigger.trigger_type,
                    raw_data=raw_data
                )
                
                execution_result = await execution_svc.execute_trigger_result(
                    agent_id=trigger.agent_id,
                    trigger_result=result,
                    trigger_event=event
                )
                
                logger.info(f"Agent execution result: {execution_result}")
                
                return JSONResponse(content={
                    "success": True,
                    "message": "Trigger processed and agent execution started",
                    "execution": execution_result,
                    "trigger_result": {
                        "should_execute_agent": result.should_execute_agent,
                        "should_execute_workflow": result.should_execute_workflow,
                        "agent_prompt": result.agent_prompt
                    }
                })
            else:
                logger.warning(f"Trigger {trigger_id} not found for execution")
        
        logger.info(f"Webhook processed but no execution needed (should_execute_agent={result.should_execute_agent})")
        return JSONResponse(content={
            "success": True,
            "message": "Trigger processed successfully (no execution needed)",
            "trigger_result": {
                "should_execute_agent": result.should_execute_agent,
                "should_execute_workflow": result.should_execute_workflow
            }
        })
        
    except Exception as e:
        logger.error(f"Error processing webhook trigger: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": "Internal server error"}
        )
