"""
Pytest configuration and shared fixtures for Kortix SDK tests
"""

import pytest
import pytest_asyncio
import asyncio
from typing import AsyncGenerator, Generator
import httpx
from unittest.mock import AsyncMock, MagicMock

from kortix.config import global_config
from .mock_api import MockSunaAPI


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def mock_api() -> AsyncGenerator[MockSunaAPI, None]:
    """Create a mock Suna API server for testing"""
    mock_api = MockSunaAPI()
    await mock_api.start()
    
    # Configure global_config to use mock API
    original_api_url = getattr(global_config, '_api_url', None)
    original_api_key = getattr(global_config, '_api_key', None)
    
    global_config.set_api_url(f"http://localhost:{mock_api.port}")
    global_config.set_api_key("test-api-key")
    
    try:
        yield mock_api
    finally:
        await mock_api.stop()
        
        # Restore original config
        if original_api_url:
            global_config.set_api_url(original_api_url)
        # Restore original API key if it was set
        if original_api_key is not None:
            global_config.set_api_key(original_api_key)


@pytest.fixture
def sample_tools():
    """Create sample tools for testing"""
    from kortix.tools.fastmcp import FastMCP
    
    mcp = FastMCP("Test Tools")
    
    @mcp.tool
    def get_weather(city: str) -> str:
        """Get weather for a city"""
        return f"The weather in {city} is sunny"
    
    @mcp.tool
    async def async_tool(query: str) -> str:
        """An async tool for testing"""
        await asyncio.sleep(0.01)  # Minimal delay
        return f"Async result for: {query}"
    
    @mcp.tool
    def calculate(expression: str) -> str:
        """Calculate a mathematical expression"""
        try:
            result = eval(expression)
            return f"Result: {result}"
        except:
            return "Error: Invalid expression"
    
    return mcp


@pytest.fixture
def mock_client():
    """Create a mock HTTP client for unit testing"""
    mock = AsyncMock(spec=httpx.AsyncClient)
    return mock


@pytest.fixture
def sample_thread_id():
    """Return a sample thread ID for testing"""
    return "test-thread-12345"


@pytest.fixture
def sample_agent_id():
    """Return a sample agent ID for testing"""
    return "test-agent-67890"


@pytest.fixture
def sample_run_id():
    """Return a sample run ID for testing"""
    return "test-run-abcdef"


@pytest.fixture
def sample_message_data():
    """Return sample message data for testing"""
    return {
        "message_id": "msg-123",
        "type": "user",
        "content": "Hello, world!",
        "created_at": "2024-01-01T12:00:00Z",
        "metadata": {}
    }


@pytest.fixture
def sample_agent_response():
    """Return sample agent response for testing"""
    return {
        "agent_run_id": "run-123",
        "thread_id": "thread-123", 
        "status": "running",
        "created_at": "2024-01-01T12:00:00Z"
    } 