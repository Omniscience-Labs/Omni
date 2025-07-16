import logging
from typing import Dict, List, Any, Optional

from .domain.entities import (
    MCPCredential, MCPCredentialProfile, MCPRequirement
)
from .repositories.credential_repository import SupabaseCredentialRepository
from .repositories.profile_repository import SupabaseProfileRepository
from .services.credential_service import CredentialService
from .services.profile_service import ProfileService
from .support.encryption import EncryptionService
from .support.validator import CredentialValidator
from .support.profile_finder import ProfileFinder
from .protocols import DatabaseConnection, Logger, ProfileManager


class CredentialManager:
    def __init__(
        self,
        db: Optional[DatabaseConnection] = None,
        profile_manager: Optional[ProfileManager] = None,
        logger: Optional[Logger] = None
    ):
        self._logger = logger or logging.getLogger(__name__)
        
        if db is None:
            from services.supabase import DBConnection
            self._db = DBConnection()
        else:
            self._db = db
        
        self._encryption = EncryptionService(self._logger)
        self._validator = CredentialValidator(self._logger)
        
        self._credential_repo = SupabaseCredentialRepository(
            self._db, self._encryption, self._logger
        )
        self._profile_repo = SupabaseProfileRepository(
            self._db, self._encryption, self._logger
        )
        
        self._profile_finder = ProfileFinder(
            self._profile_repo, profile_manager, self._logger
        )
        
        self._credential_service = CredentialService(
            self._credential_repo, self._validator, self._logger
        )
        self._profile_service = ProfileService(
            self._profile_repo, self._validator, self._profile_finder, self._logger
        )
    
    async def store_credential(
        self,
        account_id: str,
        mcp_qualified_name: str,
        display_name: str,
        config: Dict[str, Any]
    ) -> str:
        return await self._credential_service.store_credential(
            account_id, mcp_qualified_name, display_name, config
        )
    
    async def get_credential(
        self, 
        account_id: str, 
        mcp_qualified_name: str
    ) -> Optional[MCPCredential]:
        return await self._credential_service.get_credential(account_id, mcp_qualified_name)
    
    async def get_user_credentials(self, account_id: str) -> List[MCPCredential]:
        return await self._credential_service.get_user_credentials(account_id)
    
    async def delete_credential(
        self, 
        account_id: str, 
        mcp_qualified_name: str
    ) -> bool:
        return await self._credential_service.delete_credential(account_id, mcp_qualified_name)
    
    async def store_credential_profile(
        self,
        account_id: str,
        mcp_qualified_name: str,
        profile_name: str,
        display_name: str,
        config: Dict[str, Any],
        is_default: bool = False
    ) -> str:
        return await self._profile_service.store_profile(
            account_id, mcp_qualified_name, profile_name, 
            display_name, config, is_default
        )
    
    async def get_credential_profiles(
        self, 
        account_id: str, 
        mcp_qualified_name: str
    ) -> List[MCPCredentialProfile]:
        return await self._profile_service.get_profiles(account_id, mcp_qualified_name)
    
    async def get_credential_by_profile(
        self, 
        account_id: str, 
        profile_id: str
    ) -> Optional[MCPCredentialProfile]:
        return await self._profile_service.get_profile(account_id, profile_id)
    
    async def get_default_credential_profile(
        self, 
        account_id: str, 
        mcp_qualified_name: str
    ) -> Optional[MCPCredentialProfile]:
        return await self._profile_service.get_default_profile(account_id, mcp_qualified_name)
    
    async def set_default_profile(self, account_id: str, profile_id: str) -> bool:
        return await self._profile_service.set_default_profile(account_id, profile_id)
    
    async def delete_credential_profile(self, account_id: str, profile_id: str) -> bool:
        return await self._profile_service.delete_profile(account_id, profile_id)
    
    async def get_all_user_credential_profiles(self, account_id: str) -> List[MCPCredentialProfile]:
        return await self._profile_service.get_all_user_profiles(account_id)
    
    async def find_credential_profiles_robust(
        self, 
        account_id: str, 
        mcp_qualified_name: str
    ) -> List[MCPCredentialProfile]:
        return await self._profile_service.find_profiles_robust(account_id, mcp_qualified_name)
    
    async def get_missing_credentials_for_requirements(
        self, 
        account_id: str, 
        requirements: List[MCPRequirement]
    ) -> List[MCPRequirement]:
        return await self._credential_service.get_missing_credentials(account_id, requirements)
    
    async def build_credential_mappings(
        self, 
        account_id: str, 
        requirements: List[MCPRequirement]
    ) -> Dict[str, str]:
        return await self._credential_service.build_credential_mappings(account_id, requirements) 