from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from uuid import UUID

from .entities import Profile, Connection, App, MCPServer
from .value_objects import ExternalUserId, AppSlug, ProfileName, Category, SearchQuery, PaginationCursor


class ProfileRepository(ABC):
    
    @abstractmethod
    async def create(self, profile: Profile) -> Profile:
        pass
    
    @abstractmethod
    async def get_by_id(self, account_id: UUID, profile_id: UUID) -> Optional[Profile]:
        pass
    
    @abstractmethod
    async def get_by_app_slug(self, account_id: UUID, app_slug: AppSlug, profile_name: Optional[ProfileName] = None) -> Optional[Profile]:
        pass
    
    @abstractmethod
    async def find_by_account(self, account_id: UUID, app_slug: Optional[AppSlug] = None, is_active: Optional[bool] = None) -> List[Profile]:
        pass
    
    @abstractmethod
    async def update(self, profile: Profile) -> Profile:
        pass
    
    @abstractmethod
    async def delete(self, account_id: UUID, profile_id: UUID) -> bool:
        pass
    
    @abstractmethod
    async def set_default(self, account_id: UUID, profile_id: UUID, mcp_qualified_name: str) -> None:
        pass


class ConnectionRepository(ABC):
    
    @abstractmethod
    async def get_by_external_user_id(self, external_user_id: ExternalUserId) -> List[Connection]:
        pass
    
    @abstractmethod
    async def create(self, connection: Connection) -> Connection:
        pass
    
    @abstractmethod
    async def update(self, connection: Connection) -> Connection:
        pass
    
    @abstractmethod
    async def delete(self, external_user_id: ExternalUserId, app_slug: AppSlug) -> bool:
        pass


class AppRepository(ABC):
    
    @abstractmethod
    async def search(self, query: SearchQuery, category: Optional[Category] = None, page: int = 1, limit: int = 20, cursor: Optional[PaginationCursor] = None) -> Dict[str, Any]:
        pass
    
    @abstractmethod
    async def get_by_slug(self, app_slug: AppSlug) -> Optional[App]:
        pass
    
    @abstractmethod
    async def get_popular(self, category: Optional[Category] = None, limit: int = 10) -> List[App]:
        pass
    
    @abstractmethod
    async def get_by_category(self, category: Category, limit: int = 20) -> List[App]:
        pass


class MCPServerRepository(ABC):
    
    @abstractmethod
    async def discover_for_user(self, external_user_id: ExternalUserId, app_slug: Optional[AppSlug] = None) -> List[MCPServer]:
        pass
    
    @abstractmethod
    async def test_connection(self, server: MCPServer) -> MCPServer:
        pass
    
    @abstractmethod
    async def create_connection(self, external_user_id: ExternalUserId, app_slug: AppSlug, oauth_app_id: Optional[str] = None) -> MCPServer:
        pass 