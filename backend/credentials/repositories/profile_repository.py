from abc import abstractmethod
from typing import List, Optional, Dict, Any
import base64
from datetime import datetime, timezone

from .base import Repository
from ..domain.entities import MCPCredentialProfile, ProfileRequest
from ..protocols import DatabaseConnection, Logger, EncryptionService


class ProfileRepository(Repository[MCPCredentialProfile]):
    @abstractmethod
    async def find_by_account_and_qualified_name(
        self, account_id: str, mcp_qualified_name: str
    ) -> List[MCPCredentialProfile]:
        pass
    
    @abstractmethod
    async def find_by_account(self, account_id: str) -> List[MCPCredentialProfile]:
        pass
    
    @abstractmethod
    async def find_default_profile(
        self, account_id: str, mcp_qualified_name: str
    ) -> Optional[MCPCredentialProfile]:
        pass
    
    @abstractmethod
    async def store_profile(self, request: ProfileRequest) -> str:
        pass
    
    @abstractmethod
    async def set_default(self, account_id: str, profile_id: str) -> bool:
        pass
    
    @abstractmethod
    async def deactivate_profile(self, account_id: str, profile_id: str) -> bool:
        pass


class SupabaseProfileRepository(ProfileRepository):
    def __init__(self, db: DatabaseConnection, encryption: EncryptionService, logger: Logger):
        self._db = db
        self._encryption = encryption
        self._logger = logger
    
    async def find_by_id(self, profile_id: str) -> Optional[MCPCredentialProfile]:
        try:
            client = await self._db.client
            result = await client.table('user_mcp_credential_profiles').select('*')\
                .eq('profile_id', profile_id)\
                .eq('is_active', True)\
                .execute()
            
            if not result.data:
                return None
            
            profile = self._map_to_profile(result.data[0])
            
            await client.table('user_mcp_credential_profiles')\
                .update({'last_used_at': datetime.now(timezone.utc).isoformat()})\
                .eq('profile_id', profile_id)\
                .execute()
            
            return profile
            
        except Exception as e:
            self._logger.error(f"Error finding profile {profile_id}: {str(e)}")
            return None
    
    async def save(self, profile: MCPCredentialProfile) -> MCPCredentialProfile:
        raise NotImplementedError("Use store_profile method instead")
    
    async def delete(self, profile_id: str) -> bool:
        try:
            client = await self._db.client
            result = await client.table('user_mcp_credential_profiles')\
                .update({'is_active': False})\
                .eq('profile_id', profile_id)\
                .execute()
            
            return len(result.data) > 0
            
        except Exception as e:
            self._logger.error(f"Error deleting profile {profile_id}: {str(e)}")
            return False
    
    async def find_by_account_and_qualified_name(
        self, account_id: str, mcp_qualified_name: str
    ) -> List[MCPCredentialProfile]:
        try:
            client = await self._db.client
            result = await client.table('user_mcp_credential_profiles').select('*')\
                .eq('account_id', account_id)\
                .eq('mcp_qualified_name', mcp_qualified_name)\
                .eq('is_active', True)\
                .order('is_default', desc=True)\
                .order('created_at', desc=False)\
                .execute()
            
            profiles = []
            for profile_data in result.data:
                try:
                    profile = self._map_to_profile(profile_data)
                    profiles.append(profile)
                except Exception as e:
                    self._logger.error(f"Failed to decrypt profile {profile_data['profile_id']}: {e}")
                    continue
            
            return profiles
            
        except Exception as e:
            self._logger.error(f"Error retrieving profiles: {str(e)}")
            return []
    
    async def find_by_account(self, account_id: str) -> List[MCPCredentialProfile]:
        try:
            client = await self._db.client
            result = await client.table('user_mcp_credential_profiles').select('*')\
                .eq('account_id', account_id)\
                .eq('is_active', True)\
                .order('mcp_qualified_name')\
                .order('is_default', desc=True)\
                .order('created_at', desc=False)\
                .execute()
            
            profiles = []
            for profile_data in result.data:
                try:
                    profile = self._map_to_profile(profile_data)
                    profiles.append(profile)
                except Exception as e:
                    self._logger.error(f"Failed to decrypt profile {profile_data['profile_id']}: {e}")
                    continue
            
            return profiles
            
        except Exception as e:
            self._logger.error(f"Error retrieving all profiles: {str(e)}")
            return []
    
    async def find_default_profile(
        self, account_id: str, mcp_qualified_name: str
    ) -> Optional[MCPCredentialProfile]:
        profiles = await self.find_by_account_and_qualified_name(account_id, mcp_qualified_name)
        
        for profile in profiles:
            if profile.is_default:
                return profile
        
        return profiles[0] if profiles else None
    
    async def store_profile(self, request: ProfileRequest) -> str:
        try:
            encrypted_config, config_hash = self._encryption.encrypt_config(request.config)
            
            client = await self._db.client
            encoded_config = base64.b64encode(encrypted_config).decode('utf-8')
            
            if not request.is_default:
                existing_profiles = await self.find_by_account_and_qualified_name(
                    request.account_id, request.mcp_qualified_name
                )
                if not existing_profiles:
                    request.is_default = True
            
            result = await client.table('user_mcp_credential_profiles').upsert({
                'account_id': request.account_id,
                'mcp_qualified_name': request.mcp_qualified_name,
                'profile_name': request.profile_name,
                'display_name': request.display_name,
                'encrypted_config': encoded_config,
                'config_hash': config_hash,
                'is_active': True,
                'is_default': request.is_default,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }, on_conflict='account_id,mcp_qualified_name,profile_name').execute()
            
            if not result.data:
                raise ValueError("Failed to store profile")
            
            profile_id = result.data[0]['profile_id']
            self._logger.info(f"Successfully stored profile {profile_id}")
            return profile_id
            
        except Exception as e:
            self._logger.error(f"Error storing profile: {str(e)}")
            raise
    
    async def set_default(self, account_id: str, profile_id: str) -> bool:
        try:
            client = await self._db.client
            
            profile = await self.find_by_id(profile_id)
            if not profile or profile.account_id != account_id:
                return False
            
            result = await client.table('user_mcp_credential_profiles')\
                .update({'is_default': True})\
                .eq('profile_id', profile_id)\
                .eq('account_id', account_id)\
                .execute()
            
            return len(result.data) > 0
            
        except Exception as e:
            self._logger.error(f"Error setting default profile: {str(e)}")
            return False
    
    async def deactivate_profile(self, account_id: str, profile_id: str) -> bool:
        try:
            client = await self._db.client
            
            profile = await self.find_by_id(profile_id)
            if not profile or profile.account_id != account_id:
                return False
            
            if profile.is_default:
                other_profiles = await self.find_by_account_and_qualified_name(
                    account_id, profile.mcp_qualified_name
                )
                other_active_profiles = [p for p in other_profiles if p.profile_id != profile_id]
                
                if other_active_profiles:
                    await self.set_default(account_id, other_active_profiles[0].profile_id)
            
            result = await client.table('user_mcp_credential_profiles')\
                .update({'is_active': False})\
                .eq('profile_id', profile_id)\
                .eq('account_id', account_id)\
                .execute()
            
            return len(result.data) > 0
            
        except Exception as e:
            self._logger.error(f"Error deactivating profile: {str(e)}")
            return False
    
    def _map_to_profile(self, data: Dict[str, Any]) -> MCPCredentialProfile:
        encrypted_config = data['encrypted_config']
        if isinstance(encrypted_config, str):
            encrypted_config_bytes = base64.b64decode(encrypted_config.encode('utf-8'))
        else:
            encrypted_config_bytes = encrypted_config
        
        config = self._encryption.decrypt_config(
            encrypted_config_bytes, 
            data['config_hash']
        )
        
        return MCPCredentialProfile(
            profile_id=data['profile_id'],
            account_id=data['account_id'],
            mcp_qualified_name=data['mcp_qualified_name'],
            profile_name=data['profile_name'],
            display_name=data['display_name'],
            config=config,
            is_active=data['is_active'],
            is_default=data['is_default'],
            last_used_at=data.get('last_used_at'),
            created_at=data.get('created_at'),
            updated_at=data.get('updated_at')
        ) 