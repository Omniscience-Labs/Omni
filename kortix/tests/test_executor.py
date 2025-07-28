"""
Tests for the Kortix SDK tool executor module
"""

import pytest
import asyncio
from datetime import datetime

from kortix.tools.executor import ToolExecutor
from kortix.tools.fastmcp import FastMCP
from kortix.models import Message, ToolCall, ToolResult


class TestToolExecutor:
    """Test the ToolExecutor class"""
    
    def test_init(self, sample_tools):
        """Test ToolExecutor initialization"""
        executor = ToolExecutor([sample_tools])
        
        assert len(executor.mcp_instances) == 1
        assert sample_tools in executor.mcp_instances
        
        # Check tool registry is built correctly
        tools = sample_tools.get_tools()
        for tool_name in tools:
            assert tool_name in executor.tool_registry
            assert executor.tool_registry[tool_name] == sample_tools
    
    def test_init_multiple_mcp_instances(self):
        """Test ToolExecutor with multiple FastMCP instances"""
        mcp1 = FastMCP("Tools1")
        mcp2 = FastMCP("Tools2")
        
        @mcp1.tool
        def tool1(x: str) -> str:
            return f"Tool1: {x}"
        
        @mcp2.tool
        def tool2(y: str) -> str:
            return f"Tool2: {y}"
        
        executor = ToolExecutor([mcp1, mcp2])
        
        assert len(executor.mcp_instances) == 2
        assert "tool1" in executor.tool_registry
        assert "tool2" in executor.tool_registry
        assert executor.tool_registry["tool1"] == mcp1
        assert executor.tool_registry["tool2"] == mcp2
    
    def test_parse_function_calls_non_assistant_message(self):
        """Test that non-assistant messages return empty function calls"""
        executor = ToolExecutor([])
        
        user_message = Message(
            id="msg-1",
            role="user",
            content="Hello",
            created_at=datetime.now()
        )
        
        calls = executor.parse_function_calls(user_message)
        assert calls == []
    
    def test_parse_function_calls_no_function_calls(self):
        """Test parsing message without function calls"""
        executor = ToolExecutor([])
        
        assistant_message = Message(
            id="msg-1",
            role="assistant",
            content="Hello! How can I help you?",
            created_at=datetime.now()
        )
        
        calls = executor.parse_function_calls(assistant_message)
        assert calls == []
    
    def test_parse_function_calls_xml_format(self):
        """Test parsing function calls in XML format"""
        executor = ToolExecutor([])
        
        content = '''I'll help you with that.

<function_calls>
<invoke name="get_weather">
<parameter name="city">Tokyo</parameter>
</invoke>
</function_calls>

Let me check the weather for you.'''
        
        message = Message(
            id="msg-1",
            role="assistant",
            content=content,
            created_at=datetime.now()
        )
        
        calls = executor.parse_function_calls(message)
        
        assert len(calls) == 1
        assert calls[0].name == "get_weather"
        assert calls[0].arguments == {"city": "Tokyo"}
        assert calls[0].id.startswith("call_")
    
    def test_parse_function_calls_multiple_calls(self):
        """Test parsing multiple function calls"""
        executor = ToolExecutor([])
        
        content = '''I'll help with both tasks.

<function_calls>
<invoke name="get_weather">
<parameter name="city">Tokyo</parameter>
</invoke>
<invoke name="calculate">
<parameter name="expression">15 * 23</parameter>
</invoke>
</function_calls>'''
        
        message = Message(
            id="msg-1",
            role="assistant",
            content=content,
            created_at=datetime.now()
        )
        
        calls = executor.parse_function_calls(message)
        
        assert len(calls) == 2
        assert calls[0].name == "get_weather"
        assert calls[0].arguments == {"city": "Tokyo"}
        assert calls[1].name == "calculate"
        assert calls[1].arguments == {"expression": "15 * 23"}
    
    def test_parse_function_calls_json_parameter(self):
        """Test parsing function calls with JSON parameters"""
        executor = ToolExecutor([])
        
        content = '''<function_calls>
<invoke name="complex_tool">
<parameter name="data">{"key": "value", "numbers": [1, 2, 3]}</parameter>
<parameter name="simple">text</parameter>
</invoke>
</function_calls>'''
        
        message = Message(
            id="msg-1",
            role="assistant",
            content=content,
            created_at=datetime.now()
        )
        
        calls = executor.parse_function_calls(message)
        
        assert len(calls) == 1
        assert calls[0].arguments["data"] == {"key": "value", "numbers": [1, 2, 3]}
        assert calls[0].arguments["simple"] == "text"
    
    def test_parse_function_calls_list_content(self):
        """Test parsing function calls from list content format"""
        executor = ToolExecutor([])
        
        content = [
            {"type": "text", "text": "I'll help you."},
            {
                "type": "tool_use",
                "id": "call_123",
                "name": "get_weather",
                "input": {"city": "Paris"}
            }
        ]
        
        message = Message(
            id="msg-1",
            role="assistant",
            content=content,
            created_at=datetime.now()
        )
        
        calls = executor.parse_function_calls(message)
        
        assert len(calls) == 1
        assert calls[0].id == "call_123"
        assert calls[0].name == "get_weather"
        assert calls[0].arguments == {"city": "Paris"}
    
    @pytest.mark.asyncio
    async def test_execute_tool_call_success(self, sample_tools):
        """Test successful tool call execution"""
        executor = ToolExecutor([sample_tools])
        
        tool_call = ToolCall(
            id="call_1",
            name="get_weather",
            arguments={"city": "Paris"}
        )
        
        result = await executor.execute_tool_call(tool_call)
        
        assert result.tool_call_id == "call_1"
        assert result.content == "The weather in Paris is sunny"
        assert not result.is_error
    
    @pytest.mark.asyncio
    async def test_execute_tool_call_async_tool(self, sample_tools):
        """Test executing async tool"""
        executor = ToolExecutor([sample_tools])
        
        tool_call = ToolCall(
            id="call_2",
            name="async_tool",
            arguments={"query": "test"}
        )
        
        result = await executor.execute_tool_call(tool_call)
        
        assert result.tool_call_id == "call_2"
        assert result.content == "Async result for: test"
        assert not result.is_error
    
    @pytest.mark.asyncio
    async def test_execute_tool_call_not_found(self, sample_tools):
        """Test executing non-existent tool"""
        executor = ToolExecutor([sample_tools])
        
        tool_call = ToolCall(
            id="call_3",
            name="nonexistent_tool",
            arguments={}
        )
        
        result = await executor.execute_tool_call(tool_call)
        
        assert result.tool_call_id == "call_3"
        assert "not found" in result.content
        assert result.is_error is True
    
    @pytest.mark.asyncio
    async def test_execute_tool_call_with_error(self):
        """Test tool execution with error"""
        mcp = FastMCP("Error Test")
        
        @mcp.tool
        def error_tool(param: str) -> str:
            raise ValueError("Test error")
        
        executor = ToolExecutor([mcp])
        
        tool_call = ToolCall(
            id="call_4",
            name="error_tool",
            arguments={"param": "test"}
        )
        
        result = await executor.execute_tool_call(tool_call)
        
        assert result.tool_call_id == "call_4"
        assert "Tool execution failed" in result.content
        assert result.is_error is True
    
    @pytest.mark.asyncio
    async def test_execute_all_tool_calls(self, sample_tools):
        """Test executing multiple tool calls"""
        executor = ToolExecutor([sample_tools])
        
        tool_calls = [
            ToolCall(id="call_1", name="get_weather", arguments={"city": "Tokyo"}),
            ToolCall(id="call_2", name="calculate", arguments={"expression": "2 + 2"})
        ]
        
        results = await executor.execute_all_tool_calls(tool_calls)
        
        assert len(results) == 2
        assert results[0].tool_call_id == "call_1"
        assert results[1].tool_call_id == "call_2"
        assert all(not result.is_error for result in results)
    
    def test_format_tool_result_message_success(self):
        """Test formatting successful tool results"""
        executor = ToolExecutor([])
        
        results = [
            ToolResult(tool_call_id="call_1", content="Weather data", is_error=False),
            ToolResult(tool_call_id="call_2", content="Calculation result", is_error=False)
        ]
        
        formatted = executor.format_tool_result_message(results)
        
        assert '<tool_result tool_call_id="call_1">' in formatted
        assert 'Weather data' in formatted
        assert '<tool_result tool_call_id="call_2">' in formatted
        assert 'Calculation result' in formatted
        assert 'error="true"' not in formatted
    
    def test_format_tool_result_message_with_errors(self):
        """Test formatting tool results with errors"""
        executor = ToolExecutor([])
        
        results = [
            ToolResult(tool_call_id="call_1", content="Success", is_error=False),
            ToolResult(tool_call_id="call_2", content="Error occurred", is_error=True)
        ]
        
        formatted = executor.format_tool_result_message(results)
        
        assert '<tool_result tool_call_id="call_1">' in formatted
        assert '<tool_result tool_call_id="call_2" error="true">' in formatted
        assert 'Success' in formatted
        assert 'Error occurred' in formatted
    
    def test_format_tool_result_message_empty(self):
        """Test formatting empty tool results"""
        executor = ToolExecutor([])
        
        formatted = executor.format_tool_result_message([])
        assert formatted == "" 