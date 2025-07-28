"""
Integration tests for the Kortix SDK using the mock API service
"""

import pytest
import asyncio

from kortix.agent import Agent
from kortix.tools.fastmcp import FastMCP
from kortix.exceptions import AgentError, ToolExecutionError


class TestSDKIntegration:
    """Integration tests for the complete SDK"""
    
    @pytest.mark.asyncio
    async def test_simple_agent_without_tools(self, mock_api):
        """Test basic agent creation and simple interaction"""
        agent = Agent(
            name="Simple Agent",
            instructions="Be helpful",
            model="anthropic/claude-sonnet-4-20250514"
        )
        
        # Test agent creation
        assert agent.name == "Simple Agent"
        assert len(agent.mcp_instances) == 0
    
    @pytest.mark.asyncio
    async def test_agent_with_tools_creation(self, mock_api, sample_tools):
        """Test agent creation with tools"""
        agent = Agent(
            name="Tool Agent",
            instructions="Use tools to help users",
            model="anthropic/claude-sonnet-4-20250514",
            tools=[sample_tools]
        )
        
        # Test that agent was created with tools
        assert agent.name == "Tool Agent"
        assert len(agent.mcp_instances) == 1
        assert len(agent.tool_executor.tool_registry) == 3  # get_weather, async_tool, calculate
    
    @pytest.mark.asyncio
    async def test_agent_execution_simple_response(self, mock_api):
        """Test agent execution with simple response (no tools)"""
        agent = Agent(
            name="Chat Agent",
            instructions="Just chat, don't use tools",
            model="gpt-4"
        )
        
        # This should work since mock API will return simple response
        response = await agent.run("Hello, how are you?")
        
        assert response is not None
        assert response.content
        assert response.thread_id
        assert "Hello" in response.content or "how are you" in response.content
    
    @pytest.mark.asyncio
    async def test_agent_execution_with_weather_tool(self, mock_api, sample_tools):
        """Test agent execution that triggers weather tool"""
        agent = Agent(
            name="Weather Agent",
            instructions="Help with weather information",
            model="gpt-4",
            tools=[sample_tools]
        )
        
        # Mock API will trigger weather tool for this query
        response = await agent.run("What's the weather like?")
        
        assert response is not None
        assert response.content
        assert response.thread_id
        # The response should contain tool execution results
        assert len(response.messages) > 2  # At least user message, assistant message, tool message
    
    @pytest.mark.asyncio
    async def test_agent_execution_with_calculation_tool(self, mock_api, sample_tools):
        """Test agent execution that triggers calculation tool"""
        agent = Agent(
            name="Math Agent", 
            instructions="Help with calculations",
            model="gpt-4",
            tools=[sample_tools]
        )
        
        # Mock API will trigger calculate tool for this query
        response = await agent.run("Calculate 15 * 23")
        
        assert response is not None
        assert response.content
        # Should have triggered tool execution
        assert len(response.messages) > 2
    
    @pytest.mark.asyncio
    async def test_agent_execution_with_async_tool(self, mock_api, sample_tools):
        """Test agent execution with async tool"""
        agent = Agent(
            name="Search Agent",
            instructions="Help with searching information", 
            model="gpt-4",
            tools=[sample_tools]
        )
        
        # Mock API will trigger async_tool for search queries
        response = await agent.run("Search for latest AI developments")
        
        assert response is not None
        assert response.content
        assert len(response.messages) > 2
    
    @pytest.mark.asyncio
    async def test_agent_streaming_execution(self, mock_api, sample_tools):
        """Test streaming agent execution"""
        agent = Agent(
            name="Streaming Agent",
            instructions="Provide streaming responses",
            model="gpt-4",
            tools=[sample_tools]
        )
        
        chunks = []
        async for chunk in agent.run("What's the weather?", stream=True):
            chunks.append(chunk)
        
        assert len(chunks) > 0
        # Should contain progress indicators
        combined_output = "".join(chunks)
        assert "thread" in combined_output.lower()
    
    @pytest.mark.asyncio
    async def test_thread_continuation(self, mock_api):
        """Test continuing a conversation in the same thread"""
        agent = Agent(
            name="Memory Agent",
            instructions="Remember our conversation",
            model="gpt-4"
        )
        
        # First message
        response1 = await agent.run("My name is Alice")
        thread_id = response1.thread_id
        
        # Continue conversation in same thread
        response2 = await agent.run("What's my name?", thread_id=thread_id)
        
        assert response2.thread_id == thread_id
        assert response2.content
    
    @pytest.mark.asyncio
    async def test_multiple_tools_same_conversation(self, mock_api, sample_tools):
        """Test using multiple tools in the same conversation"""
        agent = Agent(
            name="Multi-Tool Agent",
            instructions="Use appropriate tools as needed",
            model="gpt-4", 
            tools=[sample_tools]
        )
        
        # This query should trigger weather tool based on mock API logic
        response1 = await agent.run("What's the weather in Tokyo?")
        thread_id = response1.thread_id
        
        # This query should trigger calculation tool
        response2 = await agent.run("Calculate 10 + 15", thread_id=thread_id)
        
        assert response2.thread_id == thread_id
        assert len(response2.messages) > 4  # Multiple tool executions
    
    @pytest.mark.asyncio
    async def test_tool_execution_error_handling(self, mock_api):
        """Test handling of tool execution errors"""
        # Create a tool that always fails
        error_mcp = FastMCP("Error Tools")
        
        @error_mcp.tool
        def failing_tool(param: str) -> str:
            raise ValueError("This tool always fails")
        
        agent = Agent(
            name="Error Agent",
            instructions="Use tools even if they fail",
            model="gpt-4",
            tools=[error_mcp]
        )
        
        # Force tool execution by adding test data to mock API
        mock_api.add_test_data("test-thread", [
            {
                "message_id": "msg-1", 
                "type": "user",
                "content": "Test failing tool",
                "created_at": "2024-01-01T12:00:00Z",
                "metadata": {}
            },
            {
                "message_id": "msg-2",
                "type": "assistant", 
                "content": '''<function_calls>
<invoke name="failing_tool">
<parameter name="param">test</parameter>
</invoke>
</function_calls>''',
                "created_at": "2024-01-01T12:01:00Z",
                "metadata": {}
            }
        ])
        
        # The agent should handle tool errors gracefully
        response = await agent.run("Test", thread_id="test-thread")
        assert response is not None
    
    @pytest.mark.asyncio
    async def test_max_iterations_limit(self, mock_api):
        """Test that agent respects max iterations limit"""
        # Create a mock that always returns function calls to create infinite loop
        mock_api.add_test_data("loop-thread", [])
        
        agent = Agent(
            name="Loop Agent",
            instructions="Keep using tools",
            model="gpt-4",
            tools=[]
        )
        
        # Test with low max iterations
        with pytest.raises(AgentError, match="exceeded maximum iterations"):
            await agent.run("Start loop", thread_id="loop-thread", max_iterations=1)


class TestSDKComplexScenarios:
    """Test complex integration scenarios"""
    
    @pytest.mark.asyncio
    async def test_multiple_agents_different_tools(self, mock_api):
        """Test multiple agents with different tool sets"""
        weather_mcp = FastMCP("Weather")
        math_mcp = FastMCP("Math")
        
        @weather_mcp.tool
        def get_forecast(city: str) -> str:
            return f"Forecast for {city}: Sunny"
        
        @math_mcp.tool
        def advanced_calc(formula: str) -> str:
            return f"Result of {formula}: 42"
        
        weather_agent = Agent(
            name="Weather Specialist",
            instructions="Only help with weather",
            model="gpt-4",
            tools=[weather_mcp]
        )
        
        math_agent = Agent(
            name="Math Specialist",
            instructions="Only help with math",
            model="gpt-4", 
            tools=[math_mcp]
        )
        
        # Test that each agent has access to only their tools
        assert len(weather_agent.tool_executor.tool_registry) == 1
        assert "get_forecast" in weather_agent.tool_executor.tool_registry
        
        assert len(math_agent.tool_executor.tool_registry) == 1
        assert "advanced_calc" in math_agent.tool_executor.tool_registry
    
    @pytest.mark.asyncio
    async def test_agent_with_mixed_tool_types(self, mock_api):
        """Test agent with both FastMCP instances and standalone functions"""
        from kortix.tools.fastmcp import function_tool
        
        mcp = FastMCP("MCP Tools")
        
        @mcp.tool
        def mcp_tool(data: str) -> str:
            return f"MCP: {data}"
        
        @function_tool
        def standalone_tool(value: str) -> str:
            return f"Standalone: {value}"
        
        agent = Agent(
            name="Mixed Agent",
            instructions="Use all available tools",
            model="gpt-4",
            tools=[mcp, standalone_tool]
        )
        
        # Should have both tool types registered
        assert len(agent.mcp_instances) == 2  # MCP instance + default for standalone
        total_tools = sum(len(mcp_inst.get_tools()) for mcp_inst in agent.mcp_instances)
        assert total_tools == 2
    
    @pytest.mark.asyncio
    async def test_concurrent_agent_execution(self, mock_api):
        """Test concurrent execution of multiple agents"""
        agent1 = Agent(
            name="Agent 1",
            instructions="Be helpful",
            model="gpt-4"
        )
        
        agent2 = Agent(
            name="Agent 2", 
            instructions="Be helpful",
            model="gpt-4"
        )
        
        # Run both agents concurrently
        results = await asyncio.gather(
            agent1.run("Hello from agent 1"),
            agent2.run("Hello from agent 2")
        )
        
        assert len(results) == 2
        assert all(result.content for result in results)
        assert results[0].thread_id != results[1].thread_id  # Different threads 