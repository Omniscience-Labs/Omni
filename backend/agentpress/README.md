# AgentPress Framework

![Python](https://img.shields.io/badge/python-3.11+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Status](https://img.shields.io/badge/status-stable-brightgreen.svg)

AgentPress is a powerful, modular Python framework for building sophisticated AI agents with advanced tool execution capabilities, conversation management, and multi-modal interactions. It provides a robust foundation for creating AI applications that can interact with various services, execute tools, and maintain complex conversation threads.

## 🚀 Key Features

- **🛠️ Advanced Tool System**: Create custom tools with OpenAPI schemas and XML-based execution
- **💬 Conversation Management**: Full thread management with context summarization and token tracking
- **🔄 Streaming Support**: Real-time response streaming with tool execution
- **🎯 Multi-Modal**: Support for text, images, and structured data
- **📊 Observability**: Built-in tracing and logging with Langfuse integration
- **⚡ Async/Await**: Fully asynchronous architecture for optimal performance
- **🔌 Extensible**: Plugin-based architecture for easy customization

## 📦 Installation

```bash
pip install agentpress
```

Or install from source:

```bash
git clone https://github.com/your-org/agentpress.git
cd agentpress/backend
pip install -e .
```

## 🏗️ Core Architecture

AgentPress is built around several key components:

### 1. Tool System (`agentpress.tool`)

The foundation of AgentPress is its powerful tool system that allows you to create custom tools with proper schema definitions:

```python
from agentpress.tool import Tool, ToolResult, openapi_schema

class CalculatorTool(Tool):
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "calculate",
            "description": "Perform basic mathematical calculations",
            "parameters": {
                "type": "object",
                "properties": {
                    "operation": {
                        "type": "string",
                        "enum": ["add", "subtract", "multiply", "divide"],
                        "description": "The mathematical operation to perform"
                    },
                    "a": {"type": "number", "description": "First number"},
                    "b": {"type": "number", "description": "Second number"}
                },
                "required": ["operation", "a", "b"]
            }
        }
    })
    async def calculate(self, operation: str, a: float, b: float) -> ToolResult:
        if operation == "add":
            result = a + b
        elif operation == "divide":
            if b == 0:
                return self.fail_response("Cannot divide by zero")
            result = a / b
        # ... other operations
        
        return self.success_response({"result": result})
```

### 2. Thread Management (`agentpress.thread_manager`)

The `ThreadManager` handles conversation flows, tool execution, and LLM interactions:

```python
from agentpress.thread_manager import ThreadManager
from agentpress.response_processor import ProcessorConfig

# Initialize thread manager
thread_manager = ThreadManager()

# Add tools
thread_manager.add_tool(CalculatorTool)

# Create conversation thread
thread_id = await thread_manager.create_thread()

# Add user message
await thread_manager.add_message(
    thread_id=thread_id,
    type="user",
    content={"role": "user", "content": "What's 15 + 27?"},
    is_llm_message=True
)

# Run conversation with tool execution
response_stream = await thread_manager.run_thread(
    thread_id=thread_id,
    system_prompt={"role": "system", "content": "You are a helpful assistant."},
    stream=True,
    llm_model="gpt-4o",
    processor_config=ProcessorConfig(
        xml_tool_calling=True,
        execute_tools=True,
        tool_execution_strategy="sequential"
    )
)

# Process streaming response
async for chunk in response_stream:
    if isinstance(chunk, dict) and chunk.get('type') == 'content':
        print(chunk.get('content', ''), end='', flush=True)
```

### 3. Tool Registry (`agentpress.tool_registry`)

Manages and organizes available tools:

```python
from agentpress.tool_registry import ToolRegistry

registry = ToolRegistry()
registry.register_tool(CalculatorTool)

# Get OpenAPI schemas for LLM function calling
schemas = registry.get_openapi_schemas()
```

### 4. Response Processing (`agentpress.response_processor`)

Handles LLM response parsing, tool call detection, and execution:

- **XML Tool Calling**: Supports Cursor-style XML tool syntax
- **Native Function Calling**: OpenAI-style function calling
- **Streaming**: Real-time response processing
- **Tool Execution**: Automatic tool execution with result handling

### 5. Context Management (`agentpress.context_manager`)

Manages conversation context and token limits:

- **Token Counting**: Tracks conversation length
- **Automatic Summarization**: Prevents context overflow
- **Message Optimization**: Removes redundant tool results

## 🎯 Quick Start Example

Here's a complete example showing how to create a simple agent:

```python
import asyncio
from agentpress.thread_manager import ThreadManager
from agentpress.tool import Tool, ToolResult, openapi_schema
from agentpress.response_processor import ProcessorConfig

class WeatherTool(Tool):
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get current weather for a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "City name or location"
                    }
                },
                "required": ["location"]
            }
        }
    })
    async def get_weather(self, location: str) -> ToolResult:
        # Simulate weather API call
        weather_data = {
            "location": location,
            "temperature": "22°C",
            "condition": "Sunny",
            "humidity": "65%"
        }
        return self.success_response(weather_data)

async def main():
    # Setup agent
    thread_manager = ThreadManager()
    thread_manager.add_tool(WeatherTool)
    
    # Create conversation
    thread_id = await thread_manager.create_thread()
    
    # Add user message
    await thread_manager.add_message(
        thread_id=thread_id,
        type="user",
        content={"role": "user", "content": "What's the weather like in Paris?"},
        is_llm_message=True
    )
    
    # Run agent
    system_prompt = {
        "role": "system",
        "content": "You are a helpful weather assistant. Use the weather tool to get current conditions."
    }
    
    response_stream = await thread_manager.run_thread(
        thread_id=thread_id,
        system_prompt=system_prompt,
        stream=True,
        llm_model="gpt-4o",
        processor_config=ProcessorConfig(
            xml_tool_calling=True,
            execute_tools=True
        )
    )
    
    # Print response
    async for chunk in response_stream:
        if isinstance(chunk, dict) and chunk.get('type') == 'content':
            print(chunk.get('content', ''), end='', flush=True)
    print()

if __name__ == "__main__":
    asyncio.run(main())
```

## 🔧 Advanced Features

### Multi-Modal Support

AgentPress supports various content types including images:

```python
# Add message with image
await thread_manager.add_message(
    thread_id=thread_id,
    type="user",
    content={
        "role": "user",
        "content": [
            {"type": "text", "text": "What's in this image?"},
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
        ]
    },
    is_llm_message=True
)
```

### Tool Execution Strategies

Configure how tools are executed:

```python
# Sequential execution (one tool at a time)
processor_config = ProcessorConfig(
    tool_execution_strategy="sequential",
    execute_tools=True
)

# Parallel execution (all tools simultaneously)
processor_config = ProcessorConfig(
    tool_execution_strategy="parallel",
    execute_tools=True
)
```

### XML Tool Calling

AgentPress supports Cursor-style XML tool syntax:

```xml
<function_calls>
<invoke name="calculate">
<parameter name="operation">add</parameter>
<parameter name="a">15</parameter>
<parameter name="b">27</parameter>
</invoke>
</function_calls>
```

### Context Summarization

Automatic context management prevents token overflow:

```python
from agentpress.context_manager import ContextManager

context_manager = ContextManager(token_threshold=120000)

# Automatically summarizes long conversations
summary_needed = await context_manager.check_summarization_needed(thread_id, messages)
if summary_needed:
    await context_manager.summarize_thread(thread_id, messages)
```

### Observability & Tracing

Built-in support for monitoring and debugging:

```python
from langfuse.client import StatefulTraceClient

# Initialize with tracing
trace = langfuse.trace(name="my_agent_session")
thread_manager = ThreadManager(trace=trace)

# All tool executions and LLM calls are automatically traced
```

## 🛠️ Tool Development

### Creating Custom Tools

Tools are the core building blocks of AgentPress agents. Here's how to create sophisticated tools:

```python
from agentpress.tool import Tool, ToolResult, openapi_schema, usage_example
import aiohttp

class APITool(Tool):
    def __init__(self, api_key: str):
        super().__init__()
        self.api_key = api_key
    
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "fetch_data",
            "description": "Fetch data from external API",
            "parameters": {
                "type": "object",
                "properties": {
                    "endpoint": {"type": "string", "description": "API endpoint"},
                    "params": {"type": "object", "description": "Query parameters"}
                },
                "required": ["endpoint"]
            }
        }
    })
    @usage_example("""
    <function_calls>
    <invoke name="fetch_data">
    <parameter name="endpoint">users</parameter>
    <parameter name="params">{"limit": 10}</parameter>
    </invoke>
    </function_calls>
    """)
    async def fetch_data(self, endpoint: str, params: dict = None) -> ToolResult:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"https://api.example.com/{endpoint}",
                    params=params,
                    headers={"Authorization": f"Bearer {self.api_key}"}
                ) as response:
                    data = await response.json()
                    return self.success_response(data)
        except Exception as e:
            return self.fail_response(f"API request failed: {str(e)}")

# Register with custom parameters
thread_manager.add_tool(APITool, api_key="your-api-key")
```

### Tool Result Formatting

Tools can return rich, structured results:

```python
async def complex_tool(self, data: dict) -> ToolResult:
    result = {
        "summary": "Operation completed successfully",
        "details": {
            "processed_items": 42,
            "duration": "1.2s",
            "status": "success"
        },
        "next_steps": [
            "Review the results",
            "Run validation checks"
        ]
    }
    
    return self.success_response(
        result=result,
        message="Complex operation completed",
        metadata={
            "execution_time": 1.2,
            "tool_version": "1.0.0"
        }
    )
```

## 📊 Configuration Options

### ProcessorConfig

Fine-tune response processing behavior:

```python
from agentpress.response_processor import ProcessorConfig

config = ProcessorConfig(
    # Tool calling methods
    xml_tool_calling=True,                    # Enable XML tool syntax
    native_tool_calling=True,                 # Enable OpenAI function calling
    
    # Execution control
    execute_tools=True,                       # Auto-execute tool calls
    execute_on_stream=False,                  # Execute after streaming completes
    tool_execution_strategy="sequential",     # "sequential" or "parallel"
    
    # Result handling
    xml_adding_strategy="assistant_message",  # How to add XML results
    add_tool_results_to_thread=True,         # Store results in conversation
    
    # Output control
    yield_intermediate_steps=True,            # Stream intermediate outputs
    verbose_tool_calls=False,                 # Detailed tool call info
    
    # Error handling
    continue_on_tool_error=True,              # Continue after tool failures
    max_tool_iterations=5                     # Limit recursive tool calls
)
```

### ThreadManager Options

Customize conversation management:

```python
thread_manager = ThreadManager(
    trace=langfuse_trace,           # Optional tracing client
    is_agent_builder=False,         # Agent builder mode
    target_agent_id=None,           # Target agent for building
    agent_config=None               # Agent configuration
)
```

## 🔌 Integration Examples

### Web Framework Integration (FastAPI)

```python
from fastapi import FastAPI, WebSocket
from agentpress.thread_manager import ThreadManager

app = FastAPI()
thread_manager = ThreadManager()

@app.websocket("/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    thread_id = await thread_manager.create_thread()
    
    while True:
        # Receive user message
        message = await websocket.receive_text()
        
        await thread_manager.add_message(
            thread_id=thread_id,
            type="user",
            content={"role": "user", "content": message},
            is_llm_message=True
        )
        
        # Stream response back
        response_stream = await thread_manager.run_thread(
            thread_id=thread_id,
            system_prompt={"role": "system", "content": "You are helpful."},
            stream=True,
            llm_model="gpt-4o"
        )
        
        async for chunk in response_stream:
            if chunk.get('type') == 'content':
                await websocket.send_text(chunk.get('content', ''))
```

### Database Integration

AgentPress includes database persistence for conversations:

```python
# Messages are automatically persisted
messages = await thread_manager.get_llm_messages(thread_id)

# Retrieve conversation history
for message in messages:
    print(f"{message['role']}: {message['content']}")
```

## 🧪 Testing

Create tests for your agents and tools:

```python
import pytest
from agentpress.thread_manager import ThreadManager
from agentpress.tool import ToolResult

@pytest.mark.asyncio
async def test_calculator_tool():
    thread_manager = ThreadManager()
    thread_manager.add_tool(CalculatorTool)
    
    thread_id = await thread_manager.create_thread()
    
    await thread_manager.add_message(
        thread_id=thread_id,
        type="user",
        content={"role": "user", "content": "What's 2 + 2?"},
        is_llm_message=True
    )
    
    # Test tool execution
    response_stream = await thread_manager.run_thread(
        thread_id=thread_id,
        system_prompt={"role": "system", "content": "Use the calculator."},
        stream=False,
        llm_model="gpt-4o"
    )
    
    # Verify response contains calculation result
    # Add your assertions here
```

## 📚 API Reference

### Core Classes

- **`Tool`**: Base class for creating custom tools
- **`ThreadManager`**: Manages conversation threads and LLM interactions
- **`ToolRegistry`**: Registers and manages available tools
- **`ResponseProcessor`**: Processes LLM responses and executes tools
- **`ContextManager`**: Handles conversation context and summarization

### Key Methods

- **`ThreadManager.add_tool()`**: Register a tool class
- **`ThreadManager.create_thread()`**: Create new conversation thread
- **`ThreadManager.add_message()`**: Add message to thread
- **`ThreadManager.run_thread()`**: Execute conversation with LLM
- **`Tool.success_response()`**: Return successful tool result
- **`Tool.fail_response()`**: Return failed tool result

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Documentation](https://docs.agentpress.dev)
- [Examples](./examples/)
- [GitHub Issues](https://github.com/your-org/agentpress/issues)
- [Discord Community](https://discord.gg/agentpress)

## 🆘 Support

- 📖 Check the [documentation](https://docs.agentpress.dev)
- 💬 Join our [Discord community](https://discord.gg/agentpress)
- 🐛 Report bugs on [GitHub Issues](https://github.com/your-org/agentpress/issues)
- 📧 Email us at support@agentpress.dev

---

Made with ❤️ by the AgentPress team