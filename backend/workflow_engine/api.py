"""
Workflow Engine API

Provides REST API endpoints for workflow management and execution.
"""

from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from typing import List, Optional, Dict, Any
from datetime import datetime

from .models import (
    WorkflowDefinition, WorkflowStatus, TriggerConfig,
    WorkflowExecution, ExecutionStatus, TriggerType
)
from .orchestrator import WorkflowOrchestrator
from .triggers import TriggerManager
from services.supabase import DBConnection
from utils.logger import logger

router = APIRouter(prefix="/workflows", tags=["workflows"])

# Global instances
db = DBConnection()
orchestrator = WorkflowOrchestrator(db)
trigger_manager = TriggerManager(db)


async def get_current_user(request: Request) -> Dict[str, Any]:
    """Get current user from request"""
    # TODO: Implement proper authentication
    return {
        "id": "user-123",
        "project_id": "project-123"
    }


@router.post("/")
async def create_workflow(
    workflow: WorkflowDefinition,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Create a new workflow"""
    try:
        # Set ownership
        workflow.project_id = user["project_id"]
        workflow.created_by = user["id"]
        
        # Validate workflow
        if not workflow.nodes:
            raise HTTPException(400, "Workflow must have at least one node")
            
        # Store in database
        client = await db.client
        result = await client.table('workflows').insert({
            "id": workflow.id,
            "name": workflow.name,
            "description": workflow.description,
            "project_id": workflow.project_id,
            "created_by": workflow.created_by,
            "status": workflow.status,
            "definition": workflow.dict(),
            "created_at": workflow.created_at.isoformat(),
            "updated_at": workflow.updated_at.isoformat()
        }).execute()
        
        # Register triggers if workflow is active
        if workflow.status == WorkflowStatus.ACTIVE:
            await trigger_manager.register_workflow_triggers(workflow)
            
        return {
            "id": workflow.id,
            "name": workflow.name,
            "status": workflow.status,
            "created_at": workflow.created_at
        }
        
    except Exception as e:
        logger.error(f"Error creating workflow: {e}")
        raise HTTPException(500, str(e))


@router.get("/{workflow_id}")
async def get_workflow(
    workflow_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Get workflow by ID"""
    try:
        client = await db.client
        result = await client.table('workflows').select('*').eq('id', workflow_id).eq('project_id', user["project_id"]).single().execute()
        
        if not result.data:
            raise HTTPException(404, "Workflow not found")
            
        return result.data
        
    except Exception as e:
        logger.error(f"Error getting workflow: {e}")
        raise HTTPException(500, str(e))


@router.put("/{workflow_id}")
async def update_workflow(
    workflow_id: str,
    workflow: WorkflowDefinition,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Update workflow"""
    try:
        # Verify ownership
        client = await db.client
        existing = await client.table('workflows').select('*').eq('id', workflow_id).eq('project_id', user["project_id"]).single().execute()
        
        if not existing.data:
            raise HTTPException(404, "Workflow not found")
            
        # Update workflow
        workflow.updated_at = datetime.utcnow()
        workflow.version += 1
        
        result = await client.table('workflows').update({
            "name": workflow.name,
            "description": workflow.description,
            "status": workflow.status,
            "definition": workflow.dict(),
            "updated_at": workflow.updated_at.isoformat(),
            "version": workflow.version
        }).eq('id', workflow_id).execute()
        
        # Update triggers
        await trigger_manager.unregister_workflow_triggers(workflow_id)
        if workflow.status == WorkflowStatus.ACTIVE:
            await trigger_manager.register_workflow_triggers(workflow)
            
        return {"message": "Workflow updated successfully"}
        
    except Exception as e:
        logger.error(f"Error updating workflow: {e}")
        raise HTTPException(500, str(e))


@router.delete("/{workflow_id}")
async def delete_workflow(
    workflow_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Delete workflow"""
    try:
        # Unregister triggers
        await trigger_manager.unregister_workflow_triggers(workflow_id)
        
        # Delete from database
        client = await db.client
        result = await client.table('workflows').delete().eq('id', workflow_id).eq('project_id', user["project_id"]).execute()
        
        return {"message": "Workflow deleted successfully"}
        
    except Exception as e:
        logger.error(f"Error deleting workflow: {e}")
        raise HTTPException(500, str(e))


@router.post("/{workflow_id}/activate")
async def activate_workflow(
    workflow_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Activate a workflow"""
    try:
        # Load workflow
        client = await db.client
        result = await client.table('workflows').select('*').eq('id', workflow_id).eq('project_id', user["project_id"]).single().execute()
        
        if not result.data:
            raise HTTPException(404, "Workflow not found")
            
        workflow = WorkflowDefinition(**result.data['definition'])
        workflow.status = WorkflowStatus.ACTIVE
        
        # Update status
        await client.table('workflows').update({
            "status": WorkflowStatus.ACTIVE,
            "definition": workflow.dict()
        }).eq('id', workflow_id).execute()
        
        # Register triggers
        await trigger_manager.register_workflow_triggers(workflow)
        
        return {"message": "Workflow activated successfully"}
        
    except Exception as e:
        logger.error(f"Error activating workflow: {e}")
        raise HTTPException(500, str(e))


@router.post("/{workflow_id}/pause")
async def pause_workflow(
    workflow_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Pause a workflow"""
    try:
        # Unregister triggers
        await trigger_manager.unregister_workflow_triggers(workflow_id)
        
        # Update status
        client = await db.client
        await client.table('workflows').update({
            "status": WorkflowStatus.PAUSED
        }).eq('id', workflow_id).eq('project_id', user["project_id"]).execute()
        
        return {"message": "Workflow paused successfully"}
        
    except Exception as e:
        logger.error(f"Error pausing workflow: {e}")
        raise HTTPException(500, str(e))


@router.post("/{workflow_id}/execute")
async def execute_workflow(
    workflow_id: str,
    background_tasks: BackgroundTasks,
    input_data: Optional[Dict[str, Any]] = None,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Manually execute a workflow"""
    try:
        # Verify workflow exists and user has access
        client = await db.client
        result = await client.table('workflows').select('*').eq('id', workflow_id).eq('project_id', user["project_id"]).single().execute()
        
        if not result.data:
            raise HTTPException(404, "Workflow not found")
            
        # Trigger manual execution
        execution_id = await trigger_manager.trigger_manual(
            workflow_id, user["id"], input_data
        )
        
        return {
            "execution_id": execution_id,
            "status": "queued",
            "message": "Workflow execution queued successfully"
        }
        
    except Exception as e:
        logger.error(f"Error executing workflow: {e}")
        raise HTTPException(500, str(e))


@router.get("/{workflow_id}/executions")
async def list_workflow_executions(
    workflow_id: str,
    limit: int = 10,
    offset: int = 0,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """List workflow executions"""
    try:
        client = await db.client
        result = await client.table('workflow_executions').select('*').eq('workflow_id', workflow_id).eq('project_id', user["project_id"]).order('started_at', desc=True).limit(limit).offset(offset).execute()
        
        return {
            "executions": result.data,
            "total": len(result.data),
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Error listing executions: {e}")
        raise HTTPException(500, str(e))


@router.get("/executions/{execution_id}")
async def get_execution(
    execution_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Get execution details"""
    try:
        # Get execution status from orchestrator
        status = await orchestrator.get_execution_status(execution_id)
        
        if not status:
            # Try to load from database
            client = await db.client
            result = await client.table('workflow_executions').select('*').eq('id', execution_id).eq('project_id', user["project_id"]).single().execute()
            
            if not result.data:
                raise HTTPException(404, "Execution not found")
                
            return result.data
            
        return status
        
    except Exception as e:
        logger.error(f"Error getting execution: {e}")
        raise HTTPException(500, str(e))


@router.post("/executions/{execution_id}/cancel")
async def cancel_execution(
    execution_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Cancel a running execution"""
    try:
        # Verify ownership
        client = await db.client
        result = await client.table('workflow_executions').select('workflow_id').eq('id', execution_id).eq('project_id', user["project_id"]).single().execute()
        
        if not result.data:
            raise HTTPException(404, "Execution not found")
            
        # Cancel execution
        cancelled = await orchestrator.cancel_execution(execution_id)
        
        if not cancelled:
            raise HTTPException(400, "Execution is not running or already completed")
            
        return {"message": "Execution cancelled successfully"}
        
    except Exception as e:
        logger.error(f"Error cancelling execution: {e}")
        raise HTTPException(500, str(e))


@router.get("/{workflow_id}/triggers")
async def list_workflow_triggers(
    workflow_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """List workflow triggers"""
    try:
        client = await db.client
        
        # Get workflow
        workflow_result = await client.table('workflows').select('definition').eq('id', workflow_id).eq('project_id', user["project_id"]).single().execute()
        
        if not workflow_result.data:
            raise HTTPException(404, "Workflow not found")
            
        workflow = WorkflowDefinition(**workflow_result.data['definition'])
        
        # Get trigger details
        triggers = []
        for trigger in workflow.triggers:
            trigger_info = {
                "type": trigger.type,
                "enabled": trigger.enabled,
                "config": trigger.dict()
            }
            
            # Add webhook URL if webhook trigger
            if trigger.type == TriggerType.WEBHOOK:
                webhook_result = await client.table('webhook_registrations').select('path').eq('workflow_id', workflow_id).single().execute()
                if webhook_result.data:
                    trigger_info["webhook_url"] = f"https://api.suna.so{webhook_result.data['path']}"
                    
            triggers.append(trigger_info)
            
        return {"triggers": triggers}
        
    except Exception as e:
        logger.error(f"Error listing triggers: {e}")
        raise HTTPException(500, str(e))


@router.post("/webhooks/{path:path}")
async def handle_webhook(
    path: str,
    request: Request
):
    """Handle incoming webhook"""
    try:
        # Get request data
        headers = dict(request.headers)
        body = await request.json() if request.headers.get("content-type") == "application/json" else await request.body()
        
        # Process webhook
        result = await trigger_manager.handle_webhook(
            path=f"/webhooks/{path}",
            method=request.method,
            headers=headers,
            body=body
        )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error handling webhook: {e}")
        raise HTTPException(500, str(e))


# Initialize on module load
async def initialize():
    """Initialize workflow engine"""
    await orchestrator.initialize()
    await trigger_manager.initialize()
    logger.info("Workflow engine initialized") 