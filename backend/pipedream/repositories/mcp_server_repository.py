import os
import asyncio
from typing import List, Optional, Dict, Any
from ..protocols import MCPServerRepository, HttpClient, Logger
from ..domain.entities import MCPServer, MCPTool, ConnectionStatus
from ..domain.value_objects import ExternalUserId, AppSlug, MCPServerUrl
from ..domain.exceptions import MCPServerNotAvailableError, MCPConnectionError

try:
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client
    MCP_AVAILABLE = True
except ImportError:
    ClientSession = None
    streamablehttp_client = None
    MCP_AVAILABLE = False


class PipedreamMCPServerRepository:
    def __init__(self, http_client: HttpClient, logger: Logger):
        self._http_client = http_client
        self._logger = logger

    async def discover_for_user(self, external_user_id: ExternalUserId, app_slug: Optional[AppSlug] = None) -> List[MCPServer]:
        if not MCP_AVAILABLE:
            self._logger.warning("MCP client libraries not available - returning empty server list")
            return []
        
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
                user_apps = [app for app in user_apps if app.get('name_slug') == app_slug.value]
                self._logger.info(f"Filtered to {len(user_apps)} apps for app_slug: {app_slug.value}")
            
            mcp_servers = []
            for app in user_apps:
                app_slug_current = app.get('name_slug')
                app_name = app.get('name')
                
                if not app_slug_current:
                    self._logger.warning(f"App missing name_slug: {app}")
                    continue
                
                self._logger.info(f"Creating MCP server for app: {app_name} ({app_slug_current})")
                
                server = MCPServer(
                    app_slug=AppSlug(app_slug_current),
                    app_name=app_name,
                    server_url=MCPServerUrl('https://remote.mcp.pipedream.net'),
                    project_id=project_id,
                    environment=environment,
                    external_user_id=external_user_id,
                    status=ConnectionStatus.DISCONNECTED
                )
                
                try:
                    tested_server = await self.test_connection(server)
                    mcp_servers.append(tested_server)
                    self._logger.info(f"Successfully tested MCP server for {app_name}: {tested_server.status.value}")
                except Exception as e:
                    self._logger.warning(f"Failed to test MCP server for {app_name}: {str(e)}")
                    server.status = ConnectionStatus.ERROR
                    server.error_message = str(e)
                    mcp_servers.append(server)
            
            self._logger.info(f"Discovered {len(mcp_servers)} MCP servers for user: {external_user_id.value}")
            return mcp_servers
            
        except Exception as e:
            self._logger.error(f"Error discovering MCP servers: {str(e)}")
            return []

    async def test_connection(self, server: MCPServer) -> MCPServer:
        if not MCP_AVAILABLE:
            self._logger.warning(f"MCP client not available for testing {server.app_name}")
            server.status = ConnectionStatus.ERROR
            server.error_message = "MCP client libraries not available"
            return server
        
        try:
            access_token = await self._http_client._ensure_access_token()
        except Exception as e:
            self._logger.error(f"Failed to get access token for MCP connection: {str(e)}")
            server.status = ConnectionStatus.ERROR
            server.error_message = f"Authentication failed: {str(e)}"
            return server
        
        headers = {
            "Authorization": f"Bearer {access_token}",
            "x-pd-project-id": server.project_id,
            "x-pd-environment": server.environment,
            "x-pd-external-user-id": server.external_user_id.value,
            "x-pd-app-slug": server.app_slug.value,
        }
        
        if hasattr(self._http_client, 'rate_limit_token') and self._http_client.rate_limit_token:
            headers["x-pd-rate-limit"] = self._http_client.rate_limit_token
        
        self._logger.info(f"Testing MCP connection for {server.app_name} at {server.server_url.value}")
        
        try:
            async with asyncio.timeout(15):
                async with streamablehttp_client(server.server_url.value, headers=headers) as (read_stream, write_stream, _):
                    async with ClientSession(read_stream, write_stream) as session:
                        await session.initialize()
                        tools_result = await session.list_tools()
                        tools = tools_result.tools if hasattr(tools_result, 'tools') else tools_result
                        
                        for tool in tools:
                            mcp_tool = MCPTool(
                                name=tool.name,
                                description=tool.description,
                                input_schema=tool.inputSchema
                            )
                            server.add_tool(mcp_tool)
                        
                        server.status = ConnectionStatus.CONNECTED
                        self._logger.info(f"Successfully tested MCP server for {server.app_name} with {server.get_tool_count()} tools")
                        return server
                        
        except asyncio.TimeoutError:
            self._logger.error(f"Timeout testing MCP connection for {server.app_name}")
            server.status = ConnectionStatus.ERROR
            server.error_message = "Connection timeout"
        except Exception as e:
            self._logger.error(f"Failed to test MCP connection for {server.app_name}: {str(e)}")
            server.status = ConnectionStatus.ERROR
            server.error_message = str(e)
        
        return server

    async def create_connection(self, external_user_id: ExternalUserId, app_slug: AppSlug, oauth_app_id: Optional[str] = None) -> MCPServer:
        if not MCP_AVAILABLE:
            raise MCPServerNotAvailableError("MCP client not available")
        
        project_id = os.getenv("PIPEDREAM_PROJECT_ID")
        environment = os.getenv("PIPEDREAM_X_PD_ENVIRONMENT", "development")
        
        if not project_id:
            raise MCPConnectionError(app_slug.value, "Missing PIPEDREAM_PROJECT_ID")
        
        self._logger.info(f"Creating MCP connection for user: {external_user_id.value}, app: {app_slug.value}")
        
        url = f"{self._http_client.base_url}/connect/{project_id}/accounts"
        params = {"external_id": external_user_id.value}
        headers = {"X-PD-Environment": environment}
        
        try:
            data = await self._http_client.get(url, headers=headers, params=params)
            
            accounts = data.get("data", [])
            user_apps = [account.get("app") for account in accounts if account.get("app")]
            
            connected_app = None
            for app in user_apps:
                if app.get('name_slug') == app_slug.value:
                    connected_app = app
                    break
            
            if not connected_app:
                raise MCPConnectionError(app_slug.value, f"User {external_user_id.value} does not have {app_slug.value} connected")
            
            server = MCPServer(
                app_slug=app_slug,
                app_name=connected_app.get('name'),
                server_url=MCPServerUrl('https://remote.mcp.pipedream.net'),
                project_id=project_id,
                environment=environment,
                external_user_id=external_user_id,
                oauth_app_id=oauth_app_id,
                status=ConnectionStatus.DISCONNECTED
            )
            
            tested_server = await self.test_connection(server)
            self._logger.info(f"Successfully created MCP connection for {app_slug.value}")
            return tested_server
            
        except Exception as e:
            self._logger.error(f"Failed to create MCP connection for {app_slug.value}: {str(e)}")
            raise MCPConnectionError(app_slug.value, str(e)) 