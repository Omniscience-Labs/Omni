from fastapi import APIRouter, HTTPException, Request, Header, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Optional, Dict, Any
import uuid
import asyncio
from datetime import datetime, timezone

from .models import SlackEventRequest, WebhookExecutionResult
from .providers import SlackWebhookProvider, GenericWebhookProvider
from workflows.models import WorkflowDefinition
from workflows.executor import WorkflowExecutor
from services.supabase import DBConnection
from utils.logger import logger

router = APIRouter()

db = DBConnection()
workflow_executor = WorkflowExecutor(db)

def initialize(database: DBConnection):
    """Initialize the webhook API with database connection."""
    global db, workflow_executor
    db = database
    workflow_executor = WorkflowExecutor(db)

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
        is_template=False,
        max_execution_time=definition.get('max_execution_time', 3600),
        max_retries=definition.get('max_retries', 3)
    )

@router.post("/webhooks/trigger/{workflow_id}")
async def trigger_workflow_webhook(
    workflow_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    x_slack_signature: Optional[str] = Header(None),
    x_slack_request_timestamp: Optional[str] = Header(None)
):
    """Handle webhook triggers for workflows."""
    try:
        logger.info(f"[Webhook] Received request for workflow {workflow_id}")
        logger.info(f"[Webhook] Headers: {dict(request.headers)}")
        
        body = await request.body()
        logger.info(f"[Webhook] Body length: {len(body)}")
        logger.info(f"[Webhook] Body preview: {body[:500]}")
        
        try:
            data = await request.json()
            logger.info(f"[Webhook] Parsed JSON data keys: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'}")
        except Exception as e:
            logger.error(f"[Webhook] Failed to parse JSON: {e}")
            raise HTTPException(status_code=400, detail=f"Invalid JSON payload: {str(e)}")

        provider_type = "slack" if x_slack_signature else "generic"
        
        logger.info(f"[Webhook] Detected provider type: {provider_type}")
        logger.info(f"[Webhook] Slack signature present: {bool(x_slack_signature)}")
        logger.info(f"[Webhook] Slack timestamp present: {bool(x_slack_request_timestamp)}")

        if provider_type == "slack" and data.get("type") == "url_verification":
            logger.info(f"[Webhook] Handling Slack URL verification challenge")
            challenge = data.get("challenge")
            if challenge:
                logger.info(f"[Webhook] Returning challenge: {challenge}")
                return JSONResponse(content={"challenge": challenge})
            else:
                logger.error(f"[Webhook] No challenge found in URL verification request")
                raise HTTPException(status_code=400, detail="No challenge found in URL verification request")

        client = await db.client
        logger.info(f"[Webhook] Looking up workflow {workflow_id} in database")
        result = await client.table('workflows').select('*').eq('id', workflow_id).execute()
        
        if not result.data:
            logger.error(f"[Webhook] Workflow {workflow_id} not found in database")
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        workflow_data = result.data[0]
        workflow = _map_db_to_workflow_definition(workflow_data)
        logger.info(f"[Webhook] Found workflow: {workflow.name}, state: {workflow.state}")
        logger.info(f"[Webhook] Workflow triggers: {[t.type for t in workflow.triggers]}")

        if workflow.state not in ['ACTIVE', 'DRAFT']:
            logger.error(f"[Webhook] Workflow {workflow_id} is not active or draft (state: {workflow.state})")
            raise HTTPException(status_code=400, detail=f"Workflow must be active or draft (current state: {workflow.state})")
        
        has_webhook_trigger = any(trigger.type == 'WEBHOOK' for trigger in workflow.triggers)
        if not has_webhook_trigger:
            logger.warning(f"[Webhook] Workflow {workflow_id} does not have webhook trigger configured, but allowing for testing")
        
        if provider_type == "slack":
            result = await _handle_slack_webhook(workflow, data, body, x_slack_signature, x_slack_request_timestamp)
        else:
            result = await _handle_generic_webhook(workflow, data)

        if result.get("should_execute", False):
            background_tasks.add_task(
                _execute_workflow_from_webhook,
                workflow,
                result.get("execution_variables", {}),
                result.get("trigger_data", {}),
                provider_type
            )
            
            return JSONResponse(content={
                "message": "Webhook received and workflow execution started",
                "workflow_id": workflow_id,
                "provider": provider_type
            })
        else:
            return JSONResponse(content=result.get("response", {"message": "Webhook processed"}))
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing webhook: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def _handle_slack_webhook(
    workflow: WorkflowDefinition,
    data: Dict[str, Any],
    body: bytes,
    signature: Optional[str],
    timestamp: Optional[str]
) -> Dict[str, Any]:
    """Handle Slack webhook specifically."""
    try:
        slack_event = SlackEventRequest(**data)

        if slack_event.type == "url_verification":
            return {
                "should_execute": False,
                "response": {"challenge": slack_event.challenge}
            }
        
        webhook_config = None
        for trigger in workflow.triggers:
            if trigger.type == 'WEBHOOK' and trigger.config.get('type') == 'slack':
                webhook_config = trigger.config
                break
        
        if not webhook_config:
            raise HTTPException(status_code=400, detail="Slack webhook not configured for this workflow")
        
        signing_secret = webhook_config.get('slack', {}).get('signing_secret')
        if not signing_secret:
            raise HTTPException(status_code=400, detail="Slack signing secret not configured")
        
        if signature and timestamp:
            if not SlackWebhookProvider.validate_request_timing(timestamp):
                raise HTTPException(status_code=400, detail="Request timestamp is too old")
            
            if not SlackWebhookProvider.verify_signature(body, timestamp, signature, signing_secret):
                raise HTTPException(status_code=401, detail="Invalid Slack signature")
        
        payload = SlackWebhookProvider.process_event(slack_event)
        
        if payload:
            execution_variables = {
                "slack_text": payload.text,
                "slack_user_id": payload.user_id,
                "slack_channel_id": payload.channel_id,
                "slack_team_id": payload.team_id,
                "slack_timestamp": payload.timestamp,
                "trigger_type": "webhook",
                "webhook_provider": "slack"
            }
            
            return {
                "should_execute": True,
                "execution_variables": execution_variables,
                "trigger_data": payload.model_dump()
            }
        else:
            return {
                "should_execute": False,
                "response": {"message": "Event processed but no action needed"}
            }
            
    except Exception as e:
        logger.error(f"Error handling Slack webhook: {e}")
        raise HTTPException(status_code=400, detail=f"Error processing Slack webhook: {str(e)}")

async def _handle_generic_webhook(workflow: WorkflowDefinition, data: Dict[str, Any]) -> Dict[str, Any]:
    """Handle generic webhook."""
    try:
        processed_data = GenericWebhookProvider.process_payload(data)
        
        execution_variables = {
            "webhook_payload": data,
            "trigger_type": "webhook",
            "webhook_provider": "generic",
            "processed_data": processed_data
        }
        
        return {
            "should_execute": True,
            "execution_variables": execution_variables,
            "trigger_data": data
        }
        
    except Exception as e:
        logger.error(f"Error handling generic webhook: {e}")
        raise HTTPException(status_code=400, detail=f"Error processing generic webhook: {str(e)}")

async def _execute_workflow_from_webhook(
    workflow: WorkflowDefinition,
    variables: Dict[str, Any],
    trigger_data: Dict[str, Any],
    provider_type: str
):
    """Execute workflow from webhook trigger in background."""
    try:
        client = await db.client

        execution_id = str(uuid.uuid4())
        thread_id = str(uuid.uuid4())
        
        execution_data = {
            "id": execution_id,
            "workflow_id": workflow.id,
            "workflow_version": 1,
            "workflow_name": workflow.name,
            "execution_context": variables,
            "project_id": workflow.project_id,
            "account_id": workflow.created_by,
            "triggered_by": "WEBHOOK",
            "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat()
        }
        
        await client.table('workflow_executions').insert(execution_data).execute()
        
        logger.info(f"Starting webhook-triggered execution {execution_id} for workflow {workflow.id}")

        async for update in workflow_executor.execute_workflow(
            workflow=workflow,
            variables=variables,
            thread_id=thread_id,
            project_id=workflow.project_id
        ):
            logger.info(f"Webhook workflow {workflow.id} update: {update.get('type', 'unknown')}")
        
        await client.table('workflow_executions').update({
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat()
        }).eq('id', execution_id).execute()
        
        logger.info(f"Webhook-triggered execution {execution_id} completed successfully")
        
    except Exception as e:
        logger.error(f"Webhook workflow execution failed: {e}")
        try:
            client = await db.client
            await client.table('workflow_executions').update({
                "status": "failed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "error": str(e)
            }).eq('id', execution_id).execute()
        except:
            pass

@router.get("/webhooks/test/{workflow_id}")
async def test_webhook_endpoint(workflow_id: str):
    """Test endpoint to verify webhook URL is accessible."""
    return {
        "message": f"Webhook endpoint for workflow {workflow_id} is accessible",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "ok"
    } 