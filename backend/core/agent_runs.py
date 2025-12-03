import asyncio
import json
import traceback
import uuid
import os
from datetime import datetime, timezone
from typing import Optional, List, Tuple, Dict
from fastapi import APIRouter, HTTPException, Depends, Request, Body, File, UploadFile, Form
from fastapi.responses import StreamingResponse

from core.utils.auth_utils import verify_and_get_user_id_from_jwt, get_user_id_from_stream_auth, verify_and_authorize_thread_access
from core.utils.logger import logger, structlog
# Billing checks now handled by billing_integration.check_model_and_billing_access
from core.billing.billing_integration import billing_integration
from core.utils.config import config, EnvMode
from core.services import redis
import redis.exceptions as redis_exceptions
from core.sandbox.sandbox import create_sandbox, delete_sandbox
from run_agent_background import run_agent_background
from core.ai_models import model_manager

from .api_models import AgentStartRequest, AgentVersionResponse, AgentResponse, ThreadAgentResponse, InitiateAgentResponse
from . import core_utils as utils
from .core_utils import (
    stop_agent_run_with_helpers as stop_agent_run, get_agent_run_with_access_check, 
    _get_version_service, generate_and_update_project_name
)
from .config_helper import extract_agent_config
from .core_utils import check_agent_run_limit, check_project_count_limit
from core.utils.agent_default_files import AgentDefaultFilesManager

router = APIRouter()

async def check_billing_status(client, user_id: str) -> Tuple[bool, str, Optional[Dict]]:
    """
    Compatibility wrapper for the new credit-based billing system.
    Converts new credit system response to match old billing status format.
    """
    can_run, message, reservation_id = await billing_integration.check_and_reserve_credits(user_id)
    
    # Create a subscription-like object for backward compatibility
    subscription_info = {
        "price_id": "credit_based",
        "plan_name": "Credit System",
        "minutes_limit": "credit based"
    }
    
    return can_run, message, subscription_info


@router.post("/thread/{thread_id}/agent/start")
async def start_agent(
    thread_id: str,
    body: AgentStartRequest = Body(...),
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Start an agent for a specific thread in the background"""
    structlog.contextvars.bind_contextvars(
        thread_id=thread_id,
    )
    if not utils.instance_id:
        raise HTTPException(status_code=500, detail="Agent API not initialized with instance ID")

    # Use model from config if not specified in the request
    model_name = body.model_name
    logger.info(f"🟢 [StartAgent] Received model_name from frontend: {model_name}")

    # Log the model name after alias resolution using new model manager
    from core.ai_models import model_manager
    resolved_model = model_manager.resolve_model_id(model_name)
    logger.info(f"🟢 [StartAgent] Resolved model name: {resolved_model}")

    # Update model_name to use the resolved version
    model_name = resolved_model

    logger.info(f"🟢 [StartAgent] Starting agent with final model: {model_name}")
    client = await utils.db.client


    thread_result = await client.table('threads').select('project_id', 'account_id', 'metadata').eq('thread_id', thread_id).execute()

    if not thread_result.data:
        raise HTTPException(status_code=404, detail="Thread not found")
    thread_data = thread_result.data[0]
    project_id = thread_data.get('project_id')
    account_id = thread_data.get('account_id')
    thread_metadata = thread_data.get('metadata', {})

    if account_id != user_id:
        await verify_and_authorize_thread_access(client, thread_id, user_id)

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
            
            agent_config = extract_agent_config(agent_data, version_data)
            
            if version_data:
                logger.info(f"Using agent {agent_config['name']} ({effective_agent_id}) version {agent_config.get('version_name', 'v1')}")
            else:
                logger.info(f"Using agent {agent_config['name']} ({effective_agent_id}) - no version data")
            source = "request" if body.agent_id else "fallback"
    
    if not agent_config:
        default_agent_result = await client.table('agents').select('*').eq('account_id', account_id).eq('is_default', True).execute()
        
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
                except Exception as e:
                    logger.warning(f"[AGENT LOAD] Failed to get default agent version data: {e}")
            
            agent_config = extract_agent_config(agent_data, version_data)
            
            if version_data:
                logger.info(f"Using default agent: {agent_config['name']} ({agent_config['agent_id']}) version {agent_config.get('version_name', 'v1')}")
            else:
                logger.info(f"Using default agent: {agent_config['name']} ({agent_config['agent_id']}) - no version data")
        else:
            logger.warning(f"[AGENT LOAD] No default agent found for account {account_id}")

    if agent_config:
        logger.debug(f"Using agent {agent_config['agent_id']} for this agent run (thread remains agent-agnostic)")

    # Unified billing and model access check
    can_proceed, error_message, context = await billing_integration.check_model_and_billing_access(
        account_id, model_name, client
    )
    
    if not can_proceed:
        if context.get("error_type") == "model_access_denied":
            raise HTTPException(status_code=403, detail={
                "message": error_message, 
                "allowed_models": context.get("allowed_models", [])
            })
        elif context.get("error_type") == "insufficient_credits":
            raise HTTPException(status_code=402, detail={
                "message": error_message,
                "is_enterprise": context.get("enterprise_mode", False)
            })
        else:
            raise HTTPException(status_code=500, detail={"message": error_message})
    
    # Check agent run limits (only if not in local mode)
    if config.ENV_MODE != EnvMode.LOCAL:
        limit_check = await check_agent_run_limit(client, account_id)
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

    instance_key = f"active_run:{utils.instance_id}:{agent_run_id}"
    try:
        await redis.set(instance_key, "running", ex=redis.REDIS_KEY_TTL)
    except Exception as e:
        logger.warning(f"Failed to register agent run in Redis ({instance_key}): {str(e)}")

    request_id = structlog.contextvars.get_contextvars().get('request_id')

    run_agent_background.send(
        agent_run_id=agent_run_id, thread_id=thread_id, instance_id=utils.instance_id,
        project_id=project_id,
        model_name=model_name,  # Already resolved above
        enable_thinking=body.enable_thinking, reasoning_effort=body.reasoning_effort,
        stream=body.stream, enable_context_manager=body.enable_context_manager,
        enable_prompt_caching=body.enable_prompt_caching,
        agent_config=agent_config,  # Pass agent configuration
        request_id=request_id,
    )

    return {"agent_run_id": agent_run_id, "status": "running"}

@router.post("/agent-run/{agent_run_id}/stop")
async def stop_agent(agent_run_id: str, user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    """Stop a running agent."""
    structlog.contextvars.bind_contextvars(
        agent_run_id=agent_run_id,
    )
    logger.debug(f"Received request to stop agent run: {agent_run_id}")
    client = await utils.db.client
    await get_agent_run_with_access_check(client, agent_run_id, user_id)
    await stop_agent_run(agent_run_id)
    return {"status": "stopped"}

@router.get("/thread/{thread_id}/agent-runs")
async def get_agent_runs(thread_id: str, user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    """Get all agent runs for a thread."""
    structlog.contextvars.bind_contextvars(
        thread_id=thread_id,
    )
    logger.debug(f"Fetching agent runs for thread: {thread_id}")
    client = await utils.db.client
    await verify_and_authorize_thread_access(client, thread_id, user_id)
    agent_runs = await client.table('agent_runs').select('id, thread_id, status, started_at, completed_at, error, created_at, updated_at').eq("thread_id", thread_id).order('created_at', desc=True).execute()
    logger.debug(f"Found {len(agent_runs.data)} agent runs for thread: {thread_id}")
    return {"agent_runs": agent_runs.data}

@router.get("/agent-run/{agent_run_id}")
async def get_agent_run(agent_run_id: str, user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    """Get agent run status and responses."""
    structlog.contextvars.bind_contextvars(
        agent_run_id=agent_run_id,
    )
    logger.debug(f"Fetching agent run details: {agent_run_id}")
    client = await utils.db.client
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
async def get_thread_agent(thread_id: str, user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    """Get the agent details for a specific thread. Since threads are fully agent-agnostic, 
    this returns the most recently used agent from agent_runs only."""
    structlog.contextvars.bind_contextvars(
        thread_id=thread_id,
    )
    logger.debug(f"Fetching agent details for thread: {thread_id}")
    client = await utils.db.client
    
    try:
        # Verify thread access and get thread data
        await verify_and_authorize_thread_access(client, thread_id, user_id)
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
        
        from .config_helper import extract_agent_config
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
    client = await utils.db.client

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
        last_processed_index = -1
        listener_task = None  # Initialize before try block to avoid UnboundLocalError
        terminate_stream = False
        initial_yield_complete = False
        has_yielded_final_status = False  # Prevent duplicate final status messages

        try:
            # 1. Fetch and yield initial responses from Redis list
            initial_responses_json = await redis.lrange(response_list_key, 0, -1)
            initial_responses = []
            if initial_responses_json:
                initial_responses = [json.loads(r) for r in initial_responses_json]
                for response in initial_responses:
                    yield f"data: {json.dumps(response)}\n\n"
                last_processed_index = len(initial_responses) - 1
            initial_yield_complete = True

            # 2. Check run status
            current_status = agent_run_data.get('status') if agent_run_data else None

            if current_status != 'running':
                yield f"data: {json.dumps({'type': 'status', 'status': 'completed'})}\n\n"
                return
          
            structlog.contextvars.bind_contextvars(
                thread_id=agent_run_data.get('thread_id'),
            )

            # 3. Use a single Pub/Sub connection subscribed to both channels
            pubsub = await redis.create_pubsub()
            await pubsub.subscribe(response_channel, control_channel)

            # Queue to communicate between listeners and the main generator loop
            message_queue = asyncio.Queue()

            async def listen_messages():
                """Listen to Redis pub/sub with automatic reconnection on errors."""
                retry_count = 0
                max_retries = 10
                base_delay = 0.1  # 100ms base delay
                
                while not terminate_stream and retry_count < max_retries:
                    try:
                        # (Re)create pubsub and subscribe
                        local_pubsub = await redis.create_pubsub()
                        await local_pubsub.subscribe(response_channel, control_channel)
                        listener = local_pubsub.listen()
                        
                        # Reset retry count on successful connection
                        if retry_count > 0:
                            logger.info(f"Redis reconnected successfully for {agent_run_id} after {retry_count} attempts")
                            retry_count = 0
                        
                        while not terminate_stream:
                            try:
                                message = await asyncio.wait_for(listener.__anext__(), timeout=30.0)
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

                            except asyncio.TimeoutError:
                                # Timeout waiting for message, continue listening
                                continue
                            except StopAsyncIteration:
                                logger.warning(f"Listener stopped for {agent_run_id}.")
                                # Don't return immediately, try to reconnect
                                break  # Break inner loop to trigger reconnection
                            except (ConnectionError, redis_exceptions.ConnectionError, redis_exceptions.TimeoutError) as e:
                                logger.warning(f"Redis connection error in listener for {agent_run_id}: {e}, will retry")
                                # Break inner loop to trigger reconnection
                                break
                            except Exception as e:
                                logger.error(f"Unexpected error in listener for {agent_run_id}: {e}")
                                # Break inner loop to trigger reconnection
                                break
                        
                        # Clean up the local pubsub connection before retry
                        try:
                            await local_pubsub.unsubscribe()
                            await local_pubsub.aclose()
                        except Exception:
                            pass
                        
                    except Exception as e:
                        logger.error(f"Failed to initialize listener for {agent_run_id}: {e}")
                    
                    # If we're here, we need to retry
                    if not terminate_stream:
                        retry_count += 1
                        if retry_count >= max_retries:
                            logger.error(f"Max Redis reconnection attempts ({max_retries}) reached for {agent_run_id}")
                            await message_queue.put({"type": "error", "data": "Redis connection lost - max retries exceeded"})
                            return
                        
                        # Exponential backoff with jitter
                        delay = min(base_delay * (2 ** retry_count), 5.0)  # Max 5 seconds
                        logger.info(f"Retrying Redis connection for {agent_run_id} in {delay:.2f}s (attempt {retry_count}/{max_retries})")
                        await asyncio.sleep(delay)


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
                            
                            for response in new_responses:
                                response_type = response.get('type')
                                
                                # ✅ Check for Claude tool_use blocks in content BEFORE checking completion
                                # This prevents premature completion when tool calls are present
                                from core.utils.json_helpers import parse_claude_tool_calls
                                
                                # Check if this response contains content with tool_use blocks
                                model_content = None
                                if 'content' in response:
                                    # Content might be a JSON string or already parsed
                                    content_data = response.get('content')
                                    if isinstance(content_data, str):
                                        try:
                                            content_data = json.loads(content_data)
                                        except (json.JSONDecodeError, TypeError):
                                            pass
                                    
                                    # Extract content from nested structure if needed
                                    if isinstance(content_data, dict):
                                        model_content = content_data.get('content') or content_data
                                    else:
                                        model_content = content_data
                                
                                # Parse tool calls from content (handles Claude 3.5/4.5 format)
                                tool_calls = []
                                if model_content:
                                    tool_calls = parse_claude_tool_calls(model_content)
                                
                                # If tool calls are detected, mark run as executing_tools and yield tool_calls
                                if tool_calls:
                                    logger.info(f"🔧 [STREAM] Detected {len(tool_calls)} tool_use block(s) in content - marking as executing_tools")
                                    
                                    # Update agent run status to executing_tools
                                    try:
                                        await client.table('agent_runs').update({
                                            'status': 'executing_tools'
                                        }).eq('id', agent_run_id).execute()
                                        logger.info(f"✅ Updated agent run {agent_run_id} status to 'executing_tools'")
                                    except Exception as e:
                                        logger.error(f"Failed to update agent run status: {e}")
                                    
                                    # Yield tool_calls payload
                                    tool_calls_response = {
                                        "type": "tool_calls",
                                        "tool_calls": tool_calls,
                                        "status": "executing_tools"
                                    }
                                    yield f"data: {json.dumps(tool_calls_response)}\n\n"
                                    
                                    # Do NOT mark completed - continue to allow tool execution
                                    continue
                                
                                # Log important status updates
                                if response_type == 'status':
                                    status_val = response.get('status')
                                    status_type = response.get('status_type')
                                    
                                    # Check if this status indicates tool calls are present
                                    # Don't terminate if tool calls exist - auto-continue will handle execution
                                    has_tool_calls = (
                                        status_val == 'executing_tools' or 
                                        status_type == 'executing_tools' or
                                        response.get('content', {}).get('tool_calls') is not None
                                    )
                                    
                                    if status_val in ['executing_tools', 'completed', 'failed', 'stopped', 'finish']:
                                        logger.info(f"📊 [STREAM] Status update for {agent_run_id}: {status_val or status_type}")
                                    
                                    # Only terminate on final statuses, NOT when tool calls are present
                                    if status_val in ['completed', 'failed', 'stopped', 'finish']:
                                        # Check finish_reason - don't terminate if tool_calls
                                        finish_reason = response.get('finish_reason')
                                        if finish_reason == 'tool_calls':
                                            logger.info(f"🔄 [STREAM] finish_reason='tool_calls' - NOT terminating, auto-continue will handle")
                                            # Don't set terminate_stream - let auto-continue handle it
                                        elif not has_tool_calls:
                                            # Only terminate if no tool calls present
                                            has_yielded_final_status = True
                                            terminate_stream = True
                                        else:
                                            logger.info(f"🔄 [STREAM] Tool calls detected - NOT terminating stream")
                                
                                # Log tool results
                                elif response_type == 'tool_result':
                                    tool_name = response.get('tool_call', {}).get('function', {}).get('name', 'unknown')
                                    logger.info(f"🔧 [STREAM] Tool result for {agent_run_id}: {tool_name}")
                                
                                yield f"data: {json.dumps(response)}\n\n"
                                
                                if terminate_stream:
                                    break
                            
                            last_processed_index += num_new
                        if terminate_stream: break

                    elif queue_item["type"] == "control":
                        control_signal = queue_item["data"]
                        terminate_stream = True
                        
                        # Map control signals to proper status values
                        # END_STREAM → completed (successful completion)
                        # ERROR → failed (actual error)
                        # STOP → stopped (user-initiated stop)
                        if control_signal == "END_STREAM":
                            final_status = "completed"
                        elif control_signal == "ERROR":
                            final_status = "failed"
                        elif control_signal == "STOP":
                            final_status = "stopped"
                        else:
                            final_status = "completed"  # Default fallback
                        
                        logger.info(f"🏁 [STREAM] Control signal '{control_signal}' → final status '{final_status}' for {agent_run_id}")
                        
                        # Only yield final status if we haven't already
                        if not has_yielded_final_status:
                            yield f"data: {json.dumps({'type': 'status', 'status': final_status})}\n\n"
                            has_yielded_final_status = True
                        break

                    elif queue_item["type"] == "error":
                        logger.error(f"❌ [STREAM] Listener error for {agent_run_id}: {queue_item['data']}")
                        terminate_stream = True
                        if not has_yielded_final_status:
                            yield f"data: {json.dumps({'type': 'status', 'status': 'failed', 'message': 'Stream connection lost'})}\n\n"
                            has_yielded_final_status = True
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
                    await pubsub.aclose()
            except Exception as e:
                logger.debug(f"Error during pubsub cleanup for {agent_run_id}: {e}")

            if listener_task:
                listener_task.cancel()
                try:
                    # Give the task a chance to clean up gracefully
                    await asyncio.wait_for(listener_task, timeout=2.0)
                except asyncio.CancelledError:
                    logger.debug(f"Listener task cancelled successfully for {agent_run_id}")
                except asyncio.TimeoutError:
                    logger.warning(f"Listener task did not cancel within timeout for {agent_run_id}")
                except Exception as e:
                    logger.debug(f"listener_task ended with: {e}")
            # Wait briefly for any remaining cleanup
            await asyncio.sleep(0.1)
            logger.debug(f"Streaming cleanup complete for agent run: {agent_run_id}")

    return StreamingResponse(stream_generator(agent_run_data), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive",
        "X-Accel-Buffering": "no", "Content-Type": "text/event-stream",
        "Access-Control-Allow-Origin": "*"
    })



@router.post("/agent/initiate", response_model=InitiateAgentResponse)
async def initiate_agent_with_files(
    prompt: str = Form(...),
    model_name: Optional[str] = Form(None),  # Default to None to use default model
    enable_thinking: Optional[bool] = Form(False),
    reasoning_effort: Optional[str] = Form("low"),
    stream: Optional[bool] = Form(True),
    enable_context_manager: Optional[bool] = Form(False),
    enable_prompt_caching: Optional[bool] = Form(False),
    agent_id: Optional[str] = Form(None),  # Add agent_id parameter
    files: List[UploadFile] = File(default=[]),
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    Initiate a new agent session with optional file attachments.

    [WARNING] Keep in sync with create thread endpoint.
    """
    if not utils.instance_id:
        raise HTTPException(status_code=500, detail="Agent API not initialized with instance ID")

    # Use model from config if not specified in the request
    logger.debug(f"Original model_name from request: {model_name}")

    if model_name is None:
        model_name = "Claude Sonnet 4"
        logger.debug(f"Using default model: {model_name}")

    from core.ai_models import model_manager
    # Log the model name after alias resolution using new model manager
    resolved_model = model_manager.resolve_model_id(model_name)
    logger.debug(f"Resolved model name: {resolved_model}")

    # Update model_name to use the resolved version
    model_name = resolved_model

    logger.debug(f"Initiating new agent with prompt and {len(files)} files (Instance: {utils.instance_id}), model: {model_name}, enable_thinking: {enable_thinking}")
    client = await utils.db.client
    account_id = user_id # In Basejump, personal account_id is the same as user_id
    
    # Load agent configuration with version support (same as start_agent endpoint)
    agent_config = None
    
    logger.debug(f"[AGENT INITIATE] Agent loading flow:")
    logger.debug(f"  - agent_id param: {agent_id}")
    
    if agent_id:
        logger.debug(f"[AGENT INITIATE] Querying for specific agent: {agent_id}")
        # Get agent
        agent_result = await client.table('agents').select('*').eq('agent_id', agent_id).eq('account_id', account_id).execute()
        logger.debug(f"[AGENT INITIATE] Query result: found {len(agent_result.data) if agent_result.data else 0} agents")
        
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found or access denied")
        
        agent_data = agent_result.data[0]
        
        # Use versioning system to get current version
        version_data = None
        if agent_data.get('current_version_id'):
            try:
                version_service = await _get_version_service()
                version_obj = await version_service.get_version(
                    agent_id=agent_id,
                    version_id=agent_data['current_version_id'],
                    user_id=user_id
                )
                version_data = version_obj.to_dict()
                logger.debug(f"[AGENT INITIATE] Got version data from version manager: {version_data.get('version_name')}")
                logger.debug(f"[AGENT INITIATE] Version data: {version_data}")
            except Exception as e:
                logger.warning(f"[AGENT INITIATE] Failed to get version data: {e}")
        
        agent_config = extract_agent_config(agent_data, version_data)
        
        if version_data:
            logger.info(f"Using custom agent: {agent_config['name']} ({agent_id}) version {agent_config.get('version_name', 'v1')}")
        else:
            logger.info(f"Using custom agent: {agent_config['name']} ({agent_id}) - no version data")
    else:
        # Try to get default agent for the account
        default_agent_result = await client.table('agents').select('*').eq('account_id', account_id).eq('is_default', True).execute()
        
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
                except Exception as e:
                    logger.warning(f"[AGENT INITIATE] Failed to get default agent version data: {e}")
            
            agent_config = extract_agent_config(agent_data, version_data)
            
            if version_data:
                logger.info(f"Using default agent: {agent_config['name']} ({agent_config['agent_id']}) version {agent_config.get('version_name', 'v1')}")
            else:
                logger.info(f"Using default agent: {agent_config['name']} ({agent_config['agent_id']}) - no version data")
        else:
            logger.warning(f"[AGENT INITIATE] No default agent found for account {account_id}")
    
    # Unified billing and model access check
    can_proceed, error_message, context = await billing_integration.check_model_and_billing_access(
        account_id, model_name, client
    )
    
    if not can_proceed:
        if context.get("error_type") == "model_access_denied":
            raise HTTPException(status_code=403, detail={
                "message": error_message, 
                "allowed_models": context.get("allowed_models", [])
            })
        elif context.get("error_type") == "insufficient_credits":
            raise HTTPException(status_code=402, detail={
                "message": error_message,
                "is_enterprise": context.get("enterprise_mode", False)
            })
        else:
            raise HTTPException(status_code=500, detail={"message": error_message})
    
    # Check additional limits (only if not in local mode)
    if config.ENV_MODE != EnvMode.LOCAL:
        # Check agent run limit and project limit concurrently
        limit_check_task = asyncio.create_task(check_agent_run_limit(client, account_id))
        project_limit_check_task = asyncio.create_task(check_project_count_limit(client, account_id))
        
        limit_check, project_limit_check = await asyncio.gather(
            limit_check_task, project_limit_check_task
        )
        
        # Check agent run limit (maximum parallel runs in past 24 hours)
        if not limit_check['can_start']:
            error_detail = {
                "message": f"Maximum of {config.MAX_PARALLEL_AGENT_RUNS} parallel agent runs allowed within 24 hours. You currently have {limit_check['running_count']} running.",
                "running_thread_ids": limit_check['running_thread_ids'],
                "running_count": limit_check['running_count'],
                "limit": config.MAX_PARALLEL_AGENT_RUNS
            }
            logger.warning(f"Agent run limit exceeded for account {account_id}: {limit_check['running_count']} running agents")
            raise HTTPException(status_code=429, detail=error_detail)

        if not project_limit_check['can_create']:
            error_detail = {
                "message": f"Maximum of {project_limit_check['limit']} projects allowed for your current plan. You have {project_limit_check['current_count']} projects.",
                "current_count": project_limit_check['current_count'],
                "limit": project_limit_check['limit'],
                "tier_name": project_limit_check['tier_name'],
                "error_code": "PROJECT_LIMIT_EXCEEDED"
            }
            logger.warning(f"Project limit exceeded for account {account_id}: {project_limit_check['current_count']}/{project_limit_check['limit']} projects")
            raise HTTPException(status_code=402, detail=error_detail)

    try:
        # 1. Create Project
        placeholder_name = f"{prompt[:30]}..." if len(prompt) > 30 else prompt
        project = await client.table('projects').insert({
            "project_id": str(uuid.uuid4()), "account_id": account_id, "name": placeholder_name,
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()
        project_id = project.data[0]['project_id']
        logger.info(f"Created new project: {project_id}")

        # 2. Create Sandbox (lazy): only create now if files were uploaded and need the
        # sandbox immediately. Otherwise leave sandbox creation to `_ensure_sandbox()`
        # which will create it lazily when tools require it.
        sandbox_id = None
        sandbox = None
        sandbox_pass = None
        vnc_url = None
        website_url = None
        token = None
        
        # Check if agent has default files that need to be downloaded
        has_default_files = False
        if agent_config:
            files_manager = AgentDefaultFilesManager()
            default_files = await files_manager.list_files(agent_config['agent_id'])
            has_default_files = len(default_files) > 0
            if has_default_files:
                logger.debug(f"Agent has {len(default_files)} default files to download")

        # Create sandbox if we have files to upload or default files to download
        if files or has_default_files:
            # 3. Create Sandbox (lazy): only create now if files were uploaded and need the
            try:
                sandbox_pass = str(uuid.uuid4())
                sandbox = await create_sandbox(sandbox_pass, project_id)
                sandbox_id = sandbox.id
                logger.info(f"Created new sandbox {sandbox_id} for project {project_id}")

                # Get preview links
                vnc_link = await sandbox.get_preview_link(6080)
                website_link = await sandbox.get_preview_link(8080)
                vnc_url = vnc_link.url if hasattr(vnc_link, 'url') else str(vnc_link).split("url='")[1].split("'")[0]
                website_url = website_link.url if hasattr(website_link, 'url') else str(website_link).split("url='")[1].split("'")[0]
                token = None
                if hasattr(vnc_link, 'token'):
                    token = vnc_link.token
                elif "token='" in str(vnc_link):
                    token = str(vnc_link).split("token='")[1].split("'")[0]

                # Update project with sandbox info
                update_result = await client.table('projects').update({
                    'sandbox': {
                        'id': sandbox_id, 'pass': sandbox_pass, 'vnc_preview': vnc_url,
                        'sandbox_url': website_url, 'token': token
                    }
                }).eq('project_id', project_id).execute()

                if not update_result.data:
                    logger.error(f"Failed to update project {project_id} with new sandbox {sandbox_id}")
                    if sandbox_id:
                        try: await delete_sandbox(sandbox_id)
                        except Exception as e: logger.error(f"Error deleting sandbox: {str(e)}")
                    raise Exception("Database update failed")
            except Exception as e:
                logger.error(f"Error creating sandbox: {str(e)}")
                await client.table('projects').delete().eq('project_id', project_id).execute()
                if sandbox_id:
                    try: await delete_sandbox(sandbox_id)
                    except Exception:
                        pass
                raise Exception("Failed to create sandbox")

        # 3. Create Thread
        thread_data = {
            "thread_id": str(uuid.uuid4()), 
            "project_id": project_id, 
            "account_id": account_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }

        structlog.contextvars.bind_contextvars(
            thread_id=thread_data["thread_id"],
            project_id=project_id,
            account_id=account_id,
        )
        
        # Don't store agent_id in thread since threads are now agent-agnostic
        # The agent selection will be handled per message/agent run
        if agent_config:
            logger.debug(f"Using agent {agent_config['agent_id']} for this conversation (thread remains agent-agnostic)")
            structlog.contextvars.bind_contextvars(
                agent_id=agent_config['agent_id'],
            )
        
        thread = await client.table('threads').insert(thread_data).execute()
        thread_id = thread.data[0]['thread_id']
        logger.debug(f"Created new thread: {thread_id}")

        # Trigger Background Naming Task
        asyncio.create_task(generate_and_update_project_name(project_id=project_id, prompt=prompt))

        # 4. Upload Files to Sandbox (if any)
        message_content = prompt
        if files:
            successful_uploads = []
            failed_uploads = []
            for file in files:
                if file.filename:
                    try:
                        safe_filename = file.filename.replace('/', '_').replace('\\', '_')
                        target_path = f"/workspace/{safe_filename}"
                        logger.debug(f"Attempting to upload {safe_filename} to {target_path} in sandbox {sandbox_id}")
                        content = await file.read()
                        upload_successful = False
                        try:
                            if hasattr(sandbox, 'fs') and hasattr(sandbox.fs, 'upload_file'):
                                await sandbox.fs.upload_file(content, target_path)
                                logger.debug(f"Called sandbox.fs.upload_file for {target_path}")
                                upload_successful = True
                            else:
                                raise NotImplementedError("Suitable upload method not found on sandbox object.")
                        except Exception as upload_error:
                            logger.error(f"Error during sandbox upload call for {safe_filename}: {str(upload_error)}", exc_info=True)

                        if upload_successful:
                            try:
                                await asyncio.sleep(0.2)
                                parent_dir = os.path.dirname(target_path)
                                files_in_dir = await sandbox.fs.list_files(parent_dir)
                                file_names_in_dir = [f.name for f in files_in_dir]
                                if safe_filename in file_names_in_dir:
                                    successful_uploads.append(target_path)
                                    logger.debug(f"Successfully uploaded and verified file {safe_filename} to sandbox path {target_path}")
                                else:
                                    logger.error(f"Verification failed for {safe_filename}: File not found in {parent_dir} after upload attempt.")
                                    failed_uploads.append(safe_filename)
                            except Exception as verify_error:
                                logger.error(f"Error verifying file {safe_filename} after upload: {str(verify_error)}", exc_info=True)
                                failed_uploads.append(safe_filename)
                        else:
                            failed_uploads.append(safe_filename)
                    except Exception as file_error:
                        logger.error(f"Error processing file {file.filename}: {str(file_error)}", exc_info=True)
                        failed_uploads.append(file.filename)
                    finally:
                        await file.close()

            if successful_uploads:
                message_content += "\n\n" if message_content else ""
                for file_path in successful_uploads: message_content += f"[Uploaded File: {file_path}]\n"
            if failed_uploads:
                message_content += "\n\nThe following files failed to upload:\n"
                for failed_file in failed_uploads: message_content += f"- {failed_file}\n"
        
        # 4.5. Download Agent Default Files (if any)
        if has_default_files and sandbox:
            try:
                downloaded_files = await files_manager.download_files_to_sandbox(agent_config['agent_id'], sandbox)
                if downloaded_files:
                    logger.info(f"Downloaded {len(downloaded_files)} default files to sandbox")
                    # Optionally add to message content to inform user
                    if not message_content.endswith('\n'):
                        message_content += "\n"
                    message_content += "\n[Agent Default Files Available]:\n"
                    for file_path in downloaded_files:
                        message_content += f"- {file_path}\n"
            except Exception as e:
                logger.error(f"Failed to download agent default files: {e}")
                # Continue without default files rather than failing the entire initiation

        # 5. Add initial user message to thread
        message_id = str(uuid.uuid4())
        message_payload = {"role": "user", "content": message_content}
        await client.table('messages').insert({
            "message_id": message_id, "thread_id": thread_id, "type": "user",
            "is_llm_message": True, "content": json.dumps(message_payload),
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()


        effective_model = model_name
        if not model_name and agent_config and agent_config.get('model'):
            effective_model = agent_config['model']
            logger.debug(f"No model specified by user, using agent's configured model: {effective_model}")
        elif model_name:
            logger.debug(f"Using user-selected model: {effective_model}")
        else:
            logger.debug(f"Using default model: {effective_model}")

        agent_run = await client.table('agent_runs').insert({
            "thread_id": thread_id, "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "agent_id": agent_config.get('agent_id') if agent_config else None,
            "agent_version_id": agent_config.get('current_version_id') if agent_config else None,
            "metadata": {
                "model_name": effective_model,
                "requested_model": model_name,
                "enable_thinking": enable_thinking,
                "reasoning_effort": reasoning_effort,
                "enable_context_manager": enable_context_manager
            }
        }).execute()
        agent_run_id = agent_run.data[0]['id']
        logger.debug(f"Created new agent run: {agent_run_id}")
        structlog.contextvars.bind_contextvars(
            agent_run_id=agent_run_id,
        )

        # Register run in Redis
        instance_key = f"active_run:{utils.instance_id}:{agent_run_id}"
        try:
            await redis.set(instance_key, "running", ex=redis.REDIS_KEY_TTL)
        except Exception as e:
            logger.warning(f"Failed to register agent run in Redis ({instance_key}): {str(e)}")

        request_id = structlog.contextvars.get_contextvars().get('request_id')

        # Run agent in background
        run_agent_background.send(
            agent_run_id=agent_run_id, thread_id=thread_id, instance_id=utils.instance_id,
            project_id=project_id,
            model_name=model_name,  # Already resolved above
            enable_thinking=enable_thinking, reasoning_effort=reasoning_effort,
            stream=stream, enable_context_manager=enable_context_manager,
            enable_prompt_caching=enable_prompt_caching,
            agent_config=agent_config,  # Pass agent configuration
            request_id=request_id,
        )

        return {"thread_id": thread_id, "agent_run_id": agent_run_id}

    except Exception as e:
        logger.error(f"Error in agent initiation: {str(e)}\n{traceback.format_exc()}")
        # TODO: Clean up created project/thread if initiation fails mid-way
        raise HTTPException(status_code=500, detail=f"Failed to initiate agent session: {str(e)}")

