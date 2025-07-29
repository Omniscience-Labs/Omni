import json
from typing import Optional, List
from agentpress.tool import ToolResult, openapi_schema, xml_schema
from agentpress.thread_manager import ThreadManager
from .base_tool import AgentBuilderBaseTool
from pipedream.facade import PipedreamManager
from .mcp_search_tool import MCPSearchTool
from utils.logger import logger


class CredentialProfileTool(AgentBuilderBaseTool):
    def __init__(self, thread_manager: ThreadManager, db_connection, agent_id: str):
        super().__init__(thread_manager, db_connection, agent_id)
        self.pipedream_manager = PipedreamManager()
        self.pipedream_search = MCPSearchTool(thread_manager, db_connection, agent_id)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "get_credential_profiles",
            "description": "Get all existing Pipedream credential profiles for the current user. Use this to show the user their available profiles.",
            "parameters": {
                "type": "object",
                "properties": {
                    "app_slug": {
                        "type": "string",
                        "description": "Optional filter to show only profiles for a specific app"
                    }
                },
                "required": []
            }
        }
    })
    @xml_schema(
        tag_name="get-credential-profiles",
        mappings=[
            {"param_name": "app_slug", "node_type": "attribute", "path": ".", "required": False}
        ],
        example='''
        <function_calls>
        <invoke name="get_credential_profiles">
        <parameter name="app_slug">github</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def get_credential_profiles(self, app_slug: Optional[str] = None) -> ToolResult:
        try:
            account_id = await self._get_current_account_id()
            profiles = await self.pipedream_manager.get_profiles(account_id, app_slug)
            
            formatted_profiles = []
            for profile in profiles:
                formatted_profiles.append({
                    "profile_id": str(profile.profile_id),
                    "profile_name": profile.profile_name.value if hasattr(profile.profile_name, 'value') else str(profile.profile_name),
                    "display_name": profile.display_name,
                    "app_slug": profile.app_slug.value if hasattr(profile.app_slug, 'value') else str(profile.app_slug),
                    "app_name": profile.app_name,
                    "external_user_id": profile.external_user_id.value if hasattr(profile.external_user_id, 'value') else str(profile.external_user_id),
                    "is_connected": profile.is_connected,
                    "is_active": profile.is_active,
                    "is_default": profile.is_default,
                    "enabled_tools": profile.enabled_tools,
                    "created_at": profile.created_at.isoformat() if profile.created_at else None,
                    "last_used_at": profile.last_used_at.isoformat() if profile.last_used_at else None
                })
            
            return self.success_response({
                "message": f"Found {len(formatted_profiles)} credential profiles",
                "profiles": formatted_profiles,
                "total_count": len(formatted_profiles)
            })
            
        except Exception as e:
            return self.fail_response(f"Error getting credential profiles: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "create_credential_profile",
            "description": "Create a new Pipedream credential profile for a specific app. This will generate a unique external user ID for the profile.",
            "parameters": {
                "type": "object",
                "properties": {
                    "app_slug": {
                        "type": "string",
                        "description": "The app slug to create the profile for (e.g., 'github', 'linear', 'slack')"
                    },
                    "profile_name": {
                        "type": "string",
                        "description": "A name for this credential profile (e.g., 'Personal GitHub', 'Work Slack')"
                    },
                    "display_name": {
                        "type": "string",
                        "description": "Display name for the profile (defaults to profile_name if not provided)"
                    }
                },
                "required": ["app_slug", "profile_name"]
            }
        }
    })
    @xml_schema(
        tag_name="create-credential-profile",
        mappings=[
            {"param_name": "app_slug", "node_type": "attribute", "path": ".", "required": True},
            {"param_name": "profile_name", "node_type": "attribute", "path": ".", "required": True},
            {"param_name": "display_name", "node_type": "attribute", "path": ".", "required": False}
        ],
        example='''
        <function_calls>
        <invoke name="create_credential_profile">
        <parameter name="app_slug">github</parameter>
        <parameter name="profile_name">Personal GitHub</parameter>
        <parameter name="display_name">My Personal GitHub Account</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def create_credential_profile(
        self,
        app_slug: str,
        profile_name: str,
        display_name: Optional[str] = None
    ) -> ToolResult:
        try:
            account_id = await self._get_current_account_id()
            # fetch app domain object directly
            app_obj = await self.pipedream_manager.get_app_by_slug(app_slug)
            if not app_obj:
                return self.fail_response(f"Could not find app for slug '{app_slug}'")
            # create credential profile using the app name
            profile = await self.pipedream_manager.create_profile(
                account_id=account_id,
                profile_name=profile_name,
                app_slug=app_slug,
                app_name=app_obj.name,
                description=display_name or profile_name,
                enabled_tools=[]
            )
            
            return self.success_response({
                "message": f"Successfully created credential profile '{profile_name}' for {app_obj.name}",
                "profile": {
                    "profile_id": str(profile.profile_id),
                    "profile_name": profile.profile_name.value if hasattr(profile.profile_name, 'value') else str(profile.profile_name),
                    "display_name": profile.display_name,
                    "app_slug": profile.app_slug.value if hasattr(profile.app_slug, 'value') else str(profile.app_slug),
                    "app_name": profile.app_name,
                    "external_user_id": profile.external_user_id.value if hasattr(profile.external_user_id, 'value') else str(profile.external_user_id),
                    "is_connected": profile.is_connected,
                    "created_at": profile.created_at.isoformat()
                }
            })
            
        except Exception as e:
            return self.fail_response(f"Error creating credential profile: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "connect_credential_profile",
            "description": "Generate a connection link for a credential profile. The user needs to visit this link to connect their app account to the profile.",
            "parameters": {
                "type": "object",
                "properties": {
                    "profile_id": {
                        "type": "string",
                        "description": "The ID of the credential profile to connect"
                    }
                },
                "required": ["profile_id"]
            }
        }
    })
    @xml_schema(
        tag_name="connect-credential-profile",
        mappings=[
            {"param_name": "profile_id", "node_type": "attribute", "path": ".", "required": True}
        ],
        example='''
        <function_calls>
        <invoke name="connect_credential_profile">
        <parameter name="profile_id">profile-uuid-123</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def connect_credential_profile(self, profile_id: str) -> ToolResult:
        try:
            account_id = await self._get_current_account_id()
            
            profile = await self.pipedream_manager.get_profile(account_id, profile_id)
            if not profile:
                return self.fail_response("Credential profile not found")
            
            # generate connection token using primitive values
            connection_result = await self.pipedream_manager.create_connection_token(
                profile.external_user_id.value if hasattr(profile.external_user_id, 'value') else str(profile.external_user_id),
                profile.app_slug.value if hasattr(profile.app_slug, 'value') else str(profile.app_slug)
            )
            
            return self.success_response({
                "message": f"Generated connection link for '{profile.display_name}'",
                "profile_name": profile.display_name,
                "app_name": profile.app_name,
                "connection_link": connection_result.get("connect_link_url"),
                "external_user_id": profile.external_user_id.value if hasattr(profile.external_user_id, 'value') else str(profile.external_user_id),
                "expires_at": connection_result.get("expires_at"),
                "instructions": f"Please visit the connection link to connect your {profile.app_name} account to this profile. After connecting, you'll be able to use {profile.app_name} tools in your agent."
            })
            
        except Exception as e:
            return self.fail_response(f"Error connecting credential profile: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "check_profile_connection",
            "description": "Check the connection status of a credential profile and get available tools if connected.",
            "parameters": {
                "type": "object",
                "properties": {
                    "profile_id": {
                        "type": "string",
                        "description": "The ID of the credential profile to check"
                    }
                },
                "required": ["profile_id"]
            }
        }
    })
    @xml_schema(
        tag_name="check-profile-connection",
        mappings=[
            {"param_name": "profile_id", "node_type": "attribute", "path": ".", "required": True}
        ],
        example='''
        <function_calls>
        <invoke name="check_profile_connection">
        <parameter name="profile_id">profile-uuid-123</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def check_profile_connection(self, profile_id: str) -> ToolResult:
        try:
            account_id = await self._get_current_account_id()
            
            profile = await self.pipedream_manager.get_profile(account_id, profile_id)
            if not profile:
                return self.fail_response("Credential profile not found")
            
            # fetch and serialize connection objects
            raw_connections = await self.pipedream_manager.get_connections(
                profile.external_user_id.value if hasattr(profile.external_user_id, 'value') else str(profile.external_user_id)
            )
            connections = []
            for conn in raw_connections:
                connections.append({
                    "external_user_id": conn.external_user_id.value if hasattr(conn.external_user_id, 'value') else str(conn.external_user_id),
                    "app_slug": conn.app.slug.value if hasattr(conn.app.slug, 'value') else str(conn.app.slug),
                    "app_name": conn.app.name,
                    "created_at": conn.created_at.isoformat() if conn.created_at else None,
                    "updated_at": conn.updated_at.isoformat() if conn.updated_at else None,
                    "is_active": conn.is_active
                })
            
            response_data = {
                "profile_name": profile.display_name,
                "app_name": profile.app_name,
                "app_slug": profile.app_slug.value if hasattr(profile.app_slug, 'value') else str(profile.app_slug),
                "external_user_id": profile.external_user_id.value if hasattr(profile.external_user_id, 'value') else str(profile.external_user_id),
                "is_connected": profile.is_connected,
                "connections": connections,
                "connection_count": len(connections)
            }
            
            if profile.is_connected and connections:
                try:
                    # directly discover MCP servers via the facade
                    from pipedream.domain.entities import ConnectionStatus
                    servers = await self.pipedream_manager.discover_mcp_servers(
                        external_user_id=profile.external_user_id.value if hasattr(profile.external_user_id, 'value') else str(profile.external_user_id),
                        app_slug=profile.app_slug.value if hasattr(profile.app_slug, 'value') else str(profile.app_slug)
                    )
                    # filter connected servers
                    connected_servers = [s for s in servers if s.status == ConnectionStatus.CONNECTED]
                    if connected_servers:
                        tools = [t.name for t in connected_servers[0].available_tools]
                        response_data["available_tools"] = tools
                        response_data["tool_count"] = len(tools)
                        response_data["message"] = f"Profile '{profile.display_name}' is connected with {len(tools)} available tools"
                    else:
                        response_data["message"] = f"Profile '{profile.display_name}' is connected but no MCP tools are available yet"
                except Exception as mcp_error:
                    logger.error(f"Error getting MCP tools for profile: {mcp_error}")
                    response_data["message"] = f"Profile '{profile.display_name}' is connected but could not retrieve MCP tools"
            else:
                response_data["message"] = f"Profile '{profile.display_name}' is not connected yet"
            
            return self.success_response(response_data)
            
        except Exception as e:
            return self.fail_response(f"Error checking profile connection: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "configure_profile_for_agent",
            "description": "Configure a connected credential profile to be used by the agent with selected tools. Use this after the profile is connected and you want to add it to the agent.",
            "parameters": {
                "type": "object",
                "properties": {
                    "profile_id": {
                        "type": "string",
                        "description": "The ID of the connected credential profile"
                    },
                    "enabled_tools": {
                        "type": "array",
                        "description": "List of tool names to enable for this profile",
                        "items": {"type": "string"}
                    },
                    "display_name": {
                        "type": "string",
                        "description": "Optional custom display name for this configuration in the agent"
                    }
                },
                "required": ["profile_id", "enabled_tools"]
            }
        }
    })
    @xml_schema(
        tag_name="configure-profile-for-agent",
        mappings=[
            {"param_name": "profile_id", "node_type": "attribute", "path": ".", "required": True},
            {"param_name": "enabled_tools", "node_type": "element", "path": "enabled_tools", "required": True},
            {"param_name": "display_name", "node_type": "attribute", "path": ".", "required": False}
        ],
        example='''
        <function_calls>
        <invoke name="configure_profile_for_agent">
        <parameter name="profile_id">profile-uuid-123</parameter>
        <parameter name="enabled_tools">["create_issue", "list_repositories", "get_user"]</parameter>
        <parameter name="display_name">Personal GitHub Integration</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def configure_profile_for_agent(
        self, 
        profile_id: str, 
        enabled_tools: List[str],
        display_name: Optional[str] = None
    ) -> ToolResult:
        try:
            account_id = await self._get_current_account_id()

            profile = await self.pipedream_manager.get_profile(account_id, profile_id)
            if not profile:
                return self.fail_response("Credential profile not found")
            if not profile.is_connected:
                return self.fail_response("Profile is not connected yet. Please connect the profile first.")

            result = await self.pipedream_manager.update_agent_profile_tools(
                self.agent_id,
                profile_id,
                account_id,
                enabled_tools
            )
            if not result.get("success", False):
                return self.fail_response("Failed to update agent profile tools")

            version_msg = f"Profile '{profile.profile_name.value if hasattr(profile.profile_name, 'value') else str(profile.profile_name)}' updated with {len(enabled_tools)} tools"
            return self.success_response({
                "message": version_msg,
                "enabled_tools": result.get("enabled_tools", []),
                "total_tools": result.get("total_tools", 0),
                "version_id": result.get("version_id"),
                "version_name": result.get("version_name")
            })
            
        except Exception as e:
            return self.fail_response(f"Error configuring profile for agent: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "delete_credential_profile",
            "description": "Delete a credential profile that is no longer needed. This will also remove it from any agent configurations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "profile_id": {
                        "type": "string",
                        "description": "The ID of the credential profile to delete"
                    }
                },
                "required": ["profile_id"]
            }
        }
    })
    @xml_schema(
        tag_name="delete-credential-profile",
        mappings=[
            {"param_name": "profile_id", "node_type": "attribute", "path": ".", "required": True}
        ],
        example='''
        <function_calls>
        <invoke name="delete_credential_profile">
        <parameter name="profile_id">profile-uuid-123</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def delete_credential_profile(self, profile_id: str) -> ToolResult:
        try:
            account_id = await self._get_current_account_id()
            client = await self.db.client
            
            profile = await self.pipedream_manager.get_profile(account_id, profile_id)
            if not profile:
                return self.fail_response("Credential profile not found")
            
            # Get current version config
            agent_result = await client.table('agents').select('current_version_id').eq('agent_id', self.agent_id).execute()
            if agent_result.data and agent_result.data[0].get('current_version_id'):
                version_result = await client.table('agent_versions')\
                    .select('config')\
                    .eq('version_id', agent_result.data[0]['current_version_id'])\
                    .maybe_single()\
                    .execute()
                
                if version_result.data and version_result.data.get('config'):
                    current_config = version_result.data['config']
                    current_tools = current_config.get('tools', {})
                    current_custom_mcps = current_tools.get('custom_mcp', [])
                    
                    updated_mcps = [mcp for mcp in current_custom_mcps if mcp.get('config', {}).get('profile_id') != str(profile.profile_id)]
                    
                    if len(updated_mcps) != len(current_custom_mcps):
                        from agent.versioning.facade import version_manager
                        try:
                            current_tools['custom_mcp'] = updated_mcps
                            current_config['tools'] = current_tools
                            
                            await version_manager.create_version(
                                agent_id=self.agent_id,
                                user_id=self.account_id,
                                system_prompt=current_config.get('system_prompt', ''),
                                configured_mcps=current_config.get('tools', {}).get('mcp', []),
                                custom_mcps=updated_mcps,
                                agentpress_tools=current_config.get('tools', {}).get('agentpress', {}),
                                version_name="Removed credential profile",
                                change_description=f"Deleted credential profile {profile.display_name}"
                            )
                        except Exception as e:
                            return self.fail_response(f"Failed to update agent config: {str(e)}")
            
            await self.pipedream_manager.delete_profile(account_id, profile_id)
            
            return self.success_response({
                "message": f"Successfully deleted credential profile '{profile.display_name}' for {profile.app_name}",
                "deleted_profile": {
                    "profile_id": str(profile.profile_id),
                    "profile_name": profile.profile_name,
                    "app_name": profile.app_name
                }
            })
            
        except Exception as e:
            return self.fail_response(f"Error deleting credential profile: {str(e)}") 