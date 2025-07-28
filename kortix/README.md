# Kortix Python SDK

Python SDK for the Suna AI Agent Platform. Create and run AI agents with custom tools and FastMCP compatibility.

## Installation

```bash
pip install kortix
```

## Quick Start

```python
import os
import asyncio
from kortix import Agent, ModelSettings, function_tool, global_config
from kortix.tools import FastMCP

# Configure the SDK
global_config.set_api_key(os.getenv("KORTIX_API_KEY"))
global_config.set_api_url(os.getenv("KORTIX_API_URL"))

# Create a FastMCP instance for tools
mcp = FastMCP("Demo 🚀")

@mcp.tool
def get_weather(city: str) -> str:
    """Get the weather for a city"""
    return f"The weather in {city} is sunny"

# Create an agent
agent = Agent(
    name="Haiku agent",
    instructions="Always respond in haiku form",
    model="o3-mini",
    tools=[get_weather],
)

# Run the agent
async def main():
    response = await agent.run("What's the weather like in Tokyo?")
    print(response.content)

if __name__ == "__main__":
    asyncio.run(main())
```

## Features

- **FastMCP Compatibility**: Define tools using the familiar `@mcp.tool` decorator
- **Async/Await Support**: Full async support for modern Python applications
- **Streaming Responses**: Get real-time streaming responses from agents
- **Tool Execution**: Local tool execution with automatic result handling
- **Thread Management**: Persistent conversation threads
- **Multiple Models**: Support for various AI models (Claude, GPT, etc.)

## Advanced Usage

### Streaming Responses

```python
agent = Agent(
    name="Streaming Agent",
    instructions="Be helpful and concise",
    model="anthropic/claude-sonnet-4-20250514",
    tools=[my_tools]
)

async for chunk in agent.run("Tell me about AI", stream=True):
    print(chunk, end="")
```

### Custom Tools

```python
# Method 1: Using FastMCP
mcp = FastMCP("MyTools")

@mcp.tool
async def search_web(query: str) -> str:
    """Search the web for information"""
    # Your search implementation
    return f"Results for: {query}"

# Method 2: Standalone function
@function_tool
def calculate(expression: str) -> str:
    """Calculate a mathematical expression"""
    try:
        result = eval(expression)  # Use safely in production
        return str(result)
    except:
        return "Invalid expression"

# Use tools with agent
agent = Agent(
    name="Helper Agent",
    instructions="Help with searches and calculations",
    model="o3-mini",
    tools=[mcp, calculate]
)
```

### Thread Continuation

```python
# First conversation
response1 = await agent.run("Hello, what's your name?")
thread_id = response1.thread_id

# Continue the conversation
response2 = await agent.run(
    "What did I just ask you?", 
    thread_id=thread_id
)
```

## Configuration

Set your API credentials:

```python
from kortix import global_config

# Option 1: Direct configuration
global_config.set_api_key("your-api-key")
global_config.set_api_url("https://api.suna.so")

# Option 2: Environment variables
# KORTIX_API_KEY=your-api-key
# KORTIX_API_URL=https://api.suna.so
```

## API Reference

### Agent

The main class for creating and running AI agents.

```python
Agent(
    name: str,                    # Agent name
    instructions: str,            # System prompt/instructions
    model: str,                   # Model name (e.g., "o3-mini")
    tools: List[Callable] = None, # List of tools or FastMCP instances
    enable_thinking: bool = False, # Enable reasoning mode
    reasoning_effort: str = 'low'  # 'low', 'medium', 'high'
)
```

### Methods

- `await agent.run(message, thread_id=None, stream=False)` - Run the agent
- `agent.current_thread_id` - Get current thread ID
- `agent.current_run_id` - Get current run ID

### FastMCP

Compatible tool definition interface.

```python
mcp = FastMCP("ToolSet")

@mcp.tool
def my_tool(param: str) -> str:
    return f"Result: {param}"
```

## Error Handling

```python
from kortix.exceptions import AgentError, AuthenticationError, ToolExecutionError

try:
    response = await agent.run("Hello")
except AuthenticationError:
    print("Invalid API key")
except AgentError as e:
    print(f"Agent error: {e}")
except ToolExecutionError as e:
    print(f"Tool failed: {e}")
```

## Requirements

- Python 3.8+
- httpx
- asyncio support

## License

MIT License 