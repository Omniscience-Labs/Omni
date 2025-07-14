from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from .entities import Profile
from .value_objects import ExternalUserId, AppSlug, ProfileName, ConnectionToken


class ExternalUserIdGeneratorService(ABC):
    
    @abstractmethod
    def generate(self, account_id: str, app_slug: AppSlug, profile_name: ProfileName) -> ExternalUserId:
        pass


class MCPQualifiedNameService(ABC):
    
    @abstractmethod
    def generate(self, app_slug: AppSlug) -> str:
        pass


class ConnectionTokenService(ABC):
    
    @abstractmethod
    async def create(self, external_user_id: ExternalUserId, app: Optional[AppSlug] = None) -> Dict[str, Any]:
        pass


class ProfileConfigurationService(ABC):
    
    @abstractmethod
    def validate_config(self, config: Dict[str, Any]) -> bool:
        pass
    
    @abstractmethod
    def merge_config(self, existing_config: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
        pass


class ConnectionStatusService(ABC):
    
    @abstractmethod
    async def check_connection_status(self, profile: Profile) -> bool:
        pass
    
    @abstractmethod
    async def update_connection_status(self, profile: Profile) -> Profile:
        pass 