from typing import List, Optional, Dict

from ..domain.entities import MCPCredential, CredentialRequest, MCPRequirement
from ..domain.exceptions import CredentialNotFoundError
from ..repositories.credential_repository import CredentialRepository
from ..support.validator import CredentialValidator
from ..protocols import Logger


class CredentialService:
    def __init__(
        self,
        credential_repo: CredentialRepository,
        validator: CredentialValidator,
        logger: Logger
    ):
        self._credential_repo = credential_repo
        self._validator = validator
        self._logger = logger
    
    async def store_credential(
        self,
        account_id: str,
        mcp_qualified_name: str,
        display_name: str,
        config: Dict[str, any]
    ) -> str:
        self._logger.info(f"Storing credential for {mcp_qualified_name}")
        
        request = CredentialRequest(
            account_id=account_id,
            mcp_qualified_name=mcp_qualified_name,
            display_name=display_name,
            config=config
        )
        
        return await self._credential_repo.store_credential(request)
    
    async def get_credential(
        self, 
        account_id: str, 
        mcp_qualified_name: str
    ) -> Optional[MCPCredential]:
        credential = await self._credential_repo.find_by_account_and_qualified_name(
            account_id, mcp_qualified_name
        )
        
        if credential:
            self._validator.validate_access(credential, account_id)
        
        return credential
    
    async def get_user_credentials(self, account_id: str) -> List[MCPCredential]:
        return await self._credential_repo.find_by_account(account_id)
    
    async def delete_credential(
        self, 
        account_id: str, 
        mcp_qualified_name: str
    ) -> bool:
        self._logger.info(f"Deleting credential for {mcp_qualified_name}")
        return await self._credential_repo.deactivate_credential(account_id, mcp_qualified_name)
    
    async def get_missing_credentials(
        self, 
        account_id: str, 
        requirements: List[MCPRequirement]
    ) -> List[MCPRequirement]:
        user_credentials = await self.get_user_credentials(account_id)
        return self._validator.get_missing_credentials(user_credentials, requirements)
    
    async def build_credential_mappings(
        self, 
        account_id: str, 
        requirements: List[MCPRequirement]
    ) -> Dict[str, str]:
        mappings = {}
        
        for req in requirements:
            if req.custom_type:
                user_credentials = await self.get_user_credentials(account_id)
                custom_pattern = f"custom_{req.custom_type}_"
                
                for cred in user_credentials:
                    if (cred.mcp_qualified_name.startswith(custom_pattern) and 
                        req.display_name.lower().replace(' ', '_') in cred.mcp_qualified_name):
                        mappings[req.qualified_name] = cred.credential_id
                        break
            else:
                credential = await self.get_credential(account_id, req.qualified_name)
                if credential:
                    mappings[req.qualified_name] = credential.credential_id
        
        return mappings 