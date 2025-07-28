"""
HTTP client for Kortix backend API communication
"""

import asyncio
import json
from typing import Optional, Dict, Any, List, AsyncGenerator
import httpx
from datetime import datetime

from .config import global_config
from .exceptions import APIError, AuthenticationError
from .models import Thread, Message, AgentRun


class KortixClient:
    """Async HTTP client for Kortix backend API"""
    
    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
    
    async def __aenter__(self):
        self._client = httpx.AsyncClient(timeout=30.0)
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._client:
            await self._client.aclose()
    
    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("Client not initialized. Use 'async with KortixClient()' context manager")
        return self._client
    
    def _get_headers(self) -> Dict[str, str]:
        """Get headers with authentication"""
        return {
            "X-API-Key": global_config.api_key,
            "Content-Type": "application/json"
        }
    
    async def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make an authenticated API request"""
        url = f"{global_config.api_url}{endpoint}"
        headers = self._get_headers()
        
        try:
            response = await self.client.request(
                method=method,
                url=url,
                headers=headers,
                **kwargs
            )
            
            if response.status_code == 401:
                raise AuthenticationError("Invalid API key or unauthorized")
            
            if response.status_code >= 400:
                try:
                    error_data = response.json()
                except:
                    error_data = {"detail": response.text}
                
                raise APIError(
                    message=error_data.get("detail", f"Request failed with status {response.status_code}"),
                    status_code=response.status_code,
                    response_data=error_data
                )
            
            return response.json()
            
        except httpx.RequestError as e:
            raise APIError(f"Request failed: {str(e)}")
    
    # Thread Management
    async def create_thread(self, prompt: str = "Initializing thread") -> Thread:
        """Create a new conversation thread"""
        response = await self._request("POST", "/agent/initiate", json={"prompt": prompt})
        
        return Thread(
            id=response["thread_id"],
            created_at=datetime.now()
        )
    
    async def get_thread_messages(self, thread_id: str) -> List[Message]:
        """Get all messages in a thread"""
        response = await self._request("GET", f"/threads/{thread_id}/messages")
        
        messages = []
        for msg_data in response.get("messages", []):
            # Parse content if it's a JSON object (as stored in the backend)
            content = msg_data.get("content", "")
            if isinstance(content, dict):
                # Extract content from the JSON structure
                if "content" in content:
                    content = content["content"]
                elif "text" in content:
                    content = content["text"]
                else:
                    content = str(content)
            
            messages.append(Message(
                id=msg_data["message_id"],
                role=msg_data["type"],
                content=str(content),
                created_at=datetime.fromisoformat(msg_data["created_at"]),
                metadata=msg_data.get("metadata", {})
            ))
        
        return messages
    
    async def add_message_to_thread(self, thread_id: str, role: str, content: str, metadata: Optional[Dict[str, Any]] = None) -> Message:
        """Add a message to a thread"""
        # The backend expects the message as a query parameter
        response = await self._request("POST", f"/threads/{thread_id}/messages/add", params={"message": content})
        
        # Parse the response from the backend format
        content_data = response.get("content", "")
        if isinstance(content_data, dict) and "content" in content_data:
            response_content = content_data["content"]
        else:
            response_content = str(content_data)
        
        return Message(
            id=response["message_id"],
            role=response["type"],
            content=response_content,
            created_at=datetime.fromisoformat(response["created_at"]),
            metadata=response.get("metadata", {})
        )
    

    
    # Agent Execution
    async def start_agent_run(self, thread_id: str, instructions: str = "", model: str = "", tool_schemas: Optional[List[Dict[str, Any]]] = None) -> AgentRun:
        """Start an agent run on a thread with instructions and tools"""
        data = {
            "stream": True,
            "instructions": instructions,
            "model_name": model,
            "tool_schemas": tool_schemas or []
        }
        
        response = await self._request("POST", f"/thread/{thread_id}/agent/start", json=data)
        
        return AgentRun(
            id=response["agent_run_id"],
            thread_id=thread_id,
            status="running",
            created_at=datetime.now()
        )
    
    async def get_agent_run(self, run_id: str) -> AgentRun:
        """Get agent run status"""
        response = await self._request("GET", f"/agent-run/{run_id}")
        
        return AgentRun(
            id=response["agent_run_id"],
            thread_id=response["thread_id"],
            status=response["status"],
            created_at=datetime.fromisoformat(response["created_at"]) if response.get("created_at") else datetime.now(),
            completed_at=datetime.fromisoformat(response["completed_at"]) if response.get("completed_at") else None
        )
    
    async def stop_agent_run(self, run_id: str) -> None:
        """Stop an agent run"""
        await self._request("POST", f"/agent-run/{run_id}/stop")
    
    async def stream_agent_run(self, run_id: str) -> AsyncGenerator[str, None]:
        """Stream agent run responses"""
        url = f"{global_config.api_url}/agent-run/{run_id}/stream"
        headers = self._get_headers()
        
        async with self.client.stream("GET", url, headers=headers) as response:
            if response.status_code >= 400:
                raise APIError(f"Stream failed with status {response.status_code}")
            
            async for line in response.aiter_lines():
                if line.strip():
                    if line.startswith("data: "):
                        data = line[6:]  # Remove "data: " prefix
                        if data.strip() != "[DONE]":
                            yield data 