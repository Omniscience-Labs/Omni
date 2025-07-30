from typing import List, Optional, Dict, Any, Protocol
from uuid import UUID
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import json
import hashlib
import re
import logging

@dataclass(frozen=True)
class ExternalUserId:
    value: str
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("ExternalUserId must be a non-empty string")
        if len(self.value) > 255:
            raise ValueError("ExternalUserId must be less than 255 characters")

@dataclass(frozen=True)
class AppSlug:
    value: str
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("AppSlug must be a non-empty string")
        if not re.match(r'^[a-z0-9_-]+$', self.value):
            raise ValueError("AppSlug must contain only lowercase letters, numbers, hyphens, and underscores")

@dataclass(frozen=True)
class ProfileName:
    value: str
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("ProfileName must be a non-empty string")
        if len(self.value) > 100:
            raise ValueError("ProfileName must be less than 100 characters")

@dataclass(frozen=True)
class EncryptedConfig:
    value: str
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("EncryptedConfig must be a non-empty string")

@dataclass(frozen=True)
class ConfigHash:
    value: str
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("ConfigHash must be a non-empty string")
        if len(self.value) != 64:
            raise ValueError("ConfigHash must be a 64-character SHA256 hash")
    
    @classmethod
    def from_config(cls, config: str) -> 'ConfigHash':
        hash_value = hashlib.sha256(config.encode()).hexdigest()
        return cls(hash_value)

@dataclass
class Profile:
    profile_id: UUID
    account_id: UUID
    mcp_qualified_name: str
    profile_name: ProfileName
    display_name: str
    encrypted_config: EncryptedConfig
    config_hash: ConfigHash
    app_slug: AppSlug
    app_name: str
    external_user_id: ExternalUserId
    enabled_tools: List[str] = field(default_factory=list)
    is_active: bool = True
    is_default: bool = False
    is_connected: bool = False
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    last_used_at: Optional[datetime] = None
    
    def update_last_used(self) -> None:
        self.last_used_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
    
    def activate(self) -> None:
        self.is_active = True
        self.updated_at = datetime.utcnow()
    
    def deactivate(self) -> None:
        self.is_active = False
        self.updated_at = datetime.utcnow()
    
    def set_as_default(self) -> None:
        self.is_default = True
        self.updated_at = datetime.utcnow()
    
    def unset_as_default(self) -> None:
        self.is_default = False
        self.updated_at = datetime.utcnow()
    
    def update_connection_status(self, is_connected: bool) -> None:
        self.is_connected = is_connected
        self.updated_at = datetime.utcnow()
    
    def enable_tool(self, tool_name: str) -> None:
        if tool_name not in self.enabled_tools:
            self.enabled_tools.append(tool_name)
            self.updated_at = datetime.utcnow()
    
    def disable_tool(self, tool_name: str) -> None:
        if tool_name in self.enabled_tools:
            self.enabled_tools.remove(tool_name)
            self.updated_at = datetime.utcnow()
    
    def get_mcp_qualified_name(self) -> str:
        return f"pipedream:{self.app_slug.value}"

class PipedreamException(Exception):
    def __init__(self, message: str, error_code: str = None):
        super().__init__(message)
        self.error_code = error_code
        self.message = message

class DomainException(PipedreamException):
    pass

class ProfileNotFoundError(DomainException):
    def __init__(self, profile_id: str):
        super().__init__(f"Profile with ID {profile_id} not found", "PROFILE_NOT_FOUND")
        self.profile_id = profile_id

class ProfileAlreadyExistsError(DomainException):
    def __init__(self, profile_name: str, app_slug: str):
        super().__init__(f"Profile '{profile_name}' already exists for app '{app_slug}'", "PROFILE_ALREADY_EXISTS")
        self.profile_name = profile_name
        self.app_slug = app_slug

class DatabaseException(PipedreamException):
    def __init__(self, operation: str, reason: str):
        super().__init__(f"Database operation '{operation}' failed: {reason}", "DATABASE_ERROR")
        self.operation = operation
        self.reason = reason

class EncryptionException(PipedreamException):
    def __init__(self, operation: str, reason: str):
        super().__init__(f"Encryption operation '{operation}' failed: {reason}", "ENCRYPTION_ERROR")
        self.operation = operation
        self.reason = reason

class DatabaseConnection(Protocol):
    async def client(self) -> Any: ...

class Logger(Protocol):
    def info(self, message: str) -> None: ...
    def warning(self, message: str) -> None: ...
    def error(self, message: str) -> None: ...
    def debug(self, message: str) -> None: ...


class EncryptionService:
    def encrypt(self, data: str) -> str:
        try:
            from utils.encryption import encrypt_data
            return encrypt_data(data)
        except Exception as e:
            raise EncryptionException("encrypt", str(e))
    
    def decrypt(self, encrypted_data: str) -> str:
        try:
            from utils.encryption import decrypt_data
            return decrypt_data(encrypted_data)
        except Exception as e:
            raise EncryptionException("decrypt", str(e))

class ExternalUserIdService:
    def generate(self, account_id: str, app_slug: AppSlug, profile_name: ProfileName) -> ExternalUserId:
        combined = f"{account_id}:{app_slug.value}:{profile_name.value}"
        hash_value = hashlib.sha256(combined.encode()).hexdigest()[:16]
        external_user_id = f"suna_{hash_value}"
        return ExternalUserId(external_user_id)

class MCPQualifiedNameService:
    def generate(self, app_slug: AppSlug) -> str:
        return f"pipedream:{app_slug.value}"

class ProfileConfigurationService:
    def validate_config(self, config: Dict[str, Any]) -> bool:
        required_keys = ["app_slug", "app_name", "external_user_id"]
        return all(key in config for key in required_keys)
    
    def merge_config(self, existing_config: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
        merged = existing_config.copy()
        merged.update(updates)
        return merged

class ConnectionStatusService:
    def __init__(self, logger: Logger):
        self._logger = logger
    
    async def check_connection_status(self, profile: Profile) -> bool:
        return True
    
    async def update_connection_status(self, profile: Profile) -> Profile:
        try:
            is_connected = await self.check_connection_status(profile)
            profile.update_connection_status(is_connected)
            return profile
        except Exception as e:
            self._logger.warning(f"Error updating connection status: {str(e)}")
            profile.update_connection_status(False)
            return profile


class ProfileRepository:
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

class ProfileService:
    def __init__(
        self,
        db: Optional[DatabaseConnection] = None,
        logger: Optional[Logger] = None
    ):
        self._logger = logger or logging.getLogger(__name__)
        
        if db is None:
            from services.supabase import DBConnection
            self._db = DBConnection()
        else:
            self._db = db
        
        self._encryption_service = EncryptionService()
        self._profile_repo = ProfileRepository(self._db, self._encryption_service, self._logger)
        self._external_user_id_service = ExternalUserIdService()
        self._mcp_qualified_name_service = MCPQualifiedNameService()
        self._profile_config_service = ProfileConfigurationService()
        self._connection_status_service = ConnectionStatusService(self._logger)

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