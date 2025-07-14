from typing import List, Optional

from ..domain.entities import MCPCredentialProfile
from ..repositories.profile_repository import ProfileRepository
from ..protocols import Logger, ProfileManager


class ProfileFinder:
    def __init__(
        self, 
        profile_repo: ProfileRepository,
        profile_manager: Optional[ProfileManager],
        logger: Logger
    ):
        self._profile_repo = profile_repo
        self._profile_manager = profile_manager
        self._logger = logger
    
    async def find_profiles(
        self, 
        account_id: str, 
        mcp_qualified_name: str
    ) -> List[MCPCredentialProfile]:
        profiles = await self._profile_repo.find_by_account_and_qualified_name(
            account_id, mcp_qualified_name
        )
        if profiles:
            self._logger.debug(f"Found {len(profiles)} profiles with exact match")
            return profiles
        
        if mcp_qualified_name.startswith("pipedream:"):
            app_slug = mcp_qualified_name[len("pipedream:"):]
            profiles = await self._find_pipedream_profiles(account_id, app_slug)
            if profiles:
                self._logger.debug(f"Found {len(profiles)} Pipedream profiles")
                return profiles
        
        elif not mcp_qualified_name.startswith("pipedream:"):
            pipedream_name = f"pipedream:{mcp_qualified_name}"
            profiles = await self._profile_repo.find_by_account_and_qualified_name(
                account_id, pipedream_name
            )
            if profiles:
                self._logger.debug(f"Found {len(profiles)} profiles with pipedream prefix")
                return profiles
        
        profiles = await self._find_fuzzy_match(account_id, mcp_qualified_name)
        if profiles:
            self._logger.debug(f"Found {len(profiles)} profiles via fuzzy matching")
        else:
            self._logger.debug(f"No profiles found for '{mcp_qualified_name}'")
        
        return profiles
    
    async def _find_pipedream_profiles(
        self, 
        account_id: str, 
        app_slug: str
    ) -> List[MCPCredentialProfile]:
        if not self._profile_manager:
            return []
        
        try:
            pipedream_profiles = await self._profile_manager.get_profiles(
                account_id, app_slug=app_slug, is_active=True
            )
            
            profiles = []
            for pd_profile in pipedream_profiles:
                profile = await self._profile_repo.find_by_id(str(pd_profile.profile_id))
                if profile:
                    profiles.append(profile)
            
            return profiles
            
        except Exception as e:
            self._logger.debug(f"Error using Pipedream profile manager: {e}")
            return []
    
    async def _find_fuzzy_match(
        self, 
        account_id: str, 
        mcp_qualified_name: str
    ) -> List[MCPCredentialProfile]:
        all_profiles = await self._profile_repo.find_by_account(account_id)
        req_name_clean = mcp_qualified_name.replace("pipedream:", "").lower()
        
        matching_profiles = []
        for profile in all_profiles:
            profile_name_clean = profile.mcp_qualified_name.replace("pipedream:", "").lower()
            if req_name_clean == profile_name_clean:
                matching_profiles.append(profile)
        
        return matching_profiles 