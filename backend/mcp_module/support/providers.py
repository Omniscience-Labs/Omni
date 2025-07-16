import os
import json
import base64
from typing import Dict, Any, Optional
from ..protocols import MCPProvider, Logger
from ..domain.exceptions import MCPProviderError, MCPAuthenticationError


class SmitheryProvider:
    def __init__(self, logger: Logger):
        self._logger = logger
        self._base_url = "https://server.smithery.ai"
        self._api_key = os.getenv("SMITHERY_API_KEY")
    
    def get_server_url(self, qualified_name: str, config: Dict[str, Any]) -> str:
        if not self._api_key:
            raise MCPAuthenticationError("SMITHERY_API_KEY environment variable is not set")
        
        config_json = json.dumps(config)
        config_b64 = base64.b64encode(config_json.encode()).decode()
        
        return f"{self._base_url}/{qualified_name}/mcp?config={config_b64}&api_key={self._api_key}"
    
    def get_headers(self, qualified_name: str, config: Dict[str, Any], external_user_id: Optional[str] = None) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if external_user_id:
            headers["X-External-User-Id"] = external_user_id
        return headers


class CustomProvider:
    def __init__(self, logger: Logger):
        self._logger = logger
    
    def get_server_url(self, qualified_name: str, config: Dict[str, Any]) -> str:
        url = config.get("url")
        if not url:
            raise MCPProviderError(f"URL not provided for custom MCP server: {qualified_name}")
        return url
    
    def get_headers(self, qualified_name: str, config: Dict[str, Any], external_user_id: Optional[str] = None) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        
        if "headers" in config:
            headers.update(config["headers"])
        
        if external_user_id:
            headers["X-External-User-Id"] = external_user_id
        
        return headers


class MCPProviderFactory:
    def __init__(self, logger: Logger):
        self._logger = logger
        self._providers = {
            'smithery': SmitheryProvider(logger),
            'custom': CustomProvider(logger),
            'http': CustomProvider(logger),
            'sse': CustomProvider(logger)
        }
    
    def create_provider(self, provider_type: str) -> MCPProvider:
        provider = self._providers.get(provider_type)
        if not provider:
            raise MCPProviderError(f"Unknown provider type: {provider_type}")
        return provider
    
    def get_available_providers(self) -> list[str]:
        return list(self._providers.keys()) 