from abc import abstractmethod
from typing import List, Optional, Dict, Any
import base64
from datetime import datetime, timezone

from .base import Repository
from ..domain.entities import MCPCredential, CredentialRequest
from ..protocols import DatabaseConnection, Logger, EncryptionService


class CredentialRepository(Repository[MCPCredential]):
    @abstractmethod
    async def find_by_account_and_qualified_name(
        self, account_id: str, mcp_qualified_name: str
    ) -> Optional[MCPCredential]:
        pass
    
    @abstractmethod
    async def find_by_account(
        self, account_id: str
    ) -> List[MCPCredential]:
        pass
    
    @abstractmethod
    async def store_credential(self, request: CredentialRequest) -> str:
        pass
    
    @abstractmethod
    async def deactivate_credential(
        self, account_id: str, mcp_qualified_name: str
    ) -> bool:
        pass


class SupabaseCredentialRepository(CredentialRepository):
    def __init__(self, db: DatabaseConnection, encryption: EncryptionService, logger: Logger):
        self._db = db
        self._encryption = encryption
        self._logger = logger
    
    async def find_by_id(self, credential_id: str) -> Optional[MCPCredential]:
        try:
            client = await self._db.client
            result = await client.table('user_mcp_credentials').select('*')\
                .eq('credential_id', credential_id)\
                .eq('is_active', True)\
                .execute()
            
            if not result.data:
                return None
            
            return self._map_to_credential(result.data[0])
            
        except Exception as e:
            self._logger.error(f"Error finding credential {credential_id}: {str(e)}")
            return None
    
    async def save(self, credential: MCPCredential) -> MCPCredential:
        raise NotImplementedError("Use store_credential method instead")
    
    async def delete(self, credential_id: str) -> bool:
        try:
            client = await self._db.client
            result = await client.table('user_mcp_credentials')\
                .update({'is_active': False})\
                .eq('credential_id', credential_id)\
                .execute()
            
            return len(result.data) > 0
            
        except Exception as e:
            self._logger.error(f"Error deleting credential {credential_id}: {str(e)}")
            return False
    
    async def find_by_account_and_qualified_name(
        self, account_id: str, mcp_qualified_name: str
    ) -> Optional[MCPCredential]:
        try:
            client = await self._db.client
            result = await client.table('user_mcp_credentials').select('*')\
                .eq('account_id', account_id)\
                .eq('mcp_qualified_name', mcp_qualified_name)\
                .eq('is_active', True)\
                .execute()
            
            if not result.data:
                return None
            
            credential = self._map_to_credential(result.data[0])
            
            await client.table('user_mcp_credentials')\
                .update({'last_used_at': datetime.now(timezone.utc).isoformat()})\
                .eq('credential_id', result.data[0]['credential_id'])\
                .execute()
            
            return credential
            
        except Exception as e:
            self._logger.error(f"Error finding credential: {str(e)}")
            return None
    
    async def find_by_account(self, account_id: str) -> List[MCPCredential]:
        try:
            client = await self._db.client
            result = await client.table('user_mcp_credentials').select('*')\
                .eq('account_id', account_id)\
                .eq('is_active', True)\
                .order('created_at', desc=True)\
                .execute()
            
            credentials = []
            for cred_data in result.data:
                try:
                    credential = self._map_to_credential(cred_data)
                    credentials.append(credential)
                except Exception as e:
                    self._logger.error(f"Failed to decrypt credential {cred_data['credential_id']}: {e}")
                    continue
            
            return credentials
            
        except Exception as e:
            self._logger.error(f"Error retrieving user credentials: {str(e)}")
            return []
    
    async def store_credential(self, request: CredentialRequest) -> str:
        try:
            encrypted_config, config_hash = self._encryption.encrypt_config(request.config)
            
            client = await self._db.client
            encoded_config = base64.b64encode(encrypted_config).decode('utf-8')
            
            result = await client.table('user_mcp_credentials').upsert({
                'account_id': request.account_id,
                'mcp_qualified_name': request.mcp_qualified_name,
                'display_name': request.display_name,
                'encrypted_config': encoded_config,
                'config_hash': config_hash,
                'is_active': True,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }, on_conflict='account_id,mcp_qualified_name').execute()
            
            if not result.data:
                raise ValueError("Failed to store credential")
            
            credential_id = result.data[0]['credential_id']
            self._logger.info(f"Successfully stored credential {credential_id}")
            return credential_id
            
        except Exception as e:
            self._logger.error(f"Error storing credential: {str(e)}")
            raise
    
    async def deactivate_credential(
        self, account_id: str, mcp_qualified_name: str
    ) -> bool:
        try:
            client = await self._db.client
            result = await client.table('user_mcp_credentials')\
                .update({'is_active': False})\
                .eq('account_id', account_id)\
                .eq('mcp_qualified_name', mcp_qualified_name)\
                .execute()
            
            return len(result.data) > 0
            
        except Exception as e:
            self._logger.error(f"Error deactivating credential: {str(e)}")
            return False
    
    def _map_to_credential(self, data: Dict[str, Any]) -> MCPCredential:
        encrypted_config = data['encrypted_config']
        if isinstance(encrypted_config, str):
            encrypted_config_bytes = base64.b64decode(encrypted_config.encode('utf-8'))
        else:
            encrypted_config_bytes = encrypted_config
        
        config = self._encryption.decrypt_config(
            encrypted_config_bytes, 
            data['config_hash']
        )
        
        return MCPCredential(
            credential_id=data['credential_id'],
            account_id=data['account_id'],
            mcp_qualified_name=data['mcp_qualified_name'],
            display_name=data['display_name'],
            config=config,
            is_active=data['is_active'],
            last_used_at=data.get('last_used_at'),
            created_at=data.get('created_at'),
            updated_at=data.get('updated_at')
        ) 