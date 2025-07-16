from typing import AsyncGenerator, Optional
from functools import lru_cache
from ..services.version_service import VersionService
from .supabase_repositories import (
    SupabaseVersionRepository,
    SupabaseAgentRepository
)
from services.supabase import DBConnection


_db_connection: Optional[DBConnection] = None

def set_db_connection(db: DBConnection):
    global _db_connection
    _db_connection = db

class DependencyContainer:
    def __init__(self):
        self._version_service = None
    
    async def get_db_client(self):
        if not _db_connection:
            raise RuntimeError("Database connection not initialized. Call set_db_connection first.")
        return await _db_connection.client
    
    async def get_version_repository(self) -> SupabaseVersionRepository:
        client = await self.get_db_client()
        return SupabaseVersionRepository(client)
    
    async def get_agent_repository(self) -> SupabaseAgentRepository:
        client = await self.get_db_client()
        return SupabaseAgentRepository(client)
    
    async def get_version_service(self) -> VersionService:
        if not self._version_service:
            version_repo = await self.get_version_repository()
            agent_repo = await self.get_agent_repository()
            
            self._version_service = VersionService(
                version_repo=version_repo,
                agent_repo=agent_repo
            )
        
        return self._version_service


@lru_cache()
def get_container() -> DependencyContainer:
    return DependencyContainer()


async def get_version_service() -> VersionService:
    container = get_container()
    return await container.get_version_service() 