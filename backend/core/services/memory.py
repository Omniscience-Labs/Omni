"""
Memory service using Supermemory for AI-powered memory management.

This service provides functionality for storing and retrieving memories
associated with user message threads. It integrates with the Supermemory
platform to provide context-aware memory storage and retrieval for AI conversations.

Features:
- Add memories before/after AI interactions
- Search memories by context or thread
- User-specific memory isolation via container tags
- Thread-based memory organization
"""

import asyncio
from typing import List, Dict, Any, Optional, Union
from core.utils.config import config
from core.utils.logger import logger
from supermemory import AsyncSupermemory
from supermemory import APIError as SupermemoryAPIError

def _clip_message_content(content: str, max_length: int = 4000) -> str:
    """Clip message content to prevent excessively large memory entries."""
    if len(content) <= max_length:
        return content
    return content[: max_length - 3] + "..."


def _content_to_string(content: Union[str, List[Dict[str, str]]]) -> str:
    """Normalize content to a single string for storage."""
    if isinstance(content, str):
        return _clip_message_content(content)
    parts = []
    for msg in content:
        if isinstance(msg, dict):
            role = msg.get("role", "user")
            text = msg.get("content", "")
            if text:
                parts.append(f"{role.capitalize()}: {_clip_message_content(str(text))}")
        else:
            parts.append(_clip_message_content(str(msg)))
    return "\n\n".join(parts) if parts else ""


def _container_tags(user_id: str, thread_id: Optional[str] = None) -> List[str]:
    """Build Supermemory container_tags for user and optional thread scoping."""
    tags = [f"user_{user_id}"]
    if thread_id:
        tags.append(f"thread_{thread_id}")
    return tags


def _is_likely_metadata(s: str) -> bool:
    """Return True if s looks like a timestamp, UUID, ID, or other non-content metadata."""
    if not s or len(s) > 2000:
        return len(s) > 2000  # Treat very long as potential content
    s = s.strip()
    if len(s) < 15:
        return True
    # ISO timestamp: 2026-02-23T17:49:56.430Z
    if len(s) >= 20 and s[4] == "-" and s[7] == "-" and "T" in s[:25]:
        return True
    # UUID-like
    if len(s) == 36 and s.count("-") == 4:
        return True
    # Document/memory ID: short alphanumeric, no spaces (e.g. p4VePZhZqB3WZkHXpWJ1yX)
    if 10 <= len(s) <= 50 and s.isalnum() and not any(c.isspace() for c in s):
        return True
    return False


class MemoryError(Exception):
    """Base exception for memory-related errors."""

    pass


class MemoryService:
    """
    Service for managing AI memories using Supermemory.

    Provides methods for adding, searching, and managing memories
    associated with user conversations and AI interactions.
    """

    def __init__(self) -> None:
        """Initialize the memory service with Supermemory async client."""
        self.api_key = getattr(config, "SUPERMEMORY_API_KEY", None)
        self.client = None
        if not self.api_key:
            logger.warning("SUPERMEMORY_API_KEY not found in environment variables")
            return
        if AsyncSupermemory is None:
            logger.warning("Supermemory SDK not installed or failed to import")
            return
        try:
            timeout = getattr(config, "SUPERMEMORY_REQUEST_TIMEOUT", 20.0)
            max_retries = getattr(config, "SUPERMEMORY_MAX_RETRIES", 4)
            # Coerce to numeric types in case config loaded from env as string
            timeout = float(timeout) if timeout is not None else 20.0
            max_retries = int(max_retries) if max_retries is not None else 4
            self.client = AsyncSupermemory(
                api_key=self.api_key,
                timeout=timeout,
                max_retries=max_retries,
            )
            logger.info("Memory service (Supermemory) initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Supermemory client: {str(e)}")
            self.client = None

    def is_available(self) -> bool:
        """Check if the memory service is available."""
        return self.client is not None

    async def add_memory(
        self,
        content: Union[str, List[Dict[str, str]]],
        user_id: str,
        thread_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
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
        tags = _container_tags(user_id, thread_id)
        body_metadata = dict(metadata) if metadata else {}
        body_metadata["user_id"] = user_id
        if thread_id:
            body_metadata["thread_id"] = thread_id
        try:
            text = _content_to_string(content)
            await self.client.add(
                content=text,
                container_tags=tags,
                metadata=body_metadata,
            )
            logger.debug(
                f"Memory added successfully for user {user_id}",
                extra={"user_id": user_id, "thread_id": thread_id},
            )
            return True
        except SupermemoryAPIError as e:
            logger.error(
                f"Supermemory add failed: {e}",
                extra={"user_id": user_id, "thread_id": thread_id},
                exc_info=True,
            )
            return False
        except Exception as e:
            logger.error(
                f"Error adding memory for user {user_id}: {e}",
                extra={"user_id": user_id, "thread_id": thread_id},
                exc_info=True,
            )
            return False

    async def search_memories(
        self,
        query: str,
        user_id: str,
        thread_id: Optional[str] = None,
        limit: int = 10,
        version: str = "v2",
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search memories for a user based on query.

        Args:
            query: Search query text
            user_id: User identifier for memory isolation
            thread_id: Optional thread identifier to scope search
            limit: Maximum number of memories to return
            version: API version (unused, for compatibility)
            filters: Optional filters (unused for v3 search)

        Returns:
            List of memory dictionaries with 'memory' or 'text' and 'id'
        """
        if not self.client:
            logger.error("Cannot search memories: Memory service not available")
            return []
        tags = _container_tags(user_id, thread_id)
        try:
            response = await self.client.search.execute(
                q=query,
                container_tags=tags,
                limit=limit,
            )
            results = getattr(response, "results", None) or getattr(
                response, "data", []
            )
            out: List[Dict[str, Any]] = []
            for item in results or []:
                if hasattr(item, "model_dump"):
                    d = item.model_dump()
                    # Supermemory search.execute returns Result: content, summary, chunks[{content}], document_id
                    doc_id = d.get("document_id") or d.get("documentId") or d.get("id")
                elif isinstance(item, dict):
                    d = dict(item)
                    doc_id = d.get("document_id") or d.get("documentId") or d.get("id")
                else:
                    d = {"id": getattr(item, "id", None), "memory": getattr(item, "memory", None) or getattr(item, "text", None) or getattr(item, "chunk", str(item))}
                    doc_id = d.get("id")
                # Extract text: Supermemory Result has content, summary, or chunks[].content
                text = ""
                if isinstance(d.get("content"), str) and d["content"].strip() and not _is_likely_metadata(d["content"]):
                    text = d["content"].strip()
                if not text and isinstance(d.get("summary"), str) and d["summary"].strip() and not _is_likely_metadata(d["summary"]):
                    text = d["summary"].strip()
                if not text:
                    chunks = d.get("chunks") or []
                    if isinstance(chunks, list):
                        parts = []
                        for c in chunks:
                            if isinstance(c, dict) and isinstance(c.get("content"), str) and c["content"].strip():
                                parts.append(c["content"].strip())
                            elif hasattr(c, "content"):
                                parts.append(str(c.content).strip())
                        if parts:
                            text = "\n".join(parts)
                if not text:
                    for key in ("memory", "chunk", "text", "body", "value", "data"):
                        raw = d.get(key)
                        if isinstance(raw, str) and raw.strip() and not _is_likely_metadata(raw):
                            text = raw.strip()
                            break
                if not text:
                    skip_keys = ("id", "metadata", "updatedAt", "createdAt", "updated_at", "created_at", "version", "document_id", "documentId", "chunks")
                    for k, v in d.items():
                        if k in skip_keys or not isinstance(v, str):
                            continue
                        if v.strip() and not _is_likely_metadata(v):
                            text = v.strip()
                            break
                out.append({"id": doc_id, "memory": text, "text": text, "metadata": d.get("metadata", {})})
            if out and not any(o.get("memory") or o.get("text") for o in out) and results:
                first = results[0]
                try:
                    raw_d = first.model_dump() if hasattr(first, "model_dump") else (first if isinstance(first, dict) else {})
                    logger.warning(
                        "Supermemory search: all results had empty text; first item repr: %s",
                        {k: repr(v)[:300] for k, v in (raw_d or {}).items()},
                        extra={"user_id": user_id},
                    )
                except Exception:
                    pass
            logger.debug(
                f"Found {len(out)} memories for user {user_id}",
                extra={"user_id": user_id, "thread_id": thread_id, "query": query[:50]},
            )
            return out
        except SupermemoryAPIError as e:
            logger.error(
                f"Supermemory search failed: {e}",
                extra={"user_id": user_id, "thread_id": thread_id, "query": query[:50]},
                exc_info=True,
            )
            return []
        except Exception as e:
            logger.error(
                f"Error searching memories for user {user_id}: {e}",
                extra={"user_id": user_id, "thread_id": thread_id},
                exc_info=True,
            )
            return []

    async def get_thread_memories(
        self,
        user_id: str,
        thread_id: str,
        limit: int = 50,
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
        tags = _container_tags(user_id, thread_id)
        try:
            response = await self.client.documents.list(
                container_tags=tags,
                limit=min(limit, 100),
            )
            items = getattr(response, "data", None) or getattr(
                response, "documents", None
            ) or []
            out: List[Dict[str, Any]] = []
            for item in items or []:
                if hasattr(item, "model_dump"):
                    d = item.model_dump()
                elif isinstance(item, dict):
                    d = item
                else:
                    d = {"id": getattr(item, "id", None), "memory": getattr(item, "content", None) or getattr(item, "memory", "")}
                text = d.get("content") or d.get("memory") or d.get("text", "")
                out.append({"id": d.get("id"), "memory": text, "text": text, "metadata": d.get("metadata", {})})
            logger.debug(
                f"Retrieved {len(out)} memories for thread {thread_id}",
                extra={"user_id": user_id, "thread_id": thread_id},
            )
            return out
        except SupermemoryAPIError as e:
            logger.error(
                f"Supermemory list failed: {e}",
                extra={"user_id": user_id, "thread_id": thread_id},
                exc_info=True,
            )
            return []
        except Exception as e:
            logger.error(
                f"Error getting thread memories: {e}",
                extra={"user_id": user_id, "thread_id": thread_id},
                exc_info=True,
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
            await self.client.documents.delete(id=memory_id)
            logger.info(
                f"Memory {memory_id} deleted successfully",
                extra={"user_id": user_id, "memory_id": memory_id},
            )
            return True
        except SupermemoryAPIError as e:
            logger.error(
                f"Supermemory delete failed: {e}",
                extra={"user_id": user_id, "memory_id": memory_id},
                exc_info=True,
            )
            return False
        except Exception as e:
            logger.error(
                f"Error deleting memory {memory_id}: {e}",
                extra={"user_id": user_id, "memory_id": memory_id},
                exc_info=True,
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
            thread_memories = await self.get_thread_memories(user_id, thread_id, limit=500)
            if not thread_memories:
                logger.info(f"No memories found for thread {thread_id}")
                return True
            success_count = 0
            for memory in thread_memories:
                mid = memory.get("id")
                if mid and await self.delete_memory(mid, user_id):
                    success_count += 1
            logger.info(
                f"Cleared {success_count}/{len(thread_memories)} memories for thread {thread_id}",
                extra={"user_id": user_id, "thread_id": thread_id},
            )
            return success_count == len(thread_memories)
        except Exception as e:
            logger.error(
                f"Error clearing thread memories: {e}",
                extra={"user_id": user_id, "thread_id": thread_id},
                exc_info=True,
            )
            return False


memory_service = MemoryService()
