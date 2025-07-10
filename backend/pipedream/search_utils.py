"""
Utility functions for searching and discovering Pipedream MCP servers and apps.
This module provides reusable search functionality for the agent builder and other components.
"""

import asyncio
import httpx
from typing import Dict, Any, List, Optional
from utils.logger import logger
from .client import get_pipedream_client

class PipedreamSearchAPI:
    """Utility class for searching Pipedream MCP servers and apps"""
    
    def __init__(self):
        self.base_url = "https://mcp.pipedream.com/api"
        self.client = get_pipedream_client()
    
    async def search_apps(
        self,
        query: Optional[str] = None,
        category: Optional[str] = None,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        """
        Search for Pipedream apps in the registry.
        
        Args:
            query: Search query string to filter apps by name or description
            category: Category filter (e.g., "AI & ML", "Developer Tools", etc.)
            page: Page number for pagination
            limit: Maximum number of results per page
            
        Returns:
            Dictionary with search results including apps, page info, and total count
        """
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.base_url}/apps"
                params = {"page": page, "pageSize": limit}
                
                if query:
                    params["q"] = query
                if category:
                    params["category"] = category
                
                logger.info(f"Searching Pipedream apps: query='{query}', category='{category}', page={page}")
                
                response = await client.get(url, params=params, timeout=30.0)
                response.raise_for_status()
                
                data = response.json()
                
                # Format response for consistency
                apps = data.get("data", [])
                formatted_apps = []
                
                for app in apps:
                    formatted_app = {
                        "name": app.get("name", "Unknown"),
                        "app_slug": app.get("name_slug", ""),
                        "description": app.get("description", "No description available"),
                        "category": app.get("category", "Other"),
                        "logo_url": app.get("img_src", ""),
                        "auth_type": app.get("auth_type", ""),
                        "is_verified": app.get("verified", False),
                        "url": app.get("url", ""),
                        "tags": app.get("tags", []),
                        "featured_weight": app.get("featured_weight", 0)
                    }
                    formatted_apps.append(formatted_app)
                
                logger.info(f"Found {len(formatted_apps)} Pipedream apps")
                
                return {
                    "success": True,
                    "apps": formatted_apps,
                    "page_info": data.get("page_info", {}),
                    "total_count": data.get("page_info", {}).get("total_count", 0)
                }
                
        except Exception as e:
            logger.error(f"Error searching Pipedream apps: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "apps": [],
                "page_info": {},
                "total_count": 0
            }
    
    async def get_app_details(self, app_slug: str) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.base_url}/apps"
                params = {"q": app_slug, "pageSize": 20}
                
                logger.info(f"Getting details for Pipedream app: {app_slug}")
                
                response = await client.get(url, params=params, timeout=30.0)
                response.raise_for_status()
                
                data = response.json()
                apps = data.get("data", [])
                
                target_app = None
                for app in apps:
                    if app.get("name_slug") == app_slug:
                        target_app = app
                        break
                
                if not target_app:
                    for app in apps:
                        if app.get("name", "").lower() == app_slug.lower():
                            target_app = app
                            break
                
                if not target_app:
                    partial_matches = []
                    for app in apps:
                        if (app_slug.lower() in app.get("name", "").lower() or 
                            app_slug.lower() in app.get("name_slug", "").lower()):
                            partial_matches.append(app)
                    
                    if partial_matches:
                        partial_matches.sort(key=lambda x: (
                            x.get("featured_weight", 0),
                            x.get("name", "").lower() == app_slug.lower()
                        ), reverse=True)
                        target_app = partial_matches[0]
                
                if not target_app:
                    return {
                        "success": False,
                        "error": f"App '{app_slug}' not found in Pipedream registry",
                        "app": None
                    }
                
                app_details = {
                    "name": target_app.get("name", "Unknown"),
                    "app_slug": target_app.get("name_slug", app_slug),
                    "description": target_app.get("description", "No description available"),
                    "category": target_app.get("category", "Other"),
                    "logo_url": target_app.get("img_src", ""),
                    "auth_type": target_app.get("auth_type", ""),
                    "is_verified": target_app.get("verified", False),
                    "url": target_app.get("url", ""),
                    "tags": target_app.get("tags", []),
                    "actions": target_app.get("actions", []),
                    "triggers": target_app.get("triggers", []),
                    "featured_weight": target_app.get("featured_weight", 0)
                }
                
                logger.info(f"Retrieved details for {app_details['name']}")
                
                return {
                    "success": True,
                    "app": app_details
                }
                
        except Exception as e:
            logger.error(f"Error getting app details for {app_slug}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "app": None
            }
    
    async def discover_user_mcp_servers(
        self, 
        user_id: str, 
        app_slug: Optional[str] = None
    ) -> Dict[str, Any]:
        try:
            logger.info(f"Discovering MCP servers for user: {user_id}, app_slug: {app_slug}")
            
            mcp_servers = await self.client.discover_mcp_servers(
                external_user_id=user_id,
                app_slug=app_slug
            )
            
            formatted_servers = []
            for server in mcp_servers:
                formatted_server = {
                    "name": server.get("app_name", "Unknown"),
                    "app_slug": server.get("app_slug", ""),
                    "external_user_id": server.get("external_user_id", ""),
                    "status": server.get("status", "unknown"),
                    "available_tools": server.get("available_tools", []),
                    "tool_count": len(server.get("available_tools", [])),
                    "config": {
                        "app_slug": server.get("app_slug"),
                        "external_user_id": server.get("external_user_id"),
                        "oauth_app_id": server.get("oauth_app_id")
                    }
                }
                formatted_servers.append(formatted_server)
            
            connected_servers = [s for s in formatted_servers if s["status"] == "connected"]
            
            logger.info(f"Found {len(connected_servers)} connected MCP servers for user")
            
            return {
                "success": True,
                "servers": formatted_servers,
                "connected_count": len(connected_servers),
                "total_count": len(formatted_servers)
            }
            
        except Exception as e:
            logger.error(f"Error discovering MCP servers for user {user_id}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "servers": [],
                "connected_count": 0,
                "total_count": 0
            }
    
    async def get_popular_apps_by_category(
        self, 
        category: Optional[str] = None,
        limit: int = 10
    ) -> Dict[str, Any]:
        try:
            apps_response = await self.search_apps(page=1, limit=100)
            
            if not apps_response["success"]:
                return apps_response
            
            apps = apps_response["apps"]
            
            categorized_apps = {}
            for app in apps:
                app_category = app.get("category", "Other")
                
                if category and app_category != category:
                    continue
                
                if app_category not in categorized_apps:
                    categorized_apps[app_category] = []
                
                categorized_apps[app_category].append(app)
            
            for cat in categorized_apps:
                categorized_apps[cat] = categorized_apps[cat][:limit]
            
            logger.info(f"Found popular apps in {len(categorized_apps)} categories")
            
            return {
                "success": True,
                "categorized_apps": categorized_apps,
                "total_categories": len(categorized_apps)
            }
            
        except Exception as e:
            logger.error(f"Error getting popular apps by category: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "categorized_apps": {},
                "total_categories": 0
            }
    
    async def test_mcp_connection(
        self, 
        user_id: str, 
        app_slug: str
    ) -> Dict[str, Any]:
        try:
            logger.info(f"Testing MCP connection for user: {user_id}, app: {app_slug}")
            
            mcp_config = await self.client.create_mcp_connection(
                external_user_id=user_id,
                app_slug=app_slug
            )
            
            if mcp_config.get("status") == "connected":
                available_tools = mcp_config.get("available_tools", [])
                
                return {
                    "success": True,
                    "status": "connected",
                    "app_slug": app_slug,
                    "available_tools": available_tools,
                    "tool_count": len(available_tools)
                }
            else:
                return {
                    "success": False,
                    "status": mcp_config.get("status", "error"),
                    "error": mcp_config.get("error", "Unknown error")
                }
                
        except Exception as e:
            logger.error(f"Error testing MCP connection: {str(e)}")
            return {
                "success": False,
                "status": "error",
                "error": str(e)
            }

async def search_pipedream_apps(
    query: Optional[str] = None,
    category: Optional[str] = None,
    page: int = 1,
    limit: int = 20
) -> Dict[str, Any]:
    search_api = PipedreamSearchAPI()
    return await search_api.search_apps(query, category, page, limit)

async def get_pipedream_app_details(app_slug: str) -> Dict[str, Any]:
    search_api = PipedreamSearchAPI()
    return await search_api.get_app_details(app_slug)

async def discover_user_pipedream_servers(
    user_id: str, 
    app_slug: Optional[str] = None
) -> Dict[str, Any]:
    search_api = PipedreamSearchAPI()
    return await search_api.discover_user_mcp_servers(user_id, app_slug)

async def get_popular_pipedream_apps(
    category: Optional[str] = None,
    limit: int = 10
) -> Dict[str, Any]:
    search_api = PipedreamSearchAPI()
    return await search_api.get_popular_apps_by_category(category, limit)

async def test_pipedream_mcp_connection(
    user_id: str, 
    app_slug: str
) -> Dict[str, Any]:
    search_api = PipedreamSearchAPI()
    return await search_api.test_mcp_connection(user_id, app_slug) 