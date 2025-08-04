from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from utils.logger import logger
from .client import ComposioClient


class CategoryInfo(BaseModel):
    id: str
    name: str


class ToolkitInfo(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None
    logo: Optional[str] = None
    tags: List[str] = []
    auth_schemes: List[str] = []
    categories: List[str] = []


class ToolkitService:
    def __init__(self, api_key: Optional[str] = None):
        self.client = ComposioClient.get_client(api_key)
    
    async def list_categories(self) -> List[CategoryInfo]:
        try:
            logger.info("Fetching Composio categories")
            popular_categories = [
                {"id": "popular", "name": "Popular"},
                {"id": "productivity", "name": "Productivity"},
                {"id": "ai", "name": "AI"},
                {"id": "crm", "name": "CRM"},
                {"id": "marketing", "name": "Marketing"},
                {"id": "email", "name": "Email"},
                {"id": "analytics", "name": "Analytics"},
                {"id": "automation", "name": "Automation"},
                {"id": "communication", "name": "Communication"},
                {"id": "project-management", "name": "Project Management"},
                {"id": "e-commerce", "name": "E-commerce"},
                {"id": "social-media", "name": "Social Media"},
                {"id": "payments", "name": "Payments"},
                {"id": "finance", "name": "Finance"},
                {"id": "developer-tools", "name": "Developer Tools"},
                {"id": "api", "name": "API"},
                {"id": "notifications", "name": "Notifications"},
                {"id": "scheduling", "name": "Scheduling"},
                {"id": "data-analytics", "name": "Data Analytics"},
                {"id": "customer-support", "name": "Customer Support"}
            ]
            
            categories = [CategoryInfo(**cat) for cat in popular_categories]
            logger.info(f"Successfully fetched {len(categories)} categories")
            return categories
            
        except Exception as e:
            logger.error(f"Failed to list categories: {e}", exc_info=True)
            raise
    
    async def list_toolkits(self, limit: int = 100, category: Optional[str] = None) -> List[ToolkitInfo]:
        try:
            logger.info(f"Fetching toolkits with limit: {limit}, category: {category}")
            if category:
                toolkits_response = self.client.toolkits.list(limit=limit, category=category)
            else:
                toolkits_response = self.client.toolkits.list(limit=limit)
            
            items = getattr(toolkits_response, 'items', [])
            if hasattr(toolkits_response, '__dict__'):
                items = toolkits_response.__dict__.get('items', [])
            
            toolkits = []
            for item in items:
                if hasattr(item, '__dict__'):
                    toolkit_data = item.__dict__
                elif hasattr(item, '_asdict'):
                    toolkit_data = item._asdict()
                else:
                    toolkit_data = item
                
                auth_schemes = toolkit_data.get("auth_schemes", [])

                if "OAUTH2" not in auth_schemes:
                    continue
                
                logo_url = None
                meta = toolkit_data.get("meta", {})
                if isinstance(meta, dict):
                    logo_url = meta.get("logo")
                elif hasattr(meta, '__dict__'):
                    logo_url = meta.__dict__.get("logo")
                
                if not logo_url:
                    logo_url = toolkit_data.get("logo")
                
                tags = []
                categories = []
                if isinstance(meta, dict) and "categories" in meta:
                    category_list = meta.get("categories", [])
                    for cat in category_list:
                        if isinstance(cat, dict):
                            cat_name = cat.get("name", "")
                            cat_id = cat.get("id", "")
                            tags.append(cat_name)
                            categories.append(cat_id)
                        elif hasattr(cat, '__dict__'):
                            cat_name = cat.__dict__.get("name", "")
                            cat_id = cat.__dict__.get("id", "")
                            tags.append(cat_name)
                            categories.append(cat_id)
                
                description = None
                if isinstance(meta, dict):
                    description = meta.get("description")
                elif hasattr(meta, '__dict__'):
                    description = meta.__dict__.get("description")
                
                if not description:
                    description = toolkit_data.get("description")
                
                toolkit = ToolkitInfo(
                    slug=toolkit_data.get("slug", ""),
                    name=toolkit_data.get("name", ""),
                    description=description,
                    logo=logo_url,
                    tags=tags,
                    auth_schemes=auth_schemes,
                    categories=categories
                )
                toolkits.append(toolkit)
            
            logger.info(f"Successfully fetched {len(toolkits)} OAUTH2-enabled toolkits" + (f" for category {category}" if category else ""))
            return toolkits
            
        except Exception as e:
            logger.error(f"Failed to list toolkits: {e}", exc_info=True)
            raise
    
    async def get_toolkit_by_slug(self, slug: str) -> Optional[ToolkitInfo]:
        try:
            toolkits = await self.list_toolkits()
            for toolkit in toolkits:
                if toolkit.slug == slug:
                    return toolkit
            return None
        except Exception as e:
            logger.error(f"Failed to get toolkit {slug}: {e}", exc_info=True)
            raise
    
    async def search_toolkits(self, query: str, category: Optional[str] = None) -> List[ToolkitInfo]:
        try:
            toolkits = await self.list_toolkits(category=category)
            query_lower = query.lower()
            
            filtered_toolkits = [
                toolkit for toolkit in toolkits
                if query_lower in toolkit.name.lower() 
                or (toolkit.description and query_lower in toolkit.description.lower())
                or any(query_lower in tag.lower() for tag in toolkit.tags)
            ]
            
            logger.info(f"Found {len(filtered_toolkits)} OAUTH2-enabled toolkits matching query: {query}" + (f" in category {category}" if category else ""))
            return filtered_toolkits
            
        except Exception as e:
            logger.error(f"Failed to search toolkits: {e}", exc_info=True)
            raise
    
    async def get_toolkit_icon(self, toolkit_slug: str) -> Optional[str]:
        try:
            logger.info(f"Fetching toolkit icon for: {toolkit_slug}")
            toolkit_response = self.client.toolkits.retrieve(toolkit_slug)
            
            if hasattr(toolkit_response, 'model_dump'):
                toolkit_dict = toolkit_response.model_dump()
            elif hasattr(toolkit_response, '__dict__'):
                toolkit_dict = toolkit_response.__dict__
            else:
                toolkit_dict = dict(toolkit_response)
            
            meta = toolkit_dict.get('meta', {})
            if isinstance(meta, dict):
                logo = meta.get('logo')
            elif hasattr(meta, '__dict__'):
                logo = meta.__dict__.get('logo')
            else:
                logo = None
            
            logger.info(f"Successfully fetched icon for {toolkit_slug}: {logo}")
            return logo
            
        except Exception as e:
            logger.error(f"Failed to get toolkit icon for {toolkit_slug}: {e}")
            return None 