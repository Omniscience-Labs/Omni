"""
Tests for the Kortix SDK FastMCP module
"""

import pytest
import asyncio
from typing import List

from kortix.tools.fastmcp import FastMCP, function_tool


class TestFastMCP:
    """Test the FastMCP class"""
    
    def test_init(self):
        """Test FastMCP initialization"""
        mcp = FastMCP("Test Server")
        assert mcp.name == "Test Server"
        assert mcp.tools == {}
        assert mcp.tool_schemas == {}
    
    def test_tool_decorator_sync(self):
        """Test the @tool decorator with sync functions"""
        mcp = FastMCP("Test")
        
        @mcp.tool
        def test_function(param: str) -> str:
            """Test function docstring"""
            return f"Result: {param}"
        
        # Check tool is registered
        assert "test_function" in mcp.tools
        assert "test_function" in mcp.tool_schemas
        
        # Check schema generation
        schema = mcp.tool_schemas["test_function"]
        assert schema["type"] == "function"
        assert schema["function"]["name"] == "test_function"
        assert schema["function"]["description"] == "Test function docstring"
        
        # Check parameters
        params = schema["function"]["parameters"]
        assert params["type"] == "object"
        assert "param" in params["properties"]
        assert params["properties"]["param"]["type"] == "string"
        assert "param" in params["required"]
    
    def test_tool_decorator_async(self):
        """Test the @tool decorator with async functions"""
        mcp = FastMCP("Test")
        
        @mcp.tool
        async def async_function(query: str) -> str:
            """Async test function"""
            await asyncio.sleep(0.01)
            return f"Async result: {query}"
        
        # Check tool is registered
        assert "async_function" in mcp.tools
        assert "async_function" in mcp.tool_schemas
    
    def test_tool_decorator_with_defaults(self):
        """Test the @tool decorator with default parameters"""
        mcp = FastMCP("Test")
        
        @mcp.tool
        def function_with_defaults(required_param: str, optional_param: int = 42) -> str:
            """Function with default parameters"""
            return f"{required_param}: {optional_param}"
        
        schema = mcp.tool_schemas["function_with_defaults"]
        params = schema["function"]["parameters"]
        
        # Check required parameters
        assert "required_param" in params["required"]
        assert "optional_param" not in params["required"]
        
        # Check properties
        assert params["properties"]["required_param"]["type"] == "string"
        assert params["properties"]["optional_param"]["type"] == "integer"
    
    def test_tool_decorator_preserves_function(self):
        """Test that the decorator preserves the original function"""
        mcp = FastMCP("Test")
        
        @mcp.tool
        def original_function(value: str) -> str:
            return f"Original: {value}"
        
        # The decorated function should still be callable
        result = original_function("test")
        assert result == "Original: test"
    
    def test_python_type_to_json_type(self):
        """Test type conversion from Python to JSON schema"""
        mcp = FastMCP("Test")
        
        assert mcp._python_type_to_json_type(str) == "string"
        assert mcp._python_type_to_json_type(int) == "integer"
        assert mcp._python_type_to_json_type(float) == "number"
        assert mcp._python_type_to_json_type(bool) == "boolean"
        assert mcp._python_type_to_json_type(list) == "array"
        assert mcp._python_type_to_json_type(dict) == "object"
        assert mcp._python_type_to_json_type(object) == "string"  # fallback
    
    @pytest.mark.asyncio
    async def test_execute_tool_sync(self):
        """Test executing synchronous tools"""
        mcp = FastMCP("Test")
        
        @mcp.tool
        def sync_tool(message: str) -> str:
            return f"Sync: {message}"
        
        result = await mcp.execute_tool("sync_tool", {"message": "hello"})
        assert result == "Sync: hello"
    
    @pytest.mark.asyncio
    async def test_execute_tool_async(self):
        """Test executing asynchronous tools"""
        mcp = FastMCP("Test")
        
        @mcp.tool
        async def async_tool(message: str) -> str:
            await asyncio.sleep(0.01)
            return f"Async: {message}"
        
        result = await mcp.execute_tool("async_tool", {"message": "hello"})
        assert result == "Async: hello"
    
    @pytest.mark.asyncio
    async def test_execute_tool_not_found(self):
        """Test executing a non-existent tool"""
        mcp = FastMCP("Test")
        
        with pytest.raises(ValueError, match="Tool 'nonexistent' not found"):
            await mcp.execute_tool("nonexistent", {})
    
    @pytest.mark.asyncio
    async def test_execute_tool_with_error(self):
        """Test tool execution with error handling"""
        mcp = FastMCP("Test")
        
        @mcp.tool
        def error_tool(message: str) -> str:
            raise ValueError("Test error")
        
        with pytest.raises(Exception, match="Tool execution failed: Test error"):
            await mcp.execute_tool("error_tool", {"message": "test"})
    
    def test_get_tools(self):
        """Test getting all registered tools"""
        mcp = FastMCP("Test")
        
        @mcp.tool
        def tool1(x: str) -> str:
            return x
        
        @mcp.tool 
        def tool2(y: int) -> int:
            return y
        
        tools = mcp.get_tools()
        assert "tool1" in tools
        assert "tool2" in tools
        assert len(tools) == 2
        
        # Should be a copy, not the original
        tools["tool3"] = lambda: None
        assert "tool3" not in mcp.tools
    
    def test_get_tool_schemas(self):
        """Test getting all tool schemas"""
        mcp = FastMCP("Test")
        
        @mcp.tool
        def schema_tool(param: str) -> str:
            return param
        
        schemas = mcp.get_tool_schemas()
        assert "schema_tool" in schemas
        assert schemas["schema_tool"]["type"] == "function"
        
        # Should be a copy, not the original
        schemas["fake_tool"] = {}
        assert "fake_tool" not in mcp.tool_schemas


class TestFunctionTool:
    """Test the function_tool decorator"""
    
    def test_function_tool_decorator(self):
        """Test the standalone function_tool decorator"""
        
        @function_tool
        def standalone_tool(value: str) -> str:
            """Standalone tool function"""
            return f"Standalone: {value}"
        
        # Check that metadata is added
        assert hasattr(standalone_tool, '_is_kortix_tool')
        assert standalone_tool._is_kortix_tool is True
        
        assert hasattr(standalone_tool, '_tool_schema')
        schema = standalone_tool._tool_schema
        assert schema["type"] == "function"
        assert schema["function"]["name"] == "standalone_tool"
        assert schema["function"]["description"] == "Standalone tool function"
    
    def test_function_tool_preserves_function(self):
        """Test that function_tool preserves the original function"""
        
        @function_tool
        def preserved_function(input_val: str) -> str:
            return f"Preserved: {input_val}"
        
        result = preserved_function("test")
        assert result == "Preserved: test"


class TestToolIntegration:
    """Test integration between different tool types"""
    
    @pytest.mark.asyncio
    async def test_multiple_tools_in_same_mcp(self):
        """Test multiple tools in the same FastMCP instance"""
        mcp = FastMCP("Multi-Tool")
        
        @mcp.tool
        def tool_a(x: str) -> str:
            return f"A: {x}"
        
        @mcp.tool
        async def tool_b(y: int) -> str:
            await asyncio.sleep(0.01)
            return f"B: {y}"
        
        result_a = await mcp.execute_tool("tool_a", {"x": "test"})
        result_b = await mcp.execute_tool("tool_b", {"y": 42})
        
        assert result_a == "A: test"
        assert result_b == "B: 42"
        assert len(mcp.get_tools()) == 2 