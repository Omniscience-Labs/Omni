from typing import List, Dict, Any

from ..domain.entities import MCPRequirement, MCPCredential, MCPCredentialProfile
from ..domain.exceptions import CredentialAccessDeniedError, ProfileAccessDeniedError
from ..protocols import Logger


class CredentialValidator:
    def __init__(self, logger: Logger):
        self._logger = logger
    
    def validate_access(self, credential: MCPCredential, account_id: str) -> None:
        if credential.account_id != account_id:
            raise CredentialAccessDeniedError("Access denied to credential")
    
    def validate_profile_access(self, profile: MCPCredentialProfile, account_id: str) -> None:
        if profile.account_id != account_id:
            raise ProfileAccessDeniedError("Access denied to profile")
    
    def get_missing_credentials(
        self, 
        user_credentials: List[MCPCredential], 
        requirements: List[MCPRequirement]
    ) -> List[MCPRequirement]:
        user_mcp_names = {cred.mcp_qualified_name for cred in user_credentials}
        
        missing = []
        for req in requirements:
            if req.custom_type:
                custom_pattern = f"custom_{req.custom_type}_"
                found = any(
                    cred_name.startswith(custom_pattern) and 
                    req.display_name.lower().replace(' ', '_') in cred_name
                    for cred_name in user_mcp_names
                )
                if not found:
                    missing.append(req)
            else:
                if req.qualified_name not in user_mcp_names:
                    missing.append(req)
        
        return missing
    
    def validate_credential_mappings(
        self, 
        mappings: Dict[str, str], 
        requirements: List[MCPRequirement]
    ) -> List[str]:
        missing_mappings = []
        
        for req in requirements:
            if req.qualified_name not in mappings:
                missing_mappings.append(req.qualified_name)
        
        return missing_mappings 