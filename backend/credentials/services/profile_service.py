from typing import List, Optional, Dict, Any

from ..domain.entities import MCPCredentialProfile, ProfileRequest
from ..domain.exceptions import ProfileNotFoundError
from ..repositories.profile_repository import ProfileRepository
from ..support.validator import CredentialValidator
from ..support.profile_finder import ProfileFinder
from ..protocols import Logger


class ProfileService:
    def __init__(
        self,
        profile_repo: ProfileRepository,
        validator: CredentialValidator,
        profile_finder: ProfileFinder,
        logger: Logger
    ):
        self._profile_repo = profile_repo
        self._validator = validator
        self._profile_finder = profile_finder
        self._logger = logger
    
    async def store_profile(
        self,
        account_id: str,
        mcp_qualified_name: str,
        profile_name: str,
        display_name: str,
        config: Dict[str, Any],
        is_default: bool = False
    ) -> str:
        self._logger.info(f"Storing profile '{profile_name}' for {mcp_qualified_name}")
        
        request = ProfileRequest(
            account_id=account_id,
            mcp_qualified_name=mcp_qualified_name,
            profile_name=profile_name,
            display_name=display_name,
            config=config,
            is_default=is_default
        )
        
        return await self._profile_repo.store_profile(request)
    
    async def get_profile(self, account_id: str, profile_id: str) -> Optional[MCPCredentialProfile]:
        profile = await self._profile_repo.find_by_id(profile_id)
        
        if profile:
            self._validator.validate_profile_access(profile, account_id)
        
        return profile
    
    async def get_profiles(
        self, 
        account_id: str, 
        mcp_qualified_name: str
    ) -> List[MCPCredentialProfile]:
        return await self._profile_repo.find_by_account_and_qualified_name(
            account_id, mcp_qualified_name
        )
    
    async def get_all_user_profiles(self, account_id: str) -> List[MCPCredentialProfile]:
        return await self._profile_repo.find_by_account(account_id)
    
    async def get_default_profile(
        self, 
        account_id: str, 
        mcp_qualified_name: str
    ) -> Optional[MCPCredentialProfile]:
        profiles = await self._profile_finder.find_profiles(
            account_id, mcp_qualified_name
        )
        
        for profile in profiles:
            if profile.is_default:
                return profile
        
        return profiles[0] if profiles else None
    
    async def set_default_profile(self, account_id: str, profile_id: str) -> bool:
        self._logger.info(f"Setting profile {profile_id} as default")
        return await self._profile_repo.set_default(account_id, profile_id)
    
    async def delete_profile(self, account_id: str, profile_id: str) -> bool:
        self._logger.info(f"Deleting profile {profile_id}")
        return await self._profile_repo.deactivate_profile(account_id, profile_id)
    
    async def find_profiles(
        self, 
        account_id: str, 
        mcp_qualified_name: str
    ) -> List[MCPCredentialProfile]:
        return await self._profile_finder.find_profiles(account_id, mcp_qualified_name) 