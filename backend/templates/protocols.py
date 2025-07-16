from typing import Protocol, Dict, List, Any, Optional
from .domain.entities import ConfigType


class Logger(Protocol):
    def info(self, message: str) -> None: ...
    def warning(self, message: str) -> None: ...
    def error(self, message: str) -> None: ...


class DatabaseConnection(Protocol):
    async def client(self) -> Any: ...


class VersionManager(Protocol):
    async def create_version(
        self, agent_id: str, user_id: str, system_prompt: str,
        configured_mcps: List[ConfigType], custom_mcps: List[ConfigType],
        agentpress_tools: ConfigType, version_name: str, 
        change_description: str
    ) -> Dict[str, Any]: ...
    
    async def get_version(
        self, agent_id: str, version_id: str, user_id: str
    ) -> Dict[str, Any]: ...


class CredentialManager(Protocol):
    async def get_default_credential_profile(
        self, account_id: str, qualified_name: str
    ) -> Optional[Any]: ...
    
    async def get_credential_by_profile(
        self, account_id: str, profile_id: str
    ) -> Optional[Any]: ...


class ProfileManager(Protocol):
    async def get_profile(self, account_id: str, profile_id: str) -> Optional[Any]: ... 