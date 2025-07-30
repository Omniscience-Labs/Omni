from typing import List, Optional, Protocol, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import os
import logging
import re
import httpx
from uuid import UUID
import json

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

class AuthType(Enum):
    OAUTH = "oauth"
    API_KEY = "api_key"
    BASIC = "basic" 
    NONE = "none"
    KEYS = "keys"
    CUSTOM = "custom"
    
    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            return cls.CUSTOM
        return super()._missing_(value)

@dataclass
class App:
    name: str
    slug: AppSlug
    description: str
    category: str
    logo_url: Optional[str] = None
    auth_type: AuthType = AuthType.OAUTH
    is_verified: bool = False
    url: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    featured_weight: int = 0
    
    def is_featured(self) -> bool:
        return self.featured_weight > 0

@dataclass
class Connection:
    external_user_id: ExternalUserId
    app: App
    created_at: datetime
    updated_at: datetime
    is_active: bool = True
    
    def activate(self) -> None:
        self.is_active = True
        self.updated_at = datetime.utcnow()
    
    def deactivate(self) -> None:
        self.is_active = False
        self.updated_at = datetime.utcnow()

# Exceptions
class PipedreamException(Exception):
    def __init__(self, message: str, error_code: str = None):
        super().__init__(message)
        self.error_code = error_code
        self.message = message

class HttpClientException(PipedreamException):
    def __init__(self, url: str, status_code: int, reason: str):
        super().__init__(f"HTTP request to {url} failed with status {status_code}: {reason}", "HTTP_CLIENT_ERROR")
        self.url = url
        self.status_code = status_code
        self.reason = reason

class AuthenticationException(PipedreamException):
    def __init__(self, reason: str):
        super().__init__(f"Authentication failed: {reason}", "AUTHENTICATION_ERROR")
        self.reason = reason

class RateLimitException(PipedreamException):
    def __init__(self, retry_after: int = None):
        super().__init__("Rate limit exceeded", "RATE_LIMIT_EXCEEDED")
        self.retry_after = retry_after

class Logger(Protocol):
    def info(self, message: str) -> None: ...
    def warning(self, message: str) -> None: ...
    def error(self, message: str) -> None: ...
    def debug(self, message: str) -> None: ...

class HttpClient:
    def __init__(self):
        self.base_url = "https://api.pipedream.com/v1"
        self.session: Optional[httpx.AsyncClient] = None
        self.access_token: Optional[str] = None
        self.token_expires_at: Optional[datetime] = None
        self.rate_limit_token: Optional[str] = None
        
    async def _get_session(self) -> httpx.AsyncClient:
        if self.session is None or self.session.is_closed:
            self.session = httpx.AsyncClient(
                timeout=httpx.Timeout(30.0),
                headers={"User-Agent": "Suna-Pipedream-Client/1.0"}
            )
        return self.session
    
    async def _ensure_access_token(self) -> str:
        if self.access_token and self.token_expires_at:
            if datetime.utcnow() < (self.token_expires_at - timedelta(minutes=5)):
                return self.access_token
            else:
                self.access_token = None
                self.token_expires_at = None
        
        return await self._fetch_fresh_token()
    
    async def _fetch_fresh_token(self) -> str:
        project_id = os.getenv("PIPEDREAM_PROJECT_ID")
        client_id = os.getenv("PIPEDREAM_CLIENT_ID")
        client_secret = os.getenv("PIPEDREAM_CLIENT_SECRET")
        
        if not all([project_id, client_id, client_secret]):
            raise AuthenticationException("Missing required environment variables")
        
        session = await self._get_session()
        
        try:
            response = await session.post(
                f"{self.base_url}/oauth/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret
                }
            )
            response.raise_for_status()
            
            data = response.json()
            self.access_token = data["access_token"]
            
            expires_in = data.get("expires_in", 3600)
            self.token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
            
            return self.access_token
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise RateLimitException()
            raise AuthenticationException(f"Failed to obtain access token: {e}")
    
    async def get(self, url: str, headers: Dict[str, str] = None, params: Dict[str, Any] = None) -> Dict[str, Any]:
        return await self._make_request("GET", url, headers=headers, params=params)
    
    async def _make_request(self, method: str, url: str, headers: Dict[str, str] = None, 
                           params: Dict[str, Any] = None, json: Dict[str, Any] = None, 
                           retry_count: int = 0) -> Dict[str, Any]:
        session = await self._get_session()
        access_token = await self._ensure_access_token()
        
        request_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        if headers:
            request_headers.update(headers)
        
        try:
            if method == "GET":
                response = await session.get(url, headers=request_headers, params=params)
            elif method == "POST":
                response = await session.post(url, headers=request_headers, json=json)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
            
            response.raise_for_status()
            return response.json()
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise RateLimitException()
            elif e.response.status_code == 401 and retry_count < 1:
                await self._invalidate_token()
                return await self._make_request(method, url, headers=headers, params=params, 
                                              json=json, retry_count=retry_count + 1)
            else:
                raise HttpClientException(url, e.response.status_code, str(e))
    
    async def _invalidate_token(self):
        self.access_token = None
        self.token_expires_at = None
    
    async def post(self, url: str, headers: Dict[str, str] = None, json: Dict[str, Any] = None) -> Dict[str, Any]:
        return await self._make_request("POST", url, headers=headers, json=json)
    
    async def close(self) -> None:
        if self.session and not self.session.is_closed:
            await self.session.aclose()

class ConnectionRepository:
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

class ConnectionService:
    def __init__(self, logger: Optional[Logger] = None):
        self._logger = logger or logging.getLogger(__name__)
        self._http_client = HttpClient()
        self._connection_repo = ConnectionRepository(self._http_client, self._logger)

    async def get_connections_for_user(self, external_user_id: ExternalUserId) -> List[Connection]:
        self._logger.info(f"Getting connections for user: {external_user_id.value}")
        
        connections = await self._connection_repo.get_by_external_user_id(external_user_id)
        
        self._logger.info(f"Found {len(connections)} connections for user: {external_user_id.value}")
        return connections

    async def has_connection(self, external_user_id: ExternalUserId, app_slug: AppSlug) -> bool:
        connections = await self._connection_repo.get_by_external_user_id(external_user_id)
        
        for connection in connections:
            if connection.app.slug == app_slug and connection.is_active:
                return True
        
        return False
    
    async def close(self):
        await self._http_client.close() 