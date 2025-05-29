"""
MCP Tool Wrapper for AgentPress

This module provides a generic tool wrapper that handles all MCP (Model Context Protocol) 
server tool calls through dynamically generated individual function methods.
"""

import json
from typing import Any, Dict, List, Optional
from agentpress.tool import Tool, ToolResult, openapi_schema, xml_schema
from mcp_local.client import MCPManager
from utils.logger import logger


class MCPToolWrapper(Tool):
    """
    A generic tool wrapper that dynamically creates individual methods for each MCP tool.
    
    This tool creates separate function calls for each MCP tool while routing them all
    through the same underlying implementation.
    """
    
    def __init__(self, mcp_configs: Optional[List[Dict[str, Any]]] = None):
        """
        Initialize the MCP tool wrapper.
        
        Args:
            mcp_configs: List of MCP configurations from agent's configured_mcps
        """
        super().__init__()
        self.mcp_manager = MCPManager()
        self.mcp_configs = mcp_configs or []
        self._initialized = False
        self._dynamic_tools = {}
        
    async def _ensure_initialized(self):
        """Ensure MCP connections are initialized and dynamic tools are created."""
        if not self._initialized and self.mcp_configs:
            logger.info(f"Initializing MCP connections for {len(self.mcp_configs)} servers")
            try:
                await self.mcp_manager.connect_all(self.mcp_configs)
                await self._create_dynamic_tools()
                self._initialized = True
            except ValueError as e:
                if "SMITHERY_API_KEY" in str(e):
                    logger.error("MCP Error: SMITHERY_API_KEY environment variable is not set")
                    logger.error("To use MCP tools, please:")
                    logger.error("1. Get your API key from https://smithery.ai")
                    logger.error("2. Set it as an environment variable: export SMITHERY_API_KEY='your-key-here'")
                    logger.error("3. Or add it to your .env file: SMITHERY_API_KEY=your-key-here")
                raise
    
    async def _create_dynamic_tools(self):
        """Create dynamic tool methods for each available MCP tool."""
        try:
            available_tools = self.mcp_manager.get_all_tools_openapi()
            
            for tool_info in available_tools:
                tool_name = tool_info.get('function', {}).get('name', '')
                if tool_name:
                    # Create a dynamic method for this tool
                    self._create_dynamic_method(tool_name, tool_info)
                    
            logger.info(f"Created {len(self._dynamic_tools)} dynamic MCP tool methods")
            
        except Exception as e:
            logger.error(f"Error creating dynamic MCP tools: {e}")
    
    def _create_dynamic_method(self, tool_name: str, tool_info: Dict[str, Any]):
        """Create a dynamic method for a specific MCP tool."""
        
        async def dynamic_tool_method(arguments: Dict[str, Any]) -> ToolResult:
            """Dynamically created method for MCP tool."""
            return await self._execute_mcp_tool(tool_name, arguments)
        
        # Store the method and its info
        self._dynamic_tools[tool_name] = {
            'method': dynamic_tool_method,
            'info': tool_info
        }
        
        # Add the method to this instance
        setattr(self, tool_name.replace('-', '_'), dynamic_tool_method)
    
    def __getattr__(self, name: str):
        """Handle calls to dynamically created MCP tool methods."""
        # Convert method name back to tool name (handle underscore conversion)
        tool_name = name.replace('_', '-')
        
        if tool_name in self._dynamic_tools:
            return self._dynamic_tools[tool_name]['method']
        
        # If it looks like an MCP tool name, try to find it
        for existing_tool_name in self._dynamic_tools:
            if existing_tool_name.replace('-', '_') == name:
                return self._dynamic_tools[existing_tool_name]['method']
        
        raise AttributeError(f"'{self.__class__.__name__}' object has no attribute '{name}'")
            
    async def get_available_tools(self) -> List[Dict[str, Any]]:
        """Get all available MCP tools in OpenAPI format."""
        await self._ensure_initialized()
        return self.mcp_manager.get_all_tools_openapi()
    
    async def _execute_mcp_tool(self, tool_name: str, arguments: Dict[str, Any]) -> ToolResult:
        """
        Execute an MCP tool call (internal implementation).
        
        Args:
            tool_name: The MCP tool name (e.g., "mcp_exa_web_search_exa")
            arguments: The arguments to pass to the tool
            
        Returns:
            ToolResult with the tool execution result
        """
        try:
            # Ensure MCP connections are initialized
            await self._ensure_initialized()
            
            logger.info(f"Executing MCP tool {tool_name} with args: {arguments}")
            
            # Parse arguments if they're provided as a JSON string
            if isinstance(arguments, str):
                try:
                    arguments = json.loads(arguments)
                except json.JSONDecodeError as e:
                    return self.fail_response(f"Invalid JSON in arguments: {str(e)}")
            
            # Execute the tool through MCP manager
            result = await self.mcp_manager.execute_tool(tool_name, arguments)
            
            # Parse tool name to extract server and tool info for metadata
            parts = tool_name.split("_", 2)
            server_name = parts[1] if len(parts) > 1 else "unknown"
            original_tool_name = parts[2] if len(parts) > 2 else tool_name
            
            # Enhance the result with metadata for better frontend display
            enhanced_result = {
                "mcp_metadata": {
                    "server_name": server_name,
                    "tool_name": original_tool_name,
                    "full_tool_name": tool_name,
                    "arguments_count": len(arguments) if isinstance(arguments, dict) else 0,
                    "is_mcp_tool": True
                },
                "content": result.get("content", ""),
                "isError": result.get("isError", False),
                "raw_result": result
            }
            
            # Check if it's an error
            if result.get("isError", False):
                return self.fail_response(json.dumps(enhanced_result, indent=2))
                
            # Return successful result with enhanced metadata
            return self.success_response(json.dumps(enhanced_result, indent=2))
            
        except ValueError as e:
            # Handle specific MCP errors (like invalid tool name format)
            error_msg = str(e)
            logger.error(f"ValueError executing MCP tool {tool_name}: {error_msg}")
            
            # Parse tool name for metadata even in error case
            parts = tool_name.split("_", 2) if "_" in tool_name else ["", "unknown", "unknown"]
            server_name = parts[1] if len(parts) > 1 else "unknown"
            original_tool_name = parts[2] if len(parts) > 2 else "unknown"
            
            error_result = {
                "mcp_metadata": {
                    "server_name": server_name,
                    "tool_name": original_tool_name,
                    "full_tool_name": tool_name,
                    "arguments_count": len(arguments) if isinstance(arguments, dict) else 0,
                    "is_mcp_tool": True
                },
                "content": error_msg,
                "isError": True,
                "error_type": "ValueError"
            }
            
            return self.fail_response(json.dumps(error_result, indent=2))
            
        except Exception as e:
            error_msg = f"Error executing MCP tool {tool_name}: {str(e)}"
            logger.error(error_msg)
            
            # Parse tool name for metadata even in error case
            parts = tool_name.split("_", 2) if "_" in tool_name else ["", "unknown", "unknown"]
            server_name = parts[1] if len(parts) > 1 else "unknown"
            original_tool_name = parts[2] if len(parts) > 2 else "unknown"
            
            error_result = {
                "mcp_metadata": {
                    "server_name": server_name,
                    "tool_name": original_tool_name,
                    "full_tool_name": tool_name,
                    "arguments_count": len(arguments) if isinstance(arguments, dict) else 0,
                    "is_mcp_tool": True
                },
                "content": error_msg,
                "isError": True,
                "error_type": "Exception"
            }
            
            return self.fail_response(json.dumps(error_result, indent=2))
    
    # Keep the original call_mcp_tool method as a fallback
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "call_mcp_tool",
            "description": "Execute a tool from any connected MCP server. This is a fallback wrapper that forwards calls to MCP tools. The tool_name should be in the format 'mcp_{server}_{tool}' where {server} is the MCP server's qualified name and {tool} is the specific tool name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tool_name": {
                        "type": "string",
                        "description": "The full MCP tool name in format 'mcp_{server}_{tool}', e.g., 'mcp_exa_web_search_exa'"
                    },
                    "arguments": {
                        "type": "object",
                        "description": "The arguments to pass to the MCP tool, as a JSON object. The required arguments depend on the specific tool being called.",
                        "additionalProperties": True
                    }
                },
                "required": ["tool_name", "arguments"]
            }
        }
    })
    @xml_schema(
        tag_name="call-mcp-tool",
        mappings=[
            {"param_name": "tool_name", "node_type": "attribute", "path": "."},
            {"param_name": "arguments", "node_type": "content", "path": "."}
        ],
        example='''
        <function_calls>
        <invoke name="call_mcp_tool">
        <parameter name="tool_name">mcp_exa_web_search_exa</parameter>
        <parameter name="arguments">{"query": "latest developments in AI", "num_results": 10}</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def call_mcp_tool(self, tool_name: str, arguments: Dict[str, Any]) -> ToolResult:
        """
        Execute an MCP tool call (fallback method).
        
        Args:
            tool_name: The full MCP tool name (e.g., "mcp_exa_web_search_exa")
            arguments: The arguments to pass to the tool
            
        Returns:
            ToolResult with the tool execution result
        """
        return await self._execute_mcp_tool(tool_name, arguments)
            
    async def cleanup(self):
        """Disconnect all MCP servers."""
        if self._initialized:
            try:
                await self.mcp_manager.disconnect_all()
            except Exception as e:
                logger.error(f"Error during MCP cleanup: {str(e)}")
            finally:
                self._initialized = False 