from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from .entities import (
    AgentVersion, VersionId, AgentId, UserId, 
    VersionNumber
)


class IVersionRepository(ABC):
    @abstractmethod
    async def create(self, version: AgentVersion) -> AgentVersion:
        pass
    
    @abstractmethod
    async def find_by_id(self, version_id: VersionId) -> Optional[AgentVersion]:
        pass
    
    @abstractmethod
    async def find_by_agent_id(self, agent_id: AgentId) -> List[AgentVersion]:
        pass
    
    @abstractmethod
    async def find_active_version(self, agent_id: AgentId) -> Optional[AgentVersion]:
        pass
    
    @abstractmethod
    async def find_by_version_number(
        self, agent_id: AgentId, version_number: VersionNumber
    ) -> Optional[AgentVersion]:
        pass
    
    @abstractmethod
    async def update(self, version: AgentVersion) -> AgentVersion:
        pass
    
    @abstractmethod
    async def get_next_version_number(self, agent_id: AgentId) -> VersionNumber:
        pass
    
    @abstractmethod
    async def count_versions(self, agent_id: AgentId) -> int:
        pass


class IAgentRepository(ABC):
    @abstractmethod
    async def find_by_id(self, agent_id: AgentId) -> Optional[Dict[str, Any]]:
        pass
    
    @abstractmethod
    async def update_current_version(
        self, agent_id: AgentId, version_id: VersionId, version_count: int
    ) -> None:
        pass
    
    @abstractmethod
    async def verify_ownership(self, agent_id: AgentId, user_id: UserId) -> bool:
        pass
    
    @abstractmethod
    async def is_public(self, agent_id: AgentId) -> bool:
        pass 