from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from utils.logger import logger
from .client import ComposioClient


class ToolkitInfo(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None
    logo: Optional[str] = None
    tags: List[str] = []
    auth_schemes: List[str] = []


class ToolkitService:
    def __init__(self, api_key: Optional[str] = None):
        self.client = ComposioClient.get_client(api_key)
    
    async def list_toolkits(self, limit: int = 100) -> List[ToolkitInfo]:
        try:
            logger.info(f"Fetching toolkits with limit: {limit}")
            
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
                if isinstance(meta, dict) and "categories" in meta:
                    categories = meta.get("categories", [])
                    for category in categories:
                        if isinstance(category, dict):
                            tags.append(category.get("name", ""))
                        elif hasattr(category, '__dict__'):
                            tags.append(category.__dict__.get("name", ""))
                
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
                    auth_schemes=auth_schemes
                )
                toolkits.append(toolkit)
            
            logger.info(f"Successfully fetched {len(toolkits)} OAUTH2-enabled toolkits")
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
    
    async def search_toolkits(self, query: str) -> List[ToolkitInfo]:
        try:
            toolkits = await self.list_toolkits()
            query_lower = query.lower()
            
            filtered_toolkits = [
                toolkit for toolkit in toolkits
                if query_lower in toolkit.name.lower() 
                or (toolkit.description and query_lower in toolkit.description.lower())
                or any(query_lower in tag.lower() for tag in toolkit.tags)
            ]
            
            logger.info(f"Found {len(filtered_toolkits)} OAUTH2-enabled toolkits matching query: {query}")
            return filtered_toolkits
            
        except Exception as e:
            logger.error(f"Failed to search toolkits: {e}", exc_info=True)
            raise 