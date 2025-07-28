"""
Simple Agent Example for AgentPress

This example demonstrates how to create a basic agent with a custom tool
using the ThreadManager and AgentPress tool system.
"""

import asyncio
from typing import Dict, Any, Optional, List
from agentpress.thread_manager import ThreadManager
from agentpress.tool import Tool, ToolResult, openapi_schema
from utils.logger import logger

class CalculatorTool(Tool):
    """A simple calculator tool for basic mathematical operations."""

    def __init__(self):
        super().__init__()
        logger.info("Initialized CalculatorTool")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "calculate",
            "description": "Perform basic mathematical calculations (addition, subtraction, multiplication, division)",
            "parameters": {
                "type": "object",
                "properties": {
                    "operation": {
                        "type": "string",
                        "enum": ["add", "subtract", "multiply", "divide"],
                        "description": "The mathematical operation to perform"
                    },
                    "a": {
                        "type": "number",
                        "description": "First number for the calculation"
                    },
                    "b": {
                        "type": "number",
                        "description": "Second number for the calculation"
                    }
                },
                "required": ["operation", "a", "b"]
            }
        }
    })
    async def calculate(self, operation: str, a: float, b: float) -> ToolResult:
        """Perform a mathematical calculation.
        
        Args:
            operation: The operation to perform (add, subtract, multiply, divide)
            a: First number
            b: Second number
            
        Returns:
            ToolResult with the calculation result
        """
        try:
            logger.info(f"Performing calculation: {a} {operation} {b}")
            
            if operation == "add":
                result = a + b
            elif operation == "subtract":
                result = a - b
            elif operation == "multiply":
                result = a * b
            elif operation == "divide":
                if b == 0:
                    return self.fail_response("Cannot divide by zero")
                result = a / b
            else:
                return self.fail_response(f"Unknown operation: {operation}")
            
            response_data = {
                "operation": operation,
                "a": a,
                "b": b,
                "result": result,
                "message": f"{a} {operation} {b} = {result}"
            }
            
            logger.info(f"Calculation result: {result}")
            return self.success_response(response_data)
            
        except Exception as e:
            logger.error(f"Error in calculation: {str(e)}", exc_info=True)
            return self.fail_response(f"Calculation failed: {str(e)}")



class SimpleAgent:
    """A simple agent that can perform mathematical calculations."""
    
    def __init__(self):
        """Initialize the agent with ThreadManager and calculator tool."""
        self.thread_manager = ThreadManager()
        
        # Add the calculator tool to the thread manager
        self.thread_manager.add_tool(CalculatorTool)
        
        # System prompt for the agent
        self.system_prompt = {
            "role": "system",
            "content": """You are a helpful mathematical assistant agent. You can:

1. Perform basic mathematical calculations (addition, subtraction, multiplication, division)
2. Provide help information about available operations
3. Explain mathematical concepts in simple terms

When a user asks for calculations, use the calculator tool to ensure accuracy. 
Always be friendly and explain your reasoning when solving problems.

Available tools:
- calculate: Perform mathematical operations

"""
        }
        
        logger.info("Initialized SimpleAgent with CalculatorTool")

    async def create_thread(self) -> str:
        """Create a new conversation thread.
        
        Returns:
            The thread ID for the new conversation
        """
        # Use ThreadManager's create_thread method to properly create the thread in the database
        # For the example, we'll create a public orphaned thread (no account_id or project_id)
        thread_id = await self.thread_manager.create_thread(
            is_public=True,  # Make it public so we don't need authentication for the example
            metadata={"agent_type": "simple_calculator", "created_by": "example_agent"}
        )
        logger.info(f"Created new thread: {thread_id}")
        return thread_id

    async def chat(self, thread_id: str, user_message: str, stream: bool = True) -> Any:
        """Send a message to the agent and get a response.
        
        Args:
            thread_id: The conversation thread ID
            user_message: The user's message
            stream: Whether to stream the response
            
        Returns:
            Agent response (streaming generator or dict)
        """
        logger.info(f"Processing message in thread {thread_id}: {user_message[:100]}...")
        
        # Add user message to thread in proper LLM format
        user_message_formatted = {
            "role": "user",
            "content": user_message
        }
        
        await self.thread_manager.add_message(
            thread_id=thread_id,
            type="user",
            content=user_message_formatted,
            is_llm_message=True
        )
        
        # Create temporary message for this interaction
        temp_message = {
            "role": "user", 
            "content": user_message
        }
        
        # Run the thread with the agent's system prompt
        # Create processor config with XML tool calling enabled
        from agentpress.response_processor import ProcessorConfig
        
        processor_config = ProcessorConfig(
            xml_tool_calling=True,
            native_tool_calling=False,
            execute_tools=True,
            execute_on_stream=False,
            tool_execution_strategy="sequential",
            xml_adding_strategy="user_message",
            max_xml_tool_calls=0  # No limit
        )
        
        return await self.thread_manager.run_thread(
            thread_id=thread_id,
            system_prompt=self.system_prompt,
            temporary_message=temp_message,
            stream=stream,
            llm_model="gpt-4o",  # Using a cost-effective model for the example
            llm_temperature=0.1,
            processor_config=processor_config,
            include_xml_examples=True  # Include XML examples for tool usage
        )

    async def get_conversation_history(self, thread_id: str) -> List[Dict[str, Any]]:
        """Get the full conversation history for a thread.
        
        Args:
            thread_id: The conversation thread ID
            
        Returns:
            List of messages in the conversation
        """
        return await self.thread_manager.get_llm_messages(thread_id)

    def render_conversation(self, messages: List[Dict[str, Any]]) -> None:
        """Render a conversation history in a readable format.
        
        Args:
            messages: List of message objects from get_llm_messages
        """
        print("\n" + "="*60)
        print("📜 CONVERSATION HISTORY")
        print("="*60)
        
        for i, message in enumerate(messages, 1):
            role = message.get('role', 'unknown')
            content = message.get('content', '')
            
            # Format role display
            if role == 'user':
                role_display = "👤 USER"
                color = '\033[94m'  # Blue
            elif role == 'assistant':
                role_display = "🤖 ASSISTANT"
                color = '\033[92m'  # Green
            elif role == 'system':
                role_display = "⚙️  SYSTEM"
                color = '\033[93m'  # Yellow
            else:
                role_display = f"📝 {role.upper()}"
                color = '\033[96m'  # Cyan
            
            reset = '\033[0m'
            
            print(f"\n{color}{role_display} (Message {i}){reset}")
            print("-" * 40)
            
            # Handle different content types
            if isinstance(content, str):
                print(content)
            elif isinstance(content, list):
                for item in content:
                    if isinstance(item, dict):
                        if item.get('type') == 'text':
                            print(item.get('text', ''))
                        elif item.get('type') == 'tool_use':
                            tool_name = item.get('name', 'unknown_tool')
                            tool_input = item.get('input', {})
                            print(f"🔧 Tool Call: {tool_name}")
                            print(f"   Input: {tool_input}")
                        else:
                            print(f"   {item}")
                    else:
                        print(f"   {item}")
            elif isinstance(content, dict):
                # Handle tool calls or other structured content
                if 'tool_calls' in content:
                    for tool_call in content['tool_calls']:
                        function = tool_call.get('function', {})
                        print(f"🔧 Tool Call: {function.get('name', 'unknown')}")
                        print(f"   Arguments: {function.get('arguments', {})}")
                else:
                    print(content)
            else:
                print(f"[{type(content).__name__}]: {content}")
        
        print("\n" + "="*60)


# Example usage and testing
async def example_usage():
    """Demonstrate how to use the SimpleAgent."""
    print("🤖 Starting SimpleAgent Example")
    
    # Create agent instance
    agent = SimpleAgent()
    
    # Create a new conversation thread
    thread_id = await agent.create_thread()
    print(f"📝 Created thread: {thread_id}")
    
    # Example conversations
    test_messages = [
        "Hello! Can you help me with some math?",
        "What's 15 + 27?",
        "Can you multiply 8.5 by 4?",
        "What's 100 divided by 7? Please round to 2 decimal places in your explanation.",
        "Can you divide 144 by 12?"
    ]
    
    for i, message in enumerate(test_messages, 1):
        print(f"\n--- Test {i} ---")
        print(f"👤 User: {message}")
        print("🤖 Agent: ", end="", flush=True)
        
        try:
            # Get streaming response
            response_stream = await agent.chat(thread_id, message, stream=True)
            
            # Process streaming response
            full_response = ""
            async for chunk in response_stream:
                # Handle case where chunk might be a string instead of dict
                if not isinstance(chunk, dict):
                    continue
                    
                if chunk.get('type') == 'content':
                    content = chunk.get('content', '')
                    print(content, end='', flush=True)
                    full_response += content
            
            print()  # New line after response
            
        except Exception as e:
            print(f"\n❌ Error: {str(e)}")
    
    print(f"\n✅ Example completed! Thread ID: {thread_id}")
    
    # Display conversation history at the end
    try:
        print("\n🔍 Fetching conversation history...")
        conversation_history = await agent.get_conversation_history(thread_id)
        agent.render_conversation(conversation_history)
    except Exception as e:
        print(f"❌ Failed to fetch conversation history: {e}")


if __name__ == "__main__":
    # Run the example
    asyncio.run(example_usage())
