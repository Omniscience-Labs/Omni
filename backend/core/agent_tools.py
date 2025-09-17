import json
import base64
from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Request, Body, Form

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.sandbox.sandbox import get_or_start_sandbox
from core.services.supabase import DBConnection
from core.agentpress.thread_manager import ThreadManager

from . import core_utils as utils
from .core_utils import _get_version_service

router = APIRouter()

@router.get("/agents/{agent_id}/custom-mcp-tools")
async def get_custom_mcp_tools_for_agent(
    agent_id: str,
    request: Request,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    logger.debug(f"Getting custom MCP tools for agent {agent_id}, user {user_id}")
    try:
        client = await utils.db.client
        agent_result = await client.table('agents').select('current_version_id').eq('agent_id', agent_id).eq('account_id', user_id).execute()
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        agent = agent_result.data[0]
 
        agent_config = {}
        if agent.get('current_version_id'):
            version_result = await client.table('agent_versions')\
                .select('config')\
                .eq('version_id', agent['current_version_id'])\
                .maybe_single()\
                .execute()
            if version_result.data and version_result.data.get('config'):
                agent_config = version_result.data['config']
        
        tools = agent_config.get('tools', {})
        custom_mcps = tools.get('custom_mcp', [])
        
        mcp_url = request.headers.get('X-MCP-URL')
        mcp_type = request.headers.get('X-MCP-Type', 'sse')
        
        if not mcp_url:
            raise HTTPException(status_code=400, detail="X-MCP-URL header is required")
        
        mcp_config = {
            'url': mcp_url,
            'type': mcp_type
        }
        
        if 'X-MCP-Headers' in request.headers:
            import json
            try:
                mcp_config['headers'] = json.loads(request.headers['X-MCP-Headers'])
            except json.JSONDecodeError:
                logger.warning("Failed to parse X-MCP-Headers as JSON")
        
        from core.mcp_module import mcp_service
        discovery_result = await mcp_service.discover_custom_tools(mcp_type, mcp_config)
        
        existing_mcp = None
        for mcp in custom_mcps:
            if mcp_type == 'composio':
                if (mcp.get('type') == 'composio' and 
                    mcp.get('config', {}).get('profile_id') == mcp_url):
                    existing_mcp = mcp
                    break
            else:
                if (mcp.get('customType') == mcp_type and 
                    mcp.get('config', {}).get('url') == mcp_url):
                    existing_mcp = mcp
                    break
        
        tools = []
        enabled_tools = existing_mcp.get('enabledTools', []) if existing_mcp else []
        
        for tool in discovery_result.tools:
            tools.append({
                'name': tool['name'],
                'description': tool.get('description', f'Tool from {mcp_type.upper()} MCP server'),
                'enabled': tool['name'] in enabled_tools
            })
        
        return {
            'tools': tools,
            'has_mcp_config': existing_mcp is not None,
            'server_type': mcp_type,
            'server_url': mcp_url
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting custom MCP tools for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/agents/{agent_id}/custom-mcp-tools")
async def update_custom_mcp_tools_for_agent(
    agent_id: str,
    request: dict,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    logger.debug(f"Updating custom MCP tools for agent {agent_id}, user {user_id}")
    
    try:
        client = await utils.db.client
        
        agent_result = await client.table('agents').select('current_version_id').eq('agent_id', agent_id).eq('account_id', user_id).execute()
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        agent = agent_result.data[0]
        
        agent_config = {}
        if agent.get('current_version_id'):
            version_result = await client.table('agent_versions')\
                .select('config')\
                .eq('version_id', agent['current_version_id'])\
                .maybe_single()\
                .execute()
            if version_result.data and version_result.data.get('config'):
                agent_config = version_result.data['config']
        
        tools = agent_config.get('tools', {})
        custom_mcps = tools.get('custom_mcp', [])
        
        mcp_url = request.get('url')
        mcp_type = request.get('type', 'sse')
        enabled_tools = request.get('enabled_tools', [])
        
        if not mcp_url:
            raise HTTPException(status_code=400, detail="MCP URL is required")
        
        updated = False
        for i, mcp in enumerate(custom_mcps):
            if mcp_type == 'composio':
                # For Composio, match by profile_id
                if (mcp.get('type') == 'composio' and 
                    mcp.get('config', {}).get('profile_id') == mcp_url):
                    custom_mcps[i]['enabledTools'] = enabled_tools
                    updated = True
                    break
            else:
                if (mcp.get('customType') == mcp_type and 
                    mcp.get('config', {}).get('url') == mcp_url):
                    custom_mcps[i]['enabledTools'] = enabled_tools
                    updated = True
                    break
        
        if not updated:
            if mcp_type == 'composio':
                try:
                    from core.composio_integration.composio_profile_service import ComposioProfileService
                    from core.services.supabase import DBConnection
                    profile_service = ComposioProfileService(DBConnection())
 
                    profile_id = mcp_url
                    mcp_config = await profile_service.get_mcp_config_for_agent(profile_id)
                    mcp_config['enabledTools'] = enabled_tools
                    custom_mcps.append(mcp_config)
                except Exception as e:
                    logger.error(f"Failed to get Composio profile config: {e}")
                    raise HTTPException(status_code=400, detail=f"Failed to get Composio profile: {str(e)}")
            else:
                new_mcp_config = {
                    "name": f"Custom MCP ({mcp_type.upper()})",
                    "customType": mcp_type,
                    "type": mcp_type,
                    "config": {
                        "url": mcp_url
                    },
                    "enabledTools": enabled_tools
                }
                custom_mcps.append(new_mcp_config)
        
        tools['custom_mcp'] = custom_mcps
        agent_config['tools'] = tools
        
        from .versioning.version_service import get_version_service
        try:
            version_service = await get_version_service() 
            new_version = await version_service.create_version(
                agent_id=agent_id,
                user_id=user_id,
                system_prompt=agent_config.get('system_prompt', ''),
                configured_mcps=agent_config.get('tools', {}).get('mcp', []),
                custom_mcps=custom_mcps,
                agentpress_tools=agent_config.get('tools', {}).get('agentpress', {}),
                change_description=f"Updated custom MCP tools for {mcp_type}"
            )
            logger.debug(f"Created version {new_version.version_id} for custom MCP tools update on agent {agent_id}")
        except Exception as e:
            logger.error(f"Failed to create version for custom MCP tools update: {e}")
            raise HTTPException(status_code=500, detail="Failed to save changes")
        
        return {
            'success': True,
            'enabled_tools': enabled_tools,
            'total_tools': len(enabled_tools)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating custom MCP tools for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/agents/{agent_id}/custom-mcp-tools")
async def update_agent_custom_mcps(
    agent_id: str,
    request: dict,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    logger.debug(f"Updating agent {agent_id} custom MCPs for user {user_id}")
    
    try:
        client = await utils.db.client
        agent_result = await client.table('agents').select('current_version_id').eq('agent_id', agent_id).eq('account_id', user_id).execute()
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        agent = agent_result.data[0]
        
        agent_config = {}
        if agent.get('current_version_id'):
            version_result = await client.table('agent_versions')\
                .select('config')\
                .eq('version_id', agent['current_version_id'])\
                .maybe_single()\
                .execute()
            if version_result.data and version_result.data.get('config'):
                agent_config = version_result.data['config']
        
        new_custom_mcps = request.get('custom_mcps', [])
        if not new_custom_mcps:
            raise HTTPException(status_code=400, detail="custom_mcps array is required")
        
        tools = agent_config.get('tools', {})
        existing_custom_mcps = tools.get('custom_mcp', [])
        
        updated = False
        for new_mcp in new_custom_mcps:
            mcp_type = new_mcp.get('type', '')
            
            if mcp_type == 'composio':
                profile_id = new_mcp.get('config', {}).get('profile_id')
                if not profile_id:
                    continue
                    
                for i, existing_mcp in enumerate(existing_custom_mcps):
                    if (existing_mcp.get('type') == 'composio' and 
                        existing_mcp.get('config', {}).get('profile_id') == profile_id):
                        existing_custom_mcps[i] = new_mcp
                        updated = True
                        break
                
                if not updated:
                    existing_custom_mcps.append(new_mcp)
                    updated = True
            else:
                mcp_url = new_mcp.get('config', {}).get('url')
                mcp_name = new_mcp.get('name', '')
                
                for i, existing_mcp in enumerate(existing_custom_mcps):
                    if (existing_mcp.get('config', {}).get('url') == mcp_url or 
                        (mcp_name and existing_mcp.get('name') == mcp_name)):
                        existing_custom_mcps[i] = new_mcp
                        updated = True
                        break
                
                if not updated:
                    existing_custom_mcps.append(new_mcp)
                    updated = True
        
        tools['custom_mcp'] = existing_custom_mcps
        agent_config['tools'] = tools
        
        from .versioning.version_service import get_version_service
        import datetime
        
        try:
            version_service = await get_version_service()
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            change_description = f"MCP tools update {timestamp}"
            
            new_version = await version_service.create_version(
                agent_id=agent_id,
                user_id=user_id,
                system_prompt=agent_config.get('system_prompt', ''),
                configured_mcps=agent_config.get('tools', {}).get('mcp', []),
                custom_mcps=existing_custom_mcps,
                agentpress_tools=agent_config.get('tools', {}).get('agentpress', {}),
                change_description=change_description
            )
            logger.debug(f"Created version {new_version.version_id} for agent {agent_id}")
            
            total_enabled_tools = sum(len(mcp.get('enabledTools', [])) for mcp in new_custom_mcps)
        except Exception as e:
            logger.error(f"Failed to create version for custom MCP tools update: {e}")
            raise HTTPException(status_code=500, detail="Failed to save changes")
        
        return {
            'success': True,
            'data': {
                'custom_mcps': existing_custom_mcps,
                'total_enabled_tools': total_enabled_tools
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating agent custom MCPs: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/agents/{agent_id}/tools")
async def get_agent_tools(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
        
    logger.debug(f"Fetching enabled tools for agent: {agent_id} by user: {user_id}")
    client = await utils.db.client

    agent_result = await client.table('agents').select('*').eq('agent_id', agent_id).execute()
    if not agent_result.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent = agent_result.data[0]
    if agent['account_id'] != user_id and not agent.get('is_public', False):
        raise HTTPException(status_code=403, detail="Access denied")

    version_data = None
    if agent.get('current_version_id'):
        try:
            version_service = await _get_version_service()

            version_obj = await version_service.get_version(
                agent_id=agent_id,
                version_id=agent['current_version_id'],
                user_id=user_id
            )
            version_data = version_obj.to_dict()
        except Exception as e:
            logger.warning(f"Failed to fetch version data for tools endpoint: {e}")
    
    from .config_helper import extract_agent_config
    agent_config = extract_agent_config(agent, version_data)
    
    agentpress_tools_config = agent_config['agentpress_tools']
    configured_mcps = agent_config['configured_mcps'] 
    custom_mcps = agent_config['custom_mcps']

    agentpress_tools = []
    for name, enabled in agentpress_tools_config.items():
        is_enabled_tool = bool(enabled.get('enabled', False)) if isinstance(enabled, dict) else bool(enabled)
        agentpress_tools.append({"name": name, "enabled": is_enabled_tool})

    mcp_tools = []
    for mcp in configured_mcps + custom_mcps:
        server = mcp.get('name')
        enabled_tools = mcp.get('enabledTools') or mcp.get('enabled_tools') or []
        for tool_name in enabled_tools:
            mcp_tools.append({"name": tool_name, "server": server, "enabled": True})
    return {"agentpress_tools": agentpress_tools, "mcp_tools": mcp_tools}


@router.post("/agents/{agent_id}/upload-automation-zip")
async def upload_automation_zip(
    agent_id: str,
    automation_zip: UploadFile = File(...),
    description: str = Form("Custom browser automation"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Upload a single ZIP file containing both automation script and Chrome profile."""
    logger.debug(f"Uploading automation ZIP for agent {agent_id}, user {user_id}")
    
    try:
        # Verify agent belongs to user
        client = await utils.db.client
        agent_result = await client.table('agents').select('*').eq('agent_id', agent_id).eq('account_id', user_id).execute()
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        # Validate file
        if not automation_zip.filename.endswith('.zip'):
            raise HTTPException(status_code=400, detail="File must be a ZIP file (.zip)")
        
        # Check file size
        zip_content = await automation_zip.read()
        if len(zip_content) > 200 * 1024 * 1024:  # 200MB limit
            raise HTTPException(status_code=413, detail="ZIP file too large (max 200MB)")
        
        # Get the agent's current thread to use the custom automation tool
        threads_result = await client.table('threads').select('thread_id').eq('agent_id', agent_id).limit(1).execute()
        if not threads_result.data:
            raise HTTPException(status_code=400, detail="No thread found for agent")
        
        thread_id = threads_result.data[0]['thread_id']
        
        # Create thread manager and custom automation tool
        thread_manager = ThreadManager()
        from core.tools.custom_automation_tool import CustomAutomationTool
        automation_tool = CustomAutomationTool(
            project_id=agent_id,  # Use agent_id as project_id
            thread_id=thread_id,
            thread_manager=thread_manager
        )
        
        # Ensure sandbox and upload ZIP
        await automation_tool._ensure_automation_directory()
        
        # Upload the entire ZIP to sandbox
        zip_path = f"/workspace/custom_automation/{automation_zip.filename}"
        await automation_tool.sandbox.fs.upload_file(zip_content, zip_path)
        
        # Extract and process the ZIP file
        extract_cmd = f"cd /workspace/custom_automation && unzip -o {automation_zip.filename}"
        extract_result = await automation_tool.sandbox.process.exec(extract_cmd)
        
        if extract_result.exit_code != 0:
            return {
                'success': False,
                'error': f"Failed to extract ZIP file: {extract_result.result}"
            }
        
        # Look for JavaScript files in the extracted content
        find_js_cmd = "find /workspace/custom_automation -name '*.js' -type f | head -1"
        js_result = await automation_tool.sandbox.process.exec(find_js_cmd)
        
        if js_result.exit_code != 0 or not js_result.result.strip():
            return {
                'success': False,
                'error': "No JavaScript automation script found in ZIP file. Please include a .js file."
            }
        
        script_path = js_result.result.strip()
        
        # Read the script content
        read_script_cmd = f"cat {script_path}"
        script_result = await automation_tool.sandbox.process.exec(read_script_cmd)
        
        if script_result.exit_code != 0:
            return {
                'success': False,
                'error': f"Failed to read script file: {script_result.result}"
            }
        
        script_content = script_result.result
        
        # Look for Chrome profile directory or another ZIP file
        profile_zip_path = zip_path  # Use the uploaded ZIP as profile
        
        # Call the configure_automation method
        result = await automation_tool.configure_automation(
            script_content=script_content,
            profile_zip_path=profile_zip_path,
            description=description
        )
        
        if result.success:
            return {
                'success': True,
                'message': 'Custom automation configured successfully from ZIP',
                'data': result.result
            }
        else:
            raise HTTPException(status_code=400, detail=result.error_message)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading automation ZIP for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/agents/{agent_id}/upload-automation-files")
async def upload_automation_files(
    agent_id: str,
    script_file: UploadFile = File(...),
    profile_file: UploadFile = File(...),
    description: str = Form("Custom browser automation"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Upload automation script and Chrome profile for custom automation."""
    logger.debug(f"Uploading automation files for agent {agent_id}, user {user_id}")
    
    try:
        # Verify agent belongs to user
        client = await utils.db.client
        agent_result = await client.table('agents').select('*').eq('agent_id', agent_id).eq('account_id', user_id).execute()
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        # Validate files
        if not script_file.filename.endswith('.js'):
            raise HTTPException(status_code=400, detail="Script file must be a JavaScript file (.js)")
        
        if not profile_file.filename.endswith('.zip'):
            raise HTTPException(status_code=400, detail="Profile file must be a ZIP file (.zip)")
        
        # Check file sizes (increase limits for Chrome profiles)
        script_content = await script_file.read()
        profile_content = await profile_file.read()
        
        if len(script_content) > 1 * 1024 * 1024:  # 1MB for script
            raise HTTPException(status_code=413, detail="Script file too large (max 1MB)")
        
        if len(profile_content) > 200 * 1024 * 1024:  # 200MB for Chrome profile
            raise HTTPException(status_code=413, detail="Profile file too large (max 200MB)")
        
        # Get the agent's current thread to use the custom automation tool
        threads_result = await client.table('threads').select('thread_id').eq('agent_id', agent_id).limit(1).execute()
        if not threads_result.data:
            raise HTTPException(status_code=400, detail="No thread found for agent")
        
        thread_id = threads_result.data[0]['thread_id']
        
        # Create thread manager and custom automation tool
        thread_manager = ThreadManager()
        from core.tools.custom_automation_tool import CustomAutomationTool
        automation_tool = CustomAutomationTool(
            project_id=agent_id,  # Use agent_id as project_id
            thread_id=thread_id,
            thread_manager=thread_manager
        )
        
        # Ensure sandbox and upload files
        await automation_tool._ensure_automation_directory()
        
        # Upload profile zip to sandbox
        profile_zip_path = f"/workspace/custom_automation/{profile_file.filename}"
        await automation_tool.sandbox.fs.upload_file(profile_content, profile_zip_path)
        
        # Call the configure_automation method with script content and uploaded profile path
        result = await automation_tool.configure_automation(
            script_content=script_content.decode('utf-8'),
            profile_zip_path=profile_zip_path,
            description=description
        )
        
        if result.success:
            return {
                'success': True,
                'message': 'Custom automation configured successfully',
                'data': result.result
            }
        else:
            raise HTTPException(status_code=400, detail=result.error_message)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading automation files for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/agents/{agent_id}/configure-custom-automation")
async def configure_custom_automation(
    agent_id: str,
    request: Dict[str, Any] = Body(...),
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Configure custom automation for an agent."""
    logger.debug(f"Configuring custom automation for agent {agent_id}, user {user_id}")
    
    try:
        # Validate request
        script_content = request.get('script_content')
        profile_zip_path = request.get('profile_zip_path')
        description = request.get('description', 'Custom browser automation')
        
        if not script_content:
            raise HTTPException(status_code=400, detail="Script content is required")
        
        if not profile_zip_path:
            raise HTTPException(status_code=400, detail="Chrome profile zip path is required")
        
        # Verify agent belongs to user
        client = await utils.db.client
        agent_result = await client.table('agents').select('*').eq('agent_id', agent_id).eq('account_id', user_id).execute()
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        agent = agent_result.data[0]
        
        # Get the agent's current thread to use the custom automation tool
        threads_result = await client.table('threads').select('thread_id').eq('agent_id', agent_id).limit(1).execute()
        if not threads_result.data:
            raise HTTPException(status_code=400, detail="No thread found for agent")
        
        thread_id = threads_result.data[0]['thread_id']
        
        # Create thread manager and custom automation tool
        thread_manager = ThreadManager()
        from core.tools.custom_automation_tool import CustomAutomationTool
        automation_tool = CustomAutomationTool(
            project_id=agent_id,  # Use agent_id as project_id
            thread_id=thread_id,
            thread_manager=thread_manager
        )
        
        # Call the configure_automation method
        result = await automation_tool.configure_automation(
            script_content=script_content,
            profile_zip_path=profile_zip_path,
            description=description
        )
        
        if result.success:
            return {
                'success': True,
                'message': 'Custom automation configured successfully',
                'data': result.result
            }
        else:
            raise HTTPException(status_code=400, detail=result.error_message)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error configuring custom automation for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

