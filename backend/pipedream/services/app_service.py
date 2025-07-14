from typing import List, Optional, Dict, Any
from ..protocols import AppRepository, Logger
from ..domain.entities import App
from ..domain.value_objects import AppSlug, SearchQuery, Category, PaginationCursor


class AppService:
    def __init__(self, app_repo: AppRepository, logger: Logger):
        self._app_repo = app_repo
        self._logger = logger

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