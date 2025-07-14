from abc import abstractmethod
from typing import List, Optional, Dict, Any
import os
import httpx
from urllib.parse import quote

from .base import Repository
from ..domain.entities import MCPServer, MCPServerDetail, MCPServerListResult, PopularServersResult
from ..domain.exceptions import MCPRegistryError, MCPServerNotFoundError
from ..protocols import Logger


class SmitheryRepository(Repository[MCPServer]):
    def __init__(self, logger: Logger):
        self._logger = logger
        self._base_url = "https://registry.smithery.ai"
        self._server_base_url = "https://server.smithery.ai"
        self._api_key = os.getenv("SMITHERY_API_KEY")
    
    async def find_by_id(self, qualified_name: str) -> Optional[MCPServer]:
        try:
            details = await self.get_server_details(qualified_name)
            return MCPServer(
                qualified_name=details.qualified_name,
                display_name=details.display_name,
                description="",
                created_at="",
                use_count=0,
                homepage="",
                icon_url=details.icon_url,
                is_deployed=details.deployment_url is not None,
                tools=details.tools,
                security=details.security
            )
        except MCPServerNotFoundError:
            return None
    
    async def find_all(self) -> List[MCPServer]:
        result = await self.list_servers()
        return result.servers
    
    async def list_servers(
        self, 
        query: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> MCPServerListResult:
        try:
            params = {
                "page": page,
                "pageSize": page_size
            }
            if query:
                params["q"] = query
            
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self._base_url}/api/v1/packages", params=params)
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
        try:
            encoded_name = quote(qualified_name, safe='')
            
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self._base_url}/api/v1/packages/{encoded_name}")
                
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
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self._base_url}/api/v1/packages/popular")
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