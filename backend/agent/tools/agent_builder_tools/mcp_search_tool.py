import json
from typing import Optional
from agentpress.tool import ToolResult, openapi_schema, xml_schema
from agentpress.thread_manager import ThreadManager
from .base_tool import AgentBuilderBaseTool
from pipedream.facade import PipedreamManager
from pipedream.domain.value_objects import ExternalUserId, AppSlug
from utils.logger import logger


class MCPSearchTool(AgentBuilderBaseTool):
    def __init__(self, thread_manager: ThreadManager, db_connection, agent_id: str):
        super().__init__(thread_manager, db_connection, agent_id)
        self.pipedream_manager = PipedreamManager()

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "search_mcp_servers",
            "description": "Search for Pipedream MCP servers based on user requirements. Use this when the user wants to add MCP tools to their agent.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query for finding relevant Pipedream apps (e.g., 'linear', 'github', 'database', 'search')"
                    },
                    "category": {
                        "type": "string",
                        "description": "Optional category filter for Pipedream apps"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of apps to return (default: 10)",
                        "default": 10
                    }
                },
                "required": ["query"]
            }
        }
    })
    @xml_schema(
        tag_name="search-mcp-servers",
        mappings=[
            {"param_name": "query", "node_type": "attribute", "path": "."},
            {"param_name": "category", "node_type": "attribute", "path": "."},
            {"param_name": "limit", "node_type": "attribute", "path": "."}
        ],
        example='''
        <function_calls>
        <invoke name="search_mcp_servers">
        <parameter name="query">linear</parameter>
        <parameter name="limit">5</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def search_mcp_servers(
        self,
        query: str,
        category: Optional[str] = None,
        limit: int = 10
    ) -> ToolResult:
        try:
            search_result = await self.pipedream_manager.search_apps(
                query=query,
                category=category,
                page=1,
                limit=limit
            )
            
            apps = search_result.get("apps", [])
            
            formatted_apps = []
            for app in apps:
                if hasattr(app, '__dict__'):
                    formatted_apps.append({
                        "name": app.name,
                        "app_slug": app.app_slug.value if hasattr(app.app_slug, 'value') else str(app.app_slug),
                        "description": app.description,
                        "category": app.categories[0] if app.categories else "Other",
                        "logo_url": getattr(app, 'logo_url', ''),
                        "auth_type": app.auth_type.value if app.auth_type else '',
                        "is_verified": getattr(app, 'is_verified', False),
                        "url": getattr(app, 'url', ''),
                        "tags": getattr(app, 'tags', [])
                    })
                else:
                    formatted_apps.append({
                        "name": app.get("name", "Unknown"),
                        "app_slug": app.get("app_slug", ""),
                        "description": app.get("description", "No description available"),
                        "category": app.get("category", "Other"),
                        "logo_url": app.get("logo_url", ""),
                        "auth_type": app.get("auth_type", ""),
                        "is_verified": app.get("is_verified", False),
                        "url": app.get("url", ""),
                        "tags": app.get("tags", [])
                    })
            
            if not formatted_apps:
                return ToolResult(
                    success=False,
                    output=json.dumps([], ensure_ascii=False)
                )
            
            return ToolResult(
                success=True,
                output=json.dumps(formatted_apps, ensure_ascii=False)
            )
                
        except Exception as e:
            return self.fail_response(f"Error searching Pipedream apps: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "get_app_details",
            "description": "Get detailed information about a specific Pipedream app, including available tools and authentication requirements.",
            "parameters": {
                "type": "object",
                "properties": {
                    "app_slug": {
                        "type": "string",
                        "description": "The app slug to get details for (e.g., 'github', 'linear', 'slack')"
                    }
                },
                "required": ["app_slug"]
            }
        }
    })
    @xml_schema(
        tag_name="get-app-details",
        mappings=[
            {"param_name": "app_slug", "node_type": "attribute", "path": "."}
        ],
        example='''
        <function_calls>
        <invoke name="get_app_details">
        <parameter name="app_slug">github</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def get_app_details(self, app_slug: str) -> ToolResult:
        try:
            app_data = await self.pipedream_manager.get_app_by_slug(app_slug)
            
            if not app_data:
                return self.fail_response(f"Could not find app details for '{app_slug}'")
            
            if hasattr(app_data, '__dict__'):
                app_data = {
                    "name": app_data.name,
                    "app_slug": app_data.app_slug.value,
                    "description": app_data.description,
                    "category": app_data.categories[0] if app_data.categories else "Other",
                    "logo_url": getattr(app_data, 'logo_url', ''),
                    "auth_type": app_data.auth_type.value if app_data.auth_type else '',
                    "is_verified": getattr(app_data, 'is_verified', False),
                    "url": getattr(app_data, 'url', ''),
                    "tags": getattr(app_data, 'tags', []),
                    "pricing": getattr(app_data, 'pricing', ''),
                    "setup_instructions": getattr(app_data, 'setup_instructions', ''),
                    "available_actions": getattr(app_data, 'available_actions', []),
                    "available_triggers": getattr(app_data, 'available_triggers', [])
                }
            
            formatted_app = {
                "name": app_data.get("name", "Unknown"),
                "app_slug": app_data.get("app_slug", app_slug),
                "description": app_data.get("description", "No description available"),
                "category": app_data.get("category", "Other"),
                "logo_url": app_data.get("logo_url", ""),
                "auth_type": app_data.get("auth_type", ""),
                "is_verified": app_data.get("is_verified", False),
                "url": app_data.get("url", ""),
                "tags": app_data.get("tags", []),
                "pricing": app_data.get("pricing", ""),
                "setup_instructions": app_data.get("setup_instructions", ""),
                "available_actions": app_data.get("available_actions", []),
                "available_triggers": app_data.get("available_triggers", [])
            }
            
            return self.success_response({
                "message": f"Retrieved details for {formatted_app['name']}",
                "app": formatted_app
            })
            
        except Exception as e:
            return self.fail_response(f"Error getting app details: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "discover_user_mcp_servers",
            "description": "Discover available MCP servers for a specific user and app combination. Use this to see what MCP tools are available for a connected profile.",
            "parameters": {
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "The external user ID from the credential profile"
                    },
                    "app_slug": {
                        "type": "string",
                        "description": "The app slug to discover MCP servers for"
                    }
                },
                "required": ["user_id", "app_slug"]
            }
        }
    })
    @xml_schema(
        tag_name="discover-user-mcp-servers",
        mappings=[
            {"param_name": "user_id", "node_type": "attribute", "path": "."},
            {"param_name": "app_slug", "node_type": "attribute", "path": "."}
        ],
        example='''
        <function_calls>
        <invoke name="discover_user_mcp_servers">
        <parameter name="user_id">user_123456</parameter>
        <parameter name="app_slug">github</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def discover_user_mcp_servers(self, user_id: str, app_slug: str) -> ToolResult:
        try:
            servers = await self.pipedream_manager.discover_mcp_servers(
                external_user_id=user_id,
                app_slug=app_slug
            )
            
            formatted_servers = []
            for server in servers:
                if hasattr(server, '__dict__'):
                    formatted_servers.append({
                        "server_id": getattr(server, 'server_id', ''),
                        "name": getattr(server, 'name', 'Unknown'),
                        "app_slug": getattr(server, 'app_slug', app_slug),
                        "status": getattr(server, 'status', 'unknown'),
                        "available_tools": getattr(server, 'available_tools', []),
                        "last_ping": getattr(server, 'last_ping', ''),
                        "created_at": getattr(server, 'created_at', '')
                    })
                else:
                    formatted_servers.append({
                        "server_id": server.get("server_id", ""),
                        "name": server.get("name", "Unknown"),
                        "app_slug": server.get("app_slug", app_slug),
                        "status": server.get("status", "unknown"),
                        "available_tools": server.get("available_tools", []),
                        "last_ping": server.get("last_ping", ""),
                        "created_at": server.get("created_at", "")
                    })
            
            connected_servers = [s for s in formatted_servers if s["status"] == "connected"]
            total_tools = sum(len(s["available_tools"]) for s in connected_servers)
            
            return self.success_response({
                "message": f"Found {len(formatted_servers)} MCP servers for {app_slug} (user: {user_id}), {len(connected_servers)} connected with {total_tools} total tools available",
                "servers": formatted_servers,
                "connected_count": len(connected_servers),
                "total_tools": total_tools
            })
            
        except Exception as e:
            return self.fail_response(f"Error discovering MCP servers: {str(e)}") 