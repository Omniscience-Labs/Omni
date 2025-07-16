from typing import List, Optional, Dict, Any
from uuid import UUID
from ..protocols import ProfileRepository, ExternalUserIdGeneratorService, MCPQualifiedNameService, ProfileConfigurationService, ConnectionStatusService, Logger
from ..domain.entities import Profile
from ..domain.value_objects import ExternalUserId, AppSlug, ProfileName, EncryptedConfig, ConfigHash
from ..domain.exceptions import ProfileNotFoundError, ProfileAlreadyExistsError
import json


class ProfileService:
    def __init__(
        self,
        profile_repo: ProfileRepository,
        external_user_id_service: ExternalUserIdGeneratorService,
        mcp_qualified_name_service: MCPQualifiedNameService,
        profile_config_service: ProfileConfigurationService,
        connection_status_service: ConnectionStatusService,
        logger: Logger
    ):
        self._profile_repo = profile_repo
        self._external_user_id_service = external_user_id_service
        self._mcp_qualified_name_service = mcp_qualified_name_service
        self._profile_config_service = profile_config_service
        self._connection_status_service = connection_status_service
        self._logger = logger

    async def create_profile(
        self,
        account_id: UUID,
        profile_name: str,
        app_slug: str,
        app_name: str,
        description: Optional[str] = None,
        is_default: bool = False,
        oauth_app_id: Optional[str] = None,
        enabled_tools: Optional[List[str]] = None,
        external_user_id: Optional[str] = None
    ) -> Profile:
        app_slug_vo = AppSlug(app_slug)
        profile_name_vo = ProfileName(profile_name)
        
        if external_user_id:
            external_user_id_vo = ExternalUserId(external_user_id)
        else:
            external_user_id_vo = self._external_user_id_service.generate(
                str(account_id), app_slug_vo, profile_name_vo
            )

        mcp_qualified_name = self._mcp_qualified_name_service.generate(app_slug_vo)

        config = {
            "app_slug": app_slug,
            "app_name": app_name,
            "external_user_id": external_user_id_vo.value,
            "oauth_app_id": oauth_app_id,
            "enabled_tools": enabled_tools or [],
            "description": description
        }

        if not self._profile_config_service.validate_config(config):
            raise ValueError("Invalid profile configuration")

        config_json = json.dumps(config)
        
        profile = Profile(
            profile_id=UUID(int=0),
            account_id=account_id,
            mcp_qualified_name=mcp_qualified_name,
            profile_name=profile_name_vo,
            display_name=profile_name,
            encrypted_config=EncryptedConfig("placeholder"),
            config_hash=ConfigHash.from_config(config_json),
            app_slug=app_slug_vo,
            app_name=app_name,
            external_user_id=external_user_id_vo,
            enabled_tools=enabled_tools or [],
            is_default=is_default
        )

        if is_default:
            await self._profile_repo.set_default(account_id, profile.profile_id, mcp_qualified_name)

        created_profile = await self._profile_repo.create(profile)
        self._logger.info(f"Created profile {created_profile.profile_id} for app {app_slug}")
        
        return created_profile

    async def get_profile(self, account_id: UUID, profile_id: UUID) -> Optional[Profile]:
        profile = await self._profile_repo.get_by_id(account_id, profile_id)
        if profile:
            return await self._connection_status_service.update_connection_status(profile)
        return None

    async def get_profiles(
        self,
        account_id: UUID,
        app_slug: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> List[Profile]:
        app_slug_vo = AppSlug(app_slug) if app_slug else None
        profiles = await self._profile_repo.find_by_account(account_id, app_slug_vo, is_active)
        
        updated_profiles = []
        for profile in profiles:
            updated_profile = await self._connection_status_service.update_connection_status(profile)
            updated_profiles.append(updated_profile)
        
        return updated_profiles

    async def update_profile(
        self,
        account_id: UUID,
        profile_id: UUID,
        profile_name: Optional[str] = None,
        display_name: Optional[str] = None,
        is_active: Optional[bool] = None,
        is_default: Optional[bool] = None,
        enabled_tools: Optional[List[str]] = None
    ) -> Profile:
        profile = await self._profile_repo.get_by_id(account_id, profile_id)
        if not profile:
            raise ProfileNotFoundError(str(profile_id))

        if profile_name:
            profile.profile_name = ProfileName(profile_name)
        if display_name:
            profile.display_name = display_name
        if is_active is not None:
            if is_active:
                profile.activate()
            else:
                profile.deactivate()
        if is_default is not None:
            if is_default:
                await self._profile_repo.set_default(account_id, profile_id, profile.mcp_qualified_name)
                profile.set_as_default()
            else:
                profile.unset_as_default()
        if enabled_tools is not None:
            profile.enabled_tools = enabled_tools

        updated_profile = await self._profile_repo.update(profile)
        self._logger.info(f"Updated profile {profile_id}")
        
        return updated_profile

    async def delete_profile(self, account_id: UUID, profile_id: UUID) -> bool:
        success = await self._profile_repo.delete(account_id, profile_id)
        if success:
            self._logger.info(f"Deleted profile {profile_id}")
        return success

    async def get_profile_by_app(
        self,
        account_id: UUID,
        app_slug: str,
        profile_name: Optional[str] = None
    ) -> Optional[Profile]:
        app_slug_vo = AppSlug(app_slug)
        profile_name_vo = ProfileName(profile_name) if profile_name else None
        
        profile = await self._profile_repo.get_by_app_slug(account_id, app_slug_vo, profile_name_vo)
        if profile:
            return await self._connection_status_service.update_connection_status(profile)
        return None 