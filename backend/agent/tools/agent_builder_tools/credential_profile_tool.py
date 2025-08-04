import json
from typing import Optional, List
from agentpress.tool import ToolResult, openapi_schema, usage_example
from agentpress.thread_manager import ThreadManager
from .base_tool import AgentBuilderBaseTool
from composio_integration.composio_service import get_integration_service
from composio_integration.composio_profile_service import ComposioProfileService
from composio_integration.toolkit_service import ToolkitService
from mcp_module.mcp_service import mcp_service
from .mcp_search_tool import MCPSearchTool
from utils.logger import logger


class CredentialProfileTool(AgentBuilderBaseTool):
    def __init__(self, thread_manager: ThreadManager, db_connection, agent_id: str):
        super().__init__(thread_manager, db_connection, agent_id)
        self.composio_search = MCPSearchTool(thread_manager, db_connection, agent_id)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "get_credential_profiles",
            "description": "Get all existing Composio credential profiles for the current user. Use this to show the user their available profiles.",
            "parameters": {
                "type": "object",
                "properties": {
                    "toolkit_slug": {
                        "type": "string",
                        "description": "Optional filter to show only profiles for a specific toolkit"
                    }
                },
                "required": []
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="get_credential_profiles">
        <parameter name="toolkit_slug">github</parameter>
        </invoke>
        </function_calls>
        ''')
    async def get_credential_profiles(self, toolkit_slug: Optional[str] = None) -> ToolResult:
        try:
            account_id = await self._get_current_account_id()
            profile_service = ComposioProfileService(self.db)
            profiles = await profile_service.get_profiles(account_id, toolkit_slug)
            
            formatted_profiles = []
            for profile in profiles:
                formatted_profiles.append({
                    "profile_id": profile.profile_id,
                    "profile_name": profile.profile_name,
                    "display_name": profile.display_name,
                    "toolkit_slug": profile.toolkit_slug,
                    "toolkit_name": profile.toolkit_name,
                    "mcp_url": profile.mcp_url,
                    "is_connected": profile.is_connected,
                    "is_default": profile.is_default,
                    "created_at": profile.created_at.isoformat() if profile.created_at else None,
                    "updated_at": profile.updated_at.isoformat() if profile.updated_at else None
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
            "description": "Create a new Composio credential profile for a specific toolkit. This will create the integration and return an authentication link.",
            "parameters": {
                "type": "object",
                "properties": {
                    "toolkit_slug": {
                        "type": "string",
                        "description": "The toolkit slug to create the profile for (e.g., 'github', 'linear', 'slack')"
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
                "required": ["toolkit_slug", "profile_name"]
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="create_credential_profile">
        <parameter name="toolkit_slug">github</parameter>
        <parameter name="profile_name">Personal GitHub</parameter>
        <parameter name="display_name">My Personal GitHub Account</parameter>
        </invoke>
        </function_calls>
        ''')
    async def create_credential_profile(
        self,
        toolkit_slug: str,
        profile_name: str,
        display_name: Optional[str] = None
    ) -> ToolResult:
        try:
            account_id = await self._get_current_account_id()

            integration_service = get_integration_service(db_connection=self.db)
            result = await integration_service.integrate_toolkit(
                toolkit_slug=toolkit_slug,
                account_id=account_id,
                profile_name=profile_name,
                display_name=display_name or profile_name,
                user_id=account_id,
                save_as_profile=True
            )

            print("[DEBUG] create_credential_profile result:", result)
            
            return self.success_response({
                "message": f"Successfully created credential profile '{profile_name}' for {result.toolkit.name}",
                "profile": {
                    "profile_id": result.profile_id,
                    "profile_name": profile_name,
                    "display_name": display_name or profile_name,
                    "toolkit_slug": toolkit_slug,
                    "toolkit_name": result.toolkit.name,
                    "mcp_url": result.final_mcp_url,
                    "redirect_url": result.connected_account.redirect_url,
                    "is_connected": False,
                    "auth_required": bool(result.connected_account.redirect_url)
                }
            })
            
        except Exception as e:
            return self.fail_response(f"Error creating credential profile: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "connect_credential_profile",
            "description": "Get the connection link for a credential profile. The user needs to visit this link to authenticate their account with the profile.",
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
    @usage_example('''
        <function_calls>
        <invoke name="connect_credential_profile">
        <parameter name="profile_id">profile-uuid-123</parameter>
        </invoke>
        </function_calls>
        ''')
    async def connect_credential_profile(self, profile_id: str) -> ToolResult:
        try:
            account_id = await self._get_current_account_id()
            profile_service = ComposioProfileService(self.db)
            profiles = await profile_service.get_profiles(account_id)
            
            profile = None
            for p in profiles:
                if p.profile_id == profile_id:
                    profile = p
                    break
            
            if not profile:
                return self.fail_response("Credential profile not found")
            
            if profile.is_connected:
                return self.success_response({
                    "message": f"Profile '{profile.display_name}' is already connected",
                    "profile_name": profile.display_name,
                    "toolkit_name": profile.toolkit_name,
                    "is_connected": True,
                    "instructions": f"This {profile.toolkit_name} profile is already connected and ready to use."
                })
            
            config = await profile_service.get_profile_config(profile_id)
            redirect_url = config.get('redirect_url')
            
            if not redirect_url:
                return self.fail_response("No authentication URL available for this profile")
            
            return self.success_response({
                "message": f"Connection link ready for '{profile.display_name}'",
                "profile_name": profile.display_name,
                "toolkit_name": profile.toolkit_name,
                "connection_link": redirect_url,
                "is_connected": profile.is_connected,
                "instructions": f"Please visit the connection link to authenticate your {profile.toolkit_name} account with this profile. After connecting, you'll be able to use {profile.toolkit_name} tools in your agent."
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
    @usage_example('''
        <function_calls>
        <invoke name="check_profile_connection">
        <parameter name="profile_id">profile-uuid-123</parameter>
        </invoke>
        </function_calls>
        ''')
    async def check_profile_connection(self, profile_id: str) -> ToolResult:
        try:
            from uuid import UUID
            from pipedream.connection_service import ExternalUserId
            account_id = await self._get_current_account_id()
            
            profile = await profile_service.get_profile(UUID(account_id), UUID(profile_id))
            if not profile:
                return self.fail_response("Credential profile not found")
            
            # fetch and serialize connection objects
            external_user_id = ExternalUserId(profile.external_user_id.value if hasattr(profile.external_user_id, 'value') else str(profile.external_user_id))
            raw_connections = await connection_service.get_connections_for_user(external_user_id)
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
                    from pipedream.mcp_service import ConnectionStatus, ExternalUserId, AppSlug
                    external_user_id = ExternalUserId(profile.external_user_id.value if hasattr(profile.external_user_id, 'value') else str(profile.external_user_id))
                    app_slug = AppSlug(profile.app_slug.value if hasattr(profile.app_slug, 'value') else str(profile.app_slug))
                    servers = await mcp_service.discover_servers_for_user(external_user_id, app_slug)
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
    @usage_example('''
        <function_calls>
        <invoke name="configure_profile_for_agent">
        <parameter name="profile_id">profile-uuid-123</parameter>
        <parameter name="enabled_tools">["create_issue", "list_repositories", "get_user"]</parameter>
        <parameter name="display_name">Personal GitHub Integration</parameter>
        </invoke>
        </function_calls>
        ''')
    async def configure_profile_for_agent(
        self, 
        profile_id: str, 
        enabled_tools: List[str],
        display_name: Optional[str] = None
    ) -> ToolResult:
        try:
            account_id = await self._get_current_account_id()
            client = await self.db.client

            profile_service = ComposioProfileService(self.db)
            profiles = await profile_service.get_profiles(account_id)
            
            profile = None
            for p in profiles:
                if p.profile_id == profile_id:
                    profile = p
                    break
            
            if not profile:
                return self.fail_response("Credential profile not found")
            if not profile.is_connected:
                return self.fail_response("Profile is not connected yet. Please connect the profile first.")

            agent_result = await client.table('agents').select('current_version_id').eq('agent_id', self.agent_id).execute()
            if not agent_result.data or not agent_result.data[0].get('current_version_id'):
                return self.fail_response("Agent configuration not found")

            version_result = await client.table('agent_versions')\
                .select('config')\
                .eq('version_id', agent_result.data[0]['current_version_id'])\
                .maybe_single()\
                .execute()
            
            if not version_result.data or not version_result.data.get('config'):
                return self.fail_response("Agent version configuration not found")

            current_config = version_result.data['config']
            current_tools = current_config.get('tools', {})
            current_custom_mcps = current_tools.get('custom_mcp', [])
            
            new_mcp_config = {
                'name': profile.toolkit_name,
                'type': 'composio',
                'config': {
                    'profile_id': profile_id
                },
                'enabledTools': enabled_tools
            }
            
            updated_mcps = [mcp for mcp in current_custom_mcps 
                          if mcp.get('config', {}).get('profile_id') != profile_id]
            
            updated_mcps.append(new_mcp_config)
            
            current_tools['custom_mcp'] = updated_mcps
            current_config['tools'] = current_tools
            
            from agent.versioning.version_service import get_version_service
            version_service = await get_version_service()
            new_version = await version_service.create_version(
                agent_id=self.agent_id,
                user_id=account_id,
                system_prompt=current_config.get('system_prompt', ''),
                configured_mcps=current_config.get('tools', {}).get('mcp', []),
                custom_mcps=updated_mcps,
                agentpress_tools=current_config.get('tools', {}).get('agentpress', {}),
                change_description=f"Configured {display_name or profile.display_name} with {len(enabled_tools)} tools"
            )

            return self.success_response({
                "message": f"Profile '{profile.profile_name}' updated with {len(enabled_tools)} tools",
                "enabled_tools": enabled_tools,
                "total_tools": len(enabled_tools),
                "version_id": new_version.version_id,
                "version_name": new_version.version_name
            })
            
        except Exception as e:
            logger.error(f"Error configuring profile for agent: {e}", exc_info=True)
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
    @usage_example('''
        <function_calls>
        <invoke name="delete_credential_profile">
        <parameter name="profile_id">profile-uuid-123</parameter>
        </invoke>
        </function_calls>
        ''')
    async def delete_credential_profile(self, profile_id: str) -> ToolResult:
        try:
            account_id = await self._get_current_account_id()
            client = await self.db.client
            
            profile_service = ComposioProfileService(self.db)
            profiles = await profile_service.get_profiles(account_id)
            
            profile = None
            for p in profiles:
                if p.profile_id == profile_id:
                    profile = p
                    break
            
            if not profile:
                return self.fail_response("Credential profile not found")
            
            # Remove from agent configuration if it exists
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
                    
                    updated_mcps = [mcp for mcp in current_custom_mcps if mcp.get('config', {}).get('profile_id') != profile_id]
                    
                    if len(updated_mcps) != len(current_custom_mcps):
                        from agent.versioning.version_service import get_version_service
                        try:
                            current_tools['custom_mcp'] = updated_mcps
                            current_config['tools'] = current_tools
                            
                            version_service = await get_version_service()
                            await version_service.create_version(
                                agent_id=self.agent_id,
                                user_id=account_id,
                                system_prompt=current_config.get('system_prompt', ''),
                                configured_mcps=current_config.get('tools', {}).get('mcp', []),
                                custom_mcps=updated_mcps,
                                agentpress_tools=current_config.get('tools', {}).get('agentpress', {}),
                                change_description=f"Deleted credential profile {profile.display_name}"
                            )
                        except Exception as e:
                            return self.fail_response(f"Failed to update agent config: {str(e)}")
            
            # Delete the profile
            await profile_service.delete_profile(profile_id)
            
            return self.success_response({
                "message": f"Successfully deleted credential profile '{profile.display_name}' for {profile.toolkit_name}",
                "deleted_profile": {
                    "profile_id": profile.profile_id,
                    "profile_name": profile.profile_name,
                    "toolkit_name": profile.toolkit_name
                }
            })
            
        except Exception as e:
            return self.fail_response(f"Error deleting credential profile: {str(e)}") 