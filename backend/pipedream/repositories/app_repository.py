from typing import List, Optional, Dict, Any
import json
from ..protocols import AppRepository, HttpClient, Logger
from ..domain.entities import App, AuthType
from ..domain.value_objects import AppSlug, SearchQuery, Category, PaginationCursor
from ..domain.exceptions import HttpClientException


class PipedreamAppRepository:
    def __init__(self, http_client: HttpClient, logger: Logger):
        self._http_client = http_client
        self._logger = logger
        import asyncio
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

    async def get_icon_url(self, app_slug: AppSlug) -> Optional[str]:
        url = f"{self._http_client.base_url}/apps"
        params = {"q": app_slug.value, "pageSize": 20}
        
        try:
            data = await self._http_client.get(url, params=params)
            
            apps = data.get("data", [])
            exact_match = next((app for app in apps if app.get("name_slug") == app_slug.value), None)
            
            if exact_match:
                icon_url = exact_match.get("img_src")
                self._logger.info(f"Found icon for {app_slug.value}: {icon_url}")
                return icon_url
            
            self._logger.warning(f"No app found with slug: {app_slug.value}")
            return None
            
        except Exception as e:
            self._logger.error(f"Error getting icon for app {app_slug.value}: {str(e)}")
            return None

    async def get_popular(self, category: Optional[Category] = None, limit: int = 100) -> List[App]:
        cache_key = f"pipedream:popular_apps:{category.value if category else 'all'}:{limit}"
        try:
            from services import redis
            redis_client = await redis.get_client()
            cached_data = await redis_client.get(cache_key)
            
            if cached_data:
                self._logger.info(f"Found cached popular apps for category: {category.value if category else 'all'}")
                cached_apps_data = json.loads(cached_data)
                return [self._map_cached_app_to_domain(app_data) for app_data in cached_apps_data]
        except Exception as e:
            self._logger.warning(f"Redis cache error for popular apps: {e}")
        
        popular_slugs = [
            "slack", "microsoft_teams", "discord", "zoom", "telegram_bot_api", "whatsapp",
            
            "gmail", "microsoft_outlook", "google_calendar", "microsoft_exchange", "calendly",
            
            "google_drive", "microsoft_onedrive", "dropbox", "google_docs", "google_sheets",
            "microsoft_word", "microsoft_excel", "microsoft_powerpoint",
            
            "notion", "asana", "monday", "trello", "linear", "jira", "clickup", "basecamp",
            
            "salesforce", "hubspot", "pipedrive", "zendesk", "freshdesk", "intercom",
            
            "github", "gitlab", "bitbucket", "docker", "jenkins", "vercel", "netlify",
            
            "supabase", "firebase", "mongodb", "postgresql", "mysql", "redis", "airtable",
            
            "openai", "anthropic", "hugging_face", "replicate",
            
            "google_analytics", "facebook", "instagram", "twitter", "linkedin", "mailchimp", "constant_contact",
            
            "stripe", "paypal", "quickbooks", "xero", "square",
            
            "aws", "google_cloud", "microsoft_azure", "digitalocean", "heroku",
            
            "shopify", "woocommerce", "magento", "bigcommerce",
            
            "bamboohr", "workday", "greenhouse", "lever",
            
            "figma", "canva", "adobe_creative_cloud",
            
            "okta", "auth0", "datadog", "new_relic", "pagerduty",
            
            "hootsuite", "buffer", "sprout_social",
        ]
        
        apps = []
        import asyncio
        
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
        
        try:
            from services import redis
            redis_client = await redis.get_client()
            apps_data = [self._map_domain_app_to_cache(app) for app in apps]
            await redis_client.setex(cache_key, 86400, json.dumps(apps_data))
            self._logger.info(f"Cached {len(apps)} popular apps for category: {category.value if category else 'all'}")
        except Exception as e:
            self._logger.warning(f"Failed to cache popular apps: {e}")
        
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