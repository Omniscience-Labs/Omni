from typing import Protocol, Any, Dict, List, Optional, Tuple
from .domain.entities import MCPCredential, MCPCredentialProfile


class DatabaseConnection(Protocol):
    @property
    async def client(self) -> Any:
        ...


class Logger(Protocol):
    def info(self, message: str) -> None:
        ...
    
    def debug(self, message: str) -> None:
        ...
    
    def warning(self, message: str) -> None:
        ...
    
    def error(self, message: str) -> None:
        ...


class EncryptionService(Protocol):
    def encrypt_config(self, config: Dict[str, Any]) -> Tuple[bytes, str]:
        ...
    
    def decrypt_config(self, encrypted_config: bytes, expected_hash: str) -> Dict[str, Any]:
        ...


class ProfileManager(Protocol):
    async def get_profiles(
        self, 
        account_id: str, 
        app_slug: Optional[str] = None,
        is_active: bool = True
    ) -> List[Any]:
        ... 