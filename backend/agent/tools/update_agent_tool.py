import json
from typing import Optional, Dict, Any
from agentpress.tool import Tool, ToolResult, openapi_schema, xml_schema

class UpdateAgentTool(Tool):
    """Tool for updating agent configuration.
    
    This tool is used by the agent builder to update agent properties
    based on user requirements.
    """

    def __init__(self, db_connection, agent_id: str):
        super().__init__()
        self.db = db_connection
        self.agent_id = agent_id

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
        tag_name="update_agent",
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
        """Update agent configuration with provided fields.
        
        Args:
            name: Agent name
            description: Agent description
            system_prompt: System instructions for the agent
            agentpress_tools: AgentPress tools configuration
            configured_mcps: MCP servers configuration
            avatar: Emoji avatar
            avatar_color: Avatar background color
            
        Returns:
            ToolResult with updated agent data or error
        """
        try:
            client = await self.db.client
            
            # Build update data with only provided fields
            update_data = {}
            if name is not None:
                update_data["name"] = name
            if description is not None:
                update_data["description"] = description
            if system_prompt is not None:
                update_data["system_prompt"] = system_prompt
            if agentpress_tools is not None:
                # Ensure proper format for agentpress_tools
                formatted_tools = {}
                for tool_name, tool_config in agentpress_tools.items():
                    if isinstance(tool_config, dict):
                        formatted_tools[tool_name] = {
                            "enabled": tool_config.get("enabled", False),
                            "description": tool_config.get("description", "")
                        }
                update_data["agentpress_tools"] = formatted_tools
            if configured_mcps is not None:
                # Parse JSON string if needed
                if isinstance(configured_mcps, str):
                    configured_mcps = json.loads(configured_mcps)
                update_data["configured_mcps"] = configured_mcps
            if avatar is not None:
                update_data["avatar"] = avatar
            if avatar_color is not None:
                update_data["avatar_color"] = avatar_color
                
            if not update_data:
                return self.fail_response("No fields provided to update")
                
            # Update the agent in the database
            result = await client.table('agents').update(update_data).eq('agent_id', self.agent_id).execute()
            
            if not result.data:
                return self.fail_response("Failed to update agent")
                
            # Return the updated agent data
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
        tag_name="get_current_agent_config",
        mappings=[],
        example='''
        <function_calls>
        <invoke name="get_current_agent_config">
        </invoke>
        </function_calls>
        '''
    )
    async def get_current_agent_config(self) -> ToolResult:
        """Get the current agent configuration.
        
        Returns:
            ToolResult with current agent configuration
        """
        try:
            client = await self.db.client
            
            # Get agent data
            result = await client.table('agents').select('*').eq('agent_id', self.agent_id).execute()
            
            if not result.data:
                return self.fail_response("Agent not found")
                
            agent = result.data[0]
            
            # Format the response for easy reading
            config_summary = {
                "agent_id": agent["agent_id"],
                "name": agent.get("name", "Untitled Agent"),
                "description": agent.get("description", "No description set"),
                "system_prompt": agent.get("system_prompt", "No system prompt set"),
                "avatar": agent.get("avatar", "🤖"),
                "avatar_color": agent.get("avatar_color", "#6B7280"),
                "agentpress_tools": agent.get("agentpress_tools", {}),
                "configured_mcps": agent.get("configured_mcps", []),
                "created_at": agent.get("created_at"),
                "updated_at": agent.get("updated_at")
            }
            
            # Create a readable summary
            tools_count = len([t for t, cfg in config_summary["agentpress_tools"].items() if cfg.get("enabled")])
            mcps_count = len(config_summary["configured_mcps"])
            
            return self.success_response({
                "summary": f"Agent '{config_summary['name']}' has {tools_count} tools enabled and {mcps_count} MCP servers configured.",
                "configuration": config_summary
            })
            
        except Exception as e:
            return self.fail_response(f"Error getting agent configuration: {str(e)}") 