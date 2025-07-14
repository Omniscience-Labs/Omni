from typing import List, Optional
from ..protocols import MCPServerRepository, Logger
from ..domain.entities import MCPServer
from ..domain.value_objects import ExternalUserId, AppSlug


class MCPService:
    def __init__(self, mcp_server_repo: MCPServerRepository, logger: Logger):
        self._mcp_server_repo = mcp_server_repo
        self._logger = logger

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