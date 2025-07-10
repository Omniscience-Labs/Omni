import httpx
import secrets
import json
from typing import Dict, Any, Optional
from urllib.parse import urlencode
import os
from utils.logger import logger
from services.supabase import DBConnection

class SlackOAuthManager:
    """Manages Slack OAuth flow for agent installation."""
    
    def __init__(self, db_connection: DBConnection):
        self.db = db_connection
        self.client_id = os.getenv("SLACK_CLIENT_ID")
        self.client_secret = os.getenv("SLACK_CLIENT_SECRET")
        self.redirect_uri = os.getenv("SLACK_REDIRECT_URI", "http://localhost:3000/api/integrations/slack/callback")
        
    def generate_install_url(self, agent_id: str, user_id: str) -> str:
        """Generate Slack app installation URL with state parameter."""
        state = self._create_state_token(agent_id, user_id)
        
        params = {
            "client_id": self.client_id,
            "scope": "app_mentions:read,channels:read,chat:write,im:read,im:write,users:read",
            "redirect_uri": self.redirect_uri,
            "state": state
        }
        
        return f"https://slack.com/oauth/v2/authorize?{urlencode(params)}"
    
    async def handle_oauth_callback(self, code: str, state: str) -> Dict[str, Any]:
        """Handle OAuth callback and set up agent trigger."""
        try:
            # Verify state and extract agent/user info
            state_data = await self._verify_state_token(state)
            if not state_data:
                return {"success": False, "error": "Invalid state parameter"}
            
            agent_id = state_data["agent_id"]
            user_id = state_data["user_id"]
            
            # Exchange code for access token
            token_data = await self._exchange_code_for_token(code)
            if not token_data:
                return {"success": False, "error": "Failed to exchange code for token"}
            
            # Get workspace and bot info
            workspace_info = await self._get_workspace_info(token_data["access_token"])
            bot_info = await self._get_bot_info(token_data["bot_user_id"], token_data["access_token"])
            
            # Create trigger configuration
            trigger_config = await self._create_agent_trigger(
                agent_id=agent_id,
                user_id=user_id,
                workspace_info=workspace_info,
                bot_info=bot_info,
                oauth_data=token_data
            )
            
            return {
                "success": True,
                "trigger_id": trigger_config["trigger_id"],
                "workspace_name": workspace_info.get("team", {}).get("name"),
                "bot_name": bot_info.get("name"),
                "webhook_url": trigger_config["webhook_url"]
            }
            
        except Exception as e:
            logger.error(f"Error handling Slack OAuth callback: {e}")
            return {"success": False, "error": str(e)}
    
    async def _exchange_code_for_token(self, code: str) -> Optional[Dict[str, Any]]:
        """Exchange OAuth code for access token."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://slack.com/api/oauth.v2.access",
                    data={
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                        "code": code,
                        "redirect_uri": self.redirect_uri
                    }
                )
                
                data = response.json()
                if data.get("ok"):
                    return {
                        "access_token": data["access_token"],
                        "bot_user_id": data["bot_user_id"],
                        "team_id": data["team"]["id"],
                        "team_name": data["team"]["name"],
                        "scope": data["scope"],
                        "app_id": data["app_id"]
                    }
                else:
                    logger.error(f"Slack OAuth error: {data.get('error')}")
                    return None
                    
        except Exception as e:
            logger.error(f"Error exchanging code for token: {e}")
            return None
    
    async def _get_workspace_info(self, access_token: str) -> Dict[str, Any]:
        """Get workspace information."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://slack.com/api/team.info",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                
                data = response.json()
                return data if data.get("ok") else {}
                
        except Exception as e:
            logger.error(f"Error getting workspace info: {e}")
            return {}
    
    async def _get_bot_info(self, bot_user_id: str, access_token: str) -> Dict[str, Any]:
        """Get bot user information."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"https://slack.com/api/users.info?user={bot_user_id}",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                
                data = response.json()
                return data.get("user", {}) if data.get("ok") else {}
                
        except Exception as e:
            logger.error(f"Error getting bot info: {e}")
            return {}
    
    async def _create_agent_trigger(
        self, 
        agent_id: str, 
        user_id: str,
        workspace_info: Dict[str, Any], 
        bot_info: Dict[str, Any],
        oauth_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create agent trigger with OAuth data."""
        from ..core import TriggerManager
        
        trigger_manager = TriggerManager(self.db)
        await trigger_manager.load_provider_definitions()
        
        config = {
            "access_token": oauth_data["access_token"],
            "bot_user_id": oauth_data["bot_user_id"],
            "team_id": oauth_data["team_id"],
            "team_name": oauth_data["team_name"],
            "bot_name": bot_info.get("name", "Agent Bot"),
            "respond_to_mentions": True,
            "respond_to_direct_messages": True,
            "allowed_channels": [],
            "trigger_keywords": [],
            "oauth_installed": True
        }
        
        trigger_config = await trigger_manager.create_trigger(
            agent_id=agent_id,
            provider_id="slack_oauth",
            name=f"Slack - {oauth_data['team_name']}",
            description=f"Auto-configured Slack integration for {oauth_data['team_name']} workspace",
            config=config
        )
        
        # COMMENTED OUT: OAuth installations functionality deprecated
        # await self._store_oauth_data(trigger_config.trigger_id, oauth_data, workspace_info, bot_info)
        
        base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
        # Slack requires a single Event Request URL per app
        webhook_url = f"{base_url}/api/triggers/slack/webhook"
        
        return {
            "trigger_id": trigger_config.trigger_id,
            "webhook_url": webhook_url
        }
    
    def _create_state_token(self, agent_id: str, user_id: str) -> str:
        state_data = {
            "agent_id": agent_id,
            "user_id": user_id,
            "nonce": secrets.token_urlsafe(16)
        }
        import base64
        state_json = json.dumps(state_data)
        return base64.b64encode(state_json.encode()).decode()
    
    async def _verify_state_token(self, state: str) -> Optional[Dict[str, Any]]:
        """Verify and decode state token."""
        try:
            import base64
            state_json = base64.b64decode(state.encode()).decode()
            return json.loads(state_json)
        except Exception as e:
            logger.error(f"Error verifying state token: {e}")
            return None
    
    # COMMENTED OUT: OAuth installations functionality deprecated
    # async def _store_oauth_data(
    #     self, 
    #     trigger_id: str, 
    #     oauth_data: Dict[str, Any], 
    #     workspace_info: Dict[str, Any], 
    #     bot_info: Dict[str, Any]
    # ):
    #     """Store OAuth data for the trigger."""
    #     client = await self.db.client
    #     await client.table('slack_oauth_installations').insert({
    #         'trigger_id': trigger_id,
    #         'team_id': oauth_data['team_id'],
    #         'team_name': oauth_data['team_name'],
    #         'access_token': oauth_data['access_token'],
    #         'bot_user_id': oauth_data['bot_user_id'],
    #         'bot_name': bot_info.get('name'),
    #         'app_id': oauth_data['app_id'],
    #         'scope': oauth_data['scope'],
    #         'workspace_info': workspace_info,
    #         'bot_info': bot_info,
    #         'installed_at': 'now()'
    #     }).execute() 