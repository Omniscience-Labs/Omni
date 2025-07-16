from typing import Dict, List, Optional, Any
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from ..domain.entities import MCPConnection, MCPConnectionRequest
from ..domain.exceptions import MCPConnectionError, MCPProviderError
from ..support.providers import MCPProviderFactory
from ..protocols import Logger


class ConnectionService:
    def __init__(self, provider_factory: MCPProviderFactory, logger: Logger):
        self._provider_factory = provider_factory
        self._logger = logger
        self._connections: Dict[str, MCPConnection] = {}
    
    async def connect_server(self, request: MCPConnectionRequest) -> MCPConnection:
        self._logger.info(f"Connecting to MCP server: {request.qualified_name}")
        
        try:
            provider = self._provider_factory.create_provider(request.provider)
            
            server_url = provider.get_server_url(request.qualified_name, request.config)
            headers = provider.get_headers(
                request.qualified_name, 
                request.config, 
                request.external_user_id
            )
            
            async with streamablehttp_client(server_url, headers=headers) as (
                read_stream, write_stream, _
            ):
                session = ClientSession(read_stream, write_stream)
                await session.initialize()
                
                tool_result = await session.list_tools()
                tools = tool_result.tools if tool_result else []
                
                connection = MCPConnection(
                    qualified_name=request.qualified_name,
                    name=request.name,
                    config=request.config,
                    enabled_tools=request.enabled_tools,
                    provider=request.provider,
                    external_user_id=request.external_user_id,
                    session=session,
                    tools=tools
                )
                
                self._connections[request.qualified_name] = connection
                self._logger.info(f"Connected to {request.qualified_name} ({len(tools)} tools available)")
                
                return connection
                
        except Exception as e:
            self._logger.error(f"Failed to connect to {request.qualified_name}: {str(e)}")
            raise MCPConnectionError(f"Failed to connect to MCP server: {str(e)}")
    
    async def disconnect_server(self, qualified_name: str) -> None:
        connection = self._connections.get(qualified_name)
        if connection and connection.session:
            try:
                await connection.session.close()
                self._logger.info(f"Disconnected from {qualified_name}")
            except Exception as e:
                self._logger.warning(f"Error disconnecting from {qualified_name}: {str(e)}")
        
        self._connections.pop(qualified_name, None)
    
    async def disconnect_all(self) -> None:
        for qualified_name in list(self._connections.keys()):
            await self.disconnect_server(qualified_name)
        self._connections.clear()
        self._logger.info("Disconnected from all MCP servers")
    
    def get_connection(self, qualified_name: str) -> Optional[MCPConnection]:
        return self._connections.get(qualified_name)
    
    def get_all_connections(self) -> List[MCPConnection]:
        return list(self._connections.values())
    
    def is_connected(self, qualified_name: str) -> bool:
        connection = self._connections.get(qualified_name)
        return connection is not None and connection.session is not None
    
    async def connect_all(self, requests: List[MCPConnectionRequest]) -> None:
        for request in requests:
            try:
                await self.connect_server(request)
            except MCPConnectionError as e:
                self._logger.error(f"Failed to connect to {request.qualified_name}: {str(e)}")
                continue 