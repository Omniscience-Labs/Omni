from typing import List, Optional
from uuid import UUID
import json
from datetime import datetime

from ..protocols import ProfileRepository, DatabaseConnection, EncryptionService, Logger
from ..domain.entities import Profile
from ..domain.value_objects import ExternalUserId, AppSlug, ProfileName, EncryptedConfig, ConfigHash
from ..domain.exceptions import DatabaseException, ProfileNotFoundError


class SupabaseProfileRepository:
    def __init__(self, db: DatabaseConnection, encryption_service: EncryptionService, logger: Logger):
        self._db = db
        self._encryption_service = encryption_service
        self._logger = logger

    async def create(self, profile: Profile) -> Profile:
        try:
            client = await self._db.client
            
            config = {
                "app_slug": profile.app_slug.value,
                "app_name": profile.app_name,
                "external_user_id": profile.external_user_id.value,
                "enabled_tools": profile.enabled_tools,
                "oauth_app_id": getattr(profile, 'oauth_app_id', None),
                "description": getattr(profile, 'description', None)
            }
            
            config_json = json.dumps(config)
            encrypted_config = self._encryption_service.encrypt(config_json)
            config_hash = ConfigHash.from_config(config_json)
            
            result = await client.table('user_mcp_credential_profiles').insert({
                'account_id': str(profile.account_id),
                'mcp_qualified_name': profile.mcp_qualified_name,
                'profile_name': profile.profile_name.value,
                'display_name': profile.display_name,
                'encrypted_config': encrypted_config,
                'config_hash': config_hash.value,
                'is_active': profile.is_active,
                'is_default': profile.is_default,
                'created_at': profile.created_at.isoformat(),
                'updated_at': profile.updated_at.isoformat()
            }).execute()
            
            if result.data:
                profile_data = result.data[0]
                return self._map_to_domain(profile_data, config)
            
            raise DatabaseException("create", "No data returned from insert")
            
        except Exception as e:
            self._logger.error(f"Error creating profile: {str(e)}")
            raise DatabaseException("create", str(e))

    async def get_by_id(self, account_id: UUID, profile_id: UUID) -> Optional[Profile]:
        try:
            client = await self._db.client
            
            self._logger.debug(f"Querying profile: account_id={account_id}, profile_id={profile_id}")
            
            result = await client.table('user_mcp_credential_profiles').select('*').eq(
                'account_id', str(account_id)
            ).eq('profile_id', str(profile_id)).single().execute()
            
            if result.data:
                profile_data = result.data
                self._logger.debug(f"Found profile: {profile_data.get('profile_name', 'unknown')}")
                decrypted_config = self._encryption_service.decrypt(profile_data['encrypted_config'])
                config = json.loads(decrypted_config)
                return self._map_to_domain(profile_data, config)
            
            self._logger.warning(f"Profile {profile_id} not found for user {account_id}")
            
            try:
                all_profiles_result = await client.table('user_mcp_credential_profiles').select('account_id, profile_name').eq(
                    'profile_id', str(profile_id)
                ).execute()
                
                if all_profiles_result.data:
                    other_user_id = all_profiles_result.data[0]['account_id']
                    profile_name = all_profiles_result.data[0]['profile_name']
                    self._logger.warning(f"Profile {profile_id} exists but belongs to user {other_user_id} (profile_name: {profile_name})")
                else:
                    self._logger.warning(f"Profile {profile_id} does not exist in the database")
            except Exception as debug_e:
                self._logger.warning(f"Could not check profile existence: {str(debug_e)}")
            
            return None
            
        except Exception as e:
            self._logger.error(f"Error getting profile by ID {profile_id} for user {account_id}: {str(e)}")
            return None

    async def get_by_app_slug(self, account_id: UUID, app_slug: AppSlug, profile_name: Optional[ProfileName] = None) -> Optional[Profile]:
        try:
            client = await self._db.client
            
            mcp_qualified_name = f"pipedream:{app_slug.value}"
            query = client.table('user_mcp_credential_profiles').select('*').eq(
                'account_id', str(account_id)
            ).eq('mcp_qualified_name', mcp_qualified_name)
            
            if profile_name:
                query = query.eq('profile_name', profile_name.value)
            
            result = await query.execute()
            
            if result.data:
                if profile_name:
                    profile_data = result.data[0]
                else:
                    profile_data = next((p for p in result.data if p.get('is_default')), result.data[0])
                
                decrypted_config = self._encryption_service.decrypt(profile_data['encrypted_config'])
                config = json.loads(decrypted_config)
                return self._map_to_domain(profile_data, config)
            
            return None
            
        except Exception as e:
            self._logger.error(f"Error getting profile by app slug: {str(e)}")
            return None

    async def find_by_account(self, account_id: UUID, app_slug: Optional[AppSlug] = None, is_active: Optional[bool] = None) -> List[Profile]:
        try:
            client = await self._db.client
            
            query = client.table('user_mcp_credential_profiles').select('*').eq(
                'account_id', str(account_id)
            )
            
            if app_slug:
                mcp_qualified_name = f"pipedream:{app_slug.value}"
                query = query.eq('mcp_qualified_name', mcp_qualified_name)
            else:
                query = query.like('mcp_qualified_name', 'pipedream:%')
            
            if is_active is not None:
                query = query.eq('is_active', is_active)
            
            result = await query.order('created_at', desc=True).execute()
            
            profiles = []
            for profile_data in result.data:
                try:
                    decrypted_config = self._encryption_service.decrypt(profile_data['encrypted_config'])
                    config = json.loads(decrypted_config)
                    profile = self._map_to_domain(profile_data, config)
                    profiles.append(profile)
                except Exception as e:
                    self._logger.error(f"Error decrypting profile config: {str(e)}")
                    continue
            
            return profiles
            
        except Exception as e:
            self._logger.error(f"Error finding profiles by account: {str(e)}")
            return []

    async def update(self, profile: Profile) -> Profile:
        try:
            client = await self._db.client
            
            config = {
                "app_slug": profile.app_slug.value,
                "app_name": profile.app_name,
                "external_user_id": profile.external_user_id.value,
                "enabled_tools": profile.enabled_tools,
                "oauth_app_id": getattr(profile, 'oauth_app_id', None),
                "description": getattr(profile, 'description', None)
            }
            
            config_json = json.dumps(config)
            encrypted_config = self._encryption_service.encrypt(config_json)
            config_hash = ConfigHash.from_config(config_json)
            
            result = await client.table('user_mcp_credential_profiles').update({
                'profile_name': profile.profile_name.value,
                'display_name': profile.display_name,
                'encrypted_config': encrypted_config,
                'config_hash': config_hash.value,
                'is_active': profile.is_active,
                'is_default': profile.is_default,
                'updated_at': profile.updated_at.isoformat(),
                'last_used_at': profile.last_used_at.isoformat() if profile.last_used_at else None
            }).eq('profile_id', str(profile.profile_id)).execute()
            
            if result.data:
                return self._map_to_domain(result.data[0], config)
            
            raise DatabaseException("update", "No data returned from update")
            
        except Exception as e:
            self._logger.error(f"Error updating profile: {str(e)}")
            raise DatabaseException("update", str(e))

    async def delete(self, account_id: UUID, profile_id: UUID) -> bool:
        try:
            client = await self._db.client
            
            result = await client.table('user_mcp_credential_profiles').delete().eq(
                'profile_id', str(profile_id)
            ).eq('account_id', str(account_id)).execute()
            
            return len(result.data) > 0
            
        except Exception as e:
            self._logger.error(f"Error deleting profile: {str(e)}")
            return False

    async def set_default(self, account_id: UUID, profile_id: UUID, mcp_qualified_name: str) -> None:
        try:
            client = await self._db.client
            
            await client.table('user_mcp_credential_profiles').update({
                'is_default': False
            }).eq('account_id', str(account_id)).eq('mcp_qualified_name', mcp_qualified_name).execute()
            
            await client.table('user_mcp_credential_profiles').update({
                'is_default': True
            }).eq('profile_id', str(profile_id)).execute()
            
        except Exception as e:
            self._logger.error(f"Error setting default profile: {str(e)}")
            raise DatabaseException("set_default", str(e))

    def _map_to_domain(self, profile_data: dict, config: dict) -> Profile:
        return Profile(
            profile_id=UUID(profile_data['profile_id']),
            account_id=UUID(profile_data['account_id']),
            mcp_qualified_name=profile_data['mcp_qualified_name'],
            profile_name=ProfileName(profile_data['profile_name']),
            display_name=profile_data['display_name'],
            encrypted_config=EncryptedConfig(profile_data['encrypted_config']),
            config_hash=ConfigHash(profile_data['config_hash']),
            app_slug=AppSlug(config['app_slug']),
            app_name=config['app_name'],
            external_user_id=ExternalUserId(config['external_user_id']),
            enabled_tools=config.get('enabled_tools', []),
            is_active=profile_data['is_active'],
            is_default=profile_data['is_default'],
            is_connected=False,
            created_at=datetime.fromisoformat(profile_data['created_at']),
            updated_at=datetime.fromisoformat(profile_data['updated_at']),
            last_used_at=datetime.fromisoformat(profile_data['last_used_at']) if profile_data.get('last_used_at') else None
        ) 