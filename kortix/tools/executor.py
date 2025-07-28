"""
Tool execution engine for Kortix SDK

Handles parsing function calls from messages and executing tools locally.
"""

import json
import re
from typing import Dict, Any, List, Optional, Union
import xml.etree.ElementTree as ET

from ..models import Message, ToolCall, ToolResult
from ..exceptions import ToolExecutionError
from .fastmcp import FastMCP


class ToolExecutor:
    """Executes tools based on function calls in messages"""
    
    def __init__(self, mcp_instances: List[FastMCP]):
        self.mcp_instances = mcp_instances
        self.tool_registry: Dict[str, FastMCP] = {}
        
        # Build a registry of all tools from all MCP instances
        for mcp in mcp_instances:
            for tool_name in mcp.get_tools():
                self.tool_registry[tool_name] = mcp
    
    def parse_function_calls(self, message: Message) -> List[ToolCall]:
        """Parse function calls from an assistant message"""
        if message.role != "assistant":
            return []
        
        function_calls = []
        
        # Handle string content
        if isinstance(message.content, str):
            function_calls.extend(self._parse_function_calls_from_text(message.content))
        
        # Handle list content (like OpenAI format)
        elif isinstance(message.content, list):
            for item in message.content:
                if isinstance(item, dict) and item.get("type") == "tool_use":
                    function_calls.append(ToolCall(
                        id=item.get("id", f"call_{len(function_calls)}"),
                        name=item["name"],
                        arguments=item.get("input", {})
                    ))
        
        return function_calls
    
    def _parse_function_calls_from_text(self, text: str) -> List[ToolCall]:
        """Parse function calls from text content (XML format)"""
        function_calls = []
        
        # Look for <function_calls> blocks
        function_calls_pattern = r'<function_calls>(.*?)</function_calls>'
        matches = re.findall(function_calls_pattern, text, re.DOTALL)
        
        for match in matches:
            # Parse individual <invoke> elements
            invoke_pattern = r'<invoke name="([^"]+)">(.*?)</invoke>'
            invoke_matches = re.findall(invoke_pattern, match, re.DOTALL)
            
            for tool_name, params_xml in invoke_matches:
                # Parse parameters
                arguments = self._parse_parameters(params_xml)
                
                function_calls.append(ToolCall(
                    id=f"call_{len(function_calls)}",
                    name=tool_name,
                    arguments=arguments
                ))
        
        return function_calls
    
    def _parse_parameters(self, params_xml: str) -> Dict[str, Any]:
        """Parse parameters from XML parameter elements"""
        arguments = {}
        
        # Find all <parameter> elements
        param_pattern = r'<parameter name="([^"]+)">(.*?)</parameter>'
        param_matches = re.findall(param_pattern, params_xml, re.DOTALL)
        
        for param_name, param_value in param_matches:
            # Try to parse as JSON first, fall back to string
            param_value = param_value.strip()
            try:
                # Try parsing as JSON
                arguments[param_name] = json.loads(param_value)
            except json.JSONDecodeError:
                # Fall back to string value
                arguments[param_name] = param_value
        
        return arguments
    
    async def execute_tool_call(self, tool_call: ToolCall) -> ToolResult:
        """Execute a single tool call"""
        tool_name = tool_call.name
        
        if tool_name not in self.tool_registry:
            return ToolResult(
                tool_call_id=tool_call.id,
                content=f"Tool '{tool_name}' not found",
                is_error=True
            )
        
        mcp_instance = self.tool_registry[tool_name]
        
        try:
            result = await mcp_instance.execute_tool(tool_name, tool_call.arguments)
            
            # Convert result to string if it's not already
            if isinstance(result, str):
                content = result
            else:
                content = json.dumps(result, ensure_ascii=False)
            
            return ToolResult(
                tool_call_id=tool_call.id,
                content=content,
                is_error=False
            )
            
        except Exception as e:
            return ToolResult(
                tool_call_id=tool_call.id,
                content=f"Tool execution failed: {str(e)}",
                is_error=True
            )
    
    async def execute_all_tool_calls(self, tool_calls: List[ToolCall]) -> List[ToolResult]:
        """Execute multiple tool calls"""
        results = []
        for tool_call in tool_calls:
            result = await self.execute_tool_call(tool_call)
            results.append(result)
        
        return results
    
    def format_tool_result_message(self, tool_results: List[ToolResult]) -> str:
        """Format tool results into a message that can be added to the thread"""
        if not tool_results:
            return ""
        
        # Format as XML for the agent to understand
        message_parts = []
        
        for result in tool_results:
            if result.is_error:
                message_parts.append(
                    f'<tool_result tool_call_id="{result.tool_call_id}" error="true">\n'
                    f'{result.content}\n'
                    f'</tool_result>'
                )
            else:
                message_parts.append(
                    f'<tool_result tool_call_id="{result.tool_call_id}">\n'
                    f'{result.content}\n'
                    f'</tool_result>'
                )
        
        return '\n\n'.join(message_parts) 