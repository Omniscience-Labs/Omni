"""
Main Agent class for Kortix SDK

Provides the primary interface for creating and running agents with tools.
"""

import asyncio
from typing import List, Optional, Dict, Any, AsyncGenerator, Union, Callable, Coroutine
from datetime import datetime

from .config import global_config
from .models import ModelSettings, AgentResponse, Message, Thread, AgentRun
from .exceptions import AgentError, ToolExecutionError
from .thread import ThreadManager
from .tools.fastmcp import FastMCP
from .tools.executor import ToolExecutor
from .client import KortixClient


class Agent:
    """
    Main Agent class for creating and running AI agents with tool capabilities
    
    Example:
        ```python
        from kortix import Agent, global_config
        from fastmcp import FastMCP
        
        global_config.set_api_key("your-api-key")
        global_config.set_api_url("https://api.suna.so")
        
        mcp = FastMCP("Demo")
        
        @mcp.tool
        def get_weather(city: str) -> str:
            return f"The weather in {city} is sunny"
        
        agent = Agent(
            name="Weather Agent",
            instructions="Help users get weather information",
            model="anthropic/claude-sonnet-4-20250514",
            tools=[get_weather]
        )
        
        response = await agent.run("What's the weather in Paris?")
        ```
    """
    
    def __init__(
        self,
        name: str,
        instructions: str,
        model: str,
        tools: Optional[List[Union[Callable, FastMCP]]] = None,
        enable_thinking: bool = False,
        reasoning_effort: str = 'low'
    ):
        self.name = name
        self.instructions = instructions
        self.model_settings = ModelSettings(
            model_name=model,
            enable_thinking=enable_thinking,
            reasoning_effort=reasoning_effort
        )
        
        # Process tools
        self.mcp_instances: List[FastMCP] = []
        self._process_tools(tools or [])
        
        # Initialize tool executor
        self.tool_executor = ToolExecutor(self.mcp_instances)
        
        # Current thread and run state
        self._current_thread: Optional[Thread] = None
        self._current_run: Optional[AgentRun] = None
    
    def _process_tools(self, tools: List[Union[Callable, FastMCP]]) -> None:
        """Process and organize tools into FastMCP instances"""
        # Check if we have any FastMCP instances directly
        for tool in tools:
            if isinstance(tool, FastMCP):
                self.mcp_instances.append(tool)
            elif callable(tool):
                # For standalone functions, create a default FastMCP instance
                if not hasattr(self, '_default_mcp'):
                    self._default_mcp = FastMCP(f"{self.name}_tools")
                    self.mcp_instances.append(self._default_mcp)
                
                # Register the function as a tool
                self._default_mcp.tool(tool)
    
    def _get_all_tool_schemas(self) -> List[Dict[str, Any]]:
        """Get all tool schemas from MCP instances"""
        schemas = []
        for mcp_instance in self.mcp_instances:
            schemas.extend(mcp_instance.get_tool_schemas().values())
        return schemas
    
    def run(
        self,
        message: str,
        thread_id: Optional[str] = None,
        stream: bool = False,
        max_iterations: int = 10
    ) -> Union[Coroutine[Any, Any, AgentResponse], AsyncGenerator[str, None]]:
        """
        Run the agent with a message
        
        Args:
            message: User message to send to the agent
            thread_id: Optional thread ID to continue a conversation
            stream: Whether to stream responses
            max_iterations: Maximum number of tool execution iterations
            
        Returns:
            Coroutine[AgentResponse] for non-streaming, AsyncGenerator for streaming
        """
        if stream:
            return self._run_streaming(message, thread_id, max_iterations)
        else:
            return self._run_direct(message, thread_id, max_iterations)
    
    async def _run_direct(
        self,
        message: str,
        thread_id: Optional[str] = None,
        max_iterations: int = 10
    ) -> AgentResponse:
        """Run the agent directly and return the final response"""
        
        async with ThreadManager() as thread_manager:
            # Create or use existing thread
            if thread_id:
                thread = Thread(id=thread_id, created_at=datetime.now())
            else:
                thread = await thread_manager.create_thread()
            
            self._current_thread = thread
            
            # Add user message
            await thread_manager.add_user_message(thread.id, message)
            
            # Get initial message count for tracking
            initial_messages = await thread_manager.get_messages(thread.id)
            last_message_id = initial_messages[-1].id if initial_messages else None
            
            # Execute agent with tool loop
            final_response = await self._execute_with_tool_loop(
                thread_manager,
                thread.id,
                max_iterations,
                last_message_id
            )
            
            # Get final messages
            final_messages = await thread_manager.get_messages(thread.id)
            
            return AgentResponse(
                content=final_response,
                messages=final_messages,
                thread_id=thread.id,
                run_id=self._current_run.id if self._current_run else None,
                status="completed"
            )
    
    async def _run_streaming(
        self,
        message: str,
        thread_id: Optional[str] = None,
        max_iterations: int = 10
    ) -> AsyncGenerator[str, None]:
        """Run the agent with streaming responses"""
        
        async with ThreadManager() as thread_manager:
            # Create or use existing thread
            if thread_id:
                thread = Thread(id=thread_id, created_at=datetime.now())
            else:
                thread = await thread_manager.create_thread()
            
            self._current_thread = thread
            
            # Add user message
            await thread_manager.add_user_message(thread.id, message)
            yield f"📝 Added user message to thread {thread.id}\n\n"
            
            # Get initial message count for tracking
            initial_messages = await thread_manager.get_messages(thread.id)
            last_message_id = initial_messages[-1].id if initial_messages else None
            
            # Execute agent with tool loop (streaming)
            async for chunk in self._execute_with_tool_loop_streaming(
                thread_manager,
                thread.id,
                max_iterations,
                last_message_id
            ):
                yield chunk
    
    async def _execute_with_tool_loop(
        self,
        thread_manager: ThreadManager,
        thread_id: str,
        max_iterations: int,
        last_message_id: Optional[str] = None
    ) -> str:
        """Execute agent with tool execution loop"""
        
        iteration = 0
        current_last_message_id = last_message_id
        final_response = ""
        
        while iteration < max_iterations:
            iteration += 1
            
            # Start agent run
            run = await thread_manager.start_agent_run(
                thread_id=thread_id,
                instructions=self.instructions,
                model=self.model_settings.model_name,
                tool_schemas=self._get_all_tool_schemas()
            )
            self._current_run = run
            
            # Wait for agent completion
            completed_run = await thread_manager.wait_for_agent_completion(run.id)
            
            if completed_run.status == "failed":
                raise AgentError(f"Agent run failed: {completed_run}")
            
            # Get new messages since last check
            new_messages = await thread_manager.get_assistant_messages_since(
                thread_id, current_last_message_id
            )
            
            if not new_messages:
                break
            
            # Check for function calls in the latest message
            latest_message = new_messages[-1]
            tool_calls = self.tool_executor.parse_function_calls(latest_message)
            
            if not tool_calls:
                # No tool calls, we're done
                if isinstance(latest_message.content, str):
                    final_response = latest_message.content
                else:
                    final_response = str(latest_message.content)
                break
            
            # Execute tools
            tool_results = await self.tool_executor.execute_all_tool_calls(tool_calls)
            
            # Format and add tool results back to thread
            tool_message_content = self.tool_executor.format_tool_result_message(tool_results)
            await thread_manager.add_tool_message(thread_id, tool_message_content)
            
            # Update last message ID
            current_last_message_id = latest_message.id
        
        if iteration >= max_iterations:
            raise AgentError(f"Agent exceeded maximum iterations ({max_iterations})")
        
        return final_response
    
    async def _execute_with_tool_loop_streaming(
        self,
        thread_manager: ThreadManager,
        thread_id: str,
        max_iterations: int,
        last_message_id: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """Execute agent with tool execution loop (streaming version)"""
        
        iteration = 0
        current_last_message_id = last_message_id
        
        while iteration < max_iterations:
            iteration += 1
            yield f"🔄 Iteration {iteration}\n\n"
            
            # Start agent run
            run = await thread_manager.start_agent_run(
                thread_id=thread_id,
                instructions=self.instructions,
                model=self.model_settings.model_name,
                tool_schemas=self._get_all_tool_schemas()
            )
            self._current_run = run
            yield f"🚀 Started agent run {run.id}\n\n"
            
            # Wait for agent completion
            completed_run = await thread_manager.wait_for_agent_completion(run.id)
            
            if completed_run.status == "failed":
                yield f"❌ Agent run failed: {completed_run}\n\n"
                break
            
            yield f"✅ Agent run completed\n\n"
            
            # Get new messages since last check
            new_messages = await thread_manager.get_assistant_messages_since(
                thread_id, current_last_message_id
            )
            
            if not new_messages:
                yield f"ℹ️ No new messages found\n\n"
                break
            
            # Check for function calls in the latest message
            latest_message = new_messages[-1]
            
            # Yield the assistant's response
            if isinstance(latest_message.content, str):
                yield f"🤖 **Assistant**: {latest_message.content}\n\n"
            
            tool_calls = self.tool_executor.parse_function_calls(latest_message)
            
            if not tool_calls:
                # No tool calls, we're done
                yield f"✨ Agent completed without tool calls\n\n"
                break
            
            yield f"🔧 Found {len(tool_calls)} tool call(s) to execute\n\n"
            
            # Execute tools
            for tool_call in tool_calls:
                yield f"⚙️ Executing {tool_call.name}...\n"
            
            tool_results = await self.tool_executor.execute_all_tool_calls(tool_calls)
            
            # Format and add tool results back to thread
            tool_message_content = self.tool_executor.format_tool_result_message(tool_results)
            await thread_manager.add_tool_message(thread_id, tool_message_content)
            
            yield f"📊 Tool results added to thread\n\n"
            
            # Update last message ID
            current_last_message_id = latest_message.id
        
        if iteration >= max_iterations:
            yield f"⚠️ Agent exceeded maximum iterations ({max_iterations})\n\n"
    
    @property
    def current_thread_id(self) -> Optional[str]:
        """Get the current thread ID"""
        return self._current_thread.id if self._current_thread else None
    
    @property
    def current_run_id(self) -> Optional[str]:
        """Get the current run ID"""
        return self._current_run.id if self._current_run else None 