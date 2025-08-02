from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import secrets
import string
from utils.logger import logger
from .client import ComposioClient


class MCPCommands(BaseModel):
    cursor: Optional[str] = None
    claude: Optional[str] = None
    windsurf: Optional[str] = None


class MCPServer(BaseModel):
    id: str
    name: str
    auth_config_ids: List[str]
    allowed_tools: List[str] = []
    mcp_url: str
    toolkits: List[str] = []
    commands: MCPCommands
    updated_at: str
    created_at: str
    managed_auth_via_composio: bool = True


class MCPUrlResponse(BaseModel):
    mcp_url: str
    connected_account_urls: List[str] = []
    user_ids_url: List[str] = []


class MCPServerService:
    def __init__(self, api_key: Optional[str] = None):
        self.client = ComposioClient.get_client(api_key)
    
    def _generate_random_cuid(self, length: int = 8) -> str:
        return ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(length))
    
    async def create_mcp_server(
        self, 
        auth_config_ids: List[str], 
        name: Optional[str] = None
    ) -> MCPServer:
        try:
            if not name:
                toolkit_name = "composio"
                random_suffix = self._generate_random_cuid()
                name = f"{toolkit_name}-{random_suffix}"
            
            logger.info(f"Creating MCP server: {name} with auth_configs: {auth_config_ids}")
            
            response = self.client.mcp.create(
                auth_config_ids=auth_config_ids,
                name=name
            )
            
            commands_data = response.get("commands", {})
            commands = MCPCommands(
                cursor=commands_data.get("cursor"),
                claude=commands_data.get("claude"),
                windsurf=commands_data.get("windsurf")
            )
            
            mcp_server = MCPServer(
                id=response.get("id"),
                name=response.get("name"),
                auth_config_ids=response.get("auth_config_ids", []),
                allowed_tools=response.get("allowed_tools", []),
                mcp_url=response.get("mcp_url"),
                toolkits=response.get("toolkits", []),
                commands=commands,
                updated_at=response.get("updated_at"),
                created_at=response.get("created_at"),
                managed_auth_via_composio=response.get("managed_auth_via_composio", True)
            )
            
            logger.info(f"Successfully created MCP server: {mcp_server.id}")
            return mcp_server
            
        except Exception as e:
            logger.error(f"Failed to create MCP server: {e}", exc_info=True)
            raise
    
    async def generate_mcp_url(
        self,
        mcp_server_id: str,
        connected_account_ids: List[str],
        user_ids: List[str]
    ) -> MCPUrlResponse:
        try:
            logger.info(f"Generating MCP URL for server: {mcp_server_id}")
            
            response = self.client.mcp.generate.url(
                mcp_server_id=mcp_server_id,
                connected_account_ids=connected_account_ids,
                user_ids=user_ids
            )
            
            mcp_url_response = MCPUrlResponse(
                mcp_url=response.get("mcp_url"),
                connected_account_urls=response.get("connected_account_urls", []),
                user_ids_url=response.get("user_ids_url", [])
            )
            
            logger.info(f"Successfully generated MCP URL for server: {mcp_server_id}")
            return mcp_url_response
            
        except Exception as e:
            logger.error(f"Failed to generate MCP URL: {e}", exc_info=True)
            raise
    
    async def get_mcp_server(self, server_id: str) -> Optional[MCPServer]:
        try:
            logger.info(f"Fetching MCP server: {server_id}")
            
            logger.warning(f"Get MCP server not implemented in SDK for ID: {server_id}")
            return None
            
        except Exception as e:
            logger.error(f"Failed to get MCP server {server_id}: {e}", exc_info=True)
            raise
    
    async def list_mcp_servers(self) -> List[MCPServer]:
        try:
            logger.info("Listing MCP servers")
            
            logger.warning("List MCP servers not implemented in SDK")
            return []
            
        except Exception as e:
            logger.error(f"Failed to list MCP servers: {e}", exc_info=True)
            raise
    
    async def delete_mcp_server(self, server_id: str) -> bool:
        try:
            logger.info(f"Deleting MCP server: {server_id}")
            
            logger.warning(f"Delete MCP server not implemented in SDK for ID: {server_id}")
            return False
            
        except Exception as e:
            logger.error(f"Failed to delete MCP server {server_id}: {e}", exc_info=True)
            raise 