from fastapi import APIRouter, HTTPException, Request, Header
from fastapi.responses import JSONResponse
from typing import Optional, Dict, Any
import uuid
import asyncio
from datetime import datetime, timezone
import json
from .models import SlackEventRequest, WebhookExecutionResult
from .providers import SlackWebhookProvider, GenericWebhookProvider
from workflows.models import WorkflowDefinition

from services.supabase import DBConnection
from utils.logger import logger

router = APIRouter()

db = DBConnection()

def initialize(database: DBConnection):
    """Initialize the webhook API with database connection."""
    global db
    db = database

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
            if len(body) == 0:
                data = {}
                logger.info(f"[Webhook] Empty body received, using empty dict")
            else:
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
            from run_workflow_background import run_workflow_background
            
            execution_id = str(uuid.uuid4())
            
            execution_data = {
                "id": execution_id,
                "workflow_id": workflow.id,
                "workflow_version": 1,
                "workflow_name": workflow.name,
                "execution_context": result.get("execution_variables", {}),
                "project_id": workflow.project_id,
                "account_id": workflow.created_by,
                "triggered_by": "WEBHOOK",
                "status": "pending",
                "started_at": datetime.now(timezone.utc).isoformat()
            }
            
            client = await db.client
            await client.table('workflow_executions').insert(execution_data).execute()
            
            thread_id = str(uuid.uuid4())

            project_result = await client.table('projects').select('account_id').eq('project_id', workflow.project_id).execute()
            if not project_result.data:
                raise HTTPException(status_code=404, detail=f"Project {workflow.project_id} not found")
            account_id = project_result.data[0]['account_id']

            await client.table('threads').insert({
                "thread_id": thread_id,
                "project_id": workflow.project_id,
                "account_id": account_id,
                "metadata": {
                    "workflow_id": workflow.id,
                    "workflow_name": workflow.name,
                    "triggered_by": "WEBHOOK",
                    "execution_id": execution_id
                }
            }).execute()
            logger.info(f"Created thread for webhook workflow: {thread_id}")
            
            initial_message_content = f"Execute the workflow: {workflow.name}"
            if workflow.description:
                initial_message_content += f"\n\nDescription: {workflow.description}"
            
            if result.get("execution_variables"):
                initial_message_content += f"\n\nWorkflow Variables: {json.dumps(result.get('execution_variables'), indent=2)}"
            
            message_data = {
                "message_id": str(uuid.uuid4()),
                "thread_id": thread_id,
                "type": "user",
                "is_llm_message": True,
                "content": json.dumps({"role": "user", "content": initial_message_content}),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await client.table('messages').insert(message_data).execute()
            logger.info(f"Created initial user message for webhook workflow: {thread_id}")
            
            # Small delay to ensure database transaction is committed before background worker starts
            import asyncio
            await asyncio.sleep(0.1)

            agent_run = await client.table('agent_runs').insert({
                "thread_id": thread_id, 
                "status": "running",
                "started_at": datetime.now(timezone.utc).isoformat()
            }).execute()
            agent_run_id = agent_run.data[0]['id']
            logger.info(f"Created agent run for webhook workflow: {agent_run_id}")
            
            if hasattr(workflow, 'model_dump'):
                workflow_dict = workflow.model_dump(mode='json')
            else:
                workflow_dict = workflow.dict()
                if 'created_at' in workflow_dict and workflow_dict['created_at']:
                    workflow_dict['created_at'] = workflow_dict['created_at'].isoformat()
                if 'updated_at' in workflow_dict and workflow_dict['updated_at']:
                    workflow_dict['updated_at'] = workflow_dict['updated_at'].isoformat()
            
            run_workflow_background.send(
                execution_id=execution_id,
                workflow_id=workflow.id,
                workflow_name=workflow.name,
                workflow_definition=workflow_dict,
                variables=result.get("execution_variables", {}),
                triggered_by="WEBHOOK",
                project_id=workflow.project_id,
                thread_id=thread_id,
                agent_run_id=agent_run_id
            )
            
            return JSONResponse(content={
                "message": "Webhook received and workflow execution started",
                "workflow_id": workflow_id,
                "execution_id": execution_id,
                "thread_id": thread_id,
                "agent_run_id": agent_run_id,
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



@router.get("/webhooks/test/{workflow_id}")
async def test_webhook_endpoint(workflow_id: str):
    """Test endpoint to verify webhook URL is accessible."""
    return {
        "message": f"Webhook endpoint for workflow {workflow_id} is accessible",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "ok"
    } 