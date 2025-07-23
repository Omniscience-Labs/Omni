import json
from typing import Optional, Dict, Any
from agentpress.tool import ToolResult, openapi_schema, xml_schema
from agentpress.thread_manager import ThreadManager
from .base_tool import AgentBuilderBaseTool
from utils.logger import logger
from agent.config_helper import build_unified_config


class AgentConfigTool(AgentBuilderBaseTool):
    def __init__(self, thread_manager: ThreadManager, db_connection, agent_id: str):
        super().__init__(thread_manager, db_connection, agent_id)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "update_agent",
            "description": "Update the agent's configuration including name, description, system prompt, tools, and MCP servers. Call this whenever the user wants to modify any aspect of the agent.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "The name of the agent. Should be descriptive and indicate the agent's purpose."
                    },
                    "description": {
                        "type": "string",
                        "description": "A brief description of what the agent does and its capabilities."
                    },
                    "system_prompt": {
                        "type": "string",
                        "description": "The system instructions that define the agent's behavior, expertise, and approach. This should be comprehensive and well-structured."
                    },
                    "agentpress_tools": {
                        "type": "object",
                        "description": "Configuration for AgentPress tools. Each key is a tool name, and the value is an object with 'enabled' (boolean) and 'description' (string) properties.",
                        "additionalProperties": {
                            "type": "object",
                            "properties": {
                                "enabled": {"type": "boolean"},
                                "description": {"type": "string"}
                            }
                        }
                    },
                    "configured_mcps": {
                        "type": "array",
                        "description": "List of configured MCP servers for external integrations.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "qualifiedName": {"type": "string"},
                                "config": {"type": "object"},
                                "enabledTools": {
                                    "type": "array",
                                    "items": {"type": "string"}
                                }
                            }
                        }
                    },
                    "avatar": {
                        "type": "string",
                        "description": "Emoji to use as the agent's avatar."
                    },
                    "avatar_color": {
                        "type": "string",
                        "description": "Hex color code for the agent's avatar background."
                    }
                },
                "required": []
            }
        }
    })
    @xml_schema(
        tag_name="update-agent",
        mappings=[
            {"param_name": "name", "node_type": "attribute", "path": ".", "required": False},
            {"param_name": "description", "node_type": "element", "path": "description", "required": False},
            {"param_name": "system_prompt", "node_type": "element", "path": "system_prompt", "required": False},
            {"param_name": "agentpress_tools", "node_type": "element", "path": "agentpress_tools", "required": False},
            {"param_name": "configured_mcps", "node_type": "element", "path": "configured_mcps", "required": False},
            {"param_name": "avatar", "node_type": "attribute", "path": ".", "required": False},
            {"param_name": "avatar_color", "node_type": "attribute", "path": ".", "required": False}
        ],
        example='''
        <function_calls>
        <invoke name="update_agent">
        <parameter name="name">Research Assistant</parameter>
        <parameter name="description">An AI assistant specialized in conducting research and providing comprehensive analysis</parameter>
        <parameter name="system_prompt">You are a research assistant with expertise in gathering, analyzing, and synthesizing information. Your approach is thorough and methodical...</parameter>
        <parameter name="agentpress_tools">{"web_search": {"enabled": true, "description": "Search the web for information"}, "sb_files": {"enabled": true, "description": "Read and write files"}}</parameter>
        <parameter name="avatar">🔬</parameter>
        <parameter name="avatar_color">#4F46E5</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def update_agent(
        self,
        name: Optional[str] = None,
        description: Optional[str] = None,
        system_prompt: Optional[str] = None,
        agentpress_tools: Optional[Dict[str, Dict[str, Any]]] = None,
        configured_mcps: Optional[list] = None,
        avatar: Optional[str] = None,
        avatar_color: Optional[str] = None
    ) -> ToolResult:
        try:
            client = await self.db.client
            
            agent_result = await client.table('agents').select('*').eq('agent_id', self.agent_id).execute()
            if not agent_result.data:
                return self.fail_response("Agent not found")
            
            current_agent = agent_result.data[0]

            metadata = current_agent.get('metadata', {})
            is_suna_default = metadata.get('is_suna_default', False)
            
            if is_suna_default:
                restricted_fields = []
                if name is not None:
                    restricted_fields.append("name")
                if description is not None:
                    restricted_fields.append("description") 
                if system_prompt is not None:
                    restricted_fields.append("system prompt")
                if agentpress_tools is not None:
                    restricted_fields.append("default tools")
                
                if restricted_fields:
                    return self.fail_response(
                        f"Cannot modify {', '.join(restricted_fields)} for the default Suna agent. "
                        f"Suna's core identity is managed centrally. However, you can still add MCP integrations, "
                        f"create workflows, set up triggers, and customize other aspects of Suna."
                    )
            
            update_data = {}
            if name is not None:
                update_data["name"] = name
            if description is not None:
                update_data["description"] = description
            if system_prompt is not None:
                update_data["system_prompt"] = system_prompt
            if agentpress_tools is not None:
                formatted_tools = {}
                for tool_name, tool_config in agentpress_tools.items():
                    if isinstance(tool_config, dict):
                        formatted_tools[tool_name] = {
                            "enabled": tool_config.get("enabled", False),
                            "description": tool_config.get("description", "")
                        }
                update_data["agentpress_tools"] = formatted_tools
            if configured_mcps is not None:
                if isinstance(configured_mcps, str):
                    configured_mcps = json.loads(configured_mcps)
                update_data["configured_mcps"] = configured_mcps
            if avatar is not None:
                update_data["avatar"] = avatar
            if avatar_color is not None:
                update_data["avatar_color"] = avatar_color
                
            if not update_data:
                return self.fail_response("No fields provided to update")
            
            current_system_prompt = system_prompt if system_prompt is not None else current_agent.get('system_prompt', '')
            current_agentpress_tools = update_data.get('agentpress_tools', current_agent.get('agentpress_tools', {}))
            current_configured_mcps = configured_mcps if configured_mcps is not None else current_agent.get('configured_mcps', [])

            raw_custom_mcps = current_agent.get('custom_mcps', [])
            import re
            sanitized_custom_mcps = []
            for mcp in raw_custom_mcps:
                headers = mcp.get('config', {}).get('headers', {})
                slug_val = headers.get('x-pd-app-slug')
                if isinstance(slug_val, str):
                    match = re.match(r"AppSlug\(value='(.+)'\)", slug_val)
                    if match:
                        headers['x-pd-app-slug'] = match.group(1)
                sanitized_custom_mcps.append(mcp)
            current_custom_mcps = sanitized_custom_mcps
            
            current_avatar = avatar if avatar is not None else current_agent.get('avatar')
            current_avatar_color = avatar_color if avatar_color is not None else current_agent.get('avatar_color')
            
            unified_config = build_unified_config(
                system_prompt=current_system_prompt,
                agentpress_tools=current_agentpress_tools,
                configured_mcps=current_configured_mcps,
                custom_mcps=current_custom_mcps,
                avatar=current_avatar,
                avatar_color=current_avatar_color
            )
            
            update_data["config"] = unified_config
            
            if "custom_mcps" not in update_data:
                update_data["custom_mcps"] = current_custom_mcps
                
            result = await client.table('agents').update(update_data).eq('agent_id', self.agent_id).execute()
            
            if not result.data:
                return self.fail_response("Failed to update agent")

            return self.success_response({
                "message": "Agent updated successfully",
                "updated_fields": list(update_data.keys()),
                "agent": result.data[0]
            })
            
        except Exception as e:
            return self.fail_response(f"Error updating agent: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "get_current_agent_config",
            "description": "Get the current configuration of the agent being edited. Use this to check what's already configured before making updates.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    })
    @xml_schema(
        tag_name="get-current-agent-config",
        mappings=[],
        example='''
        <function_calls>
        <invoke name="get_current_agent_config">
        </invoke>
        </function_calls>
        '''
    )
    async def get_current_agent_config(self) -> ToolResult:
        try:
            agent = await self._get_agent_data()
            
            if not agent:
                return self.fail_response("Agent not found")
            
            config_summary = {
                "agent_id": agent["agent_id"],
                "name": agent.get("name", "Untitled Agent"),
                "description": agent.get("description", "No description set"),
                "system_prompt": agent.get("system_prompt", "No system prompt set"),
                "avatar": agent.get("avatar", "🤖"),
                "avatar_color": agent.get("avatar_color", "#6B7280"),
                "agentpress_tools": agent.get("agentpress_tools", {}),
                "configured_mcps": agent.get("configured_mcps", []),
                "custom_mcps": agent.get("custom_mcps", []),
                "created_at": agent.get("created_at"),
                "updated_at": agent.get("updated_at")
            }
            
            tools_count = len([t for t, cfg in config_summary["agentpress_tools"].items() if cfg.get("enabled")])
            mcps_count = len(config_summary["configured_mcps"])
            custom_mcps_count = len(config_summary["custom_mcps"])
            
            return self.success_response({
                "summary": f"Agent '{config_summary['name']}' has {tools_count} tools enabled, {mcps_count} MCP servers configured, and {custom_mcps_count} custom MCP integrations.",
                "configuration": config_summary
            })
            
        except Exception as e:
            return self.fail_response(f"Error getting agent configuration: {str(e)}") 