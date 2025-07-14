from typing import Optional

from ..domain.entities import MCPServerListResult, MCPServerDetail, PopularServersResult
from ..repositories.smithery_repository import SmitheryRepository
from ..protocols import Logger


class RegistryService:
    def __init__(self, smithery_repo: SmitheryRepository, logger: Logger):
        self._smithery_repo = smithery_repo
        self._logger = logger
    
    async def list_servers(
        self, 
        query: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> MCPServerListResult:
        self._logger.info(f"Listing MCP servers (page {page}, size {page_size})")
        if query:
            self._logger.info(f"Search query: {query}")
        
        return await self._smithery_repo.list_servers(query, page, page_size)
    
    async def get_server_details(self, qualified_name: str) -> MCPServerDetail:
        self._logger.info(f"Getting details for MCP server: {qualified_name}")
        return await self._smithery_repo.get_server_details(qualified_name)
    
    async def get_popular_servers(self) -> PopularServersResult:
        self._logger.info("Getting popular MCP servers")
        return await self._smithery_repo.get_popular_servers() 