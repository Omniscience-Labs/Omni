"""
FastMCP compatibility layer for Kortix SDK

Provides a compatible interface for defining tools using decorators.
"""

import inspect
import json
from typing import Dict, Any, Callable, List, Optional, get_type_hints
from functools import wraps


class FastMCP:
    """FastMCP compatibility layer for tool registration"""
    
    def __init__(self, name: str):
        self.name = name
        self.tools: Dict[str, Callable] = {}
        self.tool_schemas: Dict[str, Dict[str, Any]] = {}
    
    def tool(self, func: Callable) -> Callable:
        """Decorator to register a function as a tool"""
        # Extract function signature and create schema
        schema = self._generate_schema(func)
        
        # Register the tool
        self.tools[func.__name__] = func
        self.tool_schemas[func.__name__] = schema
        
        # Return the original function unchanged for direct use
        # The wrapper is only used internally for execution
        return func
    
    def _generate_schema(self, func: Callable) -> Dict[str, Any]:
        """Generate OpenAPI-style schema from function signature"""
        sig = inspect.signature(func)
        type_hints = get_type_hints(func)
        
        properties = {}
        required = []
        
        for param_name, param in sig.parameters.items():
            if param_name == 'self':
                continue
                
            param_type = type_hints.get(param_name, str)
            
            # Convert Python types to JSON schema types
            json_type = self._python_type_to_json_type(param_type)
            
            properties[param_name] = {
                "type": json_type,
                "description": f"Parameter {param_name}"
            }
            
            # Check if parameter is required (no default value)
            if param.default == inspect.Parameter.empty:
                required.append(param_name)
        
        return {
            "type": "function",
            "function": {
                "name": func.__name__,
                "description": func.__doc__ or f"Execute {func.__name__}",
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required
                }
            }
        }
    
    def _python_type_to_json_type(self, python_type) -> str:
        """Convert Python type to JSON schema type"""
        if python_type == str:
            return "string"
        elif python_type == int:
            return "integer"
        elif python_type == float:
            return "number"
        elif python_type == bool:
            return "boolean"
        elif python_type == list:
            return "array"
        elif python_type == dict:
            return "object"
        else:
            return "string"  # Default fallback
    
    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Execute a registered tool"""
        if tool_name not in self.tools:
            raise ValueError(f"Tool '{tool_name}' not found")
        
        tool_func = self.tools[tool_name]
        
        try:
            if inspect.iscoroutinefunction(tool_func):
                return await tool_func(**arguments)
            else:
                return tool_func(**arguments)
        except Exception as e:
            raise Exception(f"Tool execution failed: {str(e)}")
    
    def get_tools(self) -> Dict[str, Callable]:
        """Get all registered tools"""
        return self.tools.copy()
    
    def get_tool_schemas(self) -> Dict[str, Dict[str, Any]]:
        """Get schemas for all registered tools"""
        return self.tool_schemas.copy()


def function_tool(func: Callable) -> Callable:
    """Standalone function decorator for tools (alternative to @mcp.tool)"""
    # This could be used for tools that don't belong to a specific FastMCP instance
    # For now, we'll just return the function as-is with some metadata
    func._is_kortix_tool = True
    func._tool_schema = FastMCP("standalone")._generate_schema(func)
    return func 