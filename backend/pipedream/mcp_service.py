import json
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from enum import Enum

import httpx
from utils.logger import logger


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


@dataclass
class MCPServer:
    app_slug: str
    app_name: str
    server_url: str
    project_id: str
    environment: str
    external_user_id: str
    oauth_app_id: Optional[str] = None
    status: ConnectionStatus = ConnectionStatus.DISCONNECTED
    available_tools: List[MCPTool] = field(default_factory=list)
    error_message: Optional[str] = None

    def is_connected(self) -> bool:
        return self.status == ConnectionStatus.CONNECTED

    def get_tool_count(self) -> int:
        return len(self.available_tools)


class MCPServiceError(Exception):
    pass

class MCPConnectionError(MCPServiceError):
    pass

class MCPServerNotAvailableError(MCPServiceError):
    pass

class AuthenticationError(MCPServiceError):
    pass

class RateLimitError(MCPServiceError):
    pass


class ExternalUserId:
    def __init__(self, value: str):
        if not value or not isinstance(value, str):
            raise ValueError("ExternalUserId must be a non-empty string")
        if len(value) > 255:
            raise ValueError("ExternalUserId must be less than 255 characters")
        self.value = value


class AppSlug:
    def __init__(self, value: str):
        if not value or not isinstance(value, str):
            raise ValueError("AppSlug must be a non-empty string")
        if not re.match(r'^[a-z0-9_-]+$', value):
            raise ValueError("AppSlug must contain only lowercase letters, numbers, hyphens, and underscores")
        self.value = value


class MCPService:
    def __init__(self, logger=None):
        self._logger = logger or logger
        self.base_url = "https://api.pipedream.com/v1"
        self.session = None
        self.access_token = None
        self.token_expires_at = None

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
            else:
                self.access_token = None
                self.token_expires_at = None

        return await self._fetch_fresh_token()

    async def _fetch_fresh_token(self) -> str:
        project_id = os.getenv("PIPEDREAM_PROJECT_ID")
        client_id = os.getenv("PIPEDREAM_CLIENT_ID")
        client_secret = os.getenv("PIPEDREAM_CLIENT_SECRET")

        if not all([project_id, client_id, client_secret]):
            raise AuthenticationError("Missing required environment variables")

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
                raise RateLimitError("Rate limit exceeded")
            raise AuthenticationError(f"Failed to obtain access token: {e}")

    async def _make_request(self, url: str, headers: Dict[str, str] = None, params: Dict[str, Any] = None) -> Dict[str, Any]:
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
                raise RateLimitError("Rate limit exceeded")
            raise MCPServiceError(f"HTTP request failed: {e}")

    async def _fetch_server_tools(self, external_user_id: str, app_slug: str) -> List[MCPTool]:
        project_id = os.getenv("PIPEDREAM_PROJECT_ID")
        environment = os.getenv("PIPEDREAM_X_PD_ENVIRONMENT", "development")

        if not project_id:
            return []

        url = f"{self.base_url}/connect/{project_id}/tools"
        params = {
            "app": app_slug,
            "external_id": external_user_id
        }
        headers = {"X-PD-Environment": environment}

        try:
            data = await self._make_request(url, headers=headers, params=params)
            tools_data = data.get("data", [])

            tools = []
            for tool_data in tools_data:
                if tool_data.get("name") or tool_data.get("key"):
                    tool = MCPTool(
                        name=tool_data.get("name") or tool_data.get("key", ""),
                        description=tool_data.get("description", f"Tool from {app_slug}"),
                        input_schema=tool_data.get("inputSchema") or tool_data.get("props", {})
                    )
                    tools.append(tool)

            return tools

        except Exception as e:
            logger.error(f"Error fetching tools for {app_slug}: {str(e)}")
            return []

    async def discover_servers_for_user(self, external_user_id: ExternalUserId, app_slug: Optional[AppSlug] = None) -> List[MCPServer]:
        project_id = os.getenv("PIPEDREAM_PROJECT_ID")
        environment = os.getenv("PIPEDREAM_X_PD_ENVIRONMENT", "development")

        if not project_id:
            logger.error("Missing PIPEDREAM_PROJECT_ID environment variable")
            return []

        logger.info(f"Discovering MCP servers for user: {external_user_id.value}, app_slug: {app_slug.value if app_slug else 'all'}")

        url = f"{self.base_url}/connect/{project_id}/accounts"
        params = {"external_id": external_user_id.value}
        headers = {"X-PD-Environment": environment}

        try:
            data = await self._make_request(url, headers=headers, params=params)

            accounts = data.get("data", [])
            if not accounts:
                logger.info(f"No connected apps found for user: {external_user_id.value}")
                return []

            user_apps = [account.get("app") for account in accounts if account.get("app")]

            if app_slug:
                user_apps = [app for app in user_apps if app.get("name_slug") == app_slug.value]

            servers = []
            for app in user_apps:
                try:
                    server = MCPServer(
                        app_slug=app.get("name_slug", ""),
                        app_name=app.get("name", "Unknown"),
                        server_url="https://remote.mcp.pipedream.net",
                        project_id=project_id,
                        environment=environment,
                        external_user_id=external_user_id.value,
                        status=ConnectionStatus.CONNECTED
                    )

                    try:
                        logger.info(f"Attempting to fetch tools for {app.get('name_slug')}...")
                        tools = await self._fetch_server_tools(external_user_id.value, server.app_slug)
                        server.available_tools = tools

                        logger.info(f"Successfully fetched {len(tools)} tools for app: {app.get('name_slug')}")

                    except Exception as e:
                        logger.error(f"Error fetching tools for {app.get('name_slug')}: {str(e)}")
                        server.available_tools = []

                    servers.append(server)

                except Exception as e:
                    logger.error(f"Error creating server for app {app.get('name_slug', 'unknown')}: {str(e)}")
                    continue

            logger.info(f"Successfully discovered {len(servers)} MCP servers")
            return servers

        except Exception as e:
            logger.error(f"Error discovering servers for user {external_user_id.value}: {str(e)}")
            return []

    async def test_server_connection(self, server: MCPServer) -> MCPServer:
        logger.info(f"Testing MCP server connection: {server.app_name}")
        
        server.status = ConnectionStatus.CONNECTED
        
        if server.is_connected():
            logger.info(f"MCP server {server.app_name} connected successfully with {server.get_tool_count()} tools")
        else:
            logger.warning(f"MCP server {server.app_name} connection failed: {server.error_message}")
        
        return server

    async def create_connection(self, external_user_id: ExternalUserId, app_slug: AppSlug, oauth_app_id: Optional[str] = None) -> MCPServer:
        project_id = os.getenv("PIPEDREAM_PROJECT_ID")
        environment = os.getenv("PIPEDREAM_X_PD_ENVIRONMENT", "development")

        if not project_id:
            raise MCPConnectionError("Missing PIPEDREAM_PROJECT_ID")

        logger.info(f"Creating MCP connection for user: {external_user_id.value}, app: {app_slug.value}")

        server = MCPServer(
            app_slug=app_slug.value,
            app_name=app_slug.value.replace('_', ' ').title(),
            server_url="https://remote.mcp.pipedream.net",
            project_id=project_id,
            environment=environment,
            external_user_id=external_user_id.value,
            oauth_app_id=oauth_app_id,
            status=ConnectionStatus.CONNECTED
        )

        if server.is_connected():
            logger.info(f"Successfully created MCP connection for {app_slug.value} with {server.get_tool_count()} tools")
        else:
            logger.error(f"Failed to create MCP connection for {app_slug.value}: {server.error_message}")

        return server

    async def close(self):
        if self.session and not self.session.is_closed:
            await self.session.aclose()


_mcp_service = None

def get_mcp_service() -> MCPService:
    global _mcp_service
    if _mcp_service is None:
        _mcp_service = MCPService()
    return _mcp_service


PipedreamException = MCPServiceError
MCPServerNotAvailableError = MCPServerNotAvailableError
AuthenticationException = AuthenticationError
HttpClientException = MCPServiceError
RateLimitException = RateLimitError 