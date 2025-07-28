"""
Tests for the Kortix SDK HTTP client module
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, Mock, patch
import httpx
from datetime import datetime

from kortix.client import KortixClient
from kortix.exceptions import APIError, AuthenticationError
from kortix.models import Thread, Message, AgentRun
from kortix.config import global_config


class TestKortixClient:
    """Test the KortixClient class"""
    
    def test_init(self):
        """Test client initialization"""
        client = KortixClient()
        assert client._client is None
    
    @pytest.mark.asyncio
    async def test_context_manager(self):
        """Test client as async context manager"""
        async with KortixClient() as client:
            assert client._client is not None
            assert isinstance(client._client, httpx.AsyncClient)
    
    def test_client_property_uninitialized(self):
        """Test accessing client property when uninitialized"""
        client = KortixClient()
        with pytest.raises(RuntimeError, match="Client not initialized"):
            _ = client.client
    
    @pytest.mark.asyncio
    async def test_client_property_initialized(self):
        """Test client property when initialized"""
        async with KortixClient() as client:
            # Access client property
            result = client.client
            assert result is not None
            assert isinstance(result, httpx.AsyncClient)
    
    @patch('kortix.client.global_config')
    def test_get_headers(self, mock_config):
        """Test header generation"""
        mock_config.api_key = "test-api-key"
        
        client = KortixClient()
        headers = client._get_headers()
        
        expected_headers = {
            "X-API-Key": "test-api-key",
            "Content-Type": "application/json"
        }
        assert headers == expected_headers
    
    @patch('kortix.client.global_config')
    @pytest.mark.asyncio
    async def test_request_success(self, mock_config):
        """Test successful API request"""
        mock_config.api_key = "test-key"
        mock_config.api_url = "https://api.test.com"
        
        # Mock response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"success": True}
        
        with patch('httpx.AsyncClient.request', return_value=mock_response):
            async with KortixClient() as client:
                result = await client._request("GET", "/test")
                assert result == {"success": True}
    
    @patch('kortix.client.global_config')
    @pytest.mark.asyncio
    async def test_request_401_error(self, mock_config):
        """Test 401 authentication error"""
        mock_config.api_key = "test-key"
        mock_config.api_url = "https://api.test.com"
        
        # Mock 401 response
        mock_response = Mock()
        mock_response.status_code = 401
        
        with patch('httpx.AsyncClient.request', return_value=mock_response):
            async with KortixClient() as client:
                with pytest.raises(AuthenticationError):
                    await client._request("GET", "/test")
    
    @patch('kortix.client.global_config')
    @pytest.mark.asyncio
    async def test_request_api_error(self, mock_config):
        """Test general API error"""
        mock_config.api_key = "test-key"
        mock_config.api_url = "https://api.test.com"
        
        # Mock error response
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.json.return_value = {"detail": "Internal server error"}
        
        with patch('httpx.AsyncClient.request', return_value=mock_response):
            async with KortixClient() as client:
                with pytest.raises(APIError) as exc_info:
                    await client._request("GET", "/test")
                
                assert exc_info.value.status_code == 500
    
    @patch('kortix.client.global_config')
    @pytest.mark.asyncio
    async def test_request_network_error(self, mock_config):
        """Test network error handling"""
        mock_config.api_key = "test-key"
        mock_config.api_url = "https://api.test.com"
        
        with patch('httpx.AsyncClient.request', side_effect=httpx.RequestError("Network error")):
            async with KortixClient() as client:
                with pytest.raises(APIError) as exc_info:
                    await client._request("GET", "/test")
                
                assert "Network error" in str(exc_info.value)


class TestKortixClientMethods:
    """Test KortixClient API methods"""
    
    @pytest.fixture
    def mock_client(self):
        """Create a mock client for testing"""
        client = KortixClient()
        client._client = AsyncMock()
        return client
    
    @pytest.mark.asyncio  
    async def test_create_thread(self, mock_client):
        """Test thread creation"""
        # Set API key and URL for the client
        global_config.set_api_key("test-api-key")
        global_config.set_api_url("https://api.test.com")
        
        mock_response = {"thread_id": "thread-123"}
        mock_client._request = AsyncMock(return_value=mock_response)
        
        thread = await mock_client.create_thread()
        
        assert isinstance(thread, Thread)
        assert thread.id == "thread-123"
        mock_client._request.assert_called_once_with("POST", "/agent/initiate", json={"prompt": "Initializing thread"})
    
    @pytest.mark.asyncio
    async def test_get_thread_messages(self, mock_client):
        """Test getting thread messages"""
        # Mock backend format
        mock_response = {
            "messages": [
                {
                    "message_id": "msg-1",
                    "type": "user",
                    "content": {
                        "role": "user", 
                        "content": "Hello"
                    },
                    "created_at": "2024-01-01T12:00:00Z",
                    "metadata": {}
                },
                {
                    "message_id": "msg-2",
                    "type": "assistant",
                    "content": "Hi there!",
                    "created_at": "2024-01-01T12:01:00Z",
                    "metadata": {}
                }
            ]
        }
        mock_client._request = AsyncMock(return_value=mock_response)
        
        messages = await mock_client.get_thread_messages("thread-123")
        
        assert len(messages) == 2
        assert all(isinstance(msg, Message) for msg in messages)
        assert messages[0].id == "msg-1"
        assert messages[0].role == "user"
        assert messages[0].content == "Hello"
        assert messages[1].id == "msg-2"
        assert messages[1].role == "assistant"
        assert messages[1].content == "Hi there!"
        
        mock_client._request.assert_called_once_with("GET", "/threads/thread-123/messages")
    
    @pytest.mark.asyncio
    async def test_add_message_to_thread(self, mock_client):
        """Test adding message to thread"""
        # Mock backend format
        mock_response = {
            "message_id": "msg-new",
            "type": "user",
            "content": {
                "role": "user",
                "content": "New message"
            },
            "created_at": "2024-01-01T12:02:00Z",
            "metadata": {"test": "value"}
        }
        mock_client._request = AsyncMock(return_value=mock_response)
        
        message = await mock_client.add_message_to_thread(
            "thread-123",
            "user", 
            "New message",
            {"test": "value"}
        )
        
        assert isinstance(message, Message)
        assert message.id == "msg-new"
        assert message.role == "user"
        assert message.content == "New message"
        assert message.metadata == {"test": "value"}
        
        mock_client._request.assert_called_once_with(
            "POST",
            "/threads/thread-123/messages/add",
            params={"message": "New message"}
        )
    
    @pytest.mark.asyncio
    async def test_start_agent_run(self, mock_client):
        """Test starting agent run with instructions and tools"""
        mock_response = {
            "agent_run_id": "run-789",
            "thread_id": "thread-123",
            "status": "running",
            "created_at": "2024-01-01T12:03:00Z"
        }
        mock_client._request = AsyncMock(return_value=mock_response)
        
        tool_schemas = [{"type": "function", "function": {"name": "test_tool"}}]
        
        run = await mock_client.start_agent_run(
            "thread-123",
            instructions="Be helpful",
            model="gpt-4",
            tool_schemas=tool_schemas
        )
        
        assert isinstance(run, AgentRun)
        assert run.id == "run-789"
        assert run.thread_id == "thread-123"
        assert run.status == "running"
        
        mock_client._request.assert_called_once_with(
            "POST",
            "/thread/thread-123/agent/start",
            json={
                "stream": True,
                "instructions": "Be helpful",
                "model_name": "gpt-4",
                "tool_schemas": tool_schemas
            }
        )
    
    @pytest.mark.asyncio
    async def test_get_agent_run(self, mock_client):
        """Test getting agent run status"""
        mock_response = {
            "agent_run_id": "run-789",
            "thread_id": "thread-123",
            "status": "completed",
            "created_at": "2024-01-01T12:03:00Z",
            "completed_at": "2024-01-01T12:04:00Z"
        }
        mock_client._request = AsyncMock(return_value=mock_response)
        
        run = await mock_client.get_agent_run("run-789")
        
        assert isinstance(run, AgentRun)
        assert run.id == "run-789"
        assert run.status == "completed"
        assert run.completed_at is not None
        
        mock_client._request.assert_called_once_with("GET", "/agent-run/run-789")
    
    @pytest.mark.asyncio
    async def test_stop_agent_run(self, mock_client):
        """Test stopping agent run"""
        mock_client._request = AsyncMock(return_value={})
        
        await mock_client.stop_agent_run("run-789")
        
        mock_client._request.assert_called_once_with("POST", "/agent-run/run-789/stop")


class TestStreamingMethods:
    """Test streaming functionality"""
    
    @pytest.fixture
    def mock_client_streaming(self):
        """Create a mock client for streaming tests"""
        client = KortixClient()
        client._client = AsyncMock()
        return client
    
    @pytest.mark.asyncio
    async def test_stream_agent_run(self, mock_client_streaming):
        """Test streaming agent run responses"""
        from kortix.config import global_config
        
        # Set API URL and key for the test
        original_api_url = getattr(global_config, '_api_url', None)
        original_api_key = getattr(global_config, '_api_key', None)
        global_config.set_api_url("https://api.test.com")
        global_config.set_api_key("test-api-key")
        
        try:
            # Mock streaming response
            async def mock_aiter_lines():
                lines = [
                    "data: chunk1",
                    "data: chunk2", 
                    "data: [DONE]"
                ]
                for line in lines:
                    yield line
            
            class MockResponse:
                status_code = 200
                
                async def aiter_lines(self):
                    async for line in mock_aiter_lines():
                        yield line
            
            # Create a proper async context manager mock
            class MockContextManager:
                async def __aenter__(self):
                    return MockResponse()
                async def __aexit__(self, exc_type, exc_val, exc_tb):
                    return None
            
            # Mock the stream method to return the context manager directly  
            from unittest.mock import Mock
            mock_stream = Mock(return_value=MockContextManager())
            mock_client_streaming._client.stream = mock_stream
            
            chunks = []
            async for chunk in mock_client_streaming.stream_agent_run("run-123"):
                chunks.append(chunk)
            
            assert chunks == ["chunk1", "chunk2"]
            mock_stream.assert_called_once()
        
        finally:
            # Restore original API URL and key
            if original_api_url:
                global_config.set_api_url(original_api_url)
            else:
                global_config._api_url = None
            if original_api_key:
                global_config.set_api_key(original_api_key)
            else:
                global_config._api_key = None 