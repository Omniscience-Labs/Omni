import json
import asyncio
import traceback
import uuid
import os
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form, Query

from utils.auth_utils import get_current_user_id_from_jwt
from utils.logger import logger, structlog
from utils.config import config, EnvMode
from utils.pagination import PaginationParams
from services.billing import check_billing_status, can_use_model
from services import redis
from sandbox.sandbox import create_sandbox, delete_sandbox
from run_agent_background import run_agent_background
from models import model_manager
from flags.flags import is_enabled

from ..models import (
    AgentCreateRequest, AgentResponse, AgentVersionResponse, AgentsResponse, 
    PaginationInfo, JsonAnalysisRequest,
    JsonAnalysisResponse, JsonImportRequestModel, JsonImportResponse,
    InitiateAgentResponse
)
from .. import helpers
from ..helpers import _get_version_service, merge_custom_mcps, generate_and_update_project_name
from ..config_helper import extract_agent_config
from ..utils import check_agent_run_limit

router = APIRouter()

@router.post("/agent/initiate", response_model=InitiateAgentResponse)
async def initiate_agent_with_files(
    prompt: str = Form(...),
    model_name: Optional[str] = Form(None),  # Default to None to use default model
    enable_thinking: Optional[bool] = Form(False),
    reasoning_effort: Optional[str] = Form("low"),
    stream: Optional[bool] = Form(True),
    enable_context_manager: Optional[bool] = Form(False),
    agent_id: Optional[str] = Form(None),  # Add agent_id parameter
    files: List[UploadFile] = File(default=[]),
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    Initiate a new agent session with optional file attachments.

    [WARNING] Keep in sync with create thread endpoint.
    """
    if not helpers.instance_id:
        raise HTTPException(status_code=500, detail="Agent API not initialized with instance ID")

    # Use model from config if not specified in the request
    logger.debug(f"Original model_name from request: {model_name}")

    if model_name is None:
        model_name = "openai/gpt-5-mini"
        logger.debug(f"Using default model: {model_name}")

    from models import model_manager
    # Log the model name after alias resolution using new model manager
    resolved_model = model_manager.resolve_model_id(model_name)
    logger.debug(f"Resolved model name: {resolved_model}")

    # Update model_name to use the resolved version
    model_name = resolved_model

    logger.debug(f"[\033[91mDEBUG\033[0m] Initiating new agent with prompt and {len(files)} files (Instance: {helpers.instance_id}), model: {model_name}, enable_thinking: {enable_thinking}")
    client = await helpers.db.client
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
        
        logger.debug(f"[AGENT INITIATE] About to call extract_agent_config with version data: {version_data is not None}")
        
        agent_config = extract_agent_config(agent_data, version_data)
        
        if version_data:
            logger.debug(f"Using custom agent: {agent_config['name']} ({agent_id}) version {agent_config.get('version_name', 'v1')}")
        else:
            logger.debug(f"Using custom agent: {agent_config['name']} ({agent_id}) - no version data")
    else:
        logger.debug(f"[AGENT INITIATE] No agent_id provided, querying for default agent")
        # Try to get default agent for the account
        default_agent_result = await client.table('agents').select('*').eq('account_id', account_id).eq('is_default', True).execute()
        logger.debug(f"[AGENT INITIATE] Default agent query result: found {len(default_agent_result.data) if default_agent_result.data else 0} default agents")
        
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
                    logger.debug(f"[AGENT INITIATE] Got default agent version from version manager: {version_data.get('version_name')}")
                except Exception as e:
                    logger.warning(f"[AGENT INITIATE] Failed to get default agent version data: {e}")
            
            logger.debug(f"[AGENT INITIATE] About to call extract_agent_config for DEFAULT agent with version data: {version_data is not None}")
            
            agent_config = extract_agent_config(agent_data, version_data)
            
            if version_data:
                logger.debug(f"Using default agent: {agent_config['name']} ({agent_config['agent_id']}) version {agent_config.get('version_name', 'v1')}")
            else:
                logger.debug(f"Using default agent: {agent_config['name']} ({agent_config['agent_id']}) - no version data")
        else:
            logger.warning(f"[AGENT INITIATE] No default agent found for account {account_id}")
    
    logger.debug(f"[AGENT INITIATE] Final agent_config: {agent_config is not None}")
    if agent_config:
        logger.debug(f"[AGENT INITIATE] Agent config keys: {list(agent_config.keys())}")

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

    can_run, message, subscription = await check_billing_status(client, account_id)
    if not can_run:
        raise HTTPException(status_code=402, detail={"message": message, "subscription": subscription})

    # Check agent run limit (maximum parallel runs in past 24 hours)
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

        if files:
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
        instance_key = f"active_run:{helpers.instance_id}:{agent_run_id}"
        try:
            await redis.set(instance_key, "running", ex=redis.REDIS_KEY_TTL)
        except Exception as e:
            logger.warning(f"Failed to register agent run in Redis ({instance_key}): {str(e)}")

        request_id = structlog.contextvars.get_contextvars().get('request_id')

        # Run agent in background
        run_agent_background.send(
            agent_run_id=agent_run_id, thread_id=thread_id, instance_id=helpers.instance_id,
            project_id=project_id,
            model_name=model_name,  # Already resolved above
            enable_thinking=enable_thinking, reasoning_effort=reasoning_effort,
            stream=stream, enable_context_manager=enable_context_manager,
            agent_config=agent_config,  # Pass agent configuration
            request_id=request_id,
        )

        return {"thread_id": thread_id, "agent_run_id": agent_run_id}

    except Exception as e:
        logger.error(f"Error in agent initiation: {str(e)}\n{traceback.format_exc()}")
        # TODO: Clean up created project/thread if initiation fails mid-way
        raise HTTPException(status_code=500, detail=f"Failed to initiate agent session: {str(e)}")

@router.get("/agents", response_model=AgentsResponse)
async def get_agents(
    user_id: str = Depends(get_current_user_id_from_jwt),
    page: Optional[int] = Query(1, ge=1, description="Page number (1-based)"),
    limit: Optional[int] = Query(20, ge=1, le=100, description="Number of items per page"),
    search: Optional[str] = Query(None, description="Search in name and description"),
    sort_by: Optional[str] = Query("created_at", description="Sort field: name, created_at, updated_at, tools_count"),
    sort_order: Optional[str] = Query("desc", description="Sort order: asc, desc"),
    has_default: Optional[bool] = Query(None, description="Filter by default agents"),
    has_mcp_tools: Optional[bool] = Query(None, description="Filter by agents with MCP tools"),
    has_agentpress_tools: Optional[bool] = Query(None, description="Filter by agents with AgentPress tools"),
    tools: Optional[str] = Query(None, description="Comma-separated list of tools to filter by"),
    content_type: Optional[str] = Query(None, description="Content type filter: 'agents', 'templates', or None for agents only")
):
    if not await is_enabled("custom_agents"):
        raise HTTPException(
            status_code=403, 
            detail="Custom agents currently disabled. This feature is not available at the moment."
        )
    try:
        from agent.services.agent_service import AgentService, AgentFilters
        
        tools_list = []
        if tools:
            if isinstance(tools, str):
                tools_list = [tool.strip() for tool in tools.split(',') if tool.strip()]
            else:
                logger.warning(f"Unexpected tools parameter type: {type(tools)}")
        
        pagination_params = PaginationParams(
            page=page,
            page_size=limit
        )
        
        filters = AgentFilters(
            search=search,
            has_default=has_default,
            has_mcp_tools=has_mcp_tools,
            has_agentpress_tools=has_agentpress_tools,
            tools=tools_list,
            content_type=content_type,
            sort_by=sort_by,
            sort_order=sort_order
        )
        
        client = await helpers.db.client
        agent_service = AgentService(client)
        paginated_result = await agent_service.get_agents_paginated(
            user_id=user_id,
            pagination_params=pagination_params,
            filters=filters
        )
        
        agent_responses = []
        for agent_data in paginated_result.data:
            agent_response = AgentResponse(**agent_data)
            agent_responses.append(agent_response)
        
        return AgentsResponse(
            agents=agent_responses,
            pagination=PaginationInfo(
                current_page=paginated_result.pagination.current_page,
                page_size=paginated_result.pagination.page_size,
                total_items=paginated_result.pagination.total_items,
                total_pages=paginated_result.pagination.total_pages,
                has_next=paginated_result.pagination.has_next,
                has_previous=paginated_result.pagination.has_previous
            )
        )
        
    except Exception as e:
        logger.error(f"Error fetching agents for user {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch agents: {str(e)}")

@router.get("/agents/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str, user_id: str = Depends(get_current_user_id_from_jwt)):
    if not await is_enabled("custom_agents"):
        raise HTTPException(
            status_code=403, 
            detail="Custom agents currently disabled. This feature is not available at the moment."
        )
    
    logger.debug(f"Fetching agent {agent_id} for user: {user_id}")
    
    client = await helpers.db.client
    
    try:
        agent = await client.table('agents').select('*').eq("agent_id", agent_id).execute()
        
        if not agent.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        agent_data = agent.data[0]
        
        if config.ENV_MODE == EnvMode.STAGING:
            print(f"[DEBUG] get_agent: Fetched agent from DB - icon_name={agent_data.get('icon_name')}, icon_color={agent_data.get('icon_color')}, icon_background={agent_data.get('icon_background')}")
            print(f"[DEBUG] get_agent: Also has - profile_image_url={agent_data.get('profile_image_url')}, avatar={agent_data.get('avatar')}, avatar_color={agent_data.get('avatar_color')}")
        
        if agent_data['account_id'] != user_id and not agent_data.get('is_public', False):
            raise HTTPException(status_code=403, detail="Access denied")
        
        current_version = None
        if agent_data.get('current_version_id'):
            try:
                version_service = await _get_version_service()
                current_version_obj = await version_service.get_version(
                    agent_id=agent_id,
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
                logger.warning(f"Failed to get version data for agent {agent_id}: {e}")
        
        # Extract configuration using the unified config approach
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
        
        # Debug logging before extract_agent_config
        if config.ENV_MODE == EnvMode.STAGING:
            print(f"[DEBUG] get_agent: Before extract_agent_config - agent_data has icon_name={agent_data.get('icon_name')}, icon_color={agent_data.get('icon_color')}, icon_background={agent_data.get('icon_background')}")
        
        agent_config = extract_agent_config(agent_data, version_data)
        
        # Debug logging after extract_agent_config
        if config.ENV_MODE == EnvMode.STAGING:
            print(f"[DEBUG] get_agent: After extract_agent_config - agent_config has icon_name={agent_config.get('icon_name')}, icon_color={agent_config.get('icon_color')}, icon_background={agent_config.get('icon_background')}")
            print(f"[DEBUG] get_agent: Final response will use icon fields from agent_config")
        
        system_prompt = agent_config['system_prompt']
        configured_mcps = agent_config['configured_mcps']
        custom_mcps = agent_config['custom_mcps']
        agentpress_tools = agent_config['agentpress_tools']
        
        response = AgentResponse(
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
            icon_name=agent_config.get('icon_name'),
            icon_color=agent_config.get('icon_color'),
            icon_background=agent_config.get('icon_background'),
            created_at=agent_data['created_at'],
            updated_at=agent_data.get('updated_at', agent_data['created_at']),
            current_version_id=agent_data.get('current_version_id'),
            version_count=agent_data.get('version_count', 1),
            current_version=current_version,
            metadata=agent_data.get('metadata')
        )
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching agent {agent_id} for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch agent: {str(e)}")

@router.get("/agents/{agent_id}/export")
async def export_agent(agent_id: str, user_id: str = Depends(get_current_user_id_from_jwt)):
    """Export an agent configuration as JSON"""
    logger.debug(f"Exporting agent {agent_id} for user: {user_id}")
    
    try:
        client = await helpers.db.client
        
        # Get agent data
        agent_result = await client.table('agents').select('*').eq('agent_id', agent_id).eq('account_id', user_id).execute()
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        agent = agent_result.data[0]
        
        # Get current version data if available
        current_version = None
        if agent.get('current_version_id'):
            version_result = await client.table('agent_versions').select('*').eq('version_id', agent['current_version_id']).execute()
            if version_result.data:
                current_version = version_result.data[0]

        from agent.config_helper import extract_agent_config
        config = extract_agent_config(agent, current_version)
        
        from templates.template_service import TemplateService
        template_service = TemplateService(db)
        
        full_config = {
            'system_prompt': config.get('system_prompt', ''),
            'tools': {
                'agentpress': config.get('agentpress_tools', {}),
                'mcp': config.get('configured_mcps', []),
                'custom_mcp': config.get('custom_mcps', [])
            },
            'metadata': {
                # keep backward compat metadata
                'avatar': config.get('avatar'),
                'avatar_color': config.get('avatar_color'),
                # include profile image url in metadata for completeness
                'profile_image_url': agent.get('profile_image_url')
            }
        }
        
        sanitized_config = template_service._fallback_sanitize_config(full_config)
        
        export_metadata = {}
        if agent.get('metadata'):
            export_metadata = {k: v for k, v in agent['metadata'].items() 
                             if k not in ['is_suna_default', 'centrally_managed', 'installation_date', 'last_central_update']}
        
        export_data = {
            "tools": sanitized_config['tools'],
            "metadata": sanitized_config['metadata'],
            "system_prompt": sanitized_config['system_prompt'],
            "name": config.get('name', ''),
            "description": config.get('description', ''),
            # Deprecated
            "avatar": config.get('avatar'),
            "avatar_color": config.get('avatar_color'),
            # New
            "profile_image_url": agent.get('profile_image_url'),
            "tags": agent.get('tags', []),
            "export_metadata": export_metadata,
            "exported_at": datetime.now(timezone.utc).isoformat()
        }
        
        logger.debug(f"Successfully exported agent {agent_id}")
        return export_data
        
    except Exception as e:
        logger.error(f"Error exporting agent {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to export agent: {str(e)}")

@router.post("/agents/json/analyze", response_model=JsonAnalysisResponse)
async def analyze_json_for_import(
    request: JsonAnalysisRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Analyze imported JSON to determine required credentials and configurations"""
    logger.debug(f"Analyzing JSON for import - user: {user_id}")
    
    if not await is_enabled("custom_agents"):
        raise HTTPException(
            status_code=403, 
            detail="Custom agents currently disabled. This feature is not available at the moment."
        )
    
    try:
        from agent.json_import_service import JsonImportService
        import_service = JsonImportService(db)
        
        analysis = await import_service.analyze_json(request.json_data, user_id)
        
        return JsonAnalysisResponse(
            requires_setup=analysis.requires_setup,
            missing_regular_credentials=analysis.missing_regular_credentials,
            missing_custom_configs=analysis.missing_custom_configs,
            agent_info=analysis.agent_info
        )
        
    except Exception as e:
        logger.error(f"Error analyzing JSON: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to analyze JSON: {str(e)}")

@router.post("/agents/json/import", response_model=JsonImportResponse)
async def import_agent_from_json(
    request: JsonImportRequestModel,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.debug(f"Importing agent from JSON - user: {user_id}")
    
    if not await is_enabled("custom_agents"):
        raise HTTPException(
            status_code=403, 
            detail="Custom agents currently disabled. This feature is not available at the moment."
        )
    
    client = await helpers.db.client
    from .utils import check_agent_count_limit
    limit_check = await check_agent_count_limit(client, user_id)
    
    if not limit_check['can_create']:
        error_detail = {
            "message": f"Maximum of {limit_check['limit']} agents allowed for your current plan. You have {limit_check['current_count']} agents.",
            "current_count": limit_check['current_count'],
            "limit": limit_check['limit'],
            "tier_name": limit_check['tier_name'],
            "error_code": "AGENT_LIMIT_EXCEEDED"
        }
        logger.warning(f"Agent limit exceeded for account {user_id}: {limit_check['current_count']}/{limit_check['limit']} agents")
        raise HTTPException(status_code=402, detail=error_detail)
    
    try:
        from agent.json_import_service import JsonImportService, JsonImportRequest
        import_service = JsonImportService(db)
        
        import_request = JsonImportRequest(
            json_data=request.json_data,
            account_id=user_id,
            instance_name=request.instance_name,
            custom_system_prompt=request.custom_system_prompt,
            profile_mappings=request.profile_mappings,
            custom_mcp_configs=request.custom_mcp_configs
        )
        
        result = await import_service.import_json(import_request)
        
        return JsonImportResponse(
            status=result.status,
            instance_id=result.instance_id,
            name=result.name,
            missing_regular_credentials=result.missing_regular_credentials,
            missing_custom_configs=result.missing_custom_configs,
            agent_info=result.agent_info
        )
        
    except Exception as e:
        logger.error(f"Error importing agent from JSON: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to import agent: {str(e)}")

@router.post("/agents", response_model=AgentResponse)
async def create_agent(
    agent_data: AgentCreateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.debug(f"Creating new agent for user: {user_id}")
    if not await is_enabled("custom_agents"):
        raise HTTPException(
            status_code=403, 
            detail="Custom agents currently disabled. This feature is not available at the moment."
        )
    client = await helpers.db.client
    
    from .utils import check_agent_count_limit
    limit_check = await check_agent_count_limit(client, user_id)
    
    if not limit_check['can_create']:
        error_detail = {
            "message": f"Maximum of {limit_check['limit']} agents allowed for your current plan. You have {limit_check['current_count']} agents.",
            "current_count": limit_check['current_count'],
            "limit": limit_check['limit'],
            "tier_name": limit_check['tier_name'],
            "error_code": "AGENT_LIMIT_EXCEEDED"
        }
        logger.warning(f"Agent limit exceeded for account {user_id}: {limit_check['current_count']}/{limit_check['limit']} agents")
        raise HTTPException(status_code=402, detail=error_detail)
    
    try:
        if agent_data.is_default:
            await client.table('agents').update({"is_default": False}).eq("account_id", user_id).eq("is_default", True).execute()
        
        insert_data = {
            "account_id": user_id,
            "name": agent_data.name,
            "description": agent_data.description,
            "avatar": agent_data.avatar,
            "avatar_color": agent_data.avatar_color,
            "profile_image_url": agent_data.profile_image_url,
            "icon_name": agent_data.icon_name or "bot",
            "icon_color": agent_data.icon_color or "#000000",
            "icon_background": agent_data.icon_background or "#F3F4F6",
            "is_default": agent_data.is_default or False,
            "version_count": 1
        }
        
        if config.ENV_MODE == EnvMode.STAGING:
            print(f"[DEBUG] create_agent: Creating with icon_name={insert_data.get('icon_name')}, icon_color={insert_data.get('icon_color')}, icon_background={insert_data.get('icon_background')}")
        
        new_agent = await client.table('agents').insert(insert_data).execute()
        
        if not new_agent.data:
            raise HTTPException(status_code=500, detail="Failed to create agent")
        
        agent = new_agent.data[0]
        
        try:
            version_service = await _get_version_service()
            from agent.suna_config import SUNA_CONFIG
            from agent.config_helper import _get_default_agentpress_tools
            from models import model_manager
            
            system_prompt = SUNA_CONFIG["system_prompt"]
            
            agentpress_tools = agent_data.agentpress_tools if agent_data.agentpress_tools else _get_default_agentpress_tools()
            
            default_model = await model_manager.get_default_model_for_user(client, user_id)
            
            version = await version_service.create_version(
                agent_id=agent['agent_id'],
                user_id=user_id,
                system_prompt=system_prompt,
                model=default_model,
                configured_mcps=agent_data.configured_mcps or [],
                custom_mcps=agent_data.custom_mcps or [],
                agentpress_tools=agentpress_tools,
                version_name="v1",
                change_description="Initial version"
            )
            
            agent['current_version_id'] = version.version_id
            agent['version_count'] = 1

            current_version = AgentVersionResponse(
                version_id=version.version_id,
                agent_id=version.agent_id,
                version_number=version.version_number,
                version_name=version.version_name,
                system_prompt=version.system_prompt,
                model=version.model,
                configured_mcps=version.configured_mcps,
                custom_mcps=version.custom_mcps,
                agentpress_tools=version.agentpress_tools,
                is_active=version.is_active,
                created_at=version.created_at.isoformat(),
                updated_at=version.updated_at.isoformat(),
                created_by=version.created_by
            )
        except Exception as e:
            logger.error(f"Error creating initial version: {str(e)}")
            await client.table('agents').delete().eq('agent_id', agent['agent_id']).execute()
            raise HTTPException(status_code=500, detail="Failed to create initial version")
        
        from utils.cache import Cache
        await Cache.invalidate(f"agent_count_limit:{user_id}")
        
        logger.debug(f"Created agent {agent['agent_id']} with v1 for user: {user_id}")
        
        response = AgentResponse(
            agent_id=agent['agent_id'],
            name=agent['name'],
            description=agent.get('description'),
            system_prompt=version.system_prompt,
            model=version.model,
            configured_mcps=version.configured_mcps,
            custom_mcps=version.custom_mcps,
            agentpress_tools=version.agentpress_tools,
            is_default=agent.get('is_default', False),
            is_public=agent.get('is_public', False),
            tags=agent.get('tags', []),
            avatar=agent.get('avatar'),
            avatar_color=agent.get('avatar_color'),
            profile_image_url=agent.get('profile_image_url'),
            icon_name=agent.get('icon_name'),
            icon_color=agent.get('icon_color'),
            icon_background=agent.get('icon_background'),
            created_at=agent['created_at'],
            updated_at=agent.get('updated_at', agent['created_at']),
            current_version_id=agent.get('current_version_id'),
            version_count=agent.get('version_count', 1),
            current_version=current_version,
            metadata=agent.get('metadata')
        )
        
        if config.ENV_MODE == EnvMode.STAGING:
            print(f"[DEBUG] create_agent RESPONSE: Returning icon_name={response.icon_name}, icon_color={response.icon_color}, icon_background={response.icon_background}")
            print(f"[DEBUG] create_agent RESPONSE: Also returning profile_image_url={response.profile_image_url}, avatar={response.avatar}, avatar_color={response.avatar_color}")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating agent for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create agent: {str(e)}")