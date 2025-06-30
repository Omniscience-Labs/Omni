"""
Specific OAuth provider implementations.

Each provider extends BaseOAuthProvider with minimal provider-specific code.
"""

import os
from typing import Dict, Any
from .base import BaseOAuthProvider, OAuthConfig, OAuthProvider, OAuthTokenResponse
import httpx

class SlackOAuthProvider(BaseOAuthProvider):
    """Slack OAuth provider implementation."""
    
    def __init__(self, db_connection):
        config = OAuthConfig(
            provider=OAuthProvider.SLACK,
            client_id=os.getenv("SLACK_CLIENT_ID"),
            client_secret=os.getenv("SLACK_CLIENT_SECRET"),
            authorization_url="https://slack.com/oauth/v2/authorize",
            token_url="https://slack.com/api/oauth.v2.access",
            scopes=["app_mentions:read", "channels:read", "chat:write", "im:read", "im:write", "users:read"],
            redirect_uri=os.getenv("SLACK_REDIRECT_URI", "http://localhost:3000/integrations/slack/callback")
        )
        super().__init__(config, db_connection)
    
    def _is_token_response_valid(self, data: Dict[str, Any]) -> bool:
        return data.get("ok") is True
    
    async def _get_provider_data(self, token_response: OAuthTokenResponse) -> Dict[str, Any]:
        """Get Slack-specific data."""
        access_token = token_response.access_token
        additional_data = token_response.additional_data
        
        # Get workspace info
        workspace_info = await self._get_workspace_info(access_token)
        
        # Get bot info
        bot_user_id = additional_data.get("bot_user_id")
        bot_info = await self._get_bot_info(bot_user_id, access_token) if bot_user_id else {}
        
        return {
            "workspace_name": additional_data.get("team", {}).get("name"),
            "workspace_id": additional_data.get("team", {}).get("id"),
            "bot_name": bot_info.get("name", "Agent Bot"),
            "bot_user_id": bot_user_id,
            "app_id": additional_data.get("app_id"),
            "workspace_info": workspace_info,
            "bot_info": bot_info
        }
    
    def _get_trigger_config(self, token_response: OAuthTokenResponse, provider_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate Slack trigger configuration."""
        return {
            "access_token": token_response.access_token,
            "bot_user_id": provider_data.get("bot_user_id"),
            "team_id": provider_data.get("workspace_id"),
            "team_name": provider_data.get("workspace_name"),
            "bot_name": provider_data.get("bot_name"),
            "respond_to_mentions": True,
            "respond_to_direct_messages": True,
            "allowed_channels": [],
            "trigger_keywords": []
        }
    
    async def _get_workspace_info(self, access_token: str) -> Dict[str, Any]:
        """Get Slack workspace information."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://slack.com/api/team.info",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                data = response.json()
                return data if data.get("ok") else {}
        except Exception:
            return {}
    
    async def _get_bot_info(self, bot_user_id: str, access_token: str) -> Dict[str, Any]:
        """Get Slack bot information."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"https://slack.com/api/users.info?user={bot_user_id}",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                data = response.json()
                return data.get("user", {}) if data.get("ok") else {}
        except Exception:
            return {}

class DiscordOAuthProvider(BaseOAuthProvider):
    """Discord OAuth provider implementation."""
    
    def __init__(self, db_connection):
        config = OAuthConfig(
            provider=OAuthProvider.DISCORD,
            client_id=os.getenv("DISCORD_CLIENT_ID"),
            client_secret=os.getenv("DISCORD_CLIENT_SECRET"),
            authorization_url="https://discord.com/api/oauth2/authorize",
            token_url="https://discord.com/api/oauth2/token",
            scopes=["bot", "applications.commands"],
            redirect_uri=os.getenv("DISCORD_REDIRECT_URI", "http://localhost:3000/integrations/discord/callback"),
            additional_params={"permissions": "2048"}
        )
        super().__init__(config, db_connection)
    
    def _is_token_response_valid(self, data: Dict[str, Any]) -> bool:
        return "access_token" in data
    
    async def _get_provider_data(self, token_response: OAuthTokenResponse) -> Dict[str, Any]:
        """Get Discord-specific data."""
        # Get guild info from additional_data (Discord includes it in token response)
        guild_info = token_response.additional_data.get("guild", {})
        
        return {
            "workspace_name": guild_info.get("name", "Discord Server"),
            "workspace_id": guild_info.get("id"),
            "bot_name": "Agent Bot",
            "permissions": token_response.additional_data.get("permissions"),
            "guild_info": guild_info
        }
    
    def _get_trigger_config(self, token_response: OAuthTokenResponse, provider_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate Discord trigger configuration."""
        return {
            "access_token": token_response.access_token,
            "guild_id": provider_data.get("workspace_id"),
            "guild_name": provider_data.get("workspace_name"),
            "bot_permissions": provider_data.get("permissions"),
            "respond_to_mentions": True,
            "respond_to_direct_messages": True,
            "allowed_channels": [],
            "trigger_keywords": []
        }

class TeamsOAuthProvider(BaseOAuthProvider):
    """Microsoft Teams OAuth provider implementation."""
    
    def __init__(self, db_connection):
        config = OAuthConfig(
            provider=OAuthProvider.TEAMS,
            client_id=os.getenv("TEAMS_CLIENT_ID"),
            client_secret=os.getenv("TEAMS_CLIENT_SECRET"),
            authorization_url="https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            token_url="https://login.microsoftonline.com/common/oauth2/v2.0/token",
            scopes=["https://graph.microsoft.com/ChannelMessage.Read.All", "https://graph.microsoft.com/ChannelMessage.Send"],
            redirect_uri=os.getenv("TEAMS_REDIRECT_URI", "http://localhost:3000/integrations/teams/callback")
        )
        super().__init__(config, db_connection)
    
    def _is_token_response_valid(self, data: Dict[str, Any]) -> bool:
        return "access_token" in data
    
    async def _get_provider_data(self, token_response: OAuthTokenResponse) -> Dict[str, Any]:
        """Get Teams-specific data."""
        # Get user/organization info
        user_info = await self._get_user_info(token_response.access_token)
        
        return {
            "workspace_name": user_info.get("organization", "Teams Organization"),
            "workspace_id": user_info.get("tenantId"),
            "bot_name": "Agent Bot",
            "user_info": user_info
        }
    
    def _get_trigger_config(self, token_response: OAuthTokenResponse, provider_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate Teams trigger configuration."""
        return {
            "access_token": token_response.access_token,
            "tenant_id": provider_data.get("workspace_id"),
            "organization": provider_data.get("workspace_name"),
            "respond_to_mentions": True,
            "respond_to_direct_messages": True,
            "allowed_teams": [],
            "trigger_keywords": []
        }
    
    async def _get_user_info(self, access_token: str) -> Dict[str, Any]:
        """Get Teams user information."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://graph.microsoft.com/v1.0/me",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                return response.json() if response.status_code == 200 else {}
        except Exception:
            return {}

# Provider registry for easy access
OAUTH_PROVIDERS = {
    OAuthProvider.SLACK: SlackOAuthProvider,
    OAuthProvider.DISCORD: DiscordOAuthProvider,
    OAuthProvider.TEAMS: TeamsOAuthProvider,
}

def get_oauth_provider(provider: OAuthProvider, db_connection):
    """Factory function to get OAuth provider instance."""
    provider_class = OAUTH_PROVIDERS.get(provider)
    if not provider_class:
        raise ValueError(f"Unsupported OAuth provider: {provider}")
    
    return provider_class(db_connection) 