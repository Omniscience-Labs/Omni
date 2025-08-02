from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from utils.logger import logger
from .client import ComposioClient


class ConnectionState(BaseModel):
    auth_scheme: str
    val: Dict[str, Any]


class ConnectedAccount(BaseModel):
    id: str
    status: str
    redirect_url: Optional[str] = None
    redirect_uri: Optional[str] = None
    connection_data: ConnectionState
    auth_config_id: str
    user_id: str
    deprecated: Optional[Dict[str, str]] = None


class ConnectedAccountService:
    def __init__(self, api_key: Optional[str] = None):
        self.client = ComposioClient.get_client(api_key)
    
    async def create_connected_account(
        self, 
        auth_config_id: str, 
        user_id: str = "default"
    ) -> ConnectedAccount:
        try:
            logger.info(f"Creating connected account for auth_config: {auth_config_id}, user: {user_id}")
            
            response = self.client.connected_accounts.create(
                auth_config={"id": auth_config_id},
                connection={
                    "user_id": user_id,
                    "state": {
                        "authScheme": "OAUTH2",
                        "val": {
                            "status": "INITIALIZING"
                        }
                    }
                }
            )
            
            connection_data = ConnectionState(
                auth_scheme=response.get("connectionData", {}).get("authScheme", "OAUTH2"),
                val=response.get("connectionData", {}).get("val", {})
            )
            
            connected_account = ConnectedAccount(
                id=response.get("id"),
                status=response.get("status"),
                redirect_url=response.get("redirect_url"),
                redirect_uri=response.get("redirect_uri"),
                connection_data=connection_data,
                auth_config_id=auth_config_id,
                user_id=user_id,
                deprecated=response.get("deprecated")
            )
            
            logger.info(f"Successfully created connected account: {connected_account.id}")
            return connected_account
            
        except Exception as e:
            logger.error(f"Failed to create connected account: {e}", exc_info=True)
            raise
    
    async def get_connected_account(self, account_id: str) -> Optional[ConnectedAccount]:
        try:
            logger.info(f"Fetching connected account: {account_id}")
            
            logger.warning(f"Get connected account not implemented in SDK for ID: {account_id}")
            return None
            
        except Exception as e:
            logger.error(f"Failed to get connected account {account_id}: {e}", exc_info=True)
            raise
    
    async def list_connected_accounts(self, user_id: Optional[str] = None) -> List[ConnectedAccount]:
        try:
            logger.info(f"Listing connected accounts for user: {user_id}")
            
            logger.warning("List connected accounts not implemented in SDK")
            return []
            
        except Exception as e:
            logger.error(f"Failed to list connected accounts: {e}", exc_info=True)
            raise
    
    async def delete_connected_account(self, account_id: str) -> bool:
        try:
            logger.info(f"Deleting connected account: {account_id}")
            
            logger.warning(f"Delete connected account not implemented in SDK for ID: {account_id}")
            return False
            
        except Exception as e:
            logger.error(f"Failed to delete connected account {account_id}: {e}", exc_info=True)
            raise
    
    async def get_auth_status(self, account_id: str) -> Dict[str, Any]:
        try:
            logger.info(f"Getting auth status for account: {account_id}")
            
            logger.warning(f"Get auth status not implemented in SDK for ID: {account_id}")
            return {"status": "unknown"}
            
        except Exception as e:
            logger.error(f"Failed to get auth status for {account_id}: {e}", exc_info=True)
            raise 