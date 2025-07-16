from abc import abstractmethod
from typing import Dict, Any, Optional

from .base import Repository
from ..domain.exceptions import TemplateException, TemplateInstallationError
from ..protocols import DatabaseConnection, Logger


class AgentRepository(Repository[Dict[str, Any]]):
    @abstractmethod
    async def create_from_template(self, agent_data: Dict[str, Any]) -> str:
        pass
    
    @abstractmethod
    async def update_version_info(
        self, agent_id: str, version_id: str, version_count: int
    ) -> None:
        pass


class SupabaseAgentRepository(AgentRepository):
    def __init__(self, db: DatabaseConnection, logger: Logger):
        self._db = db
        self._logger = logger
    
    async def find_by_id(self, agent_id: str) -> Optional[Dict[str, Any]]:
        try:
            client = await self._db.client
            result = await client.table('agents').select('*')\
                .eq('agent_id', agent_id).execute()
            
            return result.data[0] if result.data else None
            
        except Exception as e:
            self._logger.error(f"Error finding agent {agent_id}: {str(e)}")
            return None
    
    async def save(self, agent: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError("Use create_from_template instead")
    
    async def delete(self, agent_id: str) -> bool:
        try:
            client = await self._db.client
            result = await client.table('agents')\
                .delete()\
                .eq('agent_id', agent_id)\
                .execute()
            
            return len(result.data) > 0
            
        except Exception as e:
            self._logger.error(f"Error deleting agent {agent_id}: {str(e)}")
            return False
    
    async def create_from_template(self, agent_data: Dict[str, Any]) -> str:
        try:
            client = await self._db.client
            result = await client.table('agents').insert(agent_data).execute()
            
            if not result.data:
                raise TemplateInstallationError("Failed to create agent")
            
            return result.data[0]['agent_id']
            
        except Exception as e:
            self._logger.error(f"Error creating agent from template: {str(e)}")
            raise TemplateInstallationError(f"Failed to create agent: {str(e)}")
    
    async def update_version_info(
        self, agent_id: str, version_id: str, version_count: int
    ) -> None:
        try:
            client = await self._db.client
            await client.table('agents').update({
                'current_version_id': version_id,
                'version_count': version_count
            }).eq('agent_id', agent_id).execute()
            
        except Exception as e:
            self._logger.error(f"Error updating agent version info: {str(e)}")
            raise TemplateException(f"Failed to update version info: {str(e)}") 