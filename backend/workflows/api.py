"""
Workflow API - REST endpoints for workflow management and execution.
"""

from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.responses import StreamingResponse
from typing import List, Optional, Dict, Any
import uuid
import json
import asyncio
from datetime import datetime, timezone

from .models import (
    WorkflowDefinition, WorkflowCreateRequest, WorkflowUpdateRequest,
    WorkflowExecuteRequest, WorkflowConvertRequest, WorkflowValidateRequest,
    WorkflowValidateResponse, WorkflowFlow, WorkflowExecution
)
from .converter import WorkflowConverter, validate_workflow_flow
from .executor import WorkflowExecutor
from .scheduler import WorkflowScheduler
from services.supabase import DBConnection
from utils.logger import logger
from utils.auth_utils import get_current_user_id_from_jwt

router = APIRouter()

# Global instances
db = DBConnection()
workflow_converter = WorkflowConverter()
workflow_executor = WorkflowExecutor(db)
workflow_scheduler = WorkflowScheduler(db, workflow_executor)

def initialize(database: DBConnection):
    """Initialize the workflow API with database connection."""
    global db, workflow_executor, workflow_scheduler
    db = database
    workflow_executor = WorkflowExecutor(db)
    workflow_scheduler = WorkflowScheduler(db, workflow_executor)

def _map_db_to_workflow_definition(data: dict) -> WorkflowDefinition:
    """Helper function to map database record to WorkflowDefinition."""
    definition = data.get('definition', {})
    return WorkflowDefinition(
        id=data['id'],
        name=data['name'],
        description=data.get('description'),
        steps=definition.get('steps', []),
        entry_point=definition.get('entry_point', ''),
        triggers=definition.get('triggers', []),
        state=data.get('status', 'draft').upper(),
        created_at=datetime.fromisoformat(data['created_at']) if data.get('created_at') else None,
        updated_at=datetime.fromisoformat(data['updated_at']) if data.get('updated_at') else None,
        created_by=data.get('created_by'),
        project_id=data['project_id'],
        agent_id=definition.get('agent_id'),
        is_template=False,  # Templates are in a separate table
        max_execution_time=definition.get('max_execution_time', 3600),
        max_retries=definition.get('max_retries', 3)
    )

@router.get("/workflows", response_model=List[WorkflowDefinition])
async def list_workflows(
    user_id: str = Depends(get_current_user_id_from_jwt),
    x_project_id: Optional[str] = Header(None)
):
    """List all workflows for the current user."""
    try:
        client = await db.client
        
        query = client.table('workflows').select('*').eq('account_id', user_id)
        
        if x_project_id:
            query = query.eq('project_id', x_project_id)
        
        result = await query.execute()
        
        workflows = []
        for data in result.data:
            workflow = _map_db_to_workflow_definition(data)
            workflows.append(workflow)
        
        return workflows
        
    except Exception as e:
        logger.error(f"Error listing workflows: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workflows", response_model=WorkflowDefinition)
async def create_workflow(
    request: WorkflowCreateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Create a new workflow."""
    try:
        client = await db.client
        
        workflow_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        workflow_data = {
            'id': workflow_id,
            'name': request.name,
            'description': request.description,
            'project_id': request.project_id,
            'account_id': user_id,
            'created_by': user_id,
            'status': 'draft',
            'version': 1,
            'definition': {
                'steps': [],
                'entry_point': '',
                'triggers': [{'type': 'MANUAL', 'config': {}}],
                'agent_id': request.agent_id,
                'max_execution_time': request.max_execution_time,
                'max_retries': request.max_retries
            }
        }
        
        result = await client.table('workflows').insert(workflow_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create workflow")
        
        data = result.data[0]
        return _map_db_to_workflow_definition(data)
        
    except Exception as e:
        logger.error(f"Error creating workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workflows/{workflow_id}", response_model=WorkflowDefinition)
async def get_workflow(
    workflow_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Get a specific workflow."""
    try:
        client = await db.client
        
        result = await client.table('workflows').select('*').eq('id', workflow_id).eq('created_by', user_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        data = result.data[0]
        return _map_db_to_workflow_definition(data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/workflows/{workflow_id}", response_model=WorkflowDefinition)
async def update_workflow(
    workflow_id: str,
    request: WorkflowUpdateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Update a workflow."""
    try:
        client = await db.client
        
        # Check if workflow exists and belongs to user
        existing = await client.table('workflows').select('*').eq('id', workflow_id).eq('created_by', user_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        # Get current definition
        current_definition = existing.data[0].get('definition', {})
        
        # Prepare update data
        update_data = {}
        
        if request.name is not None:
            update_data['name'] = request.name
        if request.description is not None:
            update_data['description'] = request.description
        if request.state is not None:
            update_data['status'] = request.state.lower()
        
        # Update definition fields
        definition_updated = False
        if request.agent_id is not None:
            current_definition['agent_id'] = request.agent_id
            definition_updated = True
        if request.max_execution_time is not None:
            current_definition['max_execution_time'] = request.max_execution_time
            definition_updated = True
        if request.max_retries is not None:
            current_definition['max_retries'] = request.max_retries
            definition_updated = True
        
        if definition_updated:
            update_data['definition'] = current_definition
        
        result = await client.table('workflows').update(update_data).eq('id', workflow_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update workflow")
        
        data = result.data[0]
        updated_workflow = _map_db_to_workflow_definition(data)
        
        # Handle scheduling if workflow is active and has schedule triggers
        if updated_workflow.state == 'ACTIVE':
            has_schedule_trigger = any(trigger.type == 'SCHEDULE' for trigger in updated_workflow.triggers)
            if has_schedule_trigger:
                await workflow_scheduler.schedule_workflow(updated_workflow)
        else:
            # Unschedule if workflow is not active
            await workflow_scheduler.unschedule_workflow(workflow_id)
        
        return updated_workflow
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/workflows/{workflow_id}")
async def delete_workflow(
    workflow_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Delete a workflow."""
    try:
        client = await db.client
        
        # Check if workflow exists and belongs to user
        existing = await client.table('workflows').select('id').eq('id', workflow_id).eq('created_by', user_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        # Unschedule workflow before deleting
        await workflow_scheduler.unschedule_workflow(workflow_id)
        
        await client.table('workflows').delete().eq('id', workflow_id).execute()
        
        return {"message": "Workflow deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workflows/{workflow_id}/execute")
async def execute_workflow(
    workflow_id: str,
    request: WorkflowExecuteRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Execute a workflow and return execution info."""
    try:
        client = await db.client
        
        # Get workflow
        result = await client.table('workflows').select('*').eq('id', workflow_id).eq('created_by', user_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        data = result.data[0]
        workflow = _map_db_to_workflow_definition(data)
        
        # Check if workflow is active (allow DRAFT for testing)
        if workflow.state not in ['ACTIVE', 'DRAFT']:
            raise HTTPException(status_code=400, detail="Workflow must be active or draft to execute")
        
        # Create execution record
        execution_id = str(uuid.uuid4())
        execution_data = {
            "id": execution_id,
            "workflow_id": workflow_id,
            "workflow_version": workflow.version if hasattr(workflow, 'version') else 1,
            "workflow_name": workflow.name,
            "execution_context": request.variables or {},
            "project_id": workflow.project_id,
            "account_id": user_id,
            "triggered_by": "MANUAL",
            "status": "pending",
            "started_at": datetime.now(timezone.utc).isoformat()
        }
        
        await client.table('workflow_executions').insert(execution_data).execute()
        
        # Generate thread ID for execution
        thread_id = str(uuid.uuid4())
        
        # Start execution in background
        asyncio.create_task(
            _execute_workflow_background(workflow, request.variables, execution_id, thread_id)
        )
        
        return {
            "execution_id": execution_id,
            "thread_id": thread_id,
            "status": "pending",
            "message": "Workflow execution started"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def _execute_workflow_background(
    workflow: WorkflowDefinition,
    variables: Optional[Dict[str, Any]],
    execution_id: str,
    thread_id: str
):
    """Execute workflow in background."""
    try:
        client = await db.client
        
        # Update status to running
        await client.table('workflow_executions').update({
            "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat()
        }).eq('id', execution_id).execute()
        
        # Execute workflow
        async for update in workflow_executor.execute_workflow(
            workflow=workflow,
            variables=variables,
            thread_id=thread_id,
            project_id=workflow.project_id
        ):
            # Log updates but don't stream them for now
            logger.info(f"Workflow {workflow.id} update: {update.get('type', 'unknown')}")
        
        # Mark as completed
        await client.table('workflow_executions').update({
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat()
        }).eq('id', execution_id).execute()
        
    except Exception as e:
        logger.error(f"Background workflow execution failed: {e}")
        client = await db.client
        await client.table('workflow_executions').update({
            "status": "failed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "error": str(e)
        }).eq('id', execution_id).execute()

@router.get("/workflows/{workflow_id}/flow", response_model=WorkflowFlow)
async def get_workflow_flow(
    workflow_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Get the visual flow representation of a workflow."""
    try:
        client = await db.client
        
        # Get workflow flow data
        result = await client.table('workflow_flows').select('*').eq('workflow_id', workflow_id).execute()
        
        if result.data:
            # Return stored flow data
            data = result.data[0]
            return WorkflowFlow(
                nodes=data.get('nodes', []),
                edges=data.get('edges', []),
                metadata=data.get('metadata', {})
            )
        
        # If no flow data exists, get the workflow and generate a basic flow
        workflow_result = await client.table('workflows').select('*').eq('id', workflow_id).eq('created_by', user_id).execute()
        
        if not workflow_result.data:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        workflow_data = workflow_result.data[0]
        
        # Generate a basic flow from the workflow metadata
        metadata = {
            "name": workflow_data.get('name', 'Untitled Workflow'),
            "description": workflow_data.get('description', '')
        }
        
        # For now, return empty flow with proper metadata
        # In the future, we could implement reverse conversion from workflow definition to visual flow
        return WorkflowFlow(
            nodes=[],
            edges=[],
            metadata=metadata
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting workflow flow: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/workflows/{workflow_id}/flow", response_model=WorkflowDefinition)
async def update_workflow_flow(
    workflow_id: str,
    flow: WorkflowFlow,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Update the visual flow of a workflow and convert it to executable definition."""
    try:
        client = await db.client
        
        # Check if workflow exists and belongs to user
        existing = await client.table('workflows').select('*').eq('id', workflow_id).eq('created_by', user_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        # Store the flow data (convert Pydantic models to dicts)
        flow_data = {
            'workflow_id': workflow_id,
            'nodes': [node.model_dump() if hasattr(node, 'model_dump') else node.dict() for node in flow.nodes],
            'edges': [edge.model_dump() if hasattr(edge, 'model_dump') else edge.dict() for edge in flow.edges],
            'metadata': flow.metadata,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        
        # Upsert flow data
        await client.table('workflow_flows').upsert(flow_data).execute()
        
        # Convert flow to workflow definition
        workflow_def = workflow_converter.convert_flow_to_workflow(
            nodes=[node.model_dump() if hasattr(node, 'model_dump') else node.dict() for node in flow.nodes],
            edges=[edge.model_dump() if hasattr(edge, 'model_dump') else edge.dict() for edge in flow.edges],
            metadata={
                **flow.metadata,
                'project_id': existing.data[0]['project_id'],
                'agent_id': existing.data[0].get('definition', {}).get('agent_id')
            }
        )
        
        # Update workflow with converted definition
        current_definition = existing.data[0].get('definition', {})
        current_definition.update({
            'steps': [step.model_dump() if hasattr(step, 'model_dump') else step.dict() for step in workflow_def.steps],
            'entry_point': workflow_def.entry_point,
            'triggers': [trigger.model_dump() if hasattr(trigger, 'model_dump') else trigger.dict() for trigger in workflow_def.triggers],
        })
        
        update_data = {
            'definition': current_definition
        }
        
        # Update metadata if provided
        if flow.metadata.get('name'):
            update_data['name'] = flow.metadata['name']
        if flow.metadata.get('description'):
            update_data['description'] = flow.metadata['description']
        
        result = await client.table('workflows').update(update_data).eq('id', workflow_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update workflow")
        
        data = result.data[0]
        updated_workflow = _map_db_to_workflow_definition(data)
        
        # Handle scheduling if workflow is active and has schedule triggers
        if updated_workflow.state == 'ACTIVE':
            has_schedule_trigger = any(trigger.type == 'SCHEDULE' for trigger in updated_workflow.triggers)
            if has_schedule_trigger:
                await workflow_scheduler.schedule_workflow(updated_workflow)
        else:
            # Unschedule if workflow is not active
            await workflow_scheduler.unschedule_workflow(workflow_id)
        
        return updated_workflow
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating workflow flow: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workflows/builder/convert", response_model=WorkflowDefinition)
async def convert_flow_to_workflow(
    request: WorkflowConvertRequest,
    user_id: str = Depends(get_current_user_id_from_jwt),
    x_project_id: Optional[str] = Header(None)
):
    """Convert a visual flow to a workflow definition without saving."""
    try:
        if not x_project_id:
            raise HTTPException(status_code=400, detail="Project ID is required")
        
        # Convert flow to workflow definition
        workflow_def = workflow_converter.convert_flow_to_workflow(
            nodes=[node.model_dump() if hasattr(node, 'model_dump') else node.dict() for node in request.nodes],
            edges=[edge.model_dump() if hasattr(edge, 'model_dump') else edge.dict() for edge in request.edges],
            metadata={
                **request.metadata,
                'project_id': x_project_id
            }
        )
        
        return workflow_def
        
    except Exception as e:
        logger.error(f"Error converting flow to workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workflows/builder/validate", response_model=WorkflowValidateResponse)
async def validate_workflow_flow_endpoint(request: WorkflowValidateRequest):
    """Validate a workflow flow for errors."""
    try:
        valid, errors = validate_workflow_flow([node.model_dump() if hasattr(node, 'model_dump') else node.dict() for node in request.nodes], [edge.model_dump() if hasattr(edge, 'model_dump') else edge.dict() for edge in request.edges])
        return WorkflowValidateResponse(valid=valid, errors=errors)
        
    except Exception as e:
        logger.error(f"Error validating workflow flow: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workflows/builder/nodes")
async def get_builder_nodes():
    """Get available node types for the workflow builder."""
    try:
        # Return the available node types that can be used in workflows
        nodes = [
            {
                "id": "inputNode",
                "name": "Input",
                "description": "Workflow input configuration with prompt and trigger settings",
                "category": "input",
                "icon": "Play",
                "inputs": [],
                "outputs": ["output"],
                "required": True,
                "config_schema": {
                    "prompt": {
                        "type": "textarea",
                        "label": "Workflow Prompt",
                        "description": "The main prompt that describes what this workflow should do",
                        "required": True,
                        "placeholder": "Describe what this workflow should accomplish..."
                    },
                    "trigger_type": {
                        "type": "select",
                        "label": "Trigger Type",
                        "description": "How this workflow should be triggered",
                        "required": True,
                        "options": [
                            {"value": "MANUAL", "label": "Manual"},
                            {"value": "WEBHOOK", "label": "Webhook"},
                            {"value": "SCHEDULE", "label": "Schedule"}
                        ],
                        "default": "MANUAL"
                    },
                    "schedule_config": {
                        "type": "object",
                        "label": "Schedule Configuration",
                        "description": "Configure when the workflow runs automatically",
                        "conditional": {"field": "trigger_type", "value": "SCHEDULE"},
                        "properties": {
                            "interval_type": {
                                "type": "select",
                                "label": "Interval Type",
                                "options": [
                                    {"value": "minutes", "label": "Minutes"},
                                    {"value": "hours", "label": "Hours"},
                                    {"value": "days", "label": "Days"},
                                    {"value": "weeks", "label": "Weeks"}
                                ]
                            },
                            "interval_value": {
                                "type": "number",
                                "label": "Interval Value",
                                "min": 1,
                                "placeholder": "e.g., 30 for every 30 minutes"
                            },
                            "cron_expression": {
                                "type": "text",
                                "label": "Cron Expression (Advanced)",
                                "description": "Use cron syntax for complex schedules",
                                "placeholder": "0 9 * * 1-5 (weekdays at 9 AM)"
                            },
                            "timezone": {
                                "type": "select",
                                "label": "Timezone",
                                "default": "UTC",
                                "options": [
                                    {"value": "UTC", "label": "UTC"},
                                    {"value": "America/New_York", "label": "Eastern Time"},
                                    {"value": "America/Chicago", "label": "Central Time"},
                                    {"value": "America/Denver", "label": "Mountain Time"},
                                    {"value": "America/Los_Angeles", "label": "Pacific Time"},
                                    {"value": "Europe/London", "label": "London"},
                                    {"value": "Europe/Paris", "label": "Paris"},
                                    {"value": "Asia/Tokyo", "label": "Tokyo"}
                                ]
                            }
                        }
                    },
                    "webhook_config": {
                        "type": "object",
                        "label": "Webhook Configuration",
                        "description": "Configure webhook trigger settings",
                        "conditional": {"field": "trigger_type", "value": "WEBHOOK"},
                        "properties": {
                            "method": {
                                "type": "select",
                                "label": "HTTP Method",
                                "default": "POST",
                                "options": [
                                    {"value": "POST", "label": "POST"},
                                    {"value": "GET", "label": "GET"},
                                    {"value": "PUT", "label": "PUT"}
                                ]
                            },
                            "authentication": {
                                "type": "select",
                                "label": "Authentication",
                                "options": [
                                    {"value": "none", "label": "None"},
                                    {"value": "api_key", "label": "API Key"},
                                    {"value": "bearer", "label": "Bearer Token"}
                                ]
                            }
                        }
                    },
                    "variables": {
                        "type": "key_value",
                        "label": "Default Variables",
                        "description": "Set default values for workflow variables"
                    }
                }
            },
            {
                "id": "agentNode",
                "name": "AI Agent",
                "description": "Intelligent agent that can execute tasks",
                "category": "agent",
                "icon": "Bot",
                "inputs": ["tools", "input", "data-input"],
                "outputs": ["output", "data-output", "action-output"]
            },
            {
                "id": "toolConnectionNode", 
                "name": "Tool Connection",
                "description": "Connects tools to agents",
                "category": "tool",
                "icon": "Wrench",
                "inputs": [],
                "outputs": ["tool-connection"]
            }
        ]
        
        return nodes
        
    except Exception as e:
        logger.error(f"Error getting builder nodes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workflows/templates")
async def get_workflow_templates():
    """Get available workflow templates."""
    try:
        client = await db.client
        
        result = await client.table('workflows').select('*').eq('is_template', True).execute()
        
        templates = []
        for data in result.data:
            template = {
                "id": data['id'],
                "name": data['name'],
                "description": data.get('description'),
                "category": "general",  # Could be extracted from metadata
                "preview_image": None,  # Could be added later
                "created_at": data.get('created_at')
            }
            templates.append(template)
        
        return templates
        
    except Exception as e:
        logger.error(f"Error getting workflow templates: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workflows/templates/{template_id}/create", response_model=WorkflowDefinition)
async def create_workflow_from_template(
    template_id: str,
    request: WorkflowExecuteRequest,
    user_id: str = Depends(get_current_user_id_from_jwt),
    x_project_id: Optional[str] = Header(None)
):
    """Create a new workflow from a template."""
    try:
        if not x_project_id:
            raise HTTPException(status_code=400, detail="Project ID is required")
        
        client = await db.client
        
        # Get template
        template_result = await client.table('workflows').select('*').eq('id', template_id).eq('is_template', True).execute()
        if not template_result.data:
            raise HTTPException(status_code=404, detail="Template not found")
        
        template_data = template_result.data[0]
        
        # Create new workflow from template
        workflow_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        template_definition = template_data.get('definition', {})
        
        workflow_data = {
            'id': workflow_id,
            'name': f"{template_data['name']} (Copy)",
            'description': template_data.get('description'),
            'project_id': x_project_id,
            'account_id': user_id,
            'created_by': user_id,
            'status': 'draft',
            'version': 1,
            'definition': {
                'steps': template_definition.get('steps', []),
                'entry_point': template_definition.get('entry_point', ''),
                'triggers': template_definition.get('triggers', []),
                'agent_id': template_definition.get('agent_id'),
                'max_execution_time': template_definition.get('max_execution_time', 3600),
                'max_retries': template_definition.get('max_retries', 3)
            }
        }
        
        result = await client.table('workflows').insert(workflow_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create workflow from template")
        
        data = result.data[0]
        return _map_db_to_workflow_definition(data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating workflow from template: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workflows/scheduler/status")
async def get_scheduler_status(
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Get information about currently scheduled workflows."""
    try:
        scheduled_workflows = await workflow_scheduler.get_scheduled_workflows()
        
        # Filter to only show workflows owned by the current user
        client = await db.client
        user_workflows = await client.table('workflows').select('id').eq('created_by', user_id).execute()
        user_workflow_ids = {w['id'] for w in user_workflows.data}
        
        filtered_scheduled = [
            w for w in scheduled_workflows 
            if w['workflow_id'] in user_workflow_ids
        ]
        
        return {
            "scheduled_workflows": filtered_scheduled,
            "total_scheduled": len(filtered_scheduled)
        }
        
    except Exception as e:
        logger.error(f"Error getting scheduler status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workflows/scheduler/start")
async def start_scheduler():
    """Start the workflow scheduler."""
    try:
        await workflow_scheduler.start()
        return {"message": "Workflow scheduler started"}
    except Exception as e:
        logger.error(f"Error starting scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workflows/scheduler/stop")
async def stop_scheduler():
    """Stop the workflow scheduler."""
    try:
        await workflow_scheduler.stop()
        return {"message": "Workflow scheduler stopped"}
    except Exception as e:
        logger.error(f"Error stopping scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e)) 