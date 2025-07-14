from fastapi import APIRouter, HTTPException, Depends, Request, Body, Query
from fastapi.responses import JSONResponse
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import os
from datetime import datetime

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


class ProviderResponse(BaseModel):
    provider_id: str
    name: str
    description: str
    trigger_type: str
    webhook_enabled: bool
    setup_required: bool
    config_schema: Dict[str, Any]


def initialize(database: DBConnection):
    global db, trigger_service, execution_service, provider_service
    db = database
    # Initialize workflows API with DB connection
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
                updated_at=trigger.metadata.updated_at.isoformat()
            ))
        
        return responses
    except Exception as e:
        logger.error(f"Error getting agent triggers: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


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
            updated_at=trigger.metadata.updated_at.isoformat()
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
            updated_at=trigger.metadata.updated_at.isoformat()
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
            updated_at=updated_trigger.metadata.updated_at.isoformat()
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
        
        logger.info(f"Webhook trigger result: success={result.success}, should_execute_agent={result.should_execute_agent}, should_execute_workflow={result.should_execute_workflow}")
        logger.info(f"Trigger result details: workflow_id={result.workflow_id}, agent_prompt={result.agent_prompt}")
        
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


@router.post("/qstash/webhook")
async def qstash_webhook(request: Request):
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    try:
        headers = dict(request.headers)
        logger.info(f"QStash webhook received with headers: {headers}")
        
        try:
            raw_data = await request.json()
        except:
            raw_data = {}
            
        logger.info(f"QStash webhook payload: {raw_data}")
        trigger_id = raw_data.get('trigger_id')
        if not trigger_id:
            logger.error("No trigger_id found in QStash webhook payload")
            return JSONResponse(
                status_code=400,
                content={"error": "trigger_id is required in webhook payload"}
            )
        
        raw_data.update({
            "webhook_source": "qstash",
            "webhook_headers": headers,
            "webhook_timestamp": datetime.now(timezone.utc).isoformat()
        })

        trigger_svc, execution_svc, _ = await get_services()
        
        result = await trigger_svc.process_trigger_event(trigger_id, raw_data)
        
        logger.info(f"QStash trigger result: success={result.success}, should_execute_agent={result.should_execute_agent}, should_execute_workflow={result.should_execute_workflow}")
        
        if not result.success:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": result.error_message}
            )
        
        if result.should_execute_agent or result.should_execute_workflow:
            trigger = await trigger_svc.get_trigger(trigger_id)
            if trigger:
                logger.info(f"Executing QStash trigger for agent {trigger.agent_id}")
                
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
                
                logger.info(f"QStash execution result: {execution_result}")
                
                return JSONResponse(content={
                    "success": True,
                    "message": "QStash trigger processed and execution started",
                    "execution": execution_result,
                    "trigger_id": trigger_id,
                    "agent_id": trigger.agent_id
                })
            else:
                logger.warning(f"QStash trigger {trigger_id} not found for execution")
                return JSONResponse(
                    status_code=404,
                    content={"error": f"Trigger {trigger_id} not found"}
                )
        
        logger.info(f"QStash webhook processed but no execution needed")
        return JSONResponse(content={
            "success": True,
            "message": "QStash trigger processed successfully (no execution needed)",
            "trigger_id": trigger_id
        })
        
    except Exception as e:
        logger.error(f"Error processing QStash webhook: {e}")
        import traceback
        logger.error(f"QStash webhook error traceback: {traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error"}
        )
