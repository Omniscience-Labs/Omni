from fastapi import APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import JSONResponse
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
import os

from pydantic import BaseModel

from services.supabase import DBConnection
from utils.auth_utils import get_current_user_id_from_jwt, verify_thread_access
from utils.logger import logger, structlog
from services.billing import check_billing_status, can_use_model
from utils.config import config
from agent.config_helper import extract_agent_config

from ..services.execution_service import TriggerExecutionService
from ..domain.entities import TriggerResult, TriggerEvent, TriggerType, ExecutionVariables

router = APIRouter()

class WorkflowStepRequest(BaseModel):
    name: str
    description: Optional[str] = None
    type: Optional[str] = "instruction"
    config: Dict[str, Any] = {}
    conditions: Optional[Dict[str, Any]] = None
    order: int
    children: Optional[List['WorkflowStepRequest']] = None

class WorkflowCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    trigger_phrase: Optional[str] = None
    is_default: bool = False
    steps: List[WorkflowStepRequest] = []

class WorkflowUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger_phrase: Optional[str] = None
    is_default: Optional[bool] = None
    status: Optional[str] = None
    steps: Optional[List[WorkflowStepRequest]] = None

class WorkflowStepResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    type: str
    config: Dict[str, Any]
    conditions: Optional[Dict[str, Any]]
    order: int
    created_at: str
    updated_at: str
    children: Optional[List['WorkflowStepResponse']] = None

class WorkflowResponse(BaseModel):
    id: str
    agent_id: str
    name: str
    description: Optional[str]
    status: str
    trigger_phrase: Optional[str]
    is_default: bool
    steps: List[WorkflowStepResponse]
    created_at: str
    updated_at: str



class WorkflowExecuteRequest(BaseModel):
    input_data: Optional[Dict[str, Any]] = None
    thread_id: Optional[str] = None

# Rebuild models to handle forward references
WorkflowStepRequest.model_rebuild()
WorkflowStepResponse.model_rebuild()

def convert_steps_to_json(steps: List[WorkflowStepRequest]) -> List[Dict[str, Any]]:
    if not steps:
        return []
    
    result = []
    for step in steps:
        step_dict = {
            'name': step.name,
            'description': step.description,
            'type': step.type or 'instruction',
            'config': step.config,
            'conditions': step.conditions,
            'order': step.order
        }
        if step.children:
            step_dict['children'] = convert_steps_to_json(step.children)
        result.append(step_dict)
    return result

def convert_json_to_steps(steps_json: List[Dict[str, Any]]) -> List[WorkflowStepResponse]:
    if not steps_json:
        return []
    
    result = []
    for step_data in steps_json:
        children = None
        if step_data.get('children'):
            children = convert_json_to_steps(step_data['children'])
        
        step = WorkflowStepResponse(
            id=step_data.get('id', ''),
            name=step_data['name'],
            description=step_data.get('description'),
            type=step_data.get('type', 'instruction'),
            config=step_data.get('config', {}),
            conditions=step_data.get('conditions'),
            order=step_data.get('order', 0),
            created_at=step_data.get('created_at', ''),
            updated_at=step_data.get('updated_at', ''),
            children=children
        )
        result.append(step)
    return result

async def get_db_connection() -> DBConnection:
    if not hasattr(get_db_connection, '_db'):
        from services.supabase import DBConnection
        get_db_connection._db = DBConnection()
    return get_db_connection._db

def set_db_connection(db: DBConnection):
    get_db_connection._db = db

@router.get("/agents/{agent_id}/workflows")
async def get_agent_workflows(
    agent_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    db = await get_db_connection()
    client = await db.client
    
    workflows_result = await client.table('agent_workflows').select('*').eq('agent_id', agent_id).order('created_at', desc=True).execute()
    workflows = []
    
    for workflow_data in workflows_result.data:
        steps = []
        if workflow_data.get('steps'):
            steps = convert_json_to_steps(workflow_data['steps'])
        
        workflows.append(WorkflowResponse(
            id=workflow_data['id'],
            agent_id=workflow_data['agent_id'],
            name=workflow_data['name'],
            description=workflow_data.get('description'),
            status=workflow_data['status'],
            trigger_phrase=workflow_data.get('trigger_phrase'),
            is_default=workflow_data['is_default'],
            steps=steps,
            created_at=workflow_data['created_at'],
            updated_at=workflow_data['updated_at']
        ))
    
    return workflows

@router.post("/agents/{agent_id}/workflows")
async def create_agent_workflow(
    agent_id: str,
    workflow_data: WorkflowCreateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    try:
        logger.info(f"Creating workflow for agent {agent_id} with data: {workflow_data}")
        db = await get_db_connection()
        client = await db.client

        steps_json = convert_steps_to_json(workflow_data.steps)
        
        workflow_result = await client.table('agent_workflows').insert({
            'agent_id': agent_id,
            'name': workflow_data.name,
            'description': workflow_data.description,
            'trigger_phrase': workflow_data.trigger_phrase,
            'is_default': workflow_data.is_default,
            'status': 'draft',
            'steps': steps_json
        }).execute()
        
        workflow_id = workflow_result.data[0]['id']
        
        steps = convert_json_to_steps(steps_json)
        
        return WorkflowResponse(
            id=workflow_id,
            agent_id=agent_id,
            name=workflow_data.name,
            description=workflow_data.description,
            status='draft',
            trigger_phrase=workflow_data.trigger_phrase,
            is_default=workflow_data.is_default,
            steps=steps,
            created_at=workflow_result.data[0]['created_at'],
            updated_at=workflow_result.data[0]['updated_at']
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating workflow for agent {agent_id}: {str(e)}")
        logger.error(f"Workflow data: {workflow_data}")
        raise HTTPException(status_code=400, detail=f"Failed to create workflow: {str(e)}")

@router.put("/agents/{agent_id}/workflows/{workflow_id}")
async def update_agent_workflow(
    agent_id: str,
    workflow_id: str,
    workflow_data: WorkflowUpdateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    db = await get_db_connection()
    client = await db.client
    
    workflow_result = await client.table('agent_workflows').select('*').eq('id', workflow_id).eq('agent_id', agent_id).execute()
    if not workflow_result.data:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    update_data = {}
    if workflow_data.name is not None:
        update_data['name'] = workflow_data.name
    if workflow_data.description is not None:
        update_data['description'] = workflow_data.description
    if workflow_data.trigger_phrase is not None:
        update_data['trigger_phrase'] = workflow_data.trigger_phrase
    if workflow_data.is_default is not None:
        update_data['is_default'] = workflow_data.is_default
    if workflow_data.status is not None:
        update_data['status'] = workflow_data.status
    
    if workflow_data.steps is not None:
        steps_json = convert_steps_to_json(workflow_data.steps)
        update_data['steps'] = steps_json
    
    if update_data:
        await client.table('agent_workflows').update(update_data).eq('id', workflow_id).execute()
    
    updated_workflow = await client.table('agent_workflows').select('*').eq('id', workflow_id).execute()
    workflow_data = updated_workflow.data[0]
    
    steps = []
    if workflow_data.get('steps'):
        steps = convert_json_to_steps(workflow_data['steps'])
    
    return WorkflowResponse(
        id=workflow_data['id'],
        agent_id=workflow_data['agent_id'],
        name=workflow_data['name'],
        description=workflow_data.get('description'),
        status=workflow_data['status'],
        trigger_phrase=workflow_data.get('trigger_phrase'),
        is_default=workflow_data['is_default'],
        steps=steps,
        created_at=workflow_data['created_at'],
        updated_at=workflow_data['updated_at']
    )

@router.delete("/agents/{agent_id}/workflows/{workflow_id}")
async def delete_agent_workflow(
    agent_id: str,
    workflow_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    db = await get_db_connection()
    client = await db.client
    
    workflow_result = await client.table('agent_workflows').select('*').eq('id', workflow_id).eq('agent_id', agent_id).execute()
    if not workflow_result.data:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    await client.table('agent_workflows').delete().eq('id', workflow_id).execute()
    return {"message": "Workflow deleted successfully"}

@router.post("/agents/{agent_id}/workflows/{workflow_id}/execute")
async def execute_agent_workflow(
    agent_id: str,
    workflow_id: str,
    execution_data: WorkflowExecuteRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    structlog.contextvars.bind_contextvars(
        agent_id=agent_id,
        workflow_id=workflow_id,
    )
    
    logger.info(f"Starting manual workflow execution for workflow {workflow_id} of agent {agent_id}")
    
    db = await get_db_connection()
    client = await db.client
    
    workflow_result = await client.table('agent_workflows').select('*').eq('id', workflow_id).eq('agent_id', agent_id).execute()
    if not workflow_result.data:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    workflow = workflow_result.data[0]
    if workflow['status'] != 'active':
        raise HTTPException(status_code=400, detail="Workflow is not active")
    
    agent_result = await client.table('agents').select('*, agent_versions!current_version_id(*)').eq('agent_id', agent_id).execute()
    if not agent_result.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent_data = agent_result.data[0]
    account_id = agent_data['account_id']
    
    model_name = config.MODEL_TO_USE or "anthropic/claude-sonnet-4-20250514"
    can_use, model_message, allowed_models = await can_use_model(client, account_id, model_name)
    if not can_use:
        raise HTTPException(status_code=403, detail={"message": model_message, "allowed_models": allowed_models})

    can_run, message, subscription = await check_billing_status(client, account_id)
    if not can_run:
        raise HTTPException(status_code=402, detail={"message": message, "subscription": subscription})
    
    execution_variables = ExecutionVariables(variables={
        'triggered_by': 'manual',
        'execution_timestamp': datetime.now(timezone.utc).isoformat(),
        'user_id': user_id,
        'execution_source': 'workflow_api'
    })

    trigger_result = TriggerResult(
        success=True,
        should_execute_workflow=True,
        workflow_id=workflow_id,
        workflow_input=execution_data.input_data or {},
        execution_variables=execution_variables
    )
    
    trigger_event = TriggerEvent(
        trigger_id=f"manual_{workflow_id}_{uuid.uuid4()}",
        agent_id=agent_id,
        trigger_type=TriggerType.WEBHOOK,
        raw_data=execution_data.input_data or {}
    )
    
    execution_service = TriggerExecutionService(db)
    execution_result = await execution_service.execute_trigger_result(
        agent_id=agent_id,
        trigger_result=trigger_result,
        trigger_event=trigger_event
    )
    
    if execution_result["success"]:
        logger.info(f"Manual workflow execution started: {execution_result}")
        return {
            "execution_id": execution_result.get("execution_id"),
            "thread_id": execution_result.get("thread_id"),
            "agent_run_id": execution_result.get("agent_run_id"),
            "status": "running",
            "message": f"Workflow '{workflow['name']}' execution started"
        }
    else:
        logger.error(f"Manual workflow execution failed: {execution_result}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to start workflow execution",
                "details": execution_result.get("error", "Unknown error")
            }
        )



