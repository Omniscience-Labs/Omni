from fastapi import APIRouter, HTTPException, Depends, Request, Body, Query
from fastapi.responses import JSONResponse
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import uuid
import os
from datetime import datetime

from .core import TriggerManager, TriggerConfig, ProviderDefinition, TriggerType
from .registry import trigger_registry
from services.supabase import DBConnection
from utils.auth_utils import get_current_user_id_from_jwt
from utils.logger import logger
from flags.flags import is_enabled
from .integration import TriggerExecutor
from utils.config import config, EnvMode

router = APIRouter(prefix="/triggers", tags=["triggers"])

trigger_manager: Optional[TriggerManager] = None
db = None

def initialize(database: DBConnection):
    """Initialize the triggers API with database connection."""
    global db, trigger_manager
    db = database
    trigger_manager = TriggerManager(db)

class TriggerCreateRequest(BaseModel):
    """Request model for creating a trigger."""
    provider_id: str
    name: str
    description: Optional[str] = None
    config: Dict[str, Any]

class TriggerUpdateRequest(BaseModel):
    """Request model for updating a trigger."""
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class TriggerResponse(BaseModel):
    """Response model for trigger data."""
    trigger_id: str
    agent_id: str
    trigger_type: str
    provider_id: str
    name: str
    description: Optional[str]
    is_active: bool
    webhook_url: Optional[str] = None
    created_at: str
    updated_at: str

class ProviderResponse(BaseModel):
    """Response model for provider information."""
    provider_id: str
    name: str
    description: str
    trigger_type: str
    webhook_enabled: bool
    config_schema: Dict[str, Any]

async def get_trigger_manager() -> TriggerManager:
    """Get the trigger manager instance."""
    if not trigger_manager:
        raise HTTPException(status_code=500, detail="Trigger system not initialized")
    return trigger_manager

@router.get("/providers", response_model=List[ProviderResponse])
async def get_available_providers(
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    manager = await get_trigger_manager()
    await manager.load_provider_definitions()
    
    providers = await manager.get_available_providers()
    
    return [
        ProviderResponse(
            provider_id=provider.provider_id,
            name=provider.name,
            description=provider.description,
            trigger_type=provider.trigger_type,
            webhook_enabled=provider.webhook_enabled,
            config_schema=provider.config_schema
        )
        for provider in providers
    ]

@router.get("/agents/{agent_id}/triggers", response_model=List[TriggerResponse])
async def get_agent_triggers(
    agent_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Get all triggers for an agent."""
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    await verify_agent_access(agent_id, user_id)
    
    manager = await get_trigger_manager()
    triggers = await manager.get_agent_triggers(agent_id)
    
    base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
    
    responses = []
    for trigger in triggers:
        # Ensure trigger_type is properly handled (could be enum or string)
        trigger_type_str = trigger.trigger_type.value if hasattr(trigger.trigger_type, 'value') else str(trigger.trigger_type)
        provider_id = trigger.config.get("provider_id", trigger_type_str)
        provider = await manager.get_or_create_provider(provider_id)
        
        webhook_url = None
        if provider and provider.provider_definition and provider.provider_definition.webhook_enabled:
            webhook_url = provider.get_webhook_url(trigger.trigger_id, base_url)
        
        responses.append(TriggerResponse(
            trigger_id=trigger.trigger_id,
            agent_id=trigger.agent_id,
            trigger_type=trigger_type_str,
            provider_id=provider_id,
            name=trigger.name,
            description=trigger.description,
            is_active=trigger.is_active,
            webhook_url=webhook_url,
            created_at=trigger.created_at.isoformat(),
            updated_at=trigger.updated_at.isoformat()
        ))
    
    return responses

@router.post("/agents/{agent_id}/triggers", response_model=TriggerResponse)
async def create_agent_trigger(
    agent_id: str,
    request: TriggerCreateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Create a new trigger for an agent."""
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
        
    await verify_agent_access(agent_id, user_id)
    
    manager = await get_trigger_manager()
    await manager.load_provider_definitions()
    
    try:
        trigger_config = await manager.create_trigger(
            agent_id=agent_id,
            provider_id=request.provider_id,
            name=request.name,
            config=request.config,
            description=request.description
        )
        
        # Get webhook URL if applicable
        provider = await manager.get_or_create_provider(request.provider_id)
        webhook_url = None
        if provider and provider.provider_definition and provider.provider_definition.webhook_enabled:
            base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
            webhook_url = provider.get_webhook_url(trigger_config.trigger_id, base_url)
        
        trigger_type_str = trigger_config.trigger_type.value if hasattr(trigger_config.trigger_type, 'value') else str(trigger_config.trigger_type)
        
        return TriggerResponse(
            trigger_id=trigger_config.trigger_id,
            agent_id=trigger_config.agent_id,
            trigger_type=trigger_type_str,
            provider_id=request.provider_id,
            name=trigger_config.name,
            description=trigger_config.description,
            is_active=trigger_config.is_active,
            webhook_url=webhook_url,
            created_at=trigger_config.created_at.isoformat(),
            updated_at=trigger_config.updated_at.isoformat()
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating trigger: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/{trigger_id}", response_model=TriggerResponse)
async def get_trigger(
    trigger_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Get a specific trigger."""
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    manager = await get_trigger_manager()
    trigger_config = await manager.get_trigger(trigger_id)
    
    if not trigger_config:
        raise HTTPException(status_code=404, detail="Trigger not found")
    
    # Verify agent ownership
    await verify_agent_access(trigger_config.agent_id, user_id)
    
    # Ensure trigger_type is properly handled (could be enum or string)
    trigger_type_str = trigger_config.trigger_type.value if hasattr(trigger_config.trigger_type, 'value') else str(trigger_config.trigger_type)
    provider_id = trigger_config.config.get("provider_id", trigger_type_str)
    provider = await manager.get_or_create_provider(provider_id)
    
    webhook_url = None
    if provider and provider.provider_definition and provider.provider_definition.webhook_enabled:
        base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
        webhook_url = provider.get_webhook_url(trigger_id, base_url)
    
    return TriggerResponse(
        trigger_id=trigger_config.trigger_id,
        agent_id=trigger_config.agent_id,
        trigger_type=trigger_type_str,
        provider_id=provider_id,
        name=trigger_config.name,
        description=trigger_config.description,
        is_active=trigger_config.is_active,
        webhook_url=webhook_url,
        created_at=trigger_config.created_at.isoformat(),
        updated_at=trigger_config.updated_at.isoformat()
    )

@router.put("/{trigger_id}", response_model=TriggerResponse)
async def update_trigger(
    trigger_id: str,
    request: TriggerUpdateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    manager = await get_trigger_manager()
    trigger_config = await manager.get_trigger(trigger_id)
    
    if not trigger_config:
        raise HTTPException(status_code=404, detail="Trigger not found")

    await verify_agent_access(trigger_config.agent_id, user_id)
    
    try:
        updated_config = await manager.update_trigger(
            trigger_id=trigger_id,
            config=request.config,
            name=request.name,
            description=request.description,
            is_active=request.is_active
        )
        trigger_type_str = updated_config.trigger_type.value if hasattr(updated_config.trigger_type, 'value') else str(updated_config.trigger_type)
        provider_id = updated_config.config.get("provider_id", trigger_type_str)
        provider = await manager.get_or_create_provider(provider_id)
        
        webhook_url = None
        if provider and provider.provider_definition and provider.provider_definition.webhook_enabled:
            base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:3000")
            webhook_url = provider.get_webhook_url(trigger_id, base_url)

        return TriggerResponse(
            trigger_id=updated_config.trigger_id,
            agent_id=updated_config.agent_id,
            trigger_type=trigger_type_str,
            provider_id=provider_id,
            name=updated_config.name,
            description=updated_config.description,
            is_active=updated_config.is_active,
            webhook_url=webhook_url,
            created_at=updated_config.created_at.isoformat(),
            updated_at=updated_config.updated_at.isoformat()
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating trigger: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/{trigger_id}")
async def delete_trigger(
    trigger_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Delete a trigger."""
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    manager = await get_trigger_manager()
    trigger_config = await manager.get_trigger(trigger_id)
    
    if not trigger_config:
        raise HTTPException(status_code=404, detail="Trigger not found")
    
    # Verify agent ownership
    await verify_agent_access(trigger_config.agent_id, user_id)
    
    success = await manager.delete_trigger(trigger_id)
    
    if success:
        return {"message": "Trigger deleted successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to delete trigger")

@router.post("/qstash/webhook")
async def handle_qstash_webhook(request: Request):
    try:
        logger.info("QStash webhook received")
        body = await request.body()
        headers = dict(request.headers)
        
        logger.debug(f"QStash webhook body: {body[:500]}...")
        logger.debug(f"QStash webhook headers: {headers}")
        
        try:
            if body:
                data = await request.json()
            else:
                data = {}
        except Exception as e:
            logger.warning(f"Failed to parse JSON body: {e}")
            data = {
                "raw_body": body.decode('utf-8', errors='ignore'),
                "content_type": headers.get('content-type', '')
            }
        
        trigger_id = data.get('trigger_id')
        
        if not trigger_id:
            logger.error("No trigger_id in QStash webhook payload")
            return JSONResponse(
                status_code=400,
                content={"error": "trigger_id is required"}
            )
        
        data["headers"] = headers
        data["qstash_message_id"] = headers.get('upstash-message-id')
        data["qstash_schedule_id"] = headers.get('upstash-schedule-id')
        
        logger.info(f"Processing QStash trigger event for {trigger_id}")
        manager = await get_trigger_manager()
        result = await manager.process_trigger_event(trigger_id, data)
        
        logger.info(f"QStash trigger processing result: success={result.success}, should_execute={result.should_execute_agent}, error={result.error_message}")
        
        if result.success and (result.should_execute_agent or result.should_execute_workflow):
            from .integration import TriggerExecutor
            executor = TriggerExecutor(db)
            trigger_config = await manager.get_trigger(trigger_id)
            if trigger_config:
                from .core import TriggerEvent, TriggerType
                trigger_type = trigger_config.trigger_type
                if isinstance(trigger_type, str):
                    trigger_type = TriggerType(trigger_type)
                
                trigger_event = TriggerEvent(
                    trigger_id=trigger_id,
                    agent_id=trigger_config.agent_id,
                    trigger_type=trigger_type,
                    raw_data=data
                )
                
                execution_result = await executor.execute_trigger_result(
                    agent_id=trigger_config.agent_id,
                    trigger_result=result,
                    trigger_event=trigger_event
                )
                
                logger.info(f"QStash execution result: {execution_result}")
                
                execution_type = "workflow" if result.should_execute_workflow else "agent"
                return JSONResponse(content={
                    "message": f"QStash webhook processed and {execution_type} execution started",
                    "trigger_id": trigger_id,
                    "agent_id": trigger_config.agent_id,
                    "execution_type": execution_type,
                    "thread_id": execution_result.get("thread_id"),
                    "agent_run_id": execution_result.get("agent_run_id"),
                    "execution_id": execution_result.get("execution_id")
                })
        
        if result.response_data:
            return JSONResponse(content=result.response_data)
        elif result.success:
            return {"message": "QStash webhook processed successfully"}
        else:
            logger.warning(f"QStash webhook processing failed for {trigger_id}: {result.error_message}")
            return JSONResponse(
                status_code=400,
                content={"error": result.error_message}
            )
            
    except Exception as e:
        logger.error(f"Error processing QStash webhook: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error"}
        )

@router.post("/schedule/webhook")
async def handle_schedule_webhook(request: Request):
    try:
        logger.info("Schedule webhook received from Pipedream")
        body = await request.body()
        headers = dict(request.headers)
        
        logger.debug(f"Schedule webhook body: {body[:500]}...")
        logger.debug(f"Schedule webhook headers: {headers}")
        
        try:
            if body:
                data = await request.json()
            else:
                data = {}
        except Exception as e:
            logger.warning(f"Failed to parse JSON body: {e}")
            data = {
                "raw_body": body.decode('utf-8', errors='ignore'),
                "content_type": headers.get('content-type', '')
            }
        
        trigger_id = data.get('trigger_id')
        agent_id = data.get('agent_id')
        
        if not trigger_id:
            logger.error("No trigger_id in schedule webhook payload")
            return JSONResponse(
                status_code=400,
                content={"error": "trigger_id is required"}
            )
        
        logger.info(f"Processing scheduled trigger event for {trigger_id}")
        manager = await get_trigger_manager()

        trigger_config = await manager.get_trigger(trigger_id)
        if trigger_config:
            data['trigger_config'] = trigger_config.config
        
        result = await manager.process_trigger_event(trigger_id, data)
        
        logger.info(f"Schedule trigger processing result: success={result.success}, should_execute={result.should_execute_agent}, error={result.error_message}")
        
        if result.success and (result.should_execute_agent or result.should_execute_workflow):
            from .integration import TriggerExecutor
            executor = TriggerExecutor(db)
            if trigger_config:
                from .core import TriggerEvent, TriggerType
                trigger_type = trigger_config.trigger_type
                if isinstance(trigger_type, str):
                    trigger_type = TriggerType(trigger_type)
                
                trigger_event = TriggerEvent(
                    trigger_id=trigger_id,
                    agent_id=trigger_config.agent_id,
                    trigger_type=trigger_type,
                    raw_data=data
                )
                
                execution_result = await executor.execute_trigger_result(
                    agent_id=trigger_config.agent_id,
                    trigger_result=result,
                    trigger_event=trigger_event
                )
                
                logger.info(f"Scheduled execution result: {execution_result}")
                
                execution_type = "workflow" if result.should_execute_workflow else "agent"
                return JSONResponse(content={
                    "message": f"Schedule webhook processed and {execution_type} execution started",
                    "trigger_id": trigger_id,
                    "agent_id": trigger_config.agent_id,
                    "execution_type": execution_type,
                    "thread_id": execution_result.get("thread_id"),
                    "agent_run_id": execution_result.get("agent_run_id"),
                    "execution_id": execution_result.get("execution_id")
                })
        
        if result.response_data:
            return JSONResponse(content=result.response_data)
        elif result.success:
            return {"message": "Schedule webhook processed successfully"}
        else:
            logger.warning(f"Schedule webhook processing failed for {trigger_id}: {result.error_message}")
            return JSONResponse(
                status_code=400,
                content={"error": result.error_message}
            )
            
    except Exception as e:
        logger.error(f"Error processing schedule webhook: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error"}
        )

@router.post("/{trigger_id}/webhook")
async def handle_webhook(
    trigger_id: str,
    request: Request
):
    try:
        logger.info(f"Webhook received for trigger {trigger_id}")
        body = await request.body()
        headers = dict(request.headers)
        
        logger.debug(f"Webhook body: {body[:500]}...")
        logger.debug(f"Webhook headers: {headers}")
        
        try:
            if body:
                data = await request.json()
            else:
                data = {}
        except Exception as e:
            logger.warning(f"Failed to parse JSON body: {e}")
            data = {
                "raw_body": body.decode('utf-8', errors='ignore'),
                "content_type": headers.get('content-type', '')
            }
        data["headers"] = headers
        
        logger.info(f"Processing trigger event for {trigger_id}")
        manager = await get_trigger_manager()
        result = await manager.process_trigger_event(trigger_id, data)
        
        logger.info(f"Trigger processing result: success={result.success}, should_execute={result.should_execute_agent}, error={result.error_message}")
        
        if result.success and (result.should_execute_agent or result.should_execute_workflow):
            from .integration import TriggerExecutor
            executor = TriggerExecutor(db)
            trigger_config = await manager.get_trigger(trigger_id)
            if trigger_config:
                from .core import TriggerEvent, TriggerType
                trigger_type = trigger_config.trigger_type
                if isinstance(trigger_type, str):
                    trigger_type = TriggerType(trigger_type)
                
                trigger_event = TriggerEvent(
                    trigger_id=trigger_id,
                    agent_id=trigger_config.agent_id,
                    trigger_type=trigger_type,
                    raw_data=data
                )
                
                execution_result = await executor.execute_trigger_result(
                    agent_id=trigger_config.agent_id,
                    trigger_result=result,
                    trigger_event=trigger_event
                )
                
                logger.info(f"Execution result: {execution_result}")
                
                execution_type = "workflow" if result.should_execute_workflow else "agent"
                return JSONResponse(content={
                    "message": f"Webhook processed and {execution_type} execution started",
                    "trigger_id": trigger_id,
                    "agent_id": trigger_config.agent_id,
                    "execution_type": execution_type,
                    "thread_id": execution_result.get("thread_id"),
                    "agent_run_id": execution_result.get("agent_run_id"),
                    "execution_id": execution_result.get("execution_id")
                })
        
        if result.response_data:
            return JSONResponse(content=result.response_data)
        elif result.success:
            return {"message": "Webhook processed successfully"}
        else:
            logger.warning(f"Webhook processing failed for {trigger_id}: {result.error_message}")
            return JSONResponse(
                status_code=400,
                content={"error": result.error_message}
            )
            
    except Exception as e:
        logger.error(f"Error handling webhook for trigger {trigger_id}: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error"}
        )

@router.get("/triggers/{trigger_id}/health")
async def check_trigger_health(
    trigger_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Check the health of a trigger."""
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    manager = await get_trigger_manager()
    trigger_config = await manager.get_trigger(trigger_id)
    
    if not trigger_config:
        raise HTTPException(status_code=404, detail="Trigger not found")
    
    await verify_agent_access(trigger_config.agent_id, user_id)
    
    health_results = await manager.health_check_triggers()
    is_healthy = health_results.get(trigger_id, False)
    
    return {
        "trigger_id": trigger_id,
        "healthy": is_healthy,
        "checked_at": datetime.utcnow().isoformat()
    }

async def verify_agent_access(agent_id: str, user_id: str):
    """Verify that the user has access to the agent."""
    client = await db.client
    result = await client.table('agents').select('account_id').eq('agent_id', agent_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent = result.data[0]
    if agent['account_id'] != user_id:
        raise HTTPException(status_code=403, detail="Access denied") 