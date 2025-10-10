"""
Memory service using Mem0ai for AI-powered memory management.

This service provides functionality for storing and retrieving memories
associated with user message threads. It integrates with the Mem0 platform
to provide context-aware memory storage and retrieval for AI conversations.

Features:
- Add memories before/after AI interactions
- Search memories by context or thread
- User-specific memory isolation
- Thread-based memory organization
"""

import asyncio
import os
import time
from typing import List, Dict, Any, Optional, Union
from mem0 import AsyncMemoryClient
from core.utils.config import config
from core.utils.logger import logger


def _clip_message_content(content: str, max_length: int = 4000) -> str:
    """Clip message content to prevent excessively large memory entries."""
    if len(content) <= max_length:
        return content
    return content[:max_length - 3] + "..."


class MemoryError(Exception):
    """Base exception for memory-related errors."""
    pass


class MemoryService:
    """
    Service for managing AI memories using Mem0ai.

    Provides methods for adding, searching, and managing memories
    associated with user conversations and AI interactions.
    """

    def __init__(self):
        """Initialize the memory service with Mem0 async client."""
        self.api_key = config.MEM0_API_KEY

        if not self.api_key:
            logger.warning("MEM0_API_KEY not found in environment variables")
            self.client = None
        else:
            try:
                # Set the API key in environment for mem0 client
                os.environ["MEM0_API_KEY"] = self.api_key
                self.client = AsyncMemoryClient()
                logger.info("Memory service initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Mem0 async client: {str(e)}")
                self.client = None

    async def _retry_with_backoff(self, func, *args, **kwargs):
        """Execute function with exponential backoff retry logic."""
        max_retries = config.MEM0_MAX_RETRIES
        delay = config.MEM0_RETRY_DELAY

        for attempt in range(max_retries + 1):
            try:
                return await asyncio.wait_for(func(*args, **kwargs), timeout=config.MEM0_REQUEST_TIMEOUT)
            except (asyncio.TimeoutError, Exception) as e:
                if attempt == max_retries:
                    logger.error(f"Failed after {max_retries + 1} attempts: {str(e)}")
                    raise
                wait_time = delay * (2 ** attempt)  # Exponential backoff
                logger.warning(f"Attempt {attempt + 1} failed, retrying in {wait_time}s: {str(e)}")
                await asyncio.sleep(wait_time)
    
    def is_available(self) -> bool:
        """Check if the memory service is available."""
        return self.client is not None
    
    async def add_memory(
        self, 
        content: Union[str, List[Dict[str, str]]], 
        user_id: str, 
        thread_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Add a memory to the user's memory store.
        
        Args:
            content: The memory content to store - either a string or list of message dicts
            user_id: User identifier for memory isolation
            thread_id: Optional thread identifier for conversation context
            metadata: Additional metadata to store with the memory
            
        Returns:
            bool: True if memory was added successfully, False otherwise
        """
        if not self.client:
            logger.error("Cannot add memory: Memory service not available")
            return False
        
        try:
            # Prepare memory data with user context
            memory_data = {
                "user_id": user_id,
            }
            
            if thread_id:
                memory_data["thread_id"] = thread_id
                
            if metadata:
                memory_data.update(metadata)
            
            # Add memory using mem0 client - messages parameter expects a list
            if isinstance(content, str):
                # Handle string content - wrap in list as expected by mem0 API
                messages = [_clip_message_content(content)]
            else:
                # Handle list of message dictionaries - clip content in each message
                messages = []
                for msg in content:
                    if isinstance(msg, dict):
                        clipped_msg = dict(msg)  # Create a copy
                        if 'content' in clipped_msg:
                            clipped_msg['content'] = _clip_message_content(str(clipped_msg['content']))
                        messages.append(clipped_msg)
                    else:
                        messages.append(_clip_message_content(str(msg)))
            
            result = await self._retry_with_backoff(
                self.client.add,
                messages=messages,
                user_id=user_id,
                metadata=memory_data
            )
            
            logger.debug(
                f"Memory added successfully for user {user_id}",
                extra={
                    "user_id": user_id,
                    "thread_id": thread_id,
                    "memory_id": result.get("id") if isinstance(result, dict) else None
                }
            )
            return True
            
        except Exception as e:
            logger.error(
                f"Error adding memory for user {user_id}: {str(e)}",
                extra={"user_id": user_id, "thread_id": thread_id},
                exc_info=True
            )
            return False
    
    async def search_memories(
        self, 
        query: str, 
        user_id: str,
        thread_id: Optional[str] = None,
        limit: int = 10,
        version: str = "v2",
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Search memories for a user based on query.
        
        Args:
            query: Search query text
            user_id: User identifier for memory isolation
            thread_id: Optional thread identifier to scope search
            limit: Maximum number of memories to return
            version: API version to use ("v1" or "v2")
            filters: Optional filters for v2 API (e.g., {"AND": [{"user_id": "alex"}]})
            
        Returns:
            List of memory dictionaries matching the query
        """
        if not self.client:
            logger.error("Cannot search memories: Memory service not available")
            return []
        
        try:
            # Prepare search parameters
            search_params = {
                "query": query,
                "user_id": user_id,
                "limit": limit
            }
            
            # Add version and filters for v2 API
            if version == "v2":
                search_params["version"] = "v2"

                # Use provided filters or create default user filter with thread_id if specified
                if filters:
                    # Merge provided filters with thread_id filter if needed
                    if thread_id:
                        if "AND" not in filters:
                            # Convert to AND structure if not already
                            filters = {"AND": [filters]}
                        # Add thread_id filter to existing AND conditions
                        if isinstance(filters["AND"], list):
                            filters["AND"].append({"thread_id": thread_id})
                        search_params["filters"] = filters
                    else:
                        search_params["filters"] = filters
                else:
                    # Create default user filter with optional thread_id
                    filter_conditions = [{"user_id": user_id}]
                    if thread_id:
                        filter_conditions.append({"thread_id": thread_id})
                    search_params["filters"] = {"AND": filter_conditions}

            # Search memories using mem0 client
            results = await self._retry_with_backoff(self.client.search, **search_params)
            
            logger.debug(
                f"Found {len(results)} memories for user {user_id}",
                extra={
                    "user_id": user_id,
                    "thread_id": thread_id,
                    "query": query,
                    "results_count": len(results)
                }
            )
            
            return results or []
            
        except Exception as e:
            logger.error(
                f"Error searching memories for user {user_id}: {str(e)}",
                extra={"user_id": user_id, "thread_id": thread_id, "query": query},
                exc_info=True
            )
            return []
    
    async def get_thread_memories(
        self,
        user_id: str,
        thread_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get all memories for a specific thread.
        
        Args:
            user_id: User identifier
            thread_id: Thread identifier
            limit: Maximum number of memories to return
            
        Returns:
            List of memories for the thread
        """
        if not self.client:
            logger.error("Cannot get thread memories: Memory service not available")
            return []
        
        try:
            # Use search with filters for better performance (server-side filtering)
            search_params = {
                "query": "*",  # Match all memories for this user/thread
                "user_id": user_id,
                "limit": limit,
                "version": "v2",
                "filters": {
                    "AND": [
                        {"user_id": user_id},
                        {"thread_id": thread_id}
                    ]
                }
            }

            results = await self._retry_with_backoff(self.client.search, **search_params)

            logger.debug(
                f"Retrieved {len(results)} memories for thread {thread_id}",
                extra={
                    "user_id": user_id,
                    "thread_id": thread_id,
                    "memories_count": len(results)
                }
            )

            return results or []
            
        except Exception as e:
            logger.error(
                f"Error getting thread memories: {str(e)}",
                extra={"user_id": user_id, "thread_id": thread_id},
                exc_info=True
            )
            return []
    
    async def delete_memory(self, memory_id: str, user_id: str) -> bool:
        """
        Delete a specific memory.
        
        Args:
            memory_id: The ID of the memory to delete
            user_id: User identifier for authorization
            
        Returns:
            bool: True if deletion was successful, False otherwise
        """
        if not self.client:
            logger.error("Cannot delete memory: Memory service not available")
            return False
        
        try:
            result = await self._retry_with_backoff(self.client.delete, memory_id=memory_id)
            
            logger.info(
                f"Memory {memory_id} deleted successfully",
                extra={"user_id": user_id, "memory_id": memory_id}
            )
            return True
            
        except Exception as e:
            logger.error(
                f"Error deleting memory {memory_id}: {str(e)}",
                extra={"user_id": user_id, "memory_id": memory_id},
                exc_info=True
            )
            return False
    
    async def clear_thread_memories(self, user_id: str, thread_id: str) -> bool:
        """
        Clear all memories for a specific thread.
        
        Args:
            user_id: User identifier
            thread_id: Thread identifier
            
        Returns:
            bool: True if clearing was successful, False otherwise
        """
        try:
            # Get all memories for the thread
            thread_memories = await self.get_thread_memories(user_id, thread_id)
            
            if not thread_memories:
                logger.info(f"No memories found for thread {thread_id}")
                return True
            
            # Delete each memory
            success_count = 0
            for memory in thread_memories:
                memory_id = memory.get("id")
                if memory_id and await self.delete_memory(memory_id, user_id):
                    success_count += 1
            
            logger.info(
                f"Cleared {success_count}/{len(thread_memories)} memories for thread {thread_id}",
                extra={
                    "user_id": user_id,
                    "thread_id": thread_id,
                    "cleared_count": success_count,
                    "total_count": len(thread_memories)
                }
            )
            
            return success_count == len(thread_memories)
            
        except Exception as e:
            logger.error(
                f"Error clearing thread memories: {str(e)}",
                extra={"user_id": user_id, "thread_id": thread_id},
                exc_info=True
            )
            return False


# Create singleton instance
memory_service = MemoryService()
