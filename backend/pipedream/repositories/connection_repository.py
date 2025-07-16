import os
from typing import List
from datetime import datetime
from ..protocols import ConnectionRepository, HttpClient, Logger
from ..domain.entities import Connection, App, AuthType
from ..domain.value_objects import ExternalUserId, AppSlug
from ..domain.exceptions import HttpClientException


class PipedreamConnectionRepository:
    def __init__(self, http_client: HttpClient, logger: Logger):
        self._http_client = http_client
        self._logger = logger

    async def get_by_external_user_id(self, external_user_id: ExternalUserId) -> List[Connection]:
        project_id = os.getenv("PIPEDREAM_PROJECT_ID")
        environment = os.getenv("PIPEDREAM_X_PD_ENVIRONMENT", "development")
        
        if not project_id:
            raise HttpClientException("Missing PIPEDREAM_PROJECT_ID", 500, "Configuration error")
        
        url = f"{self._http_client.base_url}/connect/{project_id}/accounts"
        params = {"external_id": external_user_id.value}
        headers = {"X-PD-Environment": environment}
        
        try:
            data = await self._http_client.get(url, headers=headers, params=params)
            
            connections = []
            accounts = data.get("data", [])
            
            for account in accounts:
                app_data = account.get("app", {})
                if app_data:
                    try:
                        auth_type_str = app_data.get("auth_type", "oauth")
                        auth_type = AuthType(auth_type_str)
                    except ValueError:
                        self._logger.warning(f"Unknown auth type '{auth_type_str}', using CUSTOM")
                        auth_type = AuthType.CUSTOM
                    
                    app = App(
                        name=app_data.get("name", "Unknown"),
                        slug=AppSlug(app_data.get("name_slug", "")),
                        description=app_data.get("description", ""),
                        category=app_data.get("category", "Other"),
                        logo_url=app_data.get("img_src"),
                        auth_type=auth_type,
                        is_verified=app_data.get("verified", False),
                        url=app_data.get("url"),
                        tags=app_data.get("tags", []),
                        featured_weight=app_data.get("featured_weight", 0)
                    )
                    
                    connection = Connection(
                        external_user_id=external_user_id,
                        app=app,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                        is_active=True
                    )
                    connections.append(connection)
            
            self._logger.info(f"Retrieved {len(connections)} connections for user: {external_user_id.value}")
            return connections
            
        except Exception as e:
            self._logger.error(f"Error getting connections: {str(e)}")
            return []

    async def create(self, connection: Connection) -> Connection:
        raise NotImplementedError("Connection creation is handled by Pipedream API")

    async def update(self, connection: Connection) -> Connection:
        raise NotImplementedError("Connection updates are handled by Pipedream API")

    async def delete(self, external_user_id: ExternalUserId, app_slug: AppSlug) -> bool:
        raise NotImplementedError("Connection deletion is handled by Pipedream API") 