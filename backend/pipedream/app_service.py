from typing import List, Optional, Dict, Any, Protocol
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import os
import logging
import re
import httpx
import json
import asyncio

@dataclass(frozen=True)
class AppSlug:
    value: str
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("AppSlug must be a non-empty string")
        if not re.match(r'^[a-z0-9_-]+$', self.value):
            raise ValueError("AppSlug must contain only lowercase letters, numbers, hyphens, and underscores")

@dataclass(frozen=True)
class SearchQuery:
    value: Optional[str] = None
    def is_empty(self) -> bool:
        return not self.value or not self.value.strip()

@dataclass(frozen=True)
class Category:
    value: str
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("Category must be a non-empty string")

@dataclass(frozen=True)
class PaginationCursor:
    value: Optional[str] = None
    def has_more(self) -> bool:
        return self.value is not None

# Domain Entities
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
    
    async def get(self, url: str, headers: Dict[str, str] = None, params: Dict[str, Any] = None) -> Dict[str, Any]:
        session = await self._get_session()
        access_token = await self._ensure_access_token()
        
        request_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        if headers:
            request_headers.update(headers)
        
        try:
            response = await session.get(url, headers=request_headers, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise RateLimitException()
            raise HttpClientException(url, e.response.status_code, str(e))
    
    async def close(self) -> None:
        if self.session and not self.session.is_closed:
            await self.session.aclose()

class AppRepository:
    def __init__(self, http_client: HttpClient, logger: Logger):
        self._http_client = http_client
        self._logger = logger
        self._semaphore = asyncio.Semaphore(10)

    async def search(self, query: SearchQuery, category: Optional[Category] = None, 
                    page: int = 1, limit: int = 20, cursor: Optional[PaginationCursor] = None) -> Dict[str, Any]:
        url = f"{self._http_client.base_url}/apps"
        params = {}
        
        if not query.is_empty():
            params["q"] = query.value
        if category:
            params["category"] = category.value
        if cursor and cursor.value:
            params["after"] = cursor.value
        
        try:
            data = await self._http_client.get(url, params=params)
            apps = []
            for app_data in data.get("data", []):
                try:
                    app = self._map_to_domain(app_data)
                    apps.append(app)
                except Exception as e:
                    self._logger.warning(f"Error mapping app data: {str(e)}")
                    continue
            
            page_info = data.get("page_info", {})
            page_info["has_more"] = bool(page_info.get("end_cursor"))
            
            self._logger.info(f"Found {len(apps)} apps from search")
            
            return {
                "success": True,
                "apps": apps,
                "page_info": page_info,
                "total_count": page_info.get("total_count", 0)
            }
            
        except Exception as e:
            self._logger.error(f"Error searching apps: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "apps": [],
                "page_info": {},
                "total_count": 0
            }

    async def get_by_slug(self, app_slug: AppSlug) -> Optional[App]:
        cache_key = f"pipedream:app:{app_slug.value}"
        try:
            from services import redis
            redis_client = await redis.get_client()
            cached_data = await redis_client.get(cache_key)
            
            if cached_data:
                self._logger.debug(f"Found cached app for slug: {app_slug.value}")
                cached_app_data = json.loads(cached_data)
                return self._map_cached_app_to_domain(cached_app_data)
        except Exception as e:
            self._logger.warning(f"Redis cache error for app {app_slug.value}: {e}")
        
        async with self._semaphore:
            url = f"{self._http_client.base_url}/apps"
            params = {"q": app_slug.value, "pageSize": 20}
            
            try:
                data = await self._http_client.get(url, params=params)
                
                apps = data.get("data", [])
                exact_match = next((app for app in apps if app.get("name_slug") == app_slug.value), None)
                
                if exact_match:
                    app = self._map_to_domain(exact_match)
                    
                    try:
                        from services import redis
                        redis_client = await redis.get_client()
                        app_data = self._map_domain_app_to_cache(app)
                        await redis_client.setex(cache_key, 21600, json.dumps(app_data))
                        self._logger.debug(f"Cached app: {app_slug.value}")
                    except Exception as e:
                        self._logger.warning(f"Failed to cache app {app_slug.value}: {e}")
                    
                    return app
                
                return None
                
            except Exception as e:
                self._logger.error(f"Error getting app by slug: {str(e)}")
                return None

    async def get_popular(self, category: Optional[Category] = None, limit: int = 100) -> List[App]:
        popular_slugs = [
            "slack", "microsoft_teams", "discord", "zoom", "telegram_bot_api",
            "gmail", "microsoft_outlook", "google_calendar", "microsoft_exchange", "calendly",
            "google_drive", "microsoft_onedrive", "dropbox", "google_docs", "google_sheets",
            "notion", "asana", "monday", "trello", "linear", "jira", "clickup",
            "salesforce", "hubspot", "pipedrive", "zendesk", "freshdesk", "intercom",
            "github", "gitlab", "bitbucket", "docker", "jenkins", "vercel", "netlify",
            "supabase", "firebase", "mongodb", "postgresql", "mysql", "redis", "airtable",
            "openai", "anthropic", "hugging_face", "replicate",
            "google_analytics", "facebook", "instagram", "twitter", "linkedin", "mailchimp",
            "stripe", "paypal", "quickbooks", "xero", "square",
            "aws", "google_cloud", "microsoft_azure", "digitalocean", "heroku",
            "shopify", "woocommerce", "magento", "bigcommerce"
        ]
        
        apps = []
        batch_size = 20
        target_slugs = popular_slugs[:limit]
        
        async def fetch_app(slug: str):
            try:
                app = await self.get_by_slug(AppSlug(slug))
                if app and (not category or app.category == category.value):
                    return app
                return None
            except Exception as e:
                self._logger.warning(f"Error fetching popular app {slug}: {e}")
                return None
        
        for i in range(0, len(target_slugs), batch_size):
            batch_slugs = target_slugs[i:i+batch_size]
            
            if i > 0:
                await asyncio.sleep(0.1)
            
            batch_tasks = [fetch_app(slug) for slug in batch_slugs]
            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
            
            for result in batch_results:
                if isinstance(result, App):
                    apps.append(result)
                    
                if len(apps) >= limit:
                    break
            
            if len(apps) >= limit:
                break
        
        return apps

    async def get_by_category(self, category: Category, limit: int = 20) -> List[App]:
        query = SearchQuery(None)
        result = await self.search(query, category, limit=limit)
        return result.get("apps", [])

    def _map_to_domain(self, app_data: Dict[str, Any]) -> App:
        try:
            auth_type_str = app_data.get("auth_type", "oauth")
            auth_type = AuthType(auth_type_str)
        except ValueError:
            self._logger.warning(f"Unknown auth type '{auth_type_str}', using CUSTOM")
            auth_type = AuthType.CUSTOM
        
        return App(
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
    
    def _map_domain_app_to_cache(self, app: App) -> Dict[str, Any]:
        return {
            "name": app.name,
            "name_slug": app.slug.value,
            "description": app.description,
            "category": app.category,
            "img_src": app.logo_url,
            "auth_type": app.auth_type.value,
            "verified": app.is_verified,
            "url": app.url,
            "tags": app.tags,
            "featured_weight": app.featured_weight
        }
    
    def _map_cached_app_to_domain(self, app_data: Dict[str, Any]) -> App:
        try:
            auth_type_str = app_data.get("auth_type", "oauth")
            auth_type = AuthType(auth_type_str)
        except ValueError:
            self._logger.warning(f"Unknown auth type '{auth_type_str}', using CUSTOM")
            auth_type = AuthType.CUSTOM
        
        return App(
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

class AppService:
    def __init__(self, logger: Optional[Logger] = None):
        self._logger = logger or logging.getLogger(__name__)
        self._http_client = HttpClient()
        self._app_repo = AppRepository(self._http_client, self._logger)

    async def search_apps(
        self,
        query: Optional[str] = None,
        category: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
        cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        search_query = SearchQuery(query)
        category_vo = Category(category) if category else None
        cursor_vo = PaginationCursor(cursor) if cursor else None
        
        self._logger.info(f"Searching apps: query='{query}', category='{category}', page={page}")
        
        result = await self._app_repo.search(search_query, category_vo, page, limit, cursor_vo)
        
        self._logger.info(f"Found {len(result.get('apps', []))} apps")
        return result

    async def get_app_by_slug(self, app_slug: str) -> Optional[App]:
        app_slug_vo = AppSlug(app_slug)
        
        self._logger.info(f"Getting app by slug: {app_slug}")
        
        app = await self._app_repo.get_by_slug(app_slug_vo)
        
        if app:
            self._logger.info(f"Found app: {app.name}")
        else:
            self._logger.info(f"App not found: {app_slug}")
        
        return app

    async def get_popular_apps(self, category: Optional[str] = None, limit: int = 10) -> List[App]:
        category_vo = Category(category) if category else None
        
        self._logger.info(f"Getting popular apps: category='{category}', limit={limit}")
        
        apps = await self._app_repo.get_popular(category_vo, limit)
        
        self._logger.info(f"Found {len(apps)} popular apps")
        return apps

    async def get_apps_by_category(self, category: str, limit: int = 20) -> List[App]:
        category_vo = Category(category)
        
        self._logger.info(f"Getting apps by category: {category}, limit={limit}")
        
        apps = await self._app_repo.get_by_category(category_vo, limit)
        
        self._logger.info(f"Found {len(apps)} apps in category {category}")
        return apps
    
    async def close(self):
        await self._http_client.close()
    
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close() 