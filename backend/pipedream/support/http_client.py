import os
import httpx
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from ..domain.exceptions import HttpClientException, AuthenticationException, RateLimitException


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
            
            # Set token expiration (default to 1 hour if not provided)
            expires_in = data.get("expires_in", 3600)  # Default 1 hour
            self.token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
            
            return self.access_token
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise RateLimitException()
            raise AuthenticationException(f"Failed to obtain access token: {e}")
    
    async def _invalidate_token(self):
        """Invalidate the current access token"""
        self.access_token = None
        self.token_expires_at = None
    
    async def get(self, url: str, headers: Dict[str, str] = None, params: Dict[str, Any] = None) -> Dict[str, Any]:
        return await self._make_request("GET", url, headers=headers, params=params)
    
    async def _make_request(self, method: str, url: str, headers: Dict[str, str] = None, 
                           params: Dict[str, Any] = None, json: Dict[str, Any] = None, 
                           retry_count: int = 0) -> Dict[str, Any]:
        """Make HTTP request with automatic token refresh on 401 errors"""
        session = await self._get_session()
        access_token = await self._ensure_access_token()
        
        request_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        if headers:
            request_headers.update(headers)
        
        if self.rate_limit_token:
            request_headers["x-pd-rate-limit"] = self.rate_limit_token
        
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
                # Token might be expired, invalidate it and retry once
                await self._invalidate_token()
                return await self._make_request(method, url, headers=headers, params=params, 
                                              json=json, retry_count=retry_count + 1)
            else:
                raise HttpClientException(url, e.response.status_code, str(e))
    
    async def post(self, url: str, headers: Dict[str, str] = None, json: Dict[str, Any] = None) -> Dict[str, Any]:
        return await self._make_request("POST", url, headers=headers, json=json)
    
    async def close(self) -> None:
        if self.session and not self.session.is_closed:
            await self.session.aclose() 