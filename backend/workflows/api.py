"""
Workflow API - REST endpoints for workflow management and execution.
"""

from fastapi import APIRouter, HTTPException, Depends, Header, Request, Query
from fastapi.responses import StreamingResponse
from typing import List, Optional, Dict, Any
import uuid
import json
import asyncio
from datetime import datetime, timezone

from .models import (
    WorkflowDefinition, WorkflowCreateRequest, WorkflowUpdateRequest,
    WorkflowExecuteRequest, WorkflowConvertRequest, WorkflowValidateRequest,
    WorkflowValidateResponse, WorkflowFlow, WorkflowExecution, WorkflowStep, WorkflowTrigger
)
from .converter import WorkflowConverter, validate_workflow_flow
from .executor import WorkflowExecutor
from .deterministic_executor import DeterministicWorkflowExecutor
from .scheduler import WorkflowScheduler
from services.supabase import DBConnection
from utils.logger import logger
from utils.auth_utils import get_current_user_id_from_jwt
from scheduling.qstash_service import QStashService
from scheduling.models import (
    ScheduleCreateRequest, ScheduleConfig as QStashScheduleConfig,
    SimpleScheduleConfig, CronScheduleConfig
)
from webhooks.providers import TelegramWebhookProvider
from flags.flags import is_enabled

router = APIRouter()

db = DBConnection()
workflow_converter = WorkflowConverter()
workflow_executor = WorkflowExecutor(db)
workflow_scheduler = WorkflowScheduler(db, workflow_executor)
qstash_service = QStashService()

def initialize(database: DBConnection):
    """Initialize the workflow API with database connection."""
    global db, workflow_executor, workflow_scheduler, qstash_service
    db = database
    workflow_executor = WorkflowExecutor(db)
    workflow_scheduler = WorkflowScheduler(db, workflow_executor)
    qstash_service = QStashService()

async def _create_workflow_thread_for_api(
    thread_id: str, 
    project_id: str, 
    workflow: WorkflowDefinition, 
    variables: Optional[Dict[str, Any]] = None
):
    """Create a thread in the database for workflow execution (API version)."""
    try:
        client = await db.client
        project_result = await client.table('projects').select('account_id').eq('project_id', project_id).execute()
        if not project_result.data:
            raise ValueError(f"Project {project_id} not found")
        
        account_id = project_result.data[0]['account_id']
        
        thread_data = {
            "thread_id": thread_id,
            "project_id": project_id,
            "account_id": account_id,
            "metadata": {
                "workflow_id": workflow.id,
                "workflow_name": workflow.name,
                "is_workflow_execution": True,
                "workflow_run_name": f"Workflow Run: {workflow.name}"
            },
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await client.table('threads').insert(thread_data).execute()
        
        input_prompt = ""
        if workflow.steps:
            main_step = workflow.steps[0]
            input_prompt = main_step.config.get("input_prompt", "")

        if input_prompt:
            initial_message = input_prompt
        else:
            initial_message = f"Execute the workflow: {workflow.name}"
            if workflow.description:
                initial_message += f"\n\nDescription: {workflow.description}"
        
        if variables:
            initial_message += f"\n\nVariables: {json.dumps(variables, indent=2)}"
        
        message_data = {
            "message_id": str(uuid.uuid4()),
            "thread_id": thread_id,
            "type": "user",
            "is_llm_message": True,
            "content": json.dumps({"role": "user", "content": initial_message}),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await client.table('messages').insert(message_data).execute()
        logger.info(f"Created workflow thread {thread_id} for workflow {workflow.id}")
        
    except Exception as e:
        logger.error(f"Failed to create workflow thread: {e}")
        raise

def _map_db_to_workflow_definition(data: dict) -> WorkflowDefinition:
    """Helper function to map database record to WorkflowDefinition."""
    definition = data.get('definition', {})
    raw_steps = definition.get('steps', [])
    steps = []
    for step_data in raw_steps:
        if isinstance(step_data, dict):
            step = WorkflowStep(
                id=step_data.get('id', ''),
                name=step_data.get('name', ''),
                description=step_data.get('description'),
                type=step_data.get('type', 'TOOL'),
                config=step_data.get('config', {}),
                next_steps=step_data.get('next_steps', []),
                error_handler=step_data.get('error_handler')
            )
            steps.append(step)
        else:
            steps.append(step_data)
    
    raw_triggers = definition.get('triggers', [])
    triggers = []
    for trigger_data in raw_triggers:
        if isinstance(trigger_data, dict):
            trigger = WorkflowTrigger(
                type=trigger_data.get('type', 'MANUAL'),
                config=trigger_data.get('config', {})
            )
            triggers.append(trigger)
        else:
            triggers.append(trigger_data)
    
    return WorkflowDefinition(
        id=data['id'],
        name=data['name'],
        description=data.get('description'),
        steps=steps,
        entry_point=definition.get('entry_point', ''),
        triggers=triggers,
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

@router.get("/workflows", response_model=List[WorkflowDefinition])
async def list_workflows(
    user_id: str = Depends(get_current_user_id_from_jwt),
    x_project_id: Optional[str] = Header(None)
):
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    
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
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
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
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
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
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    """Update a workflow."""
    try:
        client = await db.client
        existing = await client.table('workflows').select('*').eq('id', workflow_id).eq('created_by', user_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        current_definition = existing.data[0].get('definition', {})
        
        update_data = {}
        
        if request.name is not None:
            update_data['name'] = request.name
        if request.description is not None:
            update_data['description'] = request.description
        if request.state is not None:
            update_data['status'] = request.state.lower()
        
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
        
        if updated_workflow.state == 'ACTIVE':
            schedule_triggers = [trigger for trigger in updated_workflow.triggers if trigger.type == 'SCHEDULE']
            if schedule_triggers:
                try:
                    await _remove_qstash_schedules_for_workflow(workflow_id)
                    for schedule_trigger in schedule_triggers:
                        await _create_qstash_schedule_for_workflow(updated_workflow, schedule_trigger)
                    
                    logger.info(f"Successfully created QStash schedules for workflow {workflow_id}")
                except Exception as e:
                    logger.error(f"Failed to create QStash schedules for workflow {workflow_id}: {e}")
                    raise HTTPException(status_code=500, detail=f"Failed to schedule workflow: {e}")
        else:
            try:
                await _remove_qstash_schedules_for_workflow(workflow_id)
                logger.info(f"Removed QStash schedules for inactive workflow {workflow_id}")
            except Exception as e:
                logger.warning(f"Failed to remove QStash schedules for workflow {workflow_id}: {e}")
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
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    """Delete a workflow."""
    try:
        client = await db.client

        existing = await client.table('workflows').select('id').eq('id', workflow_id).eq('created_by', user_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Workflow not found")

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
    user_id: str = Depends(get_current_user_id_from_jwt),
    deterministic: bool = Query(True, description="Use deterministic executor that follows visual flow exactly")
):
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    """Execute a workflow and return execution info."""
    try:
        client = await db.client

        result = await client.table('workflows').select('*').eq('id', workflow_id).eq('created_by', user_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        data = result.data[0]
        workflow = _map_db_to_workflow_definition(data)
        
        logger.info(f"[EXECUTE] Loaded workflow {workflow.id} with {len(workflow.steps)} steps")
        for i, step in enumerate(workflow.steps):
            if hasattr(step, 'config'):
                step_config = step.config
                tools_in_step = step_config.get('tools', []) if isinstance(step_config, dict) else []
                logger.info(f"[EXECUTE] Step {i} ({step.id}): {len(tools_in_step)} tools - {[t.get('id') if isinstance(t, dict) else t for t in tools_in_step]}")
            else:
                logger.info(f"[EXECUTE] Step {i} has no config attribute")
        
        if workflow.state not in ['ACTIVE', 'DRAFT']:
            raise HTTPException(status_code=400, detail="Workflow must be active or draft to execute")
        
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
        
        thread_id = str(uuid.uuid4())
        
        await _create_workflow_thread_for_api(thread_id, workflow.project_id, workflow, request.variables)
        
        agent_run = await client.table('agent_runs').insert({
            "thread_id": thread_id, 
            "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat()
        }).execute()
        agent_run_id = agent_run.data[0]['id']
        logger.info(f"Created agent run for workflow: {agent_run_id}")
        
        from run_agent_background import run_workflow_background
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
            workflow_id=workflow_id,
            workflow_name=workflow.name,
            workflow_definition=workflow_dict,
            variables=request.variables,
            triggered_by="MANUAL",
            project_id=workflow.project_id,
            thread_id=thread_id,
            agent_run_id=agent_run_id,
            deterministic=deterministic
        )
        
        return {
            "execution_id": execution_id,
            "thread_id": thread_id,
            "agent_run_id": agent_run_id,
            "status": "running",
            "message": "Workflow execution started"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workflows/executions/{execution_id}/stream")
async def stream_workflow_execution(
    execution_id: str,
    token: Optional[str] = None,
    request: Request = None
):
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    
    """Stream the responses of a workflow execution using Redis Lists and Pub/Sub."""
    logger.info(f"Starting stream for workflow execution: {execution_id}")
    
    from utils.auth_utils import get_user_id_from_stream_auth
    import services.redis as redis
    
    user_id = await get_user_id_from_stream_auth(request, token)
    
    client = await db.client
    execution_result = await client.table('workflow_executions').select('*').eq('id', execution_id).execute()
    
    if not execution_result.data:
        raise HTTPException(status_code=404, detail="Workflow execution not found")
    
    execution_data = execution_result.data[0]
    
    if execution_data['account_id'] != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    response_list_key = f"workflow_execution:{execution_id}:responses"
    response_channel = f"workflow_execution:{execution_id}:new_response"
    control_channel = f"workflow_execution:{execution_id}:control"

    async def stream_generator():
        logger.debug(f"Streaming responses for workflow execution {execution_id} using Redis list {response_list_key}")
        last_processed_index = -1
        pubsub_response = None
        pubsub_control = None
        listener_task = None
        terminate_stream = False
        initial_yield_complete = False

        try:
            initial_responses_json = await redis.lrange(response_list_key, 0, -1)
            initial_responses = []
            if initial_responses_json:
                initial_responses = [json.loads(r) for r in initial_responses_json]
                logger.debug(f"Sending {len(initial_responses)} initial responses for workflow execution {execution_id}")
                for response in initial_responses:
                    yield f"data: {json.dumps(response)}\n\n"
                last_processed_index = len(initial_responses) - 1
            initial_yield_complete = True

            run_status = await client.table('workflow_executions').select('status').eq("id", execution_id).maybe_single().execute()
            current_status = run_status.data.get('status') if run_status.data else None

            if current_status not in ['running', 'pending']:
                logger.info(f"Workflow execution {execution_id} is not running (status: {current_status}). Ending stream.")
                yield f"data: {json.dumps({'type': 'workflow_status', 'status': 'completed'})}\n\n"
                return

            pubsub_response = await redis.create_pubsub()
            await pubsub_response.subscribe(response_channel)
            logger.debug(f"Subscribed to response channel: {response_channel}")

            pubsub_control = await redis.create_pubsub()
            await pubsub_control.subscribe(control_channel)
            logger.debug(f"Subscribed to control channel: {control_channel}")

            message_queue = asyncio.Queue()

            async def listen_messages():
                response_reader = pubsub_response.listen()
                control_reader = pubsub_control.listen()
                tasks = [asyncio.create_task(response_reader.__anext__()), asyncio.create_task(control_reader.__anext__())]

                while not terminate_stream:
                    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                    for task in done:
                        try:
                            message = task.result()
                            if message and isinstance(message, dict) and message.get("type") == "message":
                                channel = message.get("channel")
                                data = message.get("data")
                                if isinstance(data, bytes): data = data.decode('utf-8')

                                if channel == response_channel and data == "new":
                                    await message_queue.put({"type": "new_response"})
                                elif channel == control_channel and data in ["STOP", "END_STREAM", "ERROR"]:
                                    logger.info(f"Received control signal '{data}' for workflow execution {execution_id}")
                                    await message_queue.put({"type": "control", "data": data})
                                    return

                        except StopAsyncIteration:
                            logger.warning(f"Listener {task} stopped.")
                            await message_queue.put({"type": "error", "data": "Listener stopped unexpectedly"})
                            return
                        except Exception as e:
                            logger.error(f"Error in listener for workflow execution {execution_id}: {e}")
                            await message_queue.put({"type": "error", "data": "Listener failed"})
                            return
                        finally:
                            if task in tasks:
                                tasks.remove(task)
                                if message and isinstance(message, dict) and message.get("channel") == response_channel:
                                     tasks.append(asyncio.create_task(response_reader.__anext__()))
                                elif message and isinstance(message, dict) and message.get("channel") == control_channel:
                                     tasks.append(asyncio.create_task(control_reader.__anext__()))

                for p_task in pending: p_task.cancel()
                for task in tasks: task.cancel()

            listener_task = asyncio.create_task(listen_messages())
            while not terminate_stream:
                try:
                    queue_item = await message_queue.get()

                    if queue_item["type"] == "new_response":
                        new_start_index = last_processed_index + 1
                        new_responses_json = await redis.lrange(response_list_key, new_start_index, -1)

                        if new_responses_json:
                            new_responses = [json.loads(r) for r in new_responses_json]
                            num_new = len(new_responses)
                            for response in new_responses:
                                yield f"data: {json.dumps(response)}\n\n"
                                if response.get('type') == 'workflow_status' and response.get('status') in ['completed', 'failed', 'stopped']:
                                    logger.info(f"Detected workflow completion via status message in stream: {response.get('status')}")
                                    terminate_stream = True
                                    break
                            last_processed_index += num_new
                        if terminate_stream: break

                    elif queue_item["type"] == "control":
                        control_signal = queue_item["data"]
                        terminate_stream = True
                        yield f"data: {json.dumps({'type': 'workflow_status', 'status': control_signal})}\n\n"
                        break

                    elif queue_item["type"] == "error":
                        logger.error(f"Listener error for workflow execution {execution_id}: {queue_item['data']}")
                        terminate_stream = True
                        yield f"data: {json.dumps({'type': 'workflow_status', 'status': 'error'})}\n\n"
                        break

                except asyncio.CancelledError:
                     logger.info(f"Stream generator main loop cancelled for workflow execution {execution_id}")
                     terminate_stream = True
                     break
                except Exception as loop_err:
                    logger.error(f"Error in stream generator main loop for workflow execution {execution_id}: {loop_err}", exc_info=True)
                    terminate_stream = True
                    yield f"data: {json.dumps({'type': 'workflow_status', 'status': 'error', 'message': f'Stream failed: {loop_err}'})}\n\n"
                    break

        except Exception as e:
            logger.error(f"Error setting up stream for workflow execution {execution_id}: {e}", exc_info=True)
            if not initial_yield_complete:
                 yield f"data: {json.dumps({'type': 'workflow_status', 'status': 'error', 'message': f'Failed to start stream: {e}'})}\n\n"
        finally:
            terminate_stream = True
            if pubsub_response: await pubsub_response.unsubscribe(response_channel)
            if pubsub_control: await pubsub_control.unsubscribe(control_channel)
            if pubsub_response: await pubsub_response.close()
            if pubsub_control: await pubsub_control.close()

            if listener_task:
                listener_task.cancel()
                try:
                    await listener_task
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.debug(f"listener_task ended with: {e}")
            await asyncio.sleep(0.1)
            logger.debug(f"Streaming cleanup complete for workflow execution: {execution_id}")

    return StreamingResponse(stream_generator(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive",
        "X-Accel-Buffering": "no", "Content-Type": "text/event-stream",
        "Access-Control-Allow-Origin": "*"
    })

@router.get("/workflows/{workflow_id}/flow", response_model=WorkflowFlow)
async def get_workflow_flow(
    workflow_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    
    """Get the visual flow representation of a workflow."""
    try:
        client = await db.client
        result = await client.table('workflow_flows').select('*').eq('workflow_id', workflow_id).execute()
        
        if result.data:
            data = result.data[0]
            return WorkflowFlow(
                nodes=data.get('nodes', []),
                edges=data.get('edges', []),
                metadata=data.get('metadata', {})
            )
        
        workflow_result = await client.table('workflows').select('*').eq('id', workflow_id).eq('created_by', user_id).execute()
        
        if not workflow_result.data:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        workflow_data = workflow_result.data[0]
        
        metadata = {
            "name": workflow_data.get('name', 'Untitled Workflow'),
            "description": workflow_data.get('description', '')
        }
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
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    
    """Update the visual flow of a workflow and convert it to executable definition."""
    try:
        client = await db.client
        existing = await client.table('workflows').select('*').eq('id', workflow_id).eq('created_by', user_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        flow_data = {
            'workflow_id': workflow_id,
            'nodes': [node.model_dump() if hasattr(node, 'model_dump') else node.dict() for node in flow.nodes],
            'edges': [edge.model_dump() if hasattr(edge, 'model_dump') else edge.dict() for edge in flow.edges],
            'metadata': flow.metadata,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        
        await client.table('workflow_flows').upsert(flow_data).execute()
        workflow_def = workflow_converter.convert_flow_to_workflow(
            nodes=[node.model_dump() if hasattr(node, 'model_dump') else node.dict() for node in flow.nodes],
            edges=[edge.model_dump() if hasattr(edge, 'model_dump') else edge.dict() for edge in flow.edges],
            metadata={
                **flow.metadata,
                'project_id': existing.data[0]['project_id'],
                'agent_id': existing.data[0].get('definition', {}).get('agent_id')
            }
        )
        
        current_definition = existing.data[0].get('definition', {})
        current_definition.update({
            'steps': [step.model_dump() if hasattr(step, 'model_dump') else step.dict() for step in workflow_def.steps],
            'entry_point': workflow_def.entry_point,
            'triggers': [trigger.model_dump() if hasattr(trigger, 'model_dump') else trigger.dict() for trigger in workflow_def.triggers],
        })
        
        update_data = {
            'definition': current_definition
        }
        
        if flow.metadata.get('name'):
            update_data['name'] = flow.metadata['name']
        if flow.metadata.get('description'):
            update_data['description'] = flow.metadata['description']
        
        result = await client.table('workflows').update(update_data).eq('id', workflow_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update workflow")
        
        data = result.data[0]
        updated_workflow = _map_db_to_workflow_definition(data)
        
        # Handle scheduling with QStash for cloud-based persistent scheduling
        if updated_workflow.state == 'ACTIVE':
            schedule_triggers = [trigger for trigger in updated_workflow.triggers if trigger.type == 'SCHEDULE']
            if schedule_triggers:
                try:
                    # Remove any existing QStash schedules first
                    await _remove_qstash_schedules_for_workflow(workflow_id)
                    
                    # Create new QStash schedules
                    for schedule_trigger in schedule_triggers:
                        await _create_qstash_schedule_for_workflow(updated_workflow, schedule_trigger)
                    
                    logger.info(f"Successfully created QStash schedules for workflow {workflow_id}")
                except Exception as e:
                    logger.error(f"Failed to create QStash schedules for workflow {workflow_id}: {e}")
                    raise HTTPException(status_code=500, detail=f"Failed to schedule workflow: {e}")
        else:
            # Remove QStash schedules when workflow is not active
            try:
                await _remove_qstash_schedules_for_workflow(workflow_id)
                logger.info(f"Removed QStash schedules for inactive workflow {workflow_id}")
            except Exception as e:
                logger.warning(f"Failed to remove QStash schedules for workflow {workflow_id}: {e}")
                # Also try to unschedule from old APScheduler as fallback
                await workflow_scheduler.unschedule_workflow(workflow_id)
        
        telegram_triggers = [trigger for trigger in updated_workflow.triggers if trigger.type == 'WEBHOOK' and trigger.config.get('type') == 'telegram']
        if telegram_triggers:
            try:
                import os
                base_url = (
                    os.getenv('WEBHOOK_BASE_URL', 'http://localhost:3000')
                )
                
                await _setup_telegram_webhooks_for_workflow(updated_workflow, base_url)
                logger.info(f"Processed Telegram webhook setup for workflow {workflow_id}")
            except Exception as e:
                logger.warning(f"Failed to set up Telegram webhooks for workflow {workflow_id}: {e}")
        
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
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    
    """Convert a visual flow to a workflow definition without saving."""
    try:
        if not x_project_id:
            raise HTTPException(status_code=400, detail="Project ID is required")

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
async def validate_workflow_flow_endpoint(
    request: WorkflowValidateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    
    """Validate a workflow flow for errors."""
    try:
        valid, errors = validate_workflow_flow([node.model_dump() if hasattr(node, 'model_dump') else node.dict() for node in request.nodes], [edge.model_dump() if hasattr(edge, 'model_dump') else edge.dict() for edge in request.edges])
        return WorkflowValidateResponse(valid=valid, errors=errors)
        
    except Exception as e:
        logger.error(f"Error validating workflow flow: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workflows/builder/nodes")
async def get_builder_nodes(user_id: str = Depends(get_current_user_id_from_jwt)):
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    
    """Get available node types for the workflow builder."""
    try:
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
async def get_workflow_templates(user_id: str = Depends(get_current_user_id_from_jwt)):
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    
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
                "category": "general",
                "preview_image": None,
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
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    
    """Create a new workflow from a template."""
    try:
        if not x_project_id:
            raise HTTPException(status_code=400, detail="Project ID is required")
        
        client = await db.client
        template_result = await client.table('workflows').select('*').eq('id', template_id).eq('is_template', True).execute()
        if not template_result.data:
            raise HTTPException(status_code=404, detail="Template not found")
        
        template_data = template_result.data[0]
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
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    
    """Get information about currently scheduled workflows."""
    try:
        scheduled_workflows = await workflow_scheduler.get_scheduled_workflows()
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
async def start_scheduler(user_id: str = Depends(get_current_user_id_from_jwt)):
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    
    """Start the workflow scheduler."""
    try:
        await workflow_scheduler.start()
        return {"message": "Workflow scheduler started"}
    except Exception as e:
        logger.error(f"Error starting scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workflows/scheduler/stop")
async def stop_scheduler(user_id: str = Depends(get_current_user_id_from_jwt)):
    if not await is_enabled("workflows"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    
    """Stop the workflow scheduler."""
    try:
        await workflow_scheduler.stop()
        return {"message": "Workflow scheduler stopped"}
    except Exception as e:
        logger.error(f"Error stopping scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def _create_qstash_schedule_for_workflow(workflow: WorkflowDefinition, schedule_trigger: WorkflowTrigger):
    """Create a QStash schedule for a workflow trigger."""
    try:
        # Convert workflow schedule config to QStash format
        schedule_config = schedule_trigger.config
        
        # Create QStash schedule config
        if schedule_config.get('cron_expression'):
            # Cron-based schedule
            qstash_config = QStashScheduleConfig(
                type='cron',
                enabled=schedule_config.get('enabled', True),
                cron=CronScheduleConfig(cron_expression=schedule_config['cron_expression'])
            )
        elif schedule_config.get('interval_type') and schedule_config.get('interval_value'):
            # Interval-based schedule
            qstash_config = QStashScheduleConfig(
                type='simple',
                enabled=schedule_config.get('enabled', True),
                simple=SimpleScheduleConfig(
                    interval_type=schedule_config['interval_type'],
                    interval_value=schedule_config['interval_value']
                )
            )
        else:
            logger.error(f"Invalid schedule configuration for workflow {workflow.id}: {schedule_config}")
            return
        
        # Create schedule request
        schedule_request = ScheduleCreateRequest(
            workflow_id=workflow.id,
            name=f"Workflow: {workflow.name}",
            description=f"Auto-generated schedule for workflow {workflow.name}",
            config=qstash_config
        )
        
        # Create the schedule
        schedule = await qstash_service.create_schedule(schedule_request)
        logger.info(f"Created QStash schedule {schedule.id} for workflow {workflow.id}")
        
    except Exception as e:
        logger.error(f"Failed to create QStash schedule for workflow {workflow.id}: {e}")
        raise

async def _remove_qstash_schedules_for_workflow(workflow_id: str):
    """Remove all QStash schedules for a workflow."""
    try:
        schedules = await qstash_service.list_schedules(workflow_id)
        for schedule in schedules:
            if schedule.id:
                await qstash_service.delete_schedule(schedule.id)
                logger.info(f"Deleted QStash schedule {schedule.id} for workflow {workflow_id}")
                
    except Exception as e:
        logger.error(f"Failed to remove QStash schedules for workflow {workflow_id}: {e}")
        raise

async def _setup_telegram_webhooks_for_workflow(workflow: WorkflowDefinition, base_url: str):
    """Set up Telegram webhooks for a workflow if configured."""
    try:
        telegram_triggers = [
            trigger for trigger in workflow.triggers 
            if trigger.type == 'WEBHOOK' and trigger.config.get('type') == 'telegram'
        ]
        
        for trigger in telegram_triggers:
            telegram_config = trigger.config.get('telegram')
            if not telegram_config:
                continue
                
            bot_token = telegram_config.get('bot_token')
            secret_token = telegram_config.get('secret_token')
            
            if not bot_token:
                logger.warning(f"No bot token found for Telegram webhook in workflow {workflow.id}")
                continue
            
            webhook_url = f"{base_url}/api/webhooks/trigger/{workflow.id}"
            result = await TelegramWebhookProvider.setup_webhook(
                bot_token=bot_token,
                webhook_url=webhook_url,
                secret_token=secret_token
            )
            
            if result.get('success'):
                logger.info(f"Successfully set up Telegram webhook for workflow {workflow.id}: {result.get('message')}")
            else:
                logger.error(f"Failed to set up Telegram webhook for workflow {workflow.id}: {result.get('error')}")
                
    except Exception as e:
        logger.error(f"Error setting up Telegram webhooks for workflow {workflow.id}: {e}")