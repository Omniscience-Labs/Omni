import asyncio
import json
import traceback
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request, Body
from fastapi.responses import StreamingResponse

from utils.auth_utils import get_current_user_id_from_jwt, get_user_id_from_stream_auth, verify_thread_access
from utils.logger import logger, structlog
from services.billing import check_billing_status, can_use_model
from utils.config import config
from services import redis
from run_agent_background import run_agent_background
from models import model_manager

from ..models import AgentStartRequest, AgentVersionResponse, AgentResponse, ThreadAgentResponse
from .. import helpers
from ..helpers import (
    stop_agent_run, get_agent_run_with_access_check, 
    _get_version_service
)
from ..config_helper import extract_agent_config
from ..utils import check_agent_run_limit

router = APIRouter()

@router.post("/thread/{thread_id}/agent/start")
async def start_agent(
    thread_id: str,
    body: AgentStartRequest = Body(...),
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Start an agent for a specific thread in the background"""
    structlog.contextvars.bind_contextvars(
        thread_id=thread_id,
    )
    if not helpers.instance_id:
        raise HTTPException(status_code=500, detail="Agent API not initialized with instance ID")

    # Use model from config if not specified in the request
    model_name = body.model_name
    logger.debug(f"Original model_name from request: {model_name}")

    # Log the model name after alias resolution using new model manager
    from models import model_manager
    resolved_model = model_manager.resolve_model_id(model_name)
    logger.debug(f"Resolved model name: {resolved_model}")

    # Update model_name to use the resolved version
    model_name = resolved_model

    logger.debug(f"Starting new agent for thread: {thread_id} with config: model={model_name}, thinking={body.enable_thinking}, effort={body.reasoning_effort}, stream={body.stream}, context_manager={body.enable_context_manager} (Instance: {helpers.instance_id})")
    client = await helpers.db.client


    thread_result = await client.table('threads').select('project_id', 'account_id', 'metadata').eq('thread_id', thread_id).execute()

    if not thread_result.data:
        raise HTTPException(status_code=404, detail="Thread not found")
    thread_data = thread_result.data[0]
    project_id = thread_data.get('project_id')
    account_id = thread_data.get('account_id')
    thread_metadata = thread_data.get('metadata', {})

    if account_id != user_id:
        await verify_thread_access(client, thread_id, user_id)

    structlog.contextvars.bind_contextvars(
        project_id=project_id,
        account_id=account_id,
        thread_metadata=thread_metadata,
    )
    
    # Load agent configuration with version support
    agent_config = None
    effective_agent_id = body.agent_id  # Optional agent ID from request
    
    logger.debug(f"[AGENT LOAD] Agent loading flow:")
    logger.debug(f"  - body.agent_id: {body.agent_id}")
    logger.debug(f"  - effective_agent_id: {effective_agent_id}")

    if effective_agent_id:
        logger.debug(f"[AGENT LOAD] Querying for agent: {effective_agent_id}")
        # Get agent
        agent_result = await client.table('agents').select('*').eq('agent_id', effective_agent_id).eq('account_id', account_id).execute()
        logger.debug(f"[AGENT LOAD] Query result: found {len(agent_result.data) if agent_result.data else 0} agents")
        
        if not agent_result.data:
            if body.agent_id:
                raise HTTPException(status_code=404, detail="Agent not found or access denied")
            else:
                logger.warning(f"Stored agent_id {effective_agent_id} not found, falling back to default")
                effective_agent_id = None
        else:
            agent_data = agent_result.data[0]
            version_data = None
            if agent_data.get('current_version_id'):
                try:
                    version_service = await _get_version_service()
                    version_obj = await version_service.get_version(
                        agent_id=effective_agent_id,
                        version_id=agent_data['current_version_id'],
                        user_id=user_id
                    )
                    version_data = version_obj.to_dict()
                    logger.debug(f"[AGENT LOAD] Got version data from version manager: {version_data.get('version_name')}")
                except Exception as e:
                    logger.warning(f"[AGENT LOAD] Failed to get version data: {e}")
            
            logger.debug(f"[AGENT LOAD] About to call extract_agent_config with agent_data keys: {list(agent_data.keys())}")
            logger.debug(f"[AGENT LOAD] version_data type: {type(version_data)}, has data: {version_data is not None}")
            
            agent_config = extract_agent_config(agent_data, version_data)
            
            if version_data:
                logger.debug(f"Using agent {agent_config['name']} ({effective_agent_id}) version {agent_config.get('version_name', 'v1')}")
            else:
                logger.debug(f"Using agent {agent_config['name']} ({effective_agent_id}) - no version data")
            source = "request" if body.agent_id else "fallback"
    else:
        logger.debug(f"[AGENT LOAD] No effective_agent_id, will try default agent")

    if not agent_config:
        logger.debug(f"[AGENT LOAD] No agent config yet, querying for default agent")
        default_agent_result = await client.table('agents').select('*').eq('account_id', account_id).eq('is_default', True).execute()
        logger.debug(f"[AGENT LOAD] Default agent query result: found {len(default_agent_result.data) if default_agent_result.data else 0} default agents")
        
        if default_agent_result.data:
            agent_data = default_agent_result.data[0]
            
            # Use versioning system to get current version
            version_data = None
            if agent_data.get('current_version_id'):
                try:
                    version_service = await _get_version_service()
                    version_obj = await version_service.get_version(
                        agent_id=agent_data['agent_id'],
                        version_id=agent_data['current_version_id'],
                        user_id=user_id
                    )
                    version_data = version_obj.to_dict()
                    logger.debug(f"[AGENT LOAD] Got default agent version from version manager: {version_data.get('version_name')}")
                except Exception as e:
                    logger.warning(f"[AGENT LOAD] Failed to get default agent version data: {e}")
            
            logger.debug(f"[AGENT LOAD] About to call extract_agent_config for DEFAULT agent with version data: {version_data is not None}")
            
            agent_config = extract_agent_config(agent_data, version_data)
            
            if version_data:
                logger.debug(f"Using default agent: {agent_config['name']} ({agent_config['agent_id']}) version {agent_config.get('version_name', 'v1')}")
            else:
                logger.debug(f"Using default agent: {agent_config['name']} ({agent_config['agent_id']}) - no version data")
        else:
            logger.warning(f"[AGENT LOAD] No default agent found for account {account_id}")

    logger.debug(f"[AGENT LOAD] Final agent_config: {agent_config is not None}")
    if agent_config:
        logger.debug(f"[AGENT LOAD] Agent config keys: {list(agent_config.keys())}")
        logger.debug(f"Using agent {agent_config['agent_id']} for this agent run (thread remains agent-agnostic)")

    # Run all checks concurrently
    model_check_task = asyncio.create_task(can_use_model(client, account_id, model_name))
    billing_check_task = asyncio.create_task(check_billing_status(client, account_id))
    limit_check_task = asyncio.create_task(check_agent_run_limit(client, account_id))

    # Wait for all checks to complete
    (can_use, model_message, allowed_models), (can_run, message, subscription), limit_check = await asyncio.gather(
        model_check_task, billing_check_task, limit_check_task
    )

    # Check results and raise appropriate errors
    if not can_use:
        raise HTTPException(status_code=403, detail={"message": model_message, "allowed_models": allowed_models})

    if not can_run:
        raise HTTPException(status_code=402, detail={"message": message, "subscription": subscription})

    if not limit_check['can_start']:
        error_detail = {
            "message": f"Maximum of {config.MAX_PARALLEL_AGENT_RUNS} parallel agent runs allowed within 24 hours. You currently have {limit_check['running_count']} running.",
            "running_thread_ids": limit_check['running_thread_ids'],
            "running_count": limit_check['running_count'],
            "limit": config.MAX_PARALLEL_AGENT_RUNS
        }
        logger.warning(f"Agent run limit exceeded for account {account_id}: {limit_check['running_count']} running agents")
        raise HTTPException(status_code=429, detail=error_detail)

    effective_model = model_name
    if not model_name and agent_config and agent_config.get('model'):
        effective_model = agent_config['model']
        logger.debug(f"No model specified by user, using agent's configured model: {effective_model}")
    elif model_name:
        logger.debug(f"Using user-selected model: {effective_model}")
    else:
        logger.debug(f"Using default model: {effective_model}")
    
    agent_run = await client.table('agent_runs').insert({
        "thread_id": thread_id,
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "agent_id": agent_config.get('agent_id') if agent_config else None,
        "agent_version_id": agent_config.get('current_version_id') if agent_config else None,
        "metadata": {
            "model_name": effective_model,
            "requested_model": model_name,
            "enable_thinking": body.enable_thinking,
            "reasoning_effort": body.reasoning_effort,
            "enable_context_manager": body.enable_context_manager
        }
    }).execute()

    agent_run_id = agent_run.data[0]['id']
    structlog.contextvars.bind_contextvars(
        agent_run_id=agent_run_id,
    )
    logger.debug(f"Created new agent run: {agent_run_id}")

    instance_key = f"active_run:{helpers.instance_id}:{agent_run_id}"
    try:
        await redis.set(instance_key, "running", ex=redis.REDIS_KEY_TTL)
    except Exception as e:
        logger.warning(f"Failed to register agent run in Redis ({instance_key}): {str(e)}")

    request_id = structlog.contextvars.get_contextvars().get('request_id')

    run_agent_background.send(
        agent_run_id=agent_run_id, thread_id=thread_id, instance_id=helpers.instance_id,
        project_id=project_id,
        model_name=model_name,  # Already resolved above
        enable_thinking=body.enable_thinking, reasoning_effort=body.reasoning_effort,
        stream=body.stream, enable_context_manager=body.enable_context_manager,
        agent_config=agent_config,  # Pass agent configuration
        request_id=request_id,
    )

    return {"agent_run_id": agent_run_id, "status": "running"}

@router.post("/agent-run/{agent_run_id}/stop")
async def stop_agent(agent_run_id: str, user_id: str = Depends(get_current_user_id_from_jwt)):
    """Stop a running agent."""
    structlog.contextvars.bind_contextvars(
        agent_run_id=agent_run_id,
    )
    logger.debug(f"Received request to stop agent run: {agent_run_id}")
    client = await helpers.db.client
    await get_agent_run_with_access_check(client, agent_run_id, user_id)
    await stop_agent_run(agent_run_id)
    return {"status": "stopped"}

@router.get("/thread/{thread_id}/agent-runs")
async def get_agent_runs(thread_id: str, user_id: str = Depends(get_current_user_id_from_jwt)):
    """Get all agent runs for a thread."""
    structlog.contextvars.bind_contextvars(
        thread_id=thread_id,
    )
    logger.debug(f"Fetching agent runs for thread: {thread_id}")
    client = await helpers.db.client
    await verify_thread_access(client, thread_id, user_id)
    agent_runs = await client.table('agent_runs').select('id, thread_id, status, started_at, completed_at, error, created_at, updated_at').eq("thread_id", thread_id).order('created_at', desc=True).execute()
    logger.debug(f"Found {len(agent_runs.data)} agent runs for thread: {thread_id}")
    return {"agent_runs": agent_runs.data}

@router.get("/agent-run/{agent_run_id}")
async def get_agent_run(agent_run_id: str, user_id: str = Depends(get_current_user_id_from_jwt)):
    """Get agent run status and responses."""
    structlog.contextvars.bind_contextvars(
        agent_run_id=agent_run_id,
    )
    logger.debug(f"Fetching agent run details: {agent_run_id}")
    client = await helpers.db.client
    agent_run_data = await get_agent_run_with_access_check(client, agent_run_id, user_id)
    # Note: Responses are not included here by default, they are in the stream or DB
    return {
        "id": agent_run_data['id'],
        "threadId": agent_run_data['thread_id'],
        "status": agent_run_data['status'],
        "startedAt": agent_run_data['started_at'],
        "completedAt": agent_run_data['completed_at'],
        "error": agent_run_data['error']
    }

@router.get("/thread/{thread_id}/agent", response_model=ThreadAgentResponse)
async def get_thread_agent(thread_id: str, user_id: str = Depends(get_current_user_id_from_jwt)):
    """Get the agent details for a specific thread. Since threads are fully agent-agnostic, 
    this returns the most recently used agent from agent_runs only."""
    structlog.contextvars.bind_contextvars(
        thread_id=thread_id,
    )
    logger.debug(f"Fetching agent details for thread: {thread_id}")
    client = await helpers.db.client
    
    try:
        # Verify thread access and get thread data
        await verify_thread_access(client, thread_id, user_id)
        thread_result = await client.table('threads').select('account_id').eq('thread_id', thread_id).execute()
        
        if not thread_result.data:
            raise HTTPException(status_code=404, detail="Thread not found")
        
        thread_data = thread_result.data[0]
        account_id = thread_data.get('account_id')
        
        effective_agent_id = None
        agent_source = "none"
        
        # Get the most recently used agent from agent_runs
        recent_agent_result = await client.table('agent_runs').select('agent_id', 'agent_version_id').eq('thread_id', thread_id).not_.is_('agent_id', 'null').order('created_at', desc=True).limit(1).execute()
        if recent_agent_result.data:
            effective_agent_id = recent_agent_result.data[0]['agent_id']
            recent_version_id = recent_agent_result.data[0].get('agent_version_id')
            agent_source = "recent"
            logger.debug(f"Found most recently used agent: {effective_agent_id} (version: {recent_version_id})")
        
        # If no agent found in agent_runs
        if not effective_agent_id:
            return {
                "agent": None,
                "source": "none",
                "message": "No agent has been used in this thread yet. Threads are agent-agnostic - use /agent/start to select an agent."
            }
        
        # Fetch the agent details
        agent_result = await client.table('agents').select('*').eq('agent_id', effective_agent_id).eq('account_id', account_id).execute()
        
        if not agent_result.data:
            # Agent was deleted or doesn't exist
            return {
                "agent": None,
                "source": "missing",
                "message": f"Agent {effective_agent_id} not found or was deleted. You can select a different agent."
            }
        
        agent_data = agent_result.data[0]
        
        # Use versioning system to get current version data
        version_data = None
        current_version = None
        if agent_data.get('current_version_id'):
            try:
                version_service = await _get_version_service()
                current_version_obj = await version_service.get_version(
                    agent_id=effective_agent_id,
                    version_id=agent_data['current_version_id'],
                    user_id=user_id
                )
                current_version_data = current_version_obj.to_dict()
                version_data = current_version_data
                
                # Create AgentVersionResponse from version data
                current_version = AgentVersionResponse(
                    version_id=current_version_data['version_id'],
                    agent_id=current_version_data['agent_id'],
                    version_number=current_version_data['version_number'],
                    version_name=current_version_data['version_name'],
                    system_prompt=current_version_data['system_prompt'],
                    model=current_version_data.get('model'),
                    configured_mcps=current_version_data.get('configured_mcps', []),
                    custom_mcps=current_version_data.get('custom_mcps', []),
                    agentpress_tools=current_version_data.get('agentpress_tools', {}),
                    is_active=current_version_data.get('is_active', True),
                    created_at=current_version_data['created_at'],
                    updated_at=current_version_data.get('updated_at', current_version_data['created_at']),
                    created_by=current_version_data.get('created_by')
                )
                
                logger.debug(f"Using agent {agent_data['name']} version {current_version_data.get('version_name', 'v1')}")
            except Exception as e:
                logger.warning(f"Failed to get version data for agent {effective_agent_id}: {e}")
        
        version_data = None
        if current_version:
            version_data = {
                'version_id': current_version.version_id,
                'agent_id': current_version.agent_id,
                'version_number': current_version.version_number,
                'version_name': current_version.version_name,
                'system_prompt': current_version.system_prompt,
                'model': current_version.model,
                'configured_mcps': current_version.configured_mcps,
                'custom_mcps': current_version.custom_mcps,
                'agentpress_tools': current_version.agentpress_tools,
                'is_active': current_version.is_active,
                'created_at': current_version.created_at,
                'updated_at': current_version.updated_at,
                'created_by': current_version.created_by
            }
        
        from agent.config_helper import extract_agent_config
        agent_config = extract_agent_config(agent_data, version_data)
        
        system_prompt = agent_config['system_prompt']
        configured_mcps = agent_config['configured_mcps']
        custom_mcps = agent_config['custom_mcps']
        agentpress_tools = agent_config['agentpress_tools']
        
        return {
            "agent": AgentResponse(
                agent_id=agent_data['agent_id'],
                name=agent_data['name'],
                description=agent_data.get('description'),
                system_prompt=system_prompt,
                configured_mcps=configured_mcps,
                custom_mcps=custom_mcps,
                agentpress_tools=agentpress_tools,
                is_default=agent_data.get('is_default', False),
                is_public=agent_data.get('is_public', False),
                tags=agent_data.get('tags', []),
                avatar=agent_config.get('avatar'),
                avatar_color=agent_config.get('avatar_color'),
                profile_image_url=agent_config.get('profile_image_url'),
                created_at=agent_data['created_at'],
                updated_at=agent_data.get('updated_at', agent_data['created_at']),
                current_version_id=agent_data.get('current_version_id'),
                version_count=agent_data.get('version_count', 1),
                current_version=current_version,
                metadata=agent_data.get('metadata')
            ),
            "source": agent_source,
            "message": f"Using {agent_source} agent: {agent_data['name']}. Threads are agent-agnostic - you can change agents anytime."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching agent for thread {thread_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch thread agent: {str(e)}")

@router.get("/agent-run/{agent_run_id}/stream")
async def stream_agent_run(
    agent_run_id: str,
    token: Optional[str] = None,
    request: Request = None
):
    """Stream the responses of an agent run using Redis Lists and Pub/Sub."""
    logger.debug(f"Starting stream for agent run: {agent_run_id}")
    client = await helpers.db.client

    user_id = await get_user_id_from_stream_auth(request, token) # practically instant
    agent_run_data = await get_agent_run_with_access_check(client, agent_run_id, user_id) # 1 db query

    structlog.contextvars.bind_contextvars(
        agent_run_id=agent_run_id,
        user_id=user_id,
    )

    response_list_key = f"agent_run:{agent_run_id}:responses"
    response_channel = f"agent_run:{agent_run_id}:new_response"
    control_channel = f"agent_run:{agent_run_id}:control" # Global control channel

    async def stream_generator(agent_run_data):
        logger.debug(f"Streaming responses for {agent_run_id} using Redis list {response_list_key} and channel {response_channel}")
        last_processed_index = -1
        # Single pubsub used for response + control
        listener_task = None
        terminate_stream = False
        initial_yield_complete = False

        try:
            # 1. Fetch and yield initial responses from Redis list
            initial_responses_json = await redis.lrange(response_list_key, 0, -1)
            initial_responses = []
            if initial_responses_json:
                initial_responses = [json.loads(r) for r in initial_responses_json]
                logger.debug(f"Sending {len(initial_responses)} initial responses for {agent_run_id}")
                for response in initial_responses:
                    yield f"data: {json.dumps(response)}\n\n"
                last_processed_index = len(initial_responses) - 1
            initial_yield_complete = True

            # 2. Check run status
            current_status = agent_run_data.get('status') if agent_run_data else None

            if current_status != 'running':
                logger.debug(f"Agent run {agent_run_id} is not running (status: {current_status}). Ending stream.")
                yield f"data: {json.dumps({'type': 'status', 'status': 'completed'})}\n\n"
                return
          
            structlog.contextvars.bind_contextvars(
                thread_id=agent_run_data.get('thread_id'),
            )

            # 3. Use a single Pub/Sub connection subscribed to both channels
            pubsub = await redis.create_pubsub()
            await pubsub.subscribe(response_channel, control_channel)
            logger.debug(f"Subscribed to channels: {response_channel}, {control_channel}")

            # Queue to communicate between listeners and the main generator loop
            message_queue = asyncio.Queue()

            async def listen_messages():
                listener = pubsub.listen()
                task = asyncio.create_task(listener.__anext__())

                while not terminate_stream:
                    done, _ = await asyncio.wait([task], return_when=asyncio.FIRST_COMPLETED)
                    for finished in done:
                        try:
                            message = finished.result()
                            if message and isinstance(message, dict) and message.get("type") == "message":
                                channel = message.get("channel")
                                data = message.get("data")
                                if isinstance(data, bytes):
                                    data = data.decode('utf-8')

                                if channel == response_channel and data == "new":
                                    await message_queue.put({"type": "new_response"})
                                elif channel == control_channel and data in ["STOP", "END_STREAM", "ERROR"]:
                                    logger.debug(f"Received control signal '{data}' for {agent_run_id}")
                                    await message_queue.put({"type": "control", "data": data})
                                    return  # Stop listening on control signal

                        except StopAsyncIteration:
                            logger.warning(f"Listener stopped for {agent_run_id}.")
                            await message_queue.put({"type": "error", "data": "Listener stopped unexpectedly"})
                            return
                        except Exception as e:
                            logger.error(f"Error in listener for {agent_run_id}: {e}")
                            await message_queue.put({"type": "error", "data": "Listener failed"})
                            return
                        finally:
                            # Resubscribe to the next message if continuing
                            if not terminate_stream:
                                task = asyncio.create_task(listener.__anext__())


            listener_task = asyncio.create_task(listen_messages())

            # 4. Main loop to process messages from the queue
            while not terminate_stream:
                try:
                    queue_item = await message_queue.get()

                    if queue_item["type"] == "new_response":
                        # Fetch new responses from Redis list starting after the last processed index
                        new_start_index = last_processed_index + 1
                        new_responses_json = await redis.lrange(response_list_key, new_start_index, -1)

                        if new_responses_json:
                            new_responses = [json.loads(r) for r in new_responses_json]
                            num_new = len(new_responses)
                            # logger.debug(f"Received {num_new} new responses for {agent_run_id} (index {new_start_index} onwards)")
                            for response in new_responses:
                                yield f"data: {json.dumps(response)}\n\n"
                                # Check if this response signals completion
                                if response.get('type') == 'status' and response.get('status') in ['completed', 'failed', 'stopped']:
                                    logger.debug(f"Detected run completion via status message in stream: {response.get('status')}")
                                    terminate_stream = True
                                    break # Stop processing further new responses
                            last_processed_index += num_new
                        if terminate_stream: break

                    elif queue_item["type"] == "control":
                        control_signal = queue_item["data"]
                        terminate_stream = True # Stop the stream on any control signal
                        yield f"data: {json.dumps({'type': 'status', 'status': control_signal})}\n\n"
                        break

                    elif queue_item["type"] == "error":
                        logger.error(f"Listener error for {agent_run_id}: {queue_item['data']}")
                        terminate_stream = True
                        yield f"data: {json.dumps({'type': 'status', 'status': 'error'})}\n\n"
                        break

                except asyncio.CancelledError:
                     logger.debug(f"Stream generator main loop cancelled for {agent_run_id}")
                     terminate_stream = True
                     break
                except Exception as loop_err:
                    logger.error(f"Error in stream generator main loop for {agent_run_id}: {loop_err}", exc_info=True)
                    terminate_stream = True
                    yield f"data: {json.dumps({'type': 'status', 'status': 'error', 'message': f'Stream failed: {loop_err}'})}\n\n"
                    break

        except Exception as e:
            logger.error(f"Error setting up stream for agent run {agent_run_id}: {e}", exc_info=True)
            # Only yield error if initial yield didn't happen
            if not initial_yield_complete:
                 yield f"data: {json.dumps({'type': 'status', 'status': 'error', 'message': f'Failed to start stream: {e}'})}\n\n"
        finally:
            terminate_stream = True
            # Graceful shutdown order: unsubscribe → close → cancel
            try:
                if 'pubsub' in locals() and pubsub:
                    await pubsub.unsubscribe(response_channel, control_channel)
                    await pubsub.close()
            except Exception as e:
                logger.debug(f"Error during pubsub cleanup for {agent_run_id}: {e}")

            if listener_task:
                listener_task.cancel()
                try:
                    await listener_task  # Reap inner tasks & swallow their errors
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.debug(f"listener_task ended with: {e}")
            # Wait briefly for tasks to cancel
            await asyncio.sleep(0.1)
            logger.debug(f"Streaming cleanup complete for agent run: {agent_run_id}")

    return StreamingResponse(stream_generator(agent_run_data), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive",
        "X-Accel-Buffering": "no", "Content-Type": "text/event-stream",
        "Access-Control-Allow-Origin": "*"
    })