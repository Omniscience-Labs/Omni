import os
import logging
import re
import httpx
from typing import Dict, Any, Optional, Protocol
from dataclasses import dataclass
from datetime import datetime, timedelta

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

class PipedreamException(Exception):
    def __init__(self, message: str, error_code: str = None):
        super().__init__(message)
        self.error_code = error_code
        self.message = message

class AuthenticationException(PipedreamException):
    def __init__(self, reason: str):
        super().__init__(f"Authentication failed: {reason}", "AUTHENTICATION_ERROR")
        self.reason = reason

class HttpClientException(PipedreamException):
    def __init__(self, url: str, status_code: int, reason: str):
        super().__init__(f"HTTP request to {url} failed with status {status_code}: {reason}", "HTTP_CLIENT_ERROR")
        self.url = url
        self.status_code = status_code
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
    
    async def post(self, url: str, headers: Dict[str, str] = None, json: Dict[str, Any] = None) -> Dict[str, Any]:
        session = await self._get_session()
        access_token = await self._ensure_access_token()
        
        request_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        if headers:
            request_headers.update(headers)
        
        try:
            response = await session.post(url, headers=request_headers, json=json)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise RateLimitException()
            raise HttpClientException(url, e.response.status_code, str(e))
    
    async def close(self) -> None:
        if self.session and not self.session.is_closed:
            await self.session.aclose()

class ConnectionTokenService:
    def __init__(self, logger: Optional[Logger] = None):
        self._logger = logger or logging.getLogger(__name__)
        self._http_client = HttpClient()

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
    
    async def close(self):
        await self._http_client.close() 