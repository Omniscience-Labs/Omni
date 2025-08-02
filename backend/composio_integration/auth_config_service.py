from typing import Optional, List
from composio_client import Composio
from utils.logger import logger
from pydantic import BaseModel

from .client import ComposioClient


class AuthConfig(BaseModel):
    id: str
    auth_scheme: str
    is_composio_managed: bool = True
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
            
            # Access Pydantic model attributes directly
            auth_config_obj = response.auth_config
            
            auth_config = AuthConfig(
                id=auth_config_obj.id,
                auth_scheme=auth_config_obj.auth_scheme,
                is_composio_managed=getattr(auth_config_obj, 'is_composio_managed', True),
                restrict_to_following_tools=getattr(auth_config_obj, 'restrict_to_following_tools', []),
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
            
            response = self.client.auth_configs.get(auth_config_id)
            
            if not response:
                return None
            
            # Access Pydantic model attributes directly
            return AuthConfig(
                id=response.id,
                auth_scheme=response.auth_scheme,
                is_composio_managed=getattr(response, 'is_composio_managed', True),
                restrict_to_following_tools=getattr(response, 'restrict_to_following_tools', []),
                toolkit_slug=getattr(response, 'toolkit_slug', '')
            )
            
        except Exception as e:
            logger.error(f"Failed to get auth config {auth_config_id}: {e}", exc_info=True)
            raise
    
    async def list_auth_configs(self, toolkit_slug: Optional[str] = None) -> List[AuthConfig]:
        try:
            logger.info(f"Listing auth configs for toolkit: {toolkit_slug}")
            
            if toolkit_slug:
                response = self.client.auth_configs.list(toolkit=toolkit_slug)
            else:
                response = self.client.auth_configs.list()
            
            auth_configs = []
            items = getattr(response, 'items', [])
            
            for item in items:
                auth_config = AuthConfig(
                    id=item.id,
                    auth_scheme=item.auth_scheme,
                    is_composio_managed=getattr(item, 'is_composio_managed', True),
                    restrict_to_following_tools=getattr(item, 'restrict_to_following_tools', []),
                    toolkit_slug=getattr(item, 'toolkit_slug', toolkit_slug or '')
                )
                auth_configs.append(auth_config)
            
            logger.info(f"Successfully listed {len(auth_configs)} auth configs")
            return auth_configs
            
        except Exception as e:
            logger.error(f"Failed to list auth configs: {e}", exc_info=True)
            raise 