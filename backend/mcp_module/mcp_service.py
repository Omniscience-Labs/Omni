import os
import json
import base64
import asyncio
import logging
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from collections import OrderedDict
import httpx
from urllib.parse import quote

from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamablehttp_client

from utils.logger import logger
from credentials import EncryptionService


class MCPException(Exception):
    pass

class MCPConnectionError(MCPException):
    pass

class MCPServerNotFoundError(MCPException):
    pass

class MCPToolNotFoundError(MCPException):
    pass

class MCPToolExecutionError(MCPException):
    pass

class MCPProviderError(MCPException):
    pass

class MCPConfigurationError(MCPException):
    pass

class MCPRegistryError(MCPException):
    pass

class MCPAuthenticationError(MCPException):
    pass

class CustomMCPError(MCPException):
    pass


@dataclass(frozen=True)
class MCPServer:
    qualified_name: str
    display_name: str
    description: str
    created_at: str
    use_count: int
    homepage: str
    icon_url: Optional[str] = None
    is_deployed: Optional[bool] = None
    tools: Optional[List[Dict[str, Any]]] = None
    security: Optional[Dict[str, Any]] = None


@dataclass(frozen=True)
class MCPConnection:
    qualified_name: str
    name: str
    config: Dict[str, Any]
    enabled_tools: List[str]
    provider: str = 'smithery'
    external_user_id: Optional[str] = None
    session: Optional[ClientSession] = field(default=None, compare=False)
    tools: Optional[List[Any]] = field(default=None, compare=False)


@dataclass(frozen=True)
class MCPServerDetail:
    qualified_name: str
    display_name: str
    icon_url: Optional[str] = None
    deployment_url: Optional[str] = None
    connections: List[Dict[str, Any]] = field(default_factory=list)
    security: Optional[Dict[str, Any]] = None
    tools: Optional[List[Dict[str, Any]]] = None


@dataclass(frozen=True)
class MCPServerListResult:
    servers: List[MCPServer]
    pagination: Dict[str, int]


@dataclass(frozen=True)
class PopularServersResult:
    success: bool
    servers: List[Dict[str, Any]]
    categorized: Dict[str, List[Dict[str, Any]]]
    total: int
    category_count: int
    pagination: Dict[str, int]


@dataclass(frozen=True)
class ToolInfo:
    name: str
    description: str
    input_schema: Dict[str, Any]


@dataclass(frozen=True)
class CustomMCPConnectionResult:
    success: bool
    qualified_name: str
    display_name: str
    tools: List[Dict[str, Any]]
    config: Dict[str, Any]
    url: str
    message: str


@dataclass
class MCPConnectionRequest:
    qualified_name: str
    name: str
    config: Dict[str, Any]
    enabled_tools: List[str]
    provider: str = 'smithery'
    external_user_id: Optional[str] = None


@dataclass
class ToolExecutionRequest:
    tool_name: str
    arguments: Dict[str, Any]
    external_user_id: Optional[str] = None


@dataclass
class ToolExecutionResult:
    success: bool
    result: Any
    error: Optional[str] = None


class MCPService:
    def __init__(self):
        self._logger = logger
        self._connections: Dict[str, MCPConnection] = {}
        self._encryption_service = EncryptionService()
        
        self._registry_base_url = "https://registry.smithery.ai"
        self._server_base_url = "https://server.smithery.ai"
        self._api_key = os.getenv("SMITHERY_API_KEY")

    async def list_servers(
        self, 
        query: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> MCPServerListResult:
        self._logger.info(f"Listing MCP servers (page {page}, size {page_size})")
        if query:
            self._logger.info(f"Search query: {query}")
        
        try:
            params = {
                "page": page,
                "pageSize": page_size
            }
            if query:
                params["q"] = query
            
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self._registry_base_url}/api/v1/packages", params=params)
                response.raise_for_status()
                data = response.json()
            
            servers = []
            for item in data.get("packages", []):
                servers.append(MCPServer(
                    qualified_name=item["qualifiedName"],
                    display_name=item["displayName"],
                    description=item["description"],
                    created_at=item["createdAt"],
                    use_count=item["useCount"],
                    homepage=item["homepage"]
                ))
            
            return MCPServerListResult(
                servers=servers,
                pagination=data.get("pagination", {})
            )
            
        except httpx.HTTPError as e:
            self._logger.error(f"Error fetching MCP servers: {str(e)}")
            raise MCPRegistryError(f"Failed to fetch MCP servers: {str(e)}")
    
    async def get_server_details(self, qualified_name: str) -> MCPServerDetail:
        self._logger.info(f"Getting details for MCP server: {qualified_name}")
        
        try:
            encoded_name = quote(qualified_name, safe='')
            
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self._registry_base_url}/api/v1/packages/{encoded_name}")
                
                if response.status_code == 404:
                    raise MCPServerNotFoundError(f"MCP server not found: {qualified_name}")
                
                response.raise_for_status()
                data = response.json()
            
            return MCPServerDetail(
                qualified_name=data["qualifiedName"],
                display_name=data["displayName"],
                icon_url=data.get("iconUrl"),
                deployment_url=data.get("deploymentUrl"),
                connections=data.get("connections", []),
                security=data.get("security"),
                tools=data.get("tools")
            )
            
        except httpx.HTTPError as e:
            if e.response and e.response.status_code == 404:
                raise MCPServerNotFoundError(f"MCP server not found: {qualified_name}")
            self._logger.error(f"Error fetching MCP server details: {str(e)}")
            raise MCPRegistryError(f"Failed to fetch MCP server details: {str(e)}")
    
    async def get_popular_servers(self) -> PopularServersResult:
        self._logger.info("Getting popular MCP servers")
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self._registry_base_url}/api/v1/packages/popular")
                response.raise_for_status()
                data = response.json()
            
            return PopularServersResult(
                success=data.get("success", True),
                servers=data.get("servers", []),
                categorized=data.get("categorized", {}),
                total=data.get("total", 0),
                category_count=data.get("categoryCount", 0),
                pagination=data.get("pagination", {})
            )
            
        except httpx.HTTPError as e:
            self._logger.error(f"Error fetching popular MCP servers: {str(e)}")
            raise MCPRegistryError(f"Failed to fetch popular MCP servers: {str(e)}")

    async def connect_server(self, mcp_config: Dict[str, Any], external_user_id: Optional[str] = None) -> MCPConnection:
        request = MCPConnectionRequest(
            qualified_name=mcp_config.get('qualifiedName', mcp_config.get('name', '')),
            name=mcp_config.get('name', ''),
            config=mcp_config.get('config', {}),
            enabled_tools=mcp_config.get('enabledTools', mcp_config.get('enabled_tools', [])),
            provider=mcp_config.get('provider', 'smithery'),
            external_user_id=external_user_id
        )
        return await self._connect_server_internal(request)
    
    async def _connect_server_internal(self, request: MCPConnectionRequest) -> MCPConnection:
        self._logger.info(f"Connecting to MCP server: {request.qualified_name}")
        
        try:
            server_url = self._get_server_url(request.qualified_name, request.config, request.provider)
            headers = self._get_headers(request.qualified_name, request.config, request.provider, request.external_user_id)
            
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
        
        for request in requests:
            try:
                await self._connect_server_internal(request)
            except MCPConnectionError as e:
                self._logger.error(f"Failed to connect to {request.qualified_name}: {str(e)}")
                continue
    
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

    def get_all_tools_openapi(self) -> List[Dict[str, Any]]:
        tools = []
        
        for connection in self.get_all_connections():
            if not connection.tools:
                continue
            
            for tool in connection.tools:
                if tool.name not in connection.enabled_tools:
                    continue
                
                openapi_tool = {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.inputSchema
                    }
                }
                tools.append(openapi_tool)
        
        return tools
    
    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any], external_user_id: Optional[str] = None) -> ToolExecutionResult:
        request = ToolExecutionRequest(
            tool_name=tool_name,
            arguments=arguments,
            external_user_id=external_user_id
        )
        return await self._execute_tool_internal(request)
    
    async def _execute_tool_internal(self, request: ToolExecutionRequest) -> ToolExecutionResult:
        self._logger.info(f"Executing tool: {request.tool_name}")
        
        connection = self._find_tool_connection(request.tool_name)
        if not connection:
            raise MCPToolNotFoundError(f"Tool not found: {request.tool_name}")
        
        if not connection.session:
            raise MCPToolExecutionError(f"No active session for tool: {request.tool_name}")
        
        if request.tool_name not in connection.enabled_tools:
            raise MCPToolExecutionError(f"Tool not enabled: {request.tool_name}")
        
        try:
            result = await connection.session.call_tool(request.tool_name, request.arguments)
            
            self._logger.info(f"Tool {request.tool_name} executed successfully")
            
            if hasattr(result, 'content'):
                content = result.content
                if isinstance(content, list) and content:
                    if hasattr(content[0], 'text'):
                        result_data = content[0].text
                    else:
                        result_data = str(content[0])
                else:
                    result_data = str(content)
            else:
                result_data = str(result)
            
            return ToolExecutionResult(
                success=True,
                result=result_data
            )
            
        except Exception as e:
            error_msg = f"Tool execution failed: {str(e)}"
            self._logger.error(error_msg)
            
            return ToolExecutionResult(
                success=False,
                result=None,
                error=error_msg
            )
    
    def get_tool_info(self, tool_name: str) -> Optional[Dict[str, Any]]:
        connection = self._find_tool_connection(tool_name)
        if not connection or not connection.tools:
            return None
        
        for tool in connection.tools:
            if tool.name == tool_name:
                return {
                    "name": tool.name,
                    "description": tool.description,
                    "inputSchema": tool.inputSchema,
                    "server": connection.qualified_name,
                    "enabled": tool_name in connection.enabled_tools
                }
        
        return None
    
    def get_tools_by_server(self, qualified_name: str) -> List[Dict[str, Any]]:
        connection = self.get_connection(qualified_name)
        if not connection or not connection.tools:
            return []
        
        tools = []
        for tool in connection.tools:
            tools.append({
                "name": tool.name,
                "description": tool.description,
                "inputSchema": tool.inputSchema,
                "enabled": tool.name in connection.enabled_tools
            })
        
        return tools
    
    def get_enabled_tools(self) -> List[str]:
        enabled_tools = []
        
        for connection in self.get_all_connections():
            enabled_tools.extend(connection.enabled_tools)
        
        return enabled_tools
    
    def _find_tool_connection(self, tool_name: str) -> Optional[MCPConnection]:
        for connection in self.get_all_connections():
            if not connection.tools:
                continue
            
            for tool in connection.tools:
                if tool.name == tool_name:
                    return connection
        
        return None

    async def discover_custom_tools(self, request_type: str, config: Dict[str, Any]) -> CustomMCPConnectionResult:
        if request_type == "http":
            return await self._discover_http_tools(config)
        elif request_type == "sse":
            return await self._discover_sse_tools(config)
        else:
            raise CustomMCPError(f"Unsupported request type: {request_type}")
    
    async def _discover_http_tools(self, config: Dict[str, Any]) -> CustomMCPConnectionResult:
        url = config.get("url")
        if not url:
            raise CustomMCPError("URL is required for HTTP MCP connections")
        
        try:
            async with streamablehttp_client(url) as (read_stream, write_stream, _):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    tool_result = await session.list_tools()
                    
                    tools_info = []
                    for tool in tool_result.tools:
                        tools_info.append({
                            "name": tool.name,
                            "description": tool.description,
                            "inputSchema": tool.inputSchema
                        })
                    
                    return CustomMCPConnectionResult(
                        success=True,
                        qualified_name=f"custom_http_{url.split('/')[-1]}",
                        display_name=f"Custom HTTP MCP ({url})",
                        tools=tools_info,
                        config=config,
                        url=url,
                        message=f"Connected via HTTP ({len(tools_info)} tools)"
                    )
        
        except Exception as e:
            self._logger.error(f"Error connecting to HTTP MCP server: {str(e)}")
            return CustomMCPConnectionResult(
                success=False,
                qualified_name="",
                display_name="",
                tools=[],
                config=config,
                url=url,
                message=f"Failed to connect: {str(e)}"
            )
    
    async def _discover_sse_tools(self, config: Dict[str, Any]) -> CustomMCPConnectionResult:
        url = config.get("url")
        if not url:
            raise CustomMCPError("URL is required for SSE MCP connections")
        
        try:
            async with sse_client(url) as (read_stream, write_stream):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    tool_result = await session.list_tools()
                    
                    tools_info = []
                    for tool in tool_result.tools:
                        tools_info.append({
                            "name": tool.name,
                            "description": tool.description,
                            "inputSchema": tool.inputSchema
                        })
                    
                    return CustomMCPConnectionResult(
                        success=True,
                        qualified_name=f"custom_sse_{url.split('/')[-1]}",
                        display_name=f"Custom SSE MCP ({url})",
                        tools=tools_info,
                        config=config,
                        url=url,
                        message=f"Connected via SSE ({len(tools_info)} tools)"
                    )
        
        except Exception as e:
            self._logger.error(f"Error connecting to SSE MCP server: {str(e)}")
            return CustomMCPConnectionResult(
                success=False,
                qualified_name="",
                display_name="",
                tools=[],
                config=config,
                url=url,
                message=f"Failed to connect: {str(e)}"
            )

    def _get_server_url(self, qualified_name: str, config: Dict[str, Any], provider: str) -> str:
        if provider == 'smithery':
            return self._get_smithery_server_url(qualified_name, config)
        elif provider in ['custom', 'http', 'sse']:
            return self._get_custom_server_url(qualified_name, config)
        else:
            raise MCPProviderError(f"Unknown provider type: {provider}")
    
    def _get_headers(self, qualified_name: str, config: Dict[str, Any], provider: str, external_user_id: Optional[str] = None) -> Dict[str, str]:
        if provider == 'smithery':
            return self._get_smithery_headers(qualified_name, config, external_user_id)
        elif provider in ['custom', 'http', 'sse']:
            return self._get_custom_headers(qualified_name, config, external_user_id)
        else:
            raise MCPProviderError(f"Unknown provider type: {provider}")
    
    def _get_smithery_server_url(self, qualified_name: str, config: Dict[str, Any]) -> str:
        if not self._api_key:
            raise MCPAuthenticationError("SMITHERY_API_KEY environment variable is not set")
        
        config_json = json.dumps(config)
        config_b64 = base64.b64encode(config_json.encode()).decode()
        
        return f"{self._server_base_url}/{qualified_name}/mcp?config={config_b64}&api_key={self._api_key}"
    
    def _get_smithery_headers(self, qualified_name: str, config: Dict[str, Any], external_user_id: Optional[str] = None) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if external_user_id:
            headers["X-External-User-Id"] = external_user_id
        return headers
    
    def _get_custom_server_url(self, qualified_name: str, config: Dict[str, Any]) -> str:
        url = config.get("url")
        if not url:
            raise MCPProviderError(f"URL not provided for custom MCP server: {qualified_name}")
        return url
    
    def _get_custom_headers(self, qualified_name: str, config: Dict[str, Any], external_user_id: Optional[str] = None) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        
        if "headers" in config:
            headers.update(config["headers"])
        
        if external_user_id:
            headers["X-External-User-Id"] = external_user_id
        
        return headers


mcp_service = MCPService() 