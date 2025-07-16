import logging
from typing import Dict, List, Any, Optional

from .domain.entities import (
    MCPServerListResult, MCPServerDetail, PopularServersResult,
    MCPConnection, MCPConnectionRequest, ToolExecutionRequest, 
    ToolExecutionResult, CustomMCPConnectionResult
)
from .services.connection_service import ConnectionService
from .services.tool_service import ToolService
from .services.registry_service import RegistryService
from .support.custom_discovery import CustomMCPDiscovery
from .protocols import Logger


class MCPManager:
    def __init__(
        self, 
        registry_service: RegistryService,
        connection_service: ConnectionService,
        tool_service: ToolService,
        custom_discovery: CustomMCPDiscovery,
        logger: Optional[Logger] = None
    ):
        self._logger = logger or logging.getLogger(__name__)
        
        self._registry_service = registry_service
        self._connection_service = connection_service
        self._tool_service = tool_service
        self._custom_discovery = custom_discovery
    
    async def list_servers(
        self, 
        query: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> MCPServerListResult:
        return await self._registry_service.list_servers(query, page, page_size)
    
    async def get_server_details(self, qualified_name: str) -> MCPServerDetail:
        return await self._registry_service.get_server_details(qualified_name)
    
    async def get_popular_servers(self) -> PopularServersResult:
        return await self._registry_service.get_popular_servers()
    
    async def connect_server(self, mcp_config: Dict[str, Any], external_user_id: Optional[str] = None) -> MCPConnection:
        request = MCPConnectionRequest(
            qualified_name=mcp_config.get('qualifiedName', mcp_config.get('name', '')),
            name=mcp_config.get('name', ''),
            config=mcp_config.get('config', {}),
            enabled_tools=mcp_config.get('enabledTools', mcp_config.get('enabled_tools', [])),
            provider=mcp_config.get('provider', 'smithery'),
            external_user_id=external_user_id
        )
        return await self._connection_service.connect_server(request)
    
    async def connect_all(self, mcp_configs: List[Dict[str, Any]]) -> None:
        requests = []
        for config in mcp_configs:
            request = MCPConnectionRequest(
                qualified_name=config.get('qualifiedName', config.get('name', '')),
                name=config.get('name', ''),
                config=config.get('config', {}),
                enabled_tools=config.get('enabledTools', config.get('enabled_tools', [])),
                provider=config.get('provider', 'smithery'),
                external_user_id=config.get('external_user_id')
            )
            requests.append(request)
        
        await self._connection_service.connect_all(requests)
    
    async def disconnect_server(self, qualified_name: str) -> None:
        await self._connection_service.disconnect_server(qualified_name)
    
    async def disconnect_all(self) -> None:
        await self._connection_service.disconnect_all()
    
    def get_connection(self, qualified_name: str) -> Optional[MCPConnection]:
        return self._connection_service.get_connection(qualified_name)
    
    def get_all_connections(self) -> List[MCPConnection]:
        return self._connection_service.get_all_connections()
    
    def get_all_tools_openapi(self) -> List[Dict[str, Any]]:
        return self._tool_service.get_all_tools_openapi()
    
    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any], external_user_id: Optional[str] = None) -> ToolExecutionResult:
        request = ToolExecutionRequest(
            tool_name=tool_name,
            arguments=arguments,
            external_user_id=external_user_id
        )
        return await self._tool_service.execute_tool(request)
    
    def get_tool_info(self, tool_name: str) -> Optional[Dict[str, Any]]:
        return self._tool_service.get_tool_info(tool_name)
    
    def get_tools_by_server(self, qualified_name: str) -> List[Dict[str, Any]]:
        return self._tool_service.get_tools_by_server(qualified_name)
    
    def get_enabled_tools(self) -> List[str]:
        return self._tool_service.get_enabled_tools()
    
    async def discover_custom_tools(self, request_type: str, config: Dict[str, Any]) -> CustomMCPConnectionResult:
        return await self._custom_discovery.discover_tools(request_type, config)
