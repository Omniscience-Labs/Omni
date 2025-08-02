from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from utils.logger import logger
from .client import ComposioClient


class AuthConfig(BaseModel):
    id: str
    auth_scheme: str
    is_composio_managed: bool
    restrict_to_following_tools: List[str] = []
    toolkit_slug: str


class AuthConfigService:
    def __init__(self, api_key: Optional[str] = None):
        self.client = ComposioClient.get_client(api_key)
    
    async def create_auth_config(self, toolkit_slug: str) -> AuthConfig:
        try:
            logger.info(f"Creating auth config for toolkit: {toolkit_slug}")
            
            response = self.client.auth_configs.create(
                toolkit={"slug": toolkit_slug}
            )
            
            auth_config_data = response.get("auth_config", {})
            
            auth_config = AuthConfig(
                id=auth_config_data.get("id"),
                auth_scheme=auth_config_data.get("auth_scheme"),
                is_composio_managed=auth_config_data.get("is_composio_managed", True),
                restrict_to_following_tools=auth_config_data.get("restrict_to_following_tools", []),
                toolkit_slug=toolkit_slug
            )
            
            logger.info(f"Successfully created auth config: {auth_config.id}")
            return auth_config
            
        except Exception as e:
            logger.error(f"Failed to create auth config for {toolkit_slug}: {e}", exc_info=True)
            raise
    
    async def get_auth_config(self, auth_config_id: str) -> Optional[AuthConfig]:
        try:
            logger.info(f"Fetching auth config: {auth_config_id}")
            
            logger.warning(f"Get auth config not implemented in SDK for ID: {auth_config_id}")
            return None
            
        except Exception as e:
            logger.error(f"Failed to get auth config {auth_config_id}: {e}", exc_info=True)
            raise
    
    async def list_auth_configs(self) -> List[AuthConfig]:
        try:
            logger.info("Listing auth configs")
            
            logger.warning("List auth configs not implemented in SDK")
            return []
            
        except Exception as e:
            logger.error(f"Failed to list auth configs: {e}", exc_info=True)
            raise
    
    async def delete_auth_config(self, auth_config_id: str) -> bool:
        try:
            logger.info(f"Deleting auth config: {auth_config_id}")
            
            logger.warning(f"Delete auth config not implemented in SDK for ID: {auth_config_id}")
            return False
            
        except Exception as e:
            logger.error(f"Failed to delete auth config {auth_config_id}: {e}", exc_info=True)
            raise 