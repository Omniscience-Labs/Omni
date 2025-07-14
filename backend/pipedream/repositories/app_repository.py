from typing import List, Optional, Dict, Any
from ..protocols import AppRepository, HttpClient, Logger
from ..domain.entities import App, AuthType
from ..domain.value_objects import AppSlug, SearchQuery, Category, PaginationCursor
from ..domain.exceptions import HttpClientException


class PipedreamAppRepository:
    def __init__(self, http_client: HttpClient, logger: Logger):
        self._http_client = http_client
        self._logger = logger

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
        url = f"{self._http_client.base_url}/apps"
        params = {"q": app_slug.value, "pageSize": 20}
        
        try:
            data = await self._http_client.get(url, params=params)
            
            apps = data.get("data", [])
            exact_match = next((app for app in apps if app.get("name_slug") == app_slug.value), None)
            
            if exact_match:
                return self._map_to_domain(exact_match)
            
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

    async def get_popular(self, category: Optional[Category] = None, limit: int = 10) -> List[App]:
        popular_slugs = [
            "gmail", "google_calendar", "google_drive", "google_docs", "google_sheets",
            "slack", "discord", "github", "notion", "airtable", "telegram_bot_api",
            "openai", "linear", "asana", "supabase"
        ]
        
        apps = []
        for slug in popular_slugs[:limit]:
            try:
                app = await self.get_by_slug(AppSlug(slug))
                if app and (not category or app.category == category.value):
                    apps.append(app)
            except Exception as e:
                self._logger.warning(f"Error fetching popular app {slug}: {e}")
                continue
        
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