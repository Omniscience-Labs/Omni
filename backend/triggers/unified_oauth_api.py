"""
Unified OAuth API for all providers.

This single API handles OAuth flows for Slack, Discord, Teams, and any future providers
with a consistent interface.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import RedirectResponse
from typing import Optional, List
from pydantic import BaseModel
from enum import Enum
import os

from .oauth.base import OAuthProvider
from .oauth.providers import get_oauth_provider
from services.supabase import DBConnection
from utils.auth_utils import get_current_user_id_from_jwt
from utils.logger import logger

router = APIRouter(prefix="/integrations", tags=["oauth-integrations"])

db = None

def initialize(database: DBConnection):
    """Initialize the unified OAuth API with database connection."""
    global db
    db = database

class IntegrationInstallRequest(BaseModel):
    agent_id: str
    provider: OAuthProvider

class IntegrationInstallResponse(BaseModel):
    install_url: str
    provider: str

class IntegrationStatusResponse(BaseModel):
    agent_id: str
    integrations: List[dict]

@router.get("/available")
async def get_available_integrations():
    """Get list of available OAuth integrations."""
    return {
        "providers": [
            {
                "id": "slack",
                "name": "Slack",
                "description": "Connect to Slack workspaces",
                "icon": "slack",
                "color": "#4A154B"
            },
            {
                "id": "discord", 
                "name": "Discord",
                "description": "Connect to Discord servers",
                "icon": "discord",
                "color": "#5865F2"
            },
            {
                "id": "teams",
                "name": "Microsoft Teams", 
                "description": "Connect to Teams organizations",
                "icon": "teams",
                "color": "#6264A7"
            }
        ]
    }

@router.post("/install", response_model=IntegrationInstallResponse)
async def initiate_integration_install(
    request: IntegrationInstallRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    try:
        await verify_agent_access(request.agent_id, user_id)
        oauth_provider = get_oauth_provider(request.provider, db)
        install_url = oauth_provider.generate_authorization_url(request.agent_id, user_id)
        
        return IntegrationInstallResponse(
            install_url=install_url,
            provider=request.provider.value
        )
        
    except ValueError as e:
        error_msg = str(e)
        if "environment variable is required" in error_msg:
            logger.error(f"Missing OAuth configuration for {request.provider.value}: {e}")
            raise HTTPException(
                status_code=400, 
                detail=f"OAuth integration for {request.provider.value.title()} is not configured. Please contact your administrator to set up the required environment variables."
            )
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error initiating {request.provider.value} install: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{provider}/callback")
async def handle_oauth_callback(
    provider: OAuthProvider,
    code: str = Query(..., description="OAuth authorization code"),
    state: str = Query(..., description="State parameter"),
    error: Optional[str] = Query(None, description="OAuth error")
):
    """Handle OAuth callback for any provider."""
    if error:
        logger.error(f"{provider.value} OAuth error: {error}")
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        return RedirectResponse(
            url=f"{frontend_url}/agents?{provider.value}_error={error}",
            status_code=302
        )
    
    try:
        oauth_provider = get_oauth_provider(provider, db)
        result = await oauth_provider.handle_callback(code, state)
        
        if result.success:
            frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
            redirect_url = (
                f"{frontend_url}/agents?"
                f"{provider.value}_success=true&"
                f"trigger_id={result.trigger_id}&"
                f"workspace={result.workspace_name or ''}&"
                f"bot_name={result.bot_name or ''}"
            )
            return RedirectResponse(url=redirect_url, status_code=302)
        else:
            frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
            return RedirectResponse(
                url=f"{frontend_url}/agents?{provider.value}_error={result.error}",
                status_code=302
            )
            
    except Exception as e:
        logger.error(f"Error handling {provider.value} callback: {e}")
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        return RedirectResponse(
            url=f"{frontend_url}/agents?{provider.value}_error=callback_failed",
            status_code=302
        )

@router.get("/status/{agent_id}", response_model=IntegrationStatusResponse)
async def get_integration_status(
    agent_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Get integration status for an agent across all providers."""
    try:
        await verify_agent_access(agent_id, user_id)
        
        client = await db.client
        result = await client.table('agent_triggers')\
            .select('trigger_id, trigger_type, name, is_active, created_at, config')\
            .eq('agent_id', agent_id)\
            .in_('trigger_type', ['slack', 'discord', 'teams'])\
            .execute()
        
        integrations = []
        for trigger in result.data:
            # COMMENTED OUT: OAuth installations table deprecated
            # oauth_result = await client.table('oauth_installations')\
            #     .select('provider, provider_data, installed_at')\
            #     .eq('trigger_id', trigger['trigger_id'])\
            #     .execute()
            
            # if oauth_result.data:
            #     oauth_data = oauth_result.data[0]
            #     provider_data = oauth_data.get('provider_data', {})
            
            # Get data from trigger config instead
            config = trigger.get('config', {})
            
            integrations.append({
                "trigger_id": trigger["trigger_id"],
                "provider": trigger["trigger_type"],
                "name": trigger["name"],
                "is_active": trigger["is_active"],
                "workspace_name": config.get("team_name") or config.get("guild_name") or config.get("organization"),
                "bot_name": config.get("bot_name"),
                "installed_at": trigger["created_at"],  # Use trigger creation time
                "created_at": trigger["created_at"]
            })
        
        return IntegrationStatusResponse(
            agent_id=agent_id,
            integrations=integrations
        )
        
    except Exception as e:
        logger.error(f"Error getting integration status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/uninstall/{trigger_id}")
async def uninstall_integration(
    trigger_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Uninstall any OAuth integration."""
    try:
        client = await db.client
        trigger_result = await client.table('agent_triggers')\
            .select('agent_id, trigger_type')\
            .eq('trigger_id', trigger_id)\
            .execute()
        
        if not trigger_result.data:
            raise HTTPException(status_code=404, detail="Integration not found")
        
        agent_id = trigger_result.data[0]['agent_id']
        provider_type = trigger_result.data[0]['trigger_type']
        
        await verify_agent_access(agent_id, user_id)
        
        from .core import TriggerManager
        trigger_manager = TriggerManager(db)
        success = await trigger_manager.delete_trigger(trigger_id)
        
        if success:
            # COMMENTED OUT: OAuth installations table deprecated
            # await client.table('oauth_installations')\
            #     .delete()\
            #     .eq('trigger_id', trigger_id)\
            #     .execute()
            
            return {
                "success": True, 
                "message": f"{provider_type.title()} integration uninstalled successfully"
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to uninstall integration")
            
    except Exception as e:
        logger.error(f"Error uninstalling integration: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def verify_agent_access(agent_id: str, user_id: str):
    """Verify that the user has access to the agent."""
    client = await db.client
    result = await client.table('agents').select('account_id').eq('agent_id', agent_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent = result.data[0]
    if agent['account_id'] != user_id:
        raise HTTPException(status_code=403, detail="Access denied") 