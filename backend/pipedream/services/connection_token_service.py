import os
from typing import Dict, Any, Optional
from ..protocols import ConnectionTokenService, HttpClient, Logger
from ..domain.value_objects import ExternalUserId, AppSlug
from ..domain.exceptions import AuthenticationException


class ConnectionTokenService:
    def __init__(self, http_client: HttpClient, logger: Logger):
        self._http_client = http_client
        self._logger = logger

    async def create(self, external_user_id: ExternalUserId, app: Optional[AppSlug] = None) -> Dict[str, Any]:
        project_id = os.getenv("PIPEDREAM_PROJECT_ID")
        environment = os.getenv("PIPEDREAM_X_PD_ENVIRONMENT", "development")
        
        if not project_id:
            raise AuthenticationException("Missing PIPEDREAM_PROJECT_ID")
        
        url = f"{self._http_client.base_url}/connect/{project_id}/tokens"
        
        payload = {
            "external_user_id": external_user_id.value
        }
        
        if app:
            payload["app"] = app.value
        
        headers = {
            "X-PD-Environment": environment
        }
        
        self._logger.info(f"Creating connection token for user: {external_user_id.value}")
        
        try:
            data = await self._http_client.post(url, headers=headers, json=payload)
            
            if app and "connect_link_url" in data:
                link = data["connect_link_url"]
                if "app=" not in link:
                    separator = "&" if "?" in link else "?"
                    data["connect_link_url"] = f"{link}{separator}app={app.value}"
            
            self._logger.info(f"Successfully created connection token for user: {external_user_id.value}")
            return data
            
        except Exception as e:
            self._logger.error(f"Error creating connection token: {str(e)}")
            raise 