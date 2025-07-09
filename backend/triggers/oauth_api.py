from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import RedirectResponse
from typing import Optional
from pydantic import BaseModel

from .providers.slack_oauth import SlackOAuthManager
from services.supabase import DBConnection
from utils.auth_utils import get_current_user_id_from_jwt
from utils.logger import logger

router = APIRouter(prefix="/integrations/slack", tags=["slack-oauth"])

slack_oauth_manager: Optional[SlackOAuthManager] = None
db = None

def initialize(database: DBConnection):
    """Initialize the Slack OAuth API with database connection."""
    global db, slack_oauth_manager
    db = database
    slack_oauth_manager = SlackOAuthManager(db)

class SlackInstallRequest(BaseModel):
    agent_id: str

class SlackInstallResponse(BaseModel):
    install_url: str
    state: str

class SlackCallbackResponse(BaseModel):
    success: bool
    trigger_id: Optional[str] = None
    workspace_name: Optional[str] = None
    bot_name: Optional[str] = None
    webhook_url: Optional[str] = None
    error: Optional[str] = None

@router.post("/install", response_model=SlackInstallResponse)
async def initiate_slack_install(
    request: SlackInstallRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Initiate Slack OAuth flow for agent installation."""
    if not slack_oauth_manager:
        raise HTTPException(status_code=500, detail="Slack OAuth not initialized")
    
    try:
        await verify_agent_access(request.agent_id, user_id)
        
        install_url = slack_oauth_manager.generate_install_url(request.agent_id, user_id)
        
        from urllib.parse import urlparse, parse_qs
        parsed_url = urlparse(install_url)
        state = parse_qs(parsed_url.query).get('state', [''])[0]
        
        return SlackInstallResponse(
            install_url=install_url,
            state=state
        )
        
    except Exception as e:
        logger.error(f"Error initiating Slack install: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/callback")
async def handle_slack_callback(
    code: str = Query(..., description="OAuth authorization code"),
    state: str = Query(..., description="State parameter"),
    error: Optional[str] = Query(None, description="OAuth error")
):
    """Handle Slack OAuth callback."""
    if not slack_oauth_manager:
        raise HTTPException(status_code=500, detail="Slack OAuth not initialized")
    
    if error:
        logger.error(f"Slack OAuth error: {error}")
        return RedirectResponse(
            url=f"http://localhost:3000/agents?slack_error={error}",
            status_code=302
        )
    
    try:
        result = await slack_oauth_manager.handle_oauth_callback(code, state)
        
        if result["success"]:
            redirect_url = (
                f"http://localhost:3000/agents?"
                f"slack_success=true&"
                f"trigger_id={result['trigger_id']}&"
                f"workspace={result.get('workspace_name', '')}&"
                f"bot_name={result.get('bot_name', '')}"
            )
            return RedirectResponse(url=redirect_url, status_code=302)
        else:
            # Redirect to frontend with error
            return RedirectResponse(
                url=f"http://localhost:3000/agents?slack_error={result['error']}",
                status_code=302
            )
            
    except Exception as e:
        logger.error(f"Error handling Slack callback: {e}")
        return RedirectResponse(
            url=f"http://localhost:3000/agents?slack_error=callback_failed",
            status_code=302
        )

@router.get("/status/{agent_id}")
async def get_slack_status(
    agent_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Get Slack integration status for an agent."""
    try:
        await verify_agent_access(agent_id, user_id)
        
        client = await db.client
        result = await client.table('agent_triggers')\
            .select('trigger_id, name, is_active, config')\
            .eq('agent_id', agent_id)\
            .eq('trigger_type', 'slack')\
            .execute()
        
        slack_triggers = []
        for trigger in result.data:

            
            # Get data from trigger config instead
            config = trigger.get('config', {})
            
            slack_triggers.append({
                "trigger_id": trigger["trigger_id"],
                "name": trigger["name"],
                "is_active": trigger["is_active"],
                "workspace_name": config.get("team_name"),
                "bot_name": config.get("bot_name"),
                "installed_at": None  # No longer tracked separately
            })
        
        return {
            "agent_id": agent_id,
            "has_slack_integration": len(slack_triggers) > 0,
            "slack_triggers": slack_triggers
        }
        
    except Exception as e:
        logger.error(f"Error getting Slack status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/uninstall/{trigger_id}")
async def uninstall_slack_integration(
    trigger_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Uninstall Slack integration for a trigger."""
    try:
        client = await db.client
        trigger_result = await client.table('agent_triggers')\
            .select('agent_id')\
            .eq('trigger_id', trigger_id)\
            .execute()
        
        if not trigger_result.data:
            raise HTTPException(status_code=404, detail="Trigger not found")
        
        agent_id = trigger_result.data[0]['agent_id']
        await verify_agent_access(agent_id, user_id)
        
        from .core import TriggerManager
        trigger_manager = TriggerManager(db)
        success = await trigger_manager.delete_trigger(trigger_id)
        
        if success:

            
            return {"success": True, "message": "Slack integration uninstalled"}
        else:
            raise HTTPException(status_code=500, detail="Failed to uninstall integration")
            
    except Exception as e:
        logger.error(f"Error uninstalling Slack integration: {e}")
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