"""
Tests for the Kortix SDK Agent class
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, patch
from datetime import datetime

from kortix.agent import Agent
from kortix.tools.fastmcp import FastMCP, function_tool
from kortix.models import ModelSettings, Thread, AgentRun
from kortix.exceptions import AgentError


class TestAgent:
    """Test the Agent class"""
    
    def test_init_basic(self):
        """Test basic Agent initialization"""
        agent = Agent(
            name="Test Agent",
            instructions="Be helpful",
            model="gpt-4"
        )
        
        assert agent.name == "Test Agent"
        assert agent.instructions == "Be helpful"
        assert agent.model_settings.model_name == "gpt-4"
        assert agent.model_settings.enable_thinking is False
        assert agent.model_settings.reasoning_effort == 'low'
        assert len(agent.mcp_instances) == 0
    
    def test_init_with_model_settings(self):
        """Test Agent initialization with custom model settings"""
        agent = Agent(
            name="Advanced Agent",
            instructions="Think deeply",
            model="anthropic/claude-sonnet-4",
            enable_thinking=True,
            reasoning_effort='high'
        )
        
        assert agent.model_settings.model_name == "anthropic/claude-sonnet-4"
        assert agent.model_settings.enable_thinking is True
        assert agent.model_settings.reasoning_effort == 'high'
    
    def test_init_with_fastmcp_tools(self, sample_tools):
        """Test Agent initialization with FastMCP tools"""
        agent = Agent(
            name="Tool Agent",
            instructions="Use tools",
            model="gpt-4",
            tools=[sample_tools]
        )
        
        assert len(agent.mcp_instances) == 1
        assert sample_tools in agent.mcp_instances
        assert len(agent.tool_executor.tool_registry) == 3  # get_weather, async_tool, calculate
    
    def test_init_with_standalone_functions(self):
        """Test Agent initialization with standalone function tools"""
        @function_tool
        def standalone_func(x: str) -> str:
            return f"Standalone: {x}"
        
        agent = Agent(
            name="Function Agent",
            instructions="Use functions",
            model="gpt-4",
            tools=[standalone_func]
        )
        
        # Should create a default FastMCP instance for standalone functions
        assert len(agent.mcp_instances) == 1
        assert "standalone_func" in agent.tool_executor.tool_registry
    
    def test_init_with_mixed_tools(self, sample_tools):
        """Test Agent initialization with mixed tool types"""
        @function_tool
        def standalone_func(x: str) -> str:
            return f"Standalone: {x}"
        
        agent = Agent(
            name="Mixed Agent",
            instructions="Use all tools",
            model="gpt-4",
            tools=[sample_tools, standalone_func]
        )
        
        # Should have original FastMCP + default for standalone
        assert len(agent.mcp_instances) == 2
        assert len(agent.tool_executor.tool_registry) == 4  # 3 + 1
    
    def test_process_tools_empty(self):
        """Test processing empty tools list"""
        agent = Agent(
            name="No Tools Agent",
            instructions="No tools needed",
            model="gpt-4",
            tools=[]
        )
        
        assert len(agent.mcp_instances) == 0
        assert len(agent.tool_executor.tool_registry) == 0
    
    def test_process_tools_multiple_fastmcp(self):
        """Test processing multiple FastMCP instances"""
        mcp1 = FastMCP("Tools1")
        mcp2 = FastMCP("Tools2")
        
        @mcp1.tool
        def tool1(x: str) -> str:
            return f"Tool1: {x}"
        
        @mcp2.tool 
        def tool2(y: str) -> str:
            return f"Tool2: {y}"
        
        agent = Agent(
            name="Multi-MCP Agent",
            instructions="Use multiple MCPs",
            model="gpt-4",
            tools=[mcp1, mcp2]
        )
        
        assert len(agent.mcp_instances) == 2
        assert mcp1 in agent.mcp_instances
        assert mcp2 in agent.mcp_instances
        assert "tool1" in agent.tool_executor.tool_registry
        assert "tool2" in agent.tool_executor.tool_registry
    
    def test_current_thread_id_none(self):
        """Test current_thread_id when no thread is set"""
        agent = Agent("Test", "Test", "gpt-4")
        assert agent.current_thread_id is None
    
    def test_current_run_id_none(self):
        """Test current_run_id when no run is set"""
        agent = Agent("Test", "Test", "gpt-4")
        assert agent.current_run_id is None
    
    def test_get_all_tool_schemas(self, sample_tools):
        """Test getting all tool schemas"""
        agent = Agent(
            name="Schema Agent",
            instructions="Test schemas",
            model="gpt-4",
            tools=[sample_tools]
        )
        
        schemas = agent._get_all_tool_schemas()
        assert len(schemas) == 3  # get_weather, async_tool, calculate
        
        # Check that schemas are properly formatted
        for schema in schemas:
            assert "type" in schema
            assert schema["type"] == "function"
            assert "function" in schema
            assert "name" in schema["function"]


class TestAgentRunMethods:
    """Test Agent run methods"""
    
    @pytest.fixture
    def mock_agent(self, sample_tools):
        """Create an agent with mocked dependencies for testing"""
        agent = Agent(
            name="Mock Agent",
            instructions="Test agent",
            model="gpt-4",
            tools=[sample_tools]
        )
        return agent
    
    @pytest.mark.asyncio
    async def test_run_direct_vs_streaming(self, mock_agent):
        """Test that run method routes correctly based on stream parameter"""
        
        # Mock the methods to test routing
        with patch.object(mock_agent, '_run_direct', new_callable=AsyncMock) as mock_direct, \
             patch.object(mock_agent, '_run_streaming') as mock_streaming:
            
            # Setup mock return values
            mock_direct.return_value = "direct response"
            
            # Test direct mode
            await mock_agent.run("test", stream=False)
            mock_direct.assert_called_once_with("test", None, 10)
            mock_streaming.assert_not_called()
            
            # Reset mocks
            mock_direct.reset_mock()
            mock_streaming.reset_mock()
            
            # Test streaming mode routing
            result = mock_agent.run("test", stream=True)
            # When stream=True, the method should return the result of _run_streaming
            # The call itself doesn't invoke _run_streaming until we iterate over the result
            assert result == mock_streaming.return_value
            mock_streaming.assert_called_once_with("test", None, 10)
        
        # Test actual return type without mocking
        import types
        result = mock_agent.run("test", stream=True)
        assert isinstance(result, types.AsyncGeneratorType)
    
    @pytest.mark.asyncio
    @patch('kortix.agent.ThreadManager')
    async def test_run_direct_success(self, mock_thread_manager_class, mock_agent):
        """Test successful direct agent run"""
        # Setup mocks
        mock_thread_manager = AsyncMock()
        mock_thread_manager_class.return_value.__aenter__.return_value = mock_thread_manager
        
        # Mock thread creation
        test_thread = Thread(id="test-thread-123", created_at=datetime.now())
        mock_thread_manager.create_thread.return_value = test_thread
        
        # Mock message operations
        mock_thread_manager.add_user_message.return_value = None
        mock_thread_manager.get_messages.return_value = []
        
        # Mock the execution loop to return immediately
        with patch.object(mock_agent, '_execute_with_tool_loop') as mock_execute:
            mock_execute.return_value = "Final response"
            
            response = await mock_agent._run_direct("Test message", None, 10)
            
            assert response.content == "Final response"
            assert response.thread_id == "test-thread-123"
            mock_thread_manager.create_thread.assert_called_once()
            mock_thread_manager.add_user_message.assert_called_once_with("test-thread-123", "Test message")
    
    @pytest.mark.asyncio
    @patch('kortix.agent.ThreadManager')
    async def test_run_direct_with_existing_thread(self, mock_thread_manager_class, mock_agent):
        """Test direct run with existing thread ID"""
        mock_thread_manager = AsyncMock()
        mock_thread_manager_class.return_value.__aenter__.return_value = mock_thread_manager
        
        # Mock existing thread operations
        mock_thread_manager.add_user_message.return_value = None
        mock_thread_manager.get_messages.return_value = []
        
        with patch.object(mock_agent, '_execute_with_tool_loop') as mock_execute:
            mock_execute.return_value = "Response with existing thread"
            
            response = await mock_agent._run_direct("Test", "existing-thread", 10)
            
            assert response.thread_id == "existing-thread"
            # Should not create new thread
            mock_thread_manager.create_thread.assert_not_called()


class TestAgentExecutionLoop:
    """Test the agent execution loop logic"""
    
    @pytest.fixture
    def mock_agent_for_loop(self, sample_tools):
        """Create agent with tools for loop testing"""
        agent = Agent(
            name="Loop Agent",
            instructions="Use tools",
            model="gpt-4", 
            tools=[sample_tools]
        )
        return agent
    
    @pytest.mark.asyncio
    async def test_execute_with_tool_loop_no_function_calls(self, mock_agent_for_loop):
        """Test execution loop when agent doesn't make function calls"""
        # Mock thread manager and dependencies
        mock_thread_manager = AsyncMock()
        
        # Mock agent run
        test_run = AgentRun(
            id="run-123",
            thread_id="thread-123", 
            status="completed",
            created_at=datetime.now()
        )
        mock_thread_manager.start_agent_run.return_value = test_run
        mock_thread_manager.wait_for_agent_completion.return_value = test_run
        
        # Mock messages with no function calls
        final_message = "This is the final response"
        mock_messages = [
            type('MockMessage', (), {
                'id': 'msg-1',
                'content': final_message,
                'role': 'assistant'
            })()
        ]
        mock_thread_manager.get_assistant_messages_since.return_value = mock_messages
        
        # Mock tool executor to return no function calls
        with patch.object(mock_agent_for_loop.tool_executor, 'parse_function_calls') as mock_parse:
            mock_parse.return_value = []
            
            result = await mock_agent_for_loop._execute_with_tool_loop(
                mock_thread_manager, "thread-123", 10
            )
            
            assert result == final_message
            # Verify that start_agent_run was called with instructions and tools
            mock_thread_manager.start_agent_run.assert_called_once_with(
                thread_id="thread-123",
                instructions="Use tools",
                model="gpt-4",
                tool_schemas=mock_agent_for_loop._get_all_tool_schemas()
            )
    
    @pytest.mark.asyncio
    async def test_execute_with_tool_loop_with_function_calls(self, mock_agent_for_loop):
        """Test execution loop with function calls"""
        mock_thread_manager = AsyncMock()
        
        # Mock agent runs
        test_run = AgentRun(
            id="run-123",
            thread_id="thread-123",
            status="completed", 
            created_at=datetime.now()
        )
        mock_thread_manager.start_agent_run.return_value = test_run
        mock_thread_manager.wait_for_agent_completion.return_value = test_run
        
        # Mock two iterations: first with function calls, second without
        iteration_messages = [
            # First iteration: message with function calls
            [type('MockMessage', (), {
                'id': 'msg-1',
                'content': 'I need to check the weather.',
                'role': 'assistant'
            })()],
            # Second iteration: final message without function calls  
            [type('MockMessage', (), {
                'id': 'msg-2',
                'content': 'The weather is sunny!',
                'role': 'assistant'
            })()]
        ]
        
        call_count = 0
        def mock_get_messages(*args, **kwargs):
            nonlocal call_count
            result = iteration_messages[call_count]
            call_count += 1
            return result
            
        mock_thread_manager.get_assistant_messages_since.side_effect = mock_get_messages
        
        # Mock tool execution
        with patch.object(mock_agent_for_loop.tool_executor, 'parse_function_calls') as mock_parse, \
             patch.object(mock_agent_for_loop.tool_executor, 'execute_all_tool_calls') as mock_execute, \
             patch.object(mock_agent_for_loop.tool_executor, 'format_tool_result_message') as mock_format:
            
            # First call returns function calls, second returns none
            mock_parse.side_effect = [
                [type('MockCall', (), {'id': 'call-1', 'name': 'get_weather'})()],  # First iteration
                []  # Second iteration
            ]
            mock_execute.return_value = []
            mock_format.return_value = "Tool results"
            
            result = await mock_agent_for_loop._execute_with_tool_loop(
                mock_thread_manager, "thread-123", 10
            )
            
            assert result == "The weather is sunny!"
            assert mock_thread_manager.start_agent_run.call_count == 2  # Two iterations
            mock_thread_manager.add_tool_message.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_execute_with_tool_loop_max_iterations(self, mock_agent_for_loop):
        """Test execution loop respects max iterations"""
        mock_thread_manager = AsyncMock()
        
        test_run = AgentRun(
            id="run-123",
            thread_id="thread-123",
            status="completed",
            created_at=datetime.now()
        )
        mock_thread_manager.start_agent_run.return_value = test_run
        mock_thread_manager.wait_for_agent_completion.return_value = test_run
        
        # Always return messages with function calls to create infinite loop
        mock_message = type('MockMessage', (), {
            'id': 'msg-loop',
            'content': 'Loop message',
            'role': 'assistant'
        })()
        mock_thread_manager.get_assistant_messages_since.return_value = [mock_message]
        
        with patch.object(mock_agent_for_loop.tool_executor, 'parse_function_calls') as mock_parse, \
             patch.object(mock_agent_for_loop.tool_executor, 'execute_all_tool_calls') as mock_execute, \
             patch.object(mock_agent_for_loop.tool_executor, 'format_tool_result_message') as mock_format:
            
            # Always return function calls to create loop
            mock_parse.return_value = [type('MockCall', (), {'id': 'call-loop'})()]
            mock_execute.return_value = []
            mock_format.return_value = "Loop tool result"
            
            with pytest.raises(AgentError, match="exceeded maximum iterations"):
                await mock_agent_for_loop._execute_with_tool_loop(
                    mock_thread_manager, "thread-123", 2  # Low max iterations
                ) 