"""
Global configuration management for Kortix SDK
"""

import os
from typing import Optional


class GlobalConfig:
    """Global configuration for Kortix SDK"""
    
    def __init__(self):
        self._api_key: Optional[str] = None
        self._api_url: Optional[str] = None
        self._default_model: str = "anthropic/claude-sonnet-4-20250514"
    
    def set_api_key(self, api_key: str) -> None:
        """Set the API key for authentication"""
        self._api_key = api_key
    
    def set_api_url(self, api_url: str) -> None:
        """Set the base API URL"""
        if api_url.endswith('/'):
            api_url = api_url[:-1]
        self._api_url = api_url
    
    def set_default_model(self, model: str) -> None:
        """Set the default model for agent creation"""
        self._default_model = model
    
    @property
    def api_key(self) -> str:
        """Get the current API key"""
        if self._api_key:
            return self._api_key
        
        # Try environment variable as fallback
        env_key = os.getenv("KORTIX_API_KEY")
        if env_key:
            return env_key
            
        raise ValueError("API key not set. Use global_config.set_api_key() or set KORTIX_API_KEY environment variable")
    
    @property
    def api_url(self) -> str:
        """Get the current API URL"""
        if self._api_url:
            return self._api_url
            
        # Try environment variable as fallback
        env_url = os.getenv("KORTIX_API_URL")
        if env_url:
            if env_url.endswith('/'):
                env_url = env_url[:-1]
            return env_url
            
        raise ValueError("API URL not set. Use global_config.set_api_url() or set KORTIX_API_URL environment variable")
    
    @property
    def default_model(self) -> str:
        """Get the default model"""
        return self._default_model


# Global singleton instance
global_config = GlobalConfig() 