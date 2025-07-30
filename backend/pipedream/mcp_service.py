from typing import List, Optional, Protocol, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import os
import logging
import re
import httpx
import asyncio

@dataclass(frozen=True)
class ExternalUserId:
    value: str
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("ExternalUserId must be a non-empty string")
        if len(self.value) > 255:
            raise ValueError("ExternalUserId must be less than 255 characters")

@dataclass(frozen=True)
class AppSlug:
    value: str
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("AppSlug must be a non-empty string")
        if not re.match(r'^[a-z0-9_-]+$', self.value):
            raise ValueError("AppSlug must contain only lowercase letters, numbers, hyphens, and underscores")

@dataclass(frozen=True)
class MCPServerUrl:
    value: str
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("MCPServerUrl must be a non-empty string")
        if not self.value.startswith(('http://', 'https://')):
            raise ValueError("MCPServerUrl must be a valid HTTP/HTTPS URL")

class ConnectionStatus(Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"
    PENDING = "pending"

@dataclass
class MCPTool:
    name: str
    description: str
    input_schema: Dict[str, Any]
    
    def is_valid(self) -> bool:
        return bool(self.name and self.description and self.input_schema)

@dataclass
class MCPServer:
    app_slug: AppSlug
    app_name: str
    server_url: MCPServerUrl
    project_id: str
    environment: str
    external_user_id: ExternalUserId
    oauth_app_id: Optional[str] = None
    status: ConnectionStatus = ConnectionStatus.DISCONNECTED
    available_tools: List[MCPTool] = field(default_factory=list)
    error_message: Optional[str] = None
    
    def is_connected(self) -> bool:
        return self.status == ConnectionStatus.CONNECTED
    
    def add_tool(self, tool: MCPTool) -> None:
        if tool.is_valid():
            self.available_tools.append(tool)
    
    def get_tool_count(self) -> int:
        return len(self.available_tools)

class PipedreamException(Exception):
    def __init__(self, message: str, error_code: str = None):
        super().__init__(message)
        self.error_code = error_code
        self.message = message

class MCPServerNotAvailableError(PipedreamException):
    def __init__(self, message: str = "MCP server is not available"):
        super().__init__(message, "MCP_SERVER_NOT_AVAILABLE")

class MCPConnectionError(PipedreamException):
    def __init__(self, app_slug: str, reason: str):
        super().__init__(f"MCP connection failed for {app_slug}: {reason}", "MCP_CONNECTION_ERROR")
        self.app_slug = app_slug
        self.reason = reason

class AuthenticationException(PipedreamException):
    def __init__(self, reason: str):
        super().__init__(f"Authentication failed: {reason}", "AUTHENTICATION_ERROR")
        self.reason = reason

class HttpClientException(PipedreamException):
    def __init__(self, url: str, status_code: int, reason: str):
        super().__init__(f"HTTP request to {url} failed with status {status_code}: {reason}", "HTTP_CLIENT_ERROR")
        self.url = url
        self.status_code = status_code
        self.reason = reason

class RateLimitException(PipedreamException):
    def __init__(self, retry_after: int = None):
        super().__init__("Rate limit exceeded", "RATE_LIMIT_EXCEEDED")
        self.retry_after = retry_after

class Logger(Protocol):
    def info(self, message: str) -> None: ...
    def warning(self, message: str) -> None: ...
    def error(self, message: str) -> None: ...
    def debug(self, message: str) -> None: ...

class HttpClient:
    def __init__(self):
        self.base_url = "https://api.pipedream.com/v1"
        self.session: Optional[httpx.AsyncClient] = None
        self.access_token: Optional[str] = None
        self.token_expires_at: Optional[datetime] = None
        
    async def _get_session(self) -> httpx.AsyncClient:
        if self.session is None or self.session.is_closed:
            self.session = httpx.AsyncClient(
                timeout=httpx.Timeout(30.0),
                headers={"User-Agent": "Suna-Pipedream-Client/1.0"}
            )
        return self.session
    
    async def _ensure_access_token(self) -> str:
        if self.access_token and self.token_expires_at:
            if datetime.utcnow() < (self.token_expires_at - timedelta(minutes=5)):
                return self.access_token
        return await self._fetch_fresh_token()
    
    async def _fetch_fresh_token(self) -> str:
        project_id = os.getenv("PIPEDREAM_PROJECT_ID")
        client_id = os.getenv("PIPEDREAM_CLIENT_ID")
        client_secret = os.getenv("PIPEDREAM_CLIENT_SECRET")
        
        if not all([project_id, client_id, client_secret]):
            raise AuthenticationException("Missing required environment variables")
        
        session = await self._get_session()
        
        try:
            response = await session.post(
                f"{self.base_url}/oauth/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret
                }
            )
            response.raise_for_status()
            
            data = response.json()
            self.access_token = data["access_token"]
            expires_in = data.get("expires_in", 3600)
            self.token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
            
            return self.access_token
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise RateLimitException()
            raise AuthenticationException(f"Failed to obtain access token: {e}")
    
    async def get(self, url: str, headers: Dict[str, str] = None, params: Dict[str, Any] = None) -> Dict[str, Any]:
        session = await self._get_session()
        access_token = await self._ensure_access_token()
        
        request_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        if headers:
            request_headers.update(headers)
        
        try:
            response = await session.get(url, headers=request_headers, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise RateLimitException()
            raise HttpClientException(url, e.response.status_code, str(e))
    
    async def close(self) -> None:
        if self.session and not self.session.is_closed:
            await self.session.aclose()

class MCPServerRepository:
    def __init__(self, http_client: HttpClient, logger: Logger):
        self._http_client = http_client
        self._logger = logger

    async def discover_for_user(self, external_user_id: ExternalUserId, app_slug: Optional[AppSlug] = None) -> List[MCPServer]:
        project_id = os.getenv("PIPEDREAM_PROJECT_ID")
        environment = os.getenv("PIPEDREAM_X_PD_ENVIRONMENT", "development")
        
        if not project_id:
            self._logger.error("Missing PIPEDREAM_PROJECT_ID environment variable")
            return []
        
        self._logger.info(f"Discovering MCP servers for user: {external_user_id.value}, app_slug: {app_slug.value if app_slug else 'all'}")
        
        url = f"{self._http_client.base_url}/connect/{project_id}/accounts"
        params = {"external_id": external_user_id.value}
        headers = {"X-PD-Environment": environment}
        
        try:
            data = await self._http_client.get(url, headers=headers, params=params)
            
            accounts = data.get("data", [])
            if not accounts:
                self._logger.info(f"No connected apps found for user: {external_user_id.value}")
                return []
            
            user_apps = [account.get("app") for account in accounts if account.get("app")]
            
            if app_slug:
                user_apps = [app for app in user_apps if app.get("name_slug") == app_slug.value]
            
            servers = []
            for app in user_apps:
                try:
                    server = MCPServer(
                        app_slug=AppSlug(app.get("name_slug", "")),
                        app_name=app.get("name", "Unknown"),
                        server_url=MCPServerUrl("https://remote.mcp.pipedream.net"),
                        project_id=project_id,
                        environment=environment,
                        external_user_id=external_user_id,
                        status=ConnectionStatus.CONNECTED
                    )
                    
                    try:
                        self._logger.info(f"Attempting to fetch tools for {app.get('name_slug')}...")
                        tools = await self._fetch_server_tools(external_user_id, server.app_slug)
                        
                        for tool_data in tools:
                            tool = MCPTool(
                                name=tool_data.name,
                                description=tool_data.description or f"Tool from {app.get('name', 'Unknown')}",
                                input_schema=tool_data.inputSchema if hasattr(tool_data, 'inputSchema') else {}
                            )
                            server.add_tool(tool)
                        
                        self._logger.info(f"Successfully fetched {len(tools)} tools for {app.get('name_slug')} MCP server")
                    except Exception as tool_error:
                        self._logger.error(f"Could not fetch tools for {app.get('name_slug')}: {str(tool_error)}")
                        import traceback
                        self._logger.error(f"Traceback: {traceback.format_exc()}")
                    
                    servers.append(server)
                except Exception as e:
                    self._logger.warning(f"Error creating MCP server for app {app.get('name_slug', 'unknown')}: {str(e)}")
                    continue
            
            self._logger.info(f"Discovered {len(servers)} MCP servers")
            return servers
            
        except Exception as e:
            self._logger.error(f"Error discovering MCP servers: {str(e)}")
            return []

    async def _fetch_server_tools(self, external_user_id: ExternalUserId, app_slug: AppSlug) -> List:
        try:
            from mcp import ClientSession
            from mcp.client.streamable_http import streamablehttp_client
            
            access_token = await self._http_client._ensure_access_token()
            project_id = os.getenv("PIPEDREAM_PROJECT_ID")
            environment = os.getenv("PIPEDREAM_X_PD_ENVIRONMENT", "development")
            
            headers = {
                "Authorization": f"Bearer {access_token}",
                "x-pd-project-id": project_id,
                "x-pd-environment": environment,
                "x-pd-external-user-id": external_user_id.value,
                "x-pd-app-slug": app_slug.value,
            }
            
            if hasattr(self._http_client, 'rate_limit_token') and self._http_client.rate_limit_token:
                headers["x-pd-rate-limit"] = self._http_client.rate_limit_token
            
            url = "https://remote.mcp.pipedream.net"
            
            async with streamablehttp_client(url, headers=headers) as (read_stream, write_stream, _):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    tools_result = await session.list_tools()
                    tools = tools_result.tools if hasattr(tools_result, 'tools') else tools_result
                    self._logger.info(f"Successfully fetched {len(tools) if tools else 0} tools from MCP server")
                    return tools
                    
        except Exception as e:
            self._logger.error(f"Error fetching tools for {app_slug.value}: {str(e)}")
            import traceback
            self._logger.error(f"Full traceback: {traceback.format_exc()}")
            return []
    
    async def test_connection(self, server: MCPServer) -> MCPServer:
        server.status = ConnectionStatus.CONNECTED
        return server

    async def create_connection(self, external_user_id: ExternalUserId, app_slug: AppSlug, oauth_app_id: Optional[str] = None) -> MCPServer:
        project_id = os.getenv("PIPEDREAM_PROJECT_ID")
        environment = os.getenv("PIPEDREAM_X_PD_ENVIRONMENT", "development")
        
        if not project_id:
            raise MCPConnectionError(app_slug.value, "Missing PIPEDREAM_PROJECT_ID")
        
        server = MCPServer(
            app_slug=app_slug,
            app_name=app_slug.value.replace('_', ' ').title(),
            server_url=MCPServerUrl("https://remote.mcp.pipedream.net"),
            project_id=project_id,
            environment=environment,
            external_user_id=external_user_id,
            oauth_app_id=oauth_app_id,
            status=ConnectionStatus.CONNECTED
        )
        
        return server

class MCPService:
    def __init__(self, logger: Optional[Logger] = None):
        self._logger = logger or logging.getLogger(__name__)
        self._http_client = HttpClient()
        self._mcp_server_repo = MCPServerRepository(self._http_client, self._logger)

    async def discover_servers_for_user(
        self,
        external_user_id: ExternalUserId,
        app_slug: Optional[AppSlug] = None
    ) -> List[MCPServer]:
        self._logger.info(f"Discovering MCP servers for user: {external_user_id.value}")
        
        servers = await self._mcp_server_repo.discover_for_user(external_user_id, app_slug)
        
        connected_count = sum(1 for server in servers if server.is_connected())
        self._logger.info(f"Discovered {len(servers)} MCP servers ({connected_count} connected)")
        
        return servers

    async def test_server_connection(self, server: MCPServer) -> MCPServer:
        self._logger.info(f"Testing MCP server connection: {server.app_name}")
        
        tested_server = await self._mcp_server_repo.test_connection(server)
        
        if tested_server.is_connected():
            self._logger.info(f"MCP server {server.app_name} connected successfully with {tested_server.get_tool_count()} tools")
        else:
            self._logger.warning(f"MCP server {server.app_name} connection failed: {tested_server.error_message}")
        
        return tested_server

    async def create_connection(
        self,
        external_user_id: ExternalUserId,
        app_slug: AppSlug,
        oauth_app_id: Optional[str] = None
    ) -> MCPServer:
        self._logger.info(f"Creating MCP connection for user: {external_user_id.value}, app: {app_slug.value}")
        
        server = await self._mcp_server_repo.create_connection(external_user_id, app_slug, oauth_app_id)
        
        if server.is_connected():
            self._logger.info(f"Successfully created MCP connection for {app_slug.value} with {server.get_tool_count()} tools")
        else:
            self._logger.error(f"Failed to create MCP connection for {app_slug.value}: {server.error_message}")
        
        return server
    
    async def close(self):
        await self._http_client.close() 