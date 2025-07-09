import abc
import secrets
import json
import base64
from typing import Dict, Any, Optional, List
from urllib.parse import urlencode
from dataclasses import dataclass
from enum import Enum
import httpx
from utils.logger import logger

class OAuthProvider(str, Enum):
    """Supported OAuth providers."""
    SLACK = "slack"
    DISCORD = "discord"
    TEAMS = "teams"
    GITHUB = "github"
    GOOGLE = "google"
    NOTION = "notion"

@dataclass
class OAuthConfig:
    """OAuth configuration for a provider."""
    provider: OAuthProvider
    client_id: str
    client_secret: str
    authorization_url: str
    token_url: str
    scopes: List[str]
    redirect_uri: str
    user_info_url: Optional[str] = None
    additional_params: Dict[str, str] = None

@dataclass
class OAuthTokenResponse:
    """Standardized OAuth token response."""
    access_token: str
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None
    scope: Optional[str] = None
    token_type: str = "Bearer"
    additional_data: Dict[str, Any] = None

@dataclass
class IntegrationResult:
    """Result of OAuth integration setup."""
    success: bool
    trigger_id: Optional[str] = None
    provider_name: str = ""
    workspace_name: Optional[str] = None
    bot_name: Optional[str] = None
    webhook_url: Optional[str] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = None

class BaseOAuthProvider(abc.ABC):
    """Base class for OAuth providers."""
    
    def __init__(self, config: OAuthConfig, db_connection):
        self.config = config
        self.db = db_connection
        
    def generate_authorization_url(self, agent_id: str, user_id: str) -> str:
        """Generate OAuth authorization URL."""
        state = self._create_state_token(agent_id, user_id)
        
        params = {
            "client_id": self.config.client_id,
            "redirect_uri": self.config.redirect_uri,
            "scope": " ".join(self.config.scopes),
            "state": state,
            "response_type": "code"
        }
        
        # Add provider-specific parameters
        if self.config.additional_params:
            params.update(self.config.additional_params)
        
        return f"{self.config.authorization_url}?{urlencode(params)}"
    
    async def handle_callback(self, code: str, state: str) -> IntegrationResult:
        """Handle OAuth callback and set up integration."""
        try:
            # Verify state
            state_data = await self._verify_state_token(state)
            if not state_data:
                return IntegrationResult(
                    success=False,
                    error="Invalid state parameter",
                    provider_name=self.config.provider.value
                )
            
            # Exchange code for token
            token_response = await self._exchange_code_for_token(code)
            if not token_response:
                return IntegrationResult(
                    success=False,
                    error="Failed to exchange code for token",
                    provider_name=self.config.provider.value
                )
            
            # Get provider-specific data
            provider_data = await self._get_provider_data(token_response)
            
            # Create trigger
            trigger_result = await self._create_trigger(
                state_data["agent_id"],
                state_data["user_id"],
                token_response,
                provider_data
            )
            
            return IntegrationResult(
                success=True,
                trigger_id=trigger_result["trigger_id"],
                provider_name=self.config.provider.value,
                workspace_name=provider_data.get("workspace_name"),
                bot_name=provider_data.get("bot_name"),
                webhook_url=trigger_result["webhook_url"],
                metadata=provider_data
            )
            
        except Exception as e:
            logger.error(f"Error handling {self.config.provider.value} OAuth callback: {e}")
            return IntegrationResult(
                success=False,
                error=str(e),
                provider_name=self.config.provider.value
            )
    
    async def _exchange_code_for_token(self, code: str) -> Optional[OAuthTokenResponse]:
        """Exchange authorization code for access token."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.config.token_url,
                    data={
                        "client_id": self.config.client_id,
                        "client_secret": self.config.client_secret,
                        "code": code,
                        "redirect_uri": self.config.redirect_uri,
                        "grant_type": "authorization_code"
                    }
                )
                
                data = response.json()
                
                if response.status_code == 200 and self._is_token_response_valid(data):
                    return OAuthTokenResponse(
                        access_token=data["access_token"],
                        refresh_token=data.get("refresh_token"),
                        expires_in=data.get("expires_in"),
                        scope=data.get("scope"),
                        token_type=data.get("token_type", "Bearer"),
                        additional_data=data
                    )
                else:
                    logger.error(f"Token exchange failed: {data}")
                    return None
                    
        except Exception as e:
            logger.error(f"Error exchanging code for token: {e}")
            return None
    
    @abc.abstractmethod
    async def _get_provider_data(self, token_response: OAuthTokenResponse) -> Dict[str, Any]:
        """Get provider-specific data (workspace info, bot info, etc.)."""
        pass
    
    @abc.abstractmethod
    def _is_token_response_valid(self, data: Dict[str, Any]) -> bool:
        """Check if token response is valid for this provider."""
        pass
    
    @abc.abstractmethod
    def _get_trigger_config(self, token_response: OAuthTokenResponse, provider_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate trigger configuration for this provider."""
        pass
    
    async def _create_trigger(
        self, 
        agent_id: str, 
        user_id: str, 
        token_response: OAuthTokenResponse, 
        provider_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create trigger with provider-specific configuration."""
        from ..core import TriggerManager
        
        trigger_manager = TriggerManager(self.db)
        await trigger_manager.load_provider_definitions()
        
        config = self._get_trigger_config(token_response, provider_data)
        config["oauth_installed"] = True
        config["provider"] = self.config.provider.value
        
        trigger_config = await trigger_manager.create_trigger(
            agent_id=agent_id,
            provider_id=self.config.provider.value,
            name=f"{self.config.provider.value.title()} - {provider_data.get('workspace_name', 'Integration')}",
            description=f"Auto-configured {self.config.provider.value.title()} integration",
            config=config
        )
        
        # Store OAuth data
        
        # await self._store_oauth_data(trigger_config.trigger_id, token_response, provider_data)
        
        import os
        base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
        # For Slack, use the universal webhook URL (no trigger_id parameter)
        # Slack requires a single Event Request URL per app
        if self.config.provider == OAuthProvider.SLACK:
            webhook_url = f"{base_url}/api/triggers/slack/webhook"
        else:
            webhook_url = f"{base_url}/api/triggers/{trigger_config.trigger_id}/webhook"
        
        return {
            "trigger_id": trigger_config.trigger_id,
            "webhook_url": webhook_url
        }
    
    def _create_state_token(self, agent_id: str, user_id: str) -> str:
        """Create secure state token."""
        state_data = {
            "agent_id": agent_id,
            "user_id": user_id,
            "provider": self.config.provider.value,
            "nonce": secrets.token_urlsafe(16)
        }
        
        state_json = json.dumps(state_data)
        return base64.b64encode(state_json.encode()).decode()
    
    async def _verify_state_token(self, state: str) -> Optional[Dict[str, Any]]:
        """Verify and decode state token."""
        try:
            state_json = base64.b64decode(state.encode()).decode()
            state_data = json.loads(state_json)
            
            # Verify provider matches
            if state_data.get("provider") != self.config.provider.value:
                return None
                
            return state_data
        except Exception as e:
            logger.error(f"Error verifying state token: {e}")
            return None
