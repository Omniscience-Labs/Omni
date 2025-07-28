"""
Thread management for Kortix SDK

Handles conversation threads and message operations.
"""

import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime

from .client import KortixClient
from .models import Thread, Message, AgentRun
from .exceptions import ThreadError


class ThreadManager:
    """Manages conversation threads and messages"""
    
    def __init__(self):
        self._client: Optional[KortixClient] = None
    
    async def __aenter__(self):
        self._client = KortixClient()
        await self._client.__aenter__()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._client:
            await self._client.__aexit__(exc_type, exc_val, exc_tb)
    
    @property
    def client(self) -> KortixClient:
        if self._client is None:
            raise RuntimeError("ThreadManager not initialized. Use 'async with ThreadManager()' context manager")
        return self._client
    
    async def create_thread(self) -> Thread:
        """Create a new conversation thread"""
        try:
            return await self.client.create_thread()
        except Exception as e:
            raise ThreadError(f"Failed to create thread: {str(e)}")
    
    async def get_messages(self, thread_id: str) -> List[Message]:
        """Get all messages in a thread"""
        try:
            return await self.client.get_thread_messages(thread_id)
        except Exception as e:
            raise ThreadError(f"Failed to get messages for thread {thread_id}: {str(e)}")
    
    async def add_message(self, thread_id: str, role: str, content: str, metadata: Optional[Dict[str, Any]] = None) -> Message:
        """Add a message to a thread"""
        try:
            return await self.client.add_message_to_thread(thread_id, role, content, metadata)
        except Exception as e:
            raise ThreadError(f"Failed to add message to thread {thread_id}: {str(e)}")
    
    async def add_user_message(self, thread_id: str, content: str) -> Message:
        """Add a user message to a thread"""
        return await self.add_message(thread_id, "user", content)
    
    async def add_tool_message(self, thread_id: str, content: str) -> Message:
        """Add a tool result message to a thread"""
        return await self.add_message(thread_id, "tool", content)
    
    async def get_latest_messages(self, thread_id: str, count: int = 10) -> List[Message]:
        """Get the latest N messages from a thread"""
        messages = await self.get_messages(thread_id)
        return messages[-count:] if len(messages) > count else messages
    
    async def get_assistant_messages_since(self, thread_id: str, since_message_id: Optional[str] = None) -> List[Message]:
        """Get assistant messages since a specific message ID"""
        messages = await self.get_messages(thread_id)
        
        if since_message_id is None:
            # Return all assistant messages
            return [msg for msg in messages if msg.role == "assistant"]
        
        # Find the index of the since_message_id
        since_index = None
        for i, msg in enumerate(messages):
            if msg.id == since_message_id:
                since_index = i
                break
        
        if since_index is None:
            # If we can't find the message, return all assistant messages
            return [msg for msg in messages if msg.role == "assistant"]
        
        # Return assistant messages after the since_index
        return [msg for msg in messages[since_index + 1:] if msg.role == "assistant"]
    
    async def wait_for_new_messages(self, thread_id: str, last_message_id: Optional[str] = None, timeout: float = 30.0) -> List[Message]:
        """Wait for new messages in a thread (polling approach)"""
        start_time = asyncio.get_event_loop().time()
        
        while True:
            # Check for new messages
            if last_message_id:
                messages = await self.get_messages(thread_id)
                # Find messages after the last known message
                new_messages = []
                found_last = False
                for msg in messages:
                    if found_last:
                        new_messages.append(msg)
                    elif msg.id == last_message_id:
                        found_last = True
                
                if new_messages:
                    return new_messages
            else:
                # If no last message ID, just return the latest message
                messages = await self.get_messages(thread_id)
                if messages:
                    return [messages[-1]]
            
            # Check timeout
            if asyncio.get_event_loop().time() - start_time > timeout:
                return []
            
            # Wait before polling again
            await asyncio.sleep(1.0)
    
    async def start_agent_run(
        self,
        thread_id: str,
        instructions: str = "",
        model: str = "",
        tool_schemas: Optional[List[Dict[str, Any]]] = None
    ) -> AgentRun:
        """Start an agent run on a thread"""
        try:
            return await self.client.start_agent_run(thread_id, instructions, model, tool_schemas)
        except Exception as e:
            raise ThreadError(f"Failed to start agent run on thread {thread_id}: {str(e)}")
    
    async def get_agent_run_status(self, run_id: str) -> AgentRun:
        """Get the status of an agent run"""
        try:
            return await self.client.get_agent_run(run_id)
        except Exception as e:
            raise ThreadError(f"Failed to get agent run status for {run_id}: {str(e)}")
    
    async def stop_agent_run(self, run_id: str) -> None:
        """Stop an agent run"""
        try:
            await self.client.stop_agent_run(run_id)
        except Exception as e:
            raise ThreadError(f"Failed to stop agent run {run_id}: {str(e)}")
    
    async def wait_for_agent_completion(self, run_id: str, timeout: float = 300.0, poll_interval: float = 1.0) -> AgentRun:
        """Wait for an agent run to complete"""
        start_time = asyncio.get_event_loop().time()
        
        while True:
            run_status = await self.get_agent_run_status(run_id)
            
            if run_status.status in ["completed", "failed", "stopped"]:
                return run_status
            
            # Check timeout
            if asyncio.get_event_loop().time() - start_time > timeout:
                raise ThreadError(f"Agent run {run_id} did not complete within {timeout} seconds")
            
            # Wait before polling again
            await asyncio.sleep(poll_interval) 