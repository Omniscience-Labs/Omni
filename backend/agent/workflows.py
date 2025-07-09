from fastapi import APIRouter, HTTPException, Depends, Request, Body, File, UploadFile, Form, Query
from fastapi.responses import StreamingResponse
import asyncio
import json
import traceback
from datetime import datetime, timezone
import uuid
from typing import Optional, List, Dict, Any
import jwt
from pydantic import BaseModel
import tempfile
import os

from agentpress.thread_manager import ThreadManager
from services.supabase import DBConnection
from services import redis
from utils.auth_utils import get_current_user_id_from_jwt, get_user_id_from_stream_auth, verify_thread_access
from utils.logger import logger, structlog
from services.billing import check_billing_status, can_use_model
from utils.config import config
from sandbox.sandbox import create_sandbox, delete_sandbox, get_or_start_sandbox
from services.llm import make_llm_api_call
from agent.run_agent import get_stream_context, run_agent_run_stream
from utils.constants import MODEL_NAME_ALIASES
from flags.flags import is_enabled
from .utils import check_for_active_project_agent_run, stop_agent_run as _stop_agent_run
from .config_helper import extract_agent_config

router = APIRouter()
db = None
instance_id = None

def initialize(_db: DBConnection, _instance_id: str):
    global db, instance_id
    db = _db
    instance_id = _instance_id

async def stop_agent_run(agent_run_id: str, error_message: Optional[str] = None):
    return await _stop_agent_run(db, agent_run_id, error_message)

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

class WorkflowExecutionResponse(BaseModel):
    id: str
    workflow_id: str
    agent_id: str
    thread_id: Optional[str]
    status: str
    started_at: str
    completed_at: Optional[str]
    duration_seconds: Optional[float]
    triggered_by: str
    input_data: Optional[Dict[str, Any]]
    output_data: Optional[Dict[str, Any]]
    error_message: Optional[str]
    created_at: str

class WorkflowExecuteRequest(BaseModel):
    input_data: Optional[Dict[str, Any]] = None
    thread_id: Optional[str] = None

WorkflowStepRequest.model_rebuild()
WorkflowStepResponse.model_rebuild()

@router.get("/agents/{agent_id}/workflows")
async def get_agent_workflows(
    agent_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    client = await db.client
    workflows_result = await client.table('agent_workflows').select('*').eq('agent_id', agent_id).order('created_at', desc=True).execute()
    workflows = []
    for workflow_data in workflows_result.data:
        steps = []
        if workflow_data.get('steps'):
            steps = convert_json_to_steps(workflow_data['steps'])
        else:
            workflow_steps_result = await client.table('workflow_steps').select('*').eq('workflow_id', workflow_data['id']).order('step_order').execute()
            for step_data in workflow_steps_result.data:
                steps.append(WorkflowStepResponse(
                    id=step_data['id'],
                    name=step_data['name'],
                    description=step_data.get('description'),
                    type=step_data['type'],
                    config=step_data.get('config', {}),
                    conditions=step_data.get('conditions'),
                    order=step_data['step_order'],
                    created_at=step_data['created_at'],
                    updated_at=step_data['updated_at']
                ))
        
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

@router.post("/agents/{agent_id}/workflows")
async def create_agent_workflow(
    agent_id: str,
    workflow_data: WorkflowCreateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    try:
        logger.info(f"Creating workflow for agent {agent_id} with data: {workflow_data}")
        client = await db.client

        # Convert nested steps to JSON format
        steps_json = convert_steps_to_json(workflow_data.steps)
        
        workflow_result = await client.table('agent_workflows').insert({
            'agent_id': agent_id,
            'name': workflow_data.name,
            'description': workflow_data.description,
            'trigger_phrase': workflow_data.trigger_phrase,
            'is_default': workflow_data.is_default,
            'status': 'draft',
            'steps': steps_json  # Store nested JSON structure
        }).execute()
        
        workflow_id = workflow_result.data[0]['id']
        
        # Convert back to response format
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
        
        # Clean up old workflow_steps entries (for backward compatibility)
        await client.table('workflow_steps').delete().eq('workflow_id', workflow_id).execute()
    
    if update_data:
        await client.table('agent_workflows').update(update_data).eq('id', workflow_id).execute()
    
    updated_workflow = await client.table('agent_workflows').select('*').eq('id', workflow_id).execute()
    workflow_data = updated_workflow.data[0]
    
    steps = []
    if workflow_data.get('steps'):
        steps = convert_json_to_steps(workflow_data['steps'])
    else:
        # Fallback to old workflow_steps table format for backward compatibility
        workflow_steps_result = await client.table('workflow_steps').select('*').eq('workflow_id', workflow_id).order('step_order').execute()
        for step_data in workflow_steps_result.data:
            steps.append(WorkflowStepResponse(
                id=step_data['id'],
                name=step_data['name'],
                description=step_data.get('description'),
                type=step_data['type'],
                config=step_data.get('config', {}),
                conditions=step_data.get('conditions'),
                order=step_data['step_order'],
                created_at=step_data['created_at'],
                updated_at=step_data['updated_at']
            ))
    
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
    client = await db.client
    workflow_result = await client.table('agent_workflows').select('*').eq('id', workflow_id).eq('agent_id', agent_id).execute()
    if not workflow_result.data:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    await client.table('agent_workflows').delete().eq('id', workflow_id).execute()
    return {"message": "Workflow deleted successfully"}


def build_workflow_system_prompt(workflow: dict, steps_json: List[dict], input_data: dict = None, available_tools: List[str] = None) -> str:
    def convert_to_llm_format(steps: List[dict]) -> List[dict]:
        result = []
        for step in steps:
            llm_step = {
                "step": step['name'],
            }

            if step.get('description'):
                llm_step["description"] = step['description']

            if step.get('config', {}).get('tool_name'):
                tool_name = step['config']['tool_name']
                if ':' in tool_name:
                    server, clean_tool_name = tool_name.split(':', 1)
                    llm_step["tool"] = clean_tool_name
                else:
                    llm_step["tool"] = tool_name
            
            if step['type'] == 'condition' and step.get('conditions'):
                if step['conditions'].get('type') == 'if' and step['conditions'].get('expression'):
                    llm_step["condition"] = step['conditions']['expression']
                elif step['conditions'].get('type') == 'elseif' and step['conditions'].get('expression'):
                    llm_step["condition"] = f"else if {step['conditions']['expression']}"
                elif step['conditions'].get('type') == 'else':
                    llm_step["condition"] = "else"
                
                # Process children for conditional steps
                if step.get('children'):
                    llm_step["then"] = convert_to_llm_format(step['children'])
            
            result.append(llm_step)
        
        return result
    
    llm_workflow = {
        "workflow": workflow['name'],
        "steps": convert_to_llm_format(steps_json)
    }
    
    if workflow.get('description'):
        llm_workflow["description"] = workflow['description']
    
    workflow_json = json.dumps(llm_workflow, indent=2)
    workflow_prompt = f"""You are executing a structured workflow. Follow the steps exactly as specified in the JSON below.

WORKFLOW STRUCTURE:
{workflow_json}

EXECUTION INSTRUCTIONS:
1. Execute each step in the order presented
2. For steps with a "tool" field, you MUST use that specific tool
3. For conditional steps (with "condition" field):
   - Evaluate the condition based on the current context
   - If the condition is true (or if it's an "else" condition), execute the steps in the "then" array
   - State clearly which branch you're taking and why
4. Provide clear progress updates as you complete each step
5. If a tool is not available, explain what you would do instead

AVAILABLE TOOLS:
{', '.join(available_tools) if available_tools else 'Use any available tools from your system prompt'}

IMPORTANT TOOL USAGE:
- When a step specifies a tool, that tool MUST be used
- If the specified tool is not available, adapt using similar available tools
- For example, if "web_search_exa" is specified but not available, use "web_search" instead

Current input data: {json.dumps(input_data) if input_data else 'None provided'}

Begin executing the workflow now, starting with the first step."""

    return workflow_prompt


@router.post("/agents/{agent_id}/workflows/{workflow_id}/execute")
async def execute_agent_workflow(
    agent_id: str,
    workflow_id: str,
    execution_data: WorkflowExecuteRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Execute a workflow by starting an agent run with workflow context."""
    structlog.contextvars.bind_contextvars(
        agent_id=agent_id,
        workflow_id=workflow_id,
    )
    
    global instance_id
    if not instance_id:
        raise HTTPException(status_code=500, detail="Agent API not initialized with instance ID")
    
    model_name = config.MODEL_TO_USE or "anthropic/claude-sonnet-4-20250514"
    logger.info(f"Starting workflow execution for workflow {workflow_id} of agent {agent_id} with model {model_name}")
    
    client = await db.client
    workflow_result = await client.table('agent_workflows').select('*').eq('id', workflow_id).eq('agent_id', agent_id).execute()
    if not workflow_result.data:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    workflow = workflow_result.data[0]
    if workflow['status'] != 'active':
        raise HTTPException(status_code=400, detail="Workflow is not active")
    
    # Get steps from the new JSON format or fallback to old format
    if workflow.get('steps'):
        steps_json = workflow['steps']
    else:
        # Fallback to old workflow_steps table format
        workflow_steps_result = await client.table('workflow_steps').select('*').eq('workflow_id', workflow_id).order('step_order').execute()
        steps_json = []
        for step_data in workflow_steps_result.data:
            steps_json.append({
                'name': step_data['name'],
                'description': step_data.get('description'),
                'type': step_data['type'],
                'config': step_data.get('config', {}),
                'conditions': step_data.get('conditions'),
                'order': step_data['step_order']
            })
    
    agent_result = await client.table('agents').select('*, agent_versions!current_version_id(*)').eq('agent_id', agent_id).execute()
    if not agent_result.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent_data = agent_result.data[0]
    account_id = agent_data['account_id']
    
    version_data = agent_data.get('agent_versions')
    agent_config = extract_agent_config(agent_data, version_data)
    if version_data:
        logger.info(f"Using agent {agent_config['name']} ({agent_id}) version {agent_config.get('version_name', 'v1')} for workflow")
    else:
        logger.info(f"Using agent {agent_config['name']} ({agent_id}) - no version data for workflow")
    
    available_tools = []

    agentpress_tools = agent_config.get('agentpress_tools', {})
    if agentpress_tools.get('sb_shell_tool', {}).get('enabled', False):
        available_tools.append('execute_command')
    if agentpress_tools.get('sb_files_tool', {}).get('enabled', False):
        available_tools.extend(['create_file', 'str_replace', 'full_file_rewrite', 'delete_file'])
    if agentpress_tools.get('sb_browser_tool', {}).get('enabled', False):
        available_tools.extend(['browser_navigate_to', 'browser_take_screenshot'])
    if agentpress_tools.get('sb_vision_tool', {}).get('enabled', False):
        available_tools.append('see_image')
    if agentpress_tools.get('sb_deploy_tool', {}).get('enabled', False):
        available_tools.append('deploy')
    if agentpress_tools.get('sb_expose_tool', {}).get('enabled', False):
        available_tools.append('expose_port')
    if agentpress_tools.get('web_search_tool', {}).get('enabled', False):
        available_tools.append('web_search')
    if agentpress_tools.get('data_providers_tool', {}).get('enabled', False):
        available_tools.extend(['get_data_provider_endpoints', 'execute_data_provider_call'])
    
    # Check MCP tools
    all_mcps = []
    if agent_config.get('configured_mcps'):
        all_mcps.extend(agent_config['configured_mcps'])
    if agent_config.get('custom_mcps'):
        all_mcps.extend(agent_config['custom_mcps'])
    
    for mcp in all_mcps:
        qualified_name = mcp.get('qualifiedName', '')
        enabled_tools_list = mcp.get('enabledTools', [])
        
        if qualified_name == 'exa' and ('search' in enabled_tools_list or not enabled_tools_list):
            available_tools.append('web_search_exa')
        elif qualified_name.startswith('@smithery-ai/github'):
            for tool in enabled_tools_list:
                available_tools.append(tool.replace('-', '_'))
        elif qualified_name.startswith('custom_'):
            for tool in enabled_tools_list:
                available_tools.append(f"{qualified_name}_{tool}")
    
    workflow_prompt = build_workflow_system_prompt(workflow, steps_json, execution_data.input_data, available_tools)
    enhanced_system_prompt = f"""{agent_config['system_prompt']}

--- WORKFLOW EXECUTION MODE ---
{workflow_prompt}"""
    
    # Update agent config with workflow-enhanced system prompt
    agent_config['system_prompt'] = enhanced_system_prompt
    
    # Handle thread creation or reuse
    thread_id = execution_data.thread_id
    project_id = None
    
    if thread_id:
        # Use existing thread (same as start_agent)
        await verify_thread_access(client, thread_id, user_id)
        thread_result = await client.table('threads').select('project_id', 'account_id').eq('thread_id', thread_id).execute()
        if not thread_result.data:
            raise HTTPException(status_code=404, detail="Thread not found")
        project_id = thread_result.data[0]['project_id']
        
        structlog.contextvars.bind_contextvars(
            thread_id=thread_id,
            project_id=project_id,
        )
        logger.info(f"Using existing thread {thread_id} with project {project_id} for workflow execution")
    else:
        # Create new thread and project (following initiate_agent_with_files pattern)
        try:
            # 1. Create Project
            placeholder_name = f"Workflow: {workflow['name']}"
            project = await client.table('projects').insert({
                "project_id": str(uuid.uuid4()), 
                "account_id": account_id, 
                "name": placeholder_name,
                "created_at": datetime.now(timezone.utc).isoformat()
            }).execute()
            project_id = project.data[0]['project_id']
            logger.info(f"Created new project: {project_id}")

            # 2. Create Sandbox
            sandbox_id = None
            try:
                from sandbox.sandbox import create_sandbox
                sandbox_pass = str(uuid.uuid4())
                sandbox = await create_sandbox(sandbox_pass, project_id)
                sandbox_id = sandbox.id
                logger.info(f"Created new sandbox {sandbox_id} for project {project_id}")

                vnc_link = await sandbox.get_preview_link(6080)
                website_link = await sandbox.get_preview_link(8080)
                vnc_url = vnc_link.url if hasattr(vnc_link, 'url') else str(vnc_link).split("url='")[1].split("'")[0]
                website_url = website_link.url if hasattr(website_link, 'url') else str(website_link).split("url='")[1].split("'")[0]
                token = None
                if hasattr(vnc_link, 'token'):
                    token = vnc_link.token
                elif "token='" in str(vnc_link):
                    token = str(vnc_link).split("token='")[1].split("'")[0]
            except Exception as e:
                logger.error(f"Error creating sandbox: {str(e)}")
                await client.table('projects').delete().eq('project_id', project_id).execute()
                if sandbox_id:
                    try: 
                        from sandbox.sandbox import delete_sandbox
                        await delete_sandbox(sandbox_id)
                    except Exception as e: 
                        pass
                raise Exception("Failed to create sandbox")

            update_result = await client.table('projects').update({
                'sandbox': {
                    'id': sandbox_id, 
                    'pass': sandbox_pass, 
                    'vnc_preview': vnc_url,
                    'sandbox_url': website_url, 
                    'token': token
                }
            }).eq('project_id', project_id).execute()

            if not update_result.data:
                logger.error(f"Failed to update project {project_id} with new sandbox {sandbox_id}")
                if sandbox_id:
                    try: 
                        from sandbox.sandbox import delete_sandbox
                        await delete_sandbox(sandbox_id)
                    except Exception as e: 
                        logger.error(f"Error deleting sandbox: {str(e)}")
                raise Exception("Database update failed")

            # 3. Create Thread
            thread_data = {
                "thread_id": str(uuid.uuid4()), 
                "project_id": project_id, 
                "account_id": account_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "metadata": {
                    "workflow_execution": True,
                    "workflow_id": workflow_id,
                    "workflow_name": workflow['name']
                }
            }

            thread = await client.table('threads').insert(thread_data).execute()
            thread_id = thread.data[0]['thread_id']
            logger.info(f"Created new thread: {thread_id}")
            
            structlog.contextvars.bind_contextvars(
                thread_id=thread_id,
                project_id=project_id,
            )

            # 4. Create initial message
            message_content = f"Execute workflow: {workflow['name']}\n\nInput: {json.dumps(execution_data.input_data) if execution_data.input_data else 'None'}"
            message = await client.table('messages').insert({
                "message_id": str(uuid.uuid4()),
                "thread_id": thread_id,
                "type": "user",
                "is_llm_message": True,
                "content": json.dumps({"role": "user", "content": message_content}),
                "created_at": datetime.now(timezone.utc).isoformat()
            }).execute()
            logger.info(f"Created initial message for workflow execution")

        except Exception as e:
            logger.error(f"Error in workflow project/thread creation: {str(e)}\n{traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"Failed to initiate workflow session: {str(e)}")
    
    # Check model access and billing (same as start_agent)
    can_use, model_message, allowed_models = await can_use_model(client, account_id, model_name)
    if not can_use:
        raise HTTPException(status_code=403, detail={"message": model_message, "allowed_models": allowed_models})

    can_run, message, subscription = await check_billing_status(client, account_id)
    if not can_run:
        raise HTTPException(status_code=402, detail={"message": message, "subscription": subscription})

    active_run_id = await check_for_active_project_agent_run(client, project_id)
    if active_run_id:
        logger.info(f"Stopping existing agent run {active_run_id} for project {project_id}")
        await stop_agent_run(active_run_id)

    try:
        project_result = await client.table('projects').select('*').eq('project_id', project_id).execute()
        if not project_result.data:
            raise HTTPException(status_code=404, detail="Project not found")
        
        project_data = project_result.data[0]
        sandbox_info = project_data.get('sandbox', {})
        if not sandbox_info.get('id'):
            raise HTTPException(status_code=404, detail="No sandbox found for this project")
            
        sandbox_id = sandbox_info['id']
        sandbox = await get_or_start_sandbox(sandbox_id)
        logger.info(f"Successfully started sandbox {sandbox_id} for project {project_id}")
    except Exception as e:
        logger.error(f"Failed to start sandbox for project {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to initialize sandbox: {str(e)}")

    execution_result = await client.table('workflow_executions').insert({
        'workflow_id': workflow_id,
        'agent_id': agent_id,
        'thread_id': thread_id,
        'triggered_by': 'manual',
        'status': 'running',
        'input_data': execution_data.input_data or {}
    }).execute()
    
    execution_id = execution_result.data[0]['id']
    
    agent_run = await client.table('agent_runs').insert({
        "thread_id": thread_id, 
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "agent_id": agent_config.get('agent_id') if agent_config else None,
        "agent_version_id": agent_config.get('current_version_id') if agent_config else None
    }).execute()
    agent_run_id = agent_run.data[0]['id']
    
    structlog.contextvars.bind_contextvars(
        agent_run_id=agent_run_id,
    )
    logger.info(f"Created new agent run: {agent_run_id}")

    instance_key = f"active_run:{instance_id}:{agent_run_id}"
    try:
        await redis.set(instance_key, "running", ex=redis.REDIS_KEY_TTL)
        
        # Use new agent execution format from integration.py
        stream_context = await get_stream_context()
        request_id = structlog.contextvars.get_contextvars().get('request_id')
        
        _ = await stream_context.resumable_stream(agent_run_id, lambda: run_agent_run_stream(
            agent_run_id=agent_run_id, 
            thread_id=thread_id, 
            instance_id=instance_id,
            project_id=project_id,
            model_name=model_name,
            enable_thinking=False,
            reasoning_effort='medium',
            stream=False,
            enable_context_manager=True,
            agent_config=agent_config,
            is_agent_builder=False,
            target_agent_id=None,
            request_id=request_id
        ))

        logger.info(f"Started workflow agent execution ({instance_key})")
    except Exception as e:
        logger.warning(f"Failed to register workflow agent run in Redis ({instance_key}): {str(e)}")
        # Try to update the agent run status to failed
        try:
            await client.table('agent_runs').update({
                "status": "failed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "error": f"Failed to start execution: {str(e)}"
            }).eq('id', agent_run_id).execute()
        except Exception as update_error:
            logger.error(f"Failed to update agent run status: {str(update_error)}")
        raise HTTPException(status_code=500, detail=f"Failed to start workflow execution: {str(e)}")

    return {
        "execution_id": execution_id,
        "thread_id": thread_id,
        "agent_run_id": agent_run_id,
        "status": "running",
        "message": f"Workflow '{workflow['name']}' execution started"
    }


@router.get("/agents/{agent_id}/workflows/{workflow_id}/executions")
async def get_workflow_executions(
    agent_id: str,
    workflow_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt),
    limit: int = Query(20, ge=1, le=100)
):
    client = await db.client
    executions_result = await client.table('workflow_executions').select('*').eq('workflow_id', workflow_id).order('created_at', desc=True).limit(limit).execute()
    
    executions = []
    for execution_data in executions_result.data:
        executions.append(WorkflowExecutionResponse(
            id=execution_data['id'],
            workflow_id=execution_data['workflow_id'],
            agent_id=execution_data['agent_id'],
            thread_id=execution_data.get('thread_id'),
            status=execution_data['status'],
            started_at=execution_data['started_at'],
            completed_at=execution_data.get('completed_at'),
            duration_seconds=execution_data.get('duration_seconds'),
            triggered_by=execution_data['triggered_by'],
            input_data=execution_data.get('input_data'),
            output_data=execution_data.get('output_data'),
            error_message=execution_data.get('error_message'),
            created_at=execution_data['created_at']
        ))
    
    return executions


@router.post("/agents/{agent_id}/workflows/{workflow_id}/webhook")
async def trigger_workflow_webhook(
    agent_id: str,
    workflow_id: str,
    request: Request
):
    try:
        logger.info(f"Workflow webhook received for agent {agent_id}, workflow {workflow_id}")
        body = await request.body()
        headers = dict(request.headers)
        
        try:
            if body:
                webhook_data = await request.json()
            else:
                webhook_data = {}
        except Exception as e:
            logger.warning(f"Failed to parse JSON body: {e}")
            webhook_data = {
                "raw_body": body.decode('utf-8', errors='ignore'),
                "content_type": headers.get('content-type', '')
            }
        
        webhook_data["webhook_headers"] = headers
        webhook_data["webhook_timestamp"] = datetime.now(timezone.utc).isoformat()
        
        client = await db.client
        
        workflow_result = await client.table('agent_workflows').select('*').eq('id', workflow_id).eq('agent_id', agent_id).execute()
        if not workflow_result.data:
            return JSONResponse(
                status_code=404,
                content={"error": "Workflow not found"}
            )
        
        workflow = workflow_result.data[0]
        if workflow['status'] != 'active':
            return JSONResponse(
                status_code=400,
                content={"error": "Workflow is not active"}
            )
        
        agent_result = await client.table('agents').select('*, agent_versions!current_version_id(*)').eq('agent_id', agent_id).execute()
        if not agent_result.data:
            return JSONResponse(
                status_code=404,
                content={"error": "Agent not found"}
            )
        
        agent_data = agent_result.data[0]
        account_id = agent_data['account_id']
        
        version_data = agent_data.get('agent_versions')
        agent_config = extract_agent_config(agent_data, version_data)
        agent_config['account_id'] = account_id  # Ensure account_id is in the config
        
        from triggers.integration import WorkflowTriggerExecutor
        from triggers.core import TriggerResult, TriggerEvent, TriggerType

        trigger_result = TriggerResult(
            success=True,
            should_execute_workflow=True,
            workflow_id=workflow_id,
            workflow_input=webhook_data,
            execution_variables={
                'triggered_by': 'webhook',
                'webhook_timestamp': webhook_data["webhook_timestamp"],
                'webhook_source': headers.get('user-agent', 'unknown'),
                'webhook_ip': headers.get('x-forwarded-for', headers.get('x-real-ip', 'unknown'))
            }
        )
        trigger_event = TriggerEvent(
            trigger_id=f"webhook_{workflow_id}",
            agent_id=agent_id,
            trigger_type=TriggerType.WEBHOOK,
            raw_data=webhook_data
        )
        executor = WorkflowTriggerExecutor(db)
        execution_result = await executor.execute_triggered_workflow(
            agent_id=agent_id,
            workflow_id=workflow_id,
            workflow_input=webhook_data,
            trigger_result=trigger_result,
            trigger_event=trigger_event
        )
        if execution_result["success"]:
            logger.info(f"Workflow webhook execution started: {execution_result}")
            return JSONResponse(content={
                "message": f"Workflow '{workflow['name']}' execution started via webhook",
                "execution_id": execution_result.get("execution_id"),
                "thread_id": execution_result.get("thread_id"),
                "agent_run_id": execution_result.get("agent_run_id"),
                "workflow_id": workflow_id,
                "agent_id": agent_id,
                "status": "running"
            })
        else:
            logger.error(f"Workflow webhook execution failed: {execution_result}")
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Failed to start workflow execution",
                    "details": execution_result.get("error", "Unknown error")
                }
            )
            
    except Exception as e:
        logger.error(f"Error processing workflow webhook: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error"}
        )


@router.get("/agents/{agent_id}/workflows/{workflow_id}/webhook-url")
async def get_workflow_webhook_url(
    agent_id: str,
    workflow_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt),
    request: Request = None
):
    client = await db.client
    workflow_result = await client.table('agent_workflows').select('*').eq('id', workflow_id).eq('agent_id', agent_id).execute()
    if not workflow_result.data:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    agent_result = await client.table('agents').select('account_id').eq('agent_id', agent_id).execute()
    if not agent_result.data:
        raise HTTPException(status_code=404, detail="Agent not found")

    base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
    webhook_url = f"{base_url}/api/agents/{agent_id}/workflows/{workflow_id}/webhook"
    
    return {
        "webhook_url": webhook_url,
        "workflow_id": workflow_id,
        "agent_id": agent_id,
        "workflow_name": workflow_result.data[0]['name'],
        "status": workflow_result.data[0]['status']
    }
