"""
Memory integration helper functions for AI conversation storage.

This module provides helper functions to integrate memory storage
at the end of AI interactions and retrieval before sending messages to the agent.
"""

import hashlib
import json
from typing import List, Dict, Any, Optional
from core.services.memory import memory_service
from core.services.supabase import DBConnection
from core.services import redis
from core.utils.logger import logger
from core.utils.config import config


# Constants for memory formatting
MEMORY_CONTEXT_HEADER = "**Relevant Context from Previous Conversations:**\n"
MEMORY_CONTEXT_FOOTER = "\n**Current Conversation:**"


def _compute_memory_hash(conversation_messages: List[Dict[str, Any]]) -> str:
    """Compute a hash of conversation messages for deduplication."""
    message_strs = []
    for msg in conversation_messages[-5:]:
        role = msg.get("role", "")
        content = msg.get("content", "")
        message_strs.append(f"{role}:{content}")
    content_to_hash = "|".join(message_strs)
    return hashlib.sha256(content_to_hash.encode("utf-8")).hexdigest()[:16]


def _generate_memory_cache_key(
    user_id: str, thread_id: str, query: str, limit: int
) -> str:
    """Generate a cache key for memory retrieval."""
    key_components = f"{user_id}:{thread_id}:{query}:{limit}"
    return f"mem_cache:{hashlib.sha256(key_components.encode()).hexdigest()[:16]}"


async def get_user_id_from_thread(db: DBConnection, thread_id: str) -> Optional[str]:
    """
    Get user_id (account_id) from thread_id.

    Args:
        db: Database connection
        thread_id: Thread identifier

    Returns:
        User ID (account_id) or None if not found
    """
    try:
        client = await db.client
        result = (
            await client.table("threads")
            .select("account_id")
            .eq("thread_id", thread_id)
            .execute()
        )
        if result.data and len(result.data) > 0:
            user_id = result.data[0]["account_id"]
            logger.debug(f"Retrieved user_id {user_id} for thread {thread_id}")
            return user_id
        logger.warning(f"No user found for thread {thread_id}")
        return None
    except Exception as e:
        logger.error(f"Error getting user_id from thread {thread_id}: {e}")
        return None


async def get_recent_conversation_messages(
    db: DBConnection, thread_id: str, limit: int = 20
) -> List[Dict[str, Any]]:
    """
    Get recent conversation messages from a thread for memory storage.

    Args:
        db: Database connection
        thread_id: Thread identifier
        limit: Maximum number of recent messages to retrieve

    Returns:
        List of message dictionaries with role and content
    """
    try:
        client = await db.client
        result = (
            await client.table("messages")
            .select("content, type, created_at")
            .eq("thread_id", thread_id)
            .eq("is_llm_message", True)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        if not result.data:
            return []
        messages = []
        for msg_data in reversed(result.data):
            content = msg_data["content"]
            if isinstance(content, str):
                try:
                    content = json.loads(content)
                except json.JSONDecodeError:
                    continue
            role = content.get("role", msg_data["type"])
            message_content = content.get("content", "")
            if role and message_content:
                messages.append({"role": role, "content": str(message_content)})
        return messages
    except Exception as e:
        logger.error(f"Error getting conversation messages from thread {thread_id}: {e}")
        return []


async def store_conversation_memory(
    db: DBConnection,
    thread_id: str,
    conversation_messages: Optional[List[Dict[str, Any]]] = None,
    additional_context: Optional[str] = None,
    agent_run_id: Optional[str] = None,
) -> bool:
    """
    Store conversation memory at the end of an AI interaction.

    Args:
        db: Database connection
        thread_id: Thread identifier
        conversation_messages: Optional pre-fetched messages, will fetch if None
        additional_context: Additional context to include in memory
        agent_run_id: Optional agent run ID for deduplication

    Returns:
        True if memory storage was successful, False otherwise
    """
    try:
        if not memory_service.is_available():
            logger.debug("Memory service not available, skipping memory storage")
            return False
        user_id = await get_user_id_from_thread(db, thread_id)
        if not user_id:
            logger.warning(
                f"Could not get user_id for thread {thread_id}, skipping memory storage"
            )
            return False
        if conversation_messages is None:
            conversation_messages = await get_recent_conversation_messages(
                db, thread_id, limit=10
            )
        if not conversation_messages:
            logger.debug(f"No conversation messages found for thread {thread_id}")
            return False
        memory_hash = _compute_memory_hash(conversation_messages)
        memory_metadata: Dict[str, Any] = {
            "type": "conversation",
            "message_count": len(conversation_messages),
            "stored_at": "conversation_end",
            "memory_hash": memory_hash,
        }
        if agent_run_id:
            memory_metadata["agent_run_id"] = agent_run_id
        if additional_context:
            memory_metadata["additional_context"] = additional_context
        # Store as user-level (thread_id=None) so the memory is found in new chats
        success = await memory_service.add_memory(
            content=conversation_messages,
            user_id=user_id,
            thread_id=None,
            metadata=memory_metadata,
        )
        if success:
            logger.info(
                f"Successfully stored conversation memory for thread {thread_id} (user: {user_id})"
            )
        else:
            logger.warning(f"Failed to store conversation memory for thread {thread_id}")
        return success
    except Exception as e:
        logger.error(
            f"Error storing conversation memory for thread {thread_id}: {e}",
            exc_info=True,
        )
        return False


async def retrieve_relevant_memories(
    db: DBConnection,
    thread_id: str,
    query: str,
    limit: int = 5,
) -> Optional[str]:
    """
    Retrieve relevant memories before sending message to agent.

    Uses Redis caching to avoid repeated identical searches.

    Args:
        db: Database connection
        thread_id: Thread identifier
        query: User's current message/query
        limit: Maximum number of memories to retrieve

    Returns:
        Formatted memory context string or None if no memories found
    """
    try:
        if not memory_service.is_available():
            logger.debug("Memory service not available, skipping memory retrieval")
            return None
        user_id = await get_user_id_from_thread(db, thread_id)
        if not user_id:
            logger.warning(
                f"Could not get user_id for thread {thread_id}, skipping memory retrieval"
            )
            return None
        logger.info(
            f"Memory retrieval: looking up memories for user (thread {thread_id})",
            extra={"user_id": user_id, "thread_id": thread_id, "query_preview": query[:80]},
        )
        cache_ttl = getattr(config, "SUPERMEMORY_CACHE_TTL", 45)
        cache_key = _generate_memory_cache_key(user_id, thread_id, query, limit)
        try:
            cached_result = await redis.get(cache_key)
            if cached_result:
                logger.debug(f"Memory cache hit for key: {cache_key}")
                decoded = cached_result if isinstance(cached_result, str) else (cached_result.decode("utf-8") if isinstance(cached_result, bytes) else str(cached_result))
                if decoded:
                    return decoded
        except Exception:
            pass
        relevant_memories = await memory_service.search_memories(
            query=query,
            user_id=user_id,
            thread_id=None,  # Search user-level memories so agent remembers across threads/chats
            limit=limit,
        )
        # Fallback: if no results, try broader search so "do you remember my team?" still finds context
        if not relevant_memories and query:
            fallback_query = "user information work team preferences context"
            logger.info(f"Memory retrieval: trying fallback query {fallback_query!r}")
            relevant_memories = await memory_service.search_memories(
                query=fallback_query,
                user_id=user_id,
                thread_id=None,
                limit=limit,
            )
        if not relevant_memories:
            logger.info(
                f"No relevant memories found for user (cross-thread)",
                extra={"user_id": user_id, "thread_id": thread_id, "query_preview": query[:80]},
            )
            try:
                await redis.set(cache_key, "", ex=cache_ttl)
            except Exception:
                pass
            return None
        memory_context_parts = [MEMORY_CONTEXT_HEADER]
        for i, memory in enumerate(relevant_memories):
            memory_text = memory.get("memory", memory.get("text", ""))
            if isinstance(memory_text, dict):
                memory_text = memory_text.get("text") or memory_text.get("content") or memory_text.get("chunk") or str(memory_text)
            memory_text = (memory_text or "").strip()
            if memory_text:
                memory_context_parts.append(f"{i + 1}. {memory_text}")
        if len(memory_context_parts) == 1:
            # Header but no memory items - extraction may be using wrong field names
            logger.warning(
                "Memory retrieval: 0 memories had non-empty text; first result keys: %s",
                list(relevant_memories[0].keys()) if relevant_memories else [],
                extra={"user_id": user_id, "thread_id": thread_id},
            )
        memory_context_parts.append(MEMORY_CONTEXT_FOOTER)
        memory_context = "\n".join(memory_context_parts)
        try:
            await redis.set(cache_key, memory_context, ex=cache_ttl)
        except Exception:
            pass
        logger.debug(
            f"Retrieved {len(relevant_memories)} relevant memories for user {user_id}",
            extra={"user_id": user_id, "thread_id": thread_id, "memories_count": len(relevant_memories)},
        )
        logger.info(
            f"Memory retrieval: found {len(relevant_memories)} relevant memories for user (cross-thread)",
            extra={"user_id": user_id, "thread_id": thread_id},
        )
        return memory_context
    except Exception as e:
        logger.error(f"Error retrieving relevant memories: {e}", exc_info=True)
        return None


store_memory_on_completion = store_conversation_memory
