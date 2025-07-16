from typing import List
from ..protocols import ConnectionRepository, Logger
from ..domain.entities import Connection
from ..domain.value_objects import ExternalUserId, AppSlug


class ConnectionService:
    def __init__(self, connection_repo: ConnectionRepository, logger: Logger):
        self._connection_repo = connection_repo
        self._logger = logger

    async def get_connections_for_user(self, external_user_id: ExternalUserId) -> List[Connection]:
        self._logger.info(f"Getting connections for user: {external_user_id.value}")
        
        connections = await self._connection_repo.get_by_external_user_id(external_user_id)
        
        self._logger.info(f"Found {len(connections)} connections for user: {external_user_id.value}")
        return connections

    async def has_connection(self, external_user_id: ExternalUserId, app_slug: AppSlug) -> bool:
        connections = await self._connection_repo.get_by_external_user_id(external_user_id)
        
        for connection in connections:
            if connection.app.slug == app_slug and connection.is_active:
                return True
        
        return False 