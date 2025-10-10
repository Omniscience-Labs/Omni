"""
Memory integration helper functions for AI conversation storage.

This module provides helper functions to integrate memory storage
at the end of AI interactions, following the mem0ai pattern.
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
    # Create a deterministic string representation of the conversation
    message_strs = []
    for msg in conversation_messages[-5:]:  # Use last 5 messages for hash
        role = msg.get('role', '')
        content = msg.get('content', '')
        message_strs.append(f"{role}:{content}")

    # Join and hash for consistent deduplication
    content_to_hash = "|".join(message_strs)
    return hashlib.sha256(content_to_hash.encode('utf-8')).hexdigest()[:16]


def _generate_memory_cache_key(user_id: str, thread_id: str, query: str, limit: int) -> str:
    """Generate a cache key for memory retrieval."""
    # Create a deterministic cache key from the parameters
    key_components = f"{user_id}:{thread_id}:{query}:{limit}"
    return f"mem_cache:{hashlib.sha256(key_components.encode()).hexdigest()[:16]}"


async def get_user_id_from_thread(db: DBConnection, thread_id: str) -> Optional[str]:
    """
    Get user_id (account_id) from thread_id - this is the authenticated user.
    
    Args:
        db: Database connection
        thread_id: Thread identifier
        
    Returns:
        User ID (account_id) or None if not found
    """
    try:
        client = await db.client
        result = await client.table('threads').select('account_id').eq('thread_id', thread_id).execute()
        
        if result.data and len(result.data) > 0:
            user_id = result.data[0]['account_id']
            logger.debug(f"Retrieved user_id {user_id} for thread {thread_id}")
            return user_id
        
        logger.warning(f"No user found for thread {thread_id}")
        return None
        
    except Exception as e:
        try:
            error_msg = str(e)
        except Exception:
            # Handle cases where the exception itself is not a proper string
            try:
                error_msg = repr(e)
            except Exception:
                error_msg = f"Exception of type {type(e).__name__} (unable to convert to string)"
        logger.error(f"Error getting user_id from thread {thread_id}: {error_msg}")
        return None


async def get_recent_conversation_messages(db: DBConnection, thread_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Get recent conversation messages from a thread for memory storage.
    
    Args:
        db: Database connection
        thread_id: Thread identifier
        limit: Maximum number of recent messages to retrieve
        
    Returns:
        List of message dictionaries in mem0ai format
    """
    try:
        client = await db.client
        
        # Get recent LLM messages (user and assistant interactions)
        result = await client.table('messages').select('content, type, created_at').eq('thread_id', thread_id).eq('is_llm_message', True).order('created_at', desc=True).limit(limit).execute()
        
        if not result.data:
            return []
        
        # Convert to mem0ai format (reverse to get chronological order)
        messages = []
        for msg_data in reversed(result.data):
            content = msg_data['content']
            
            # Parse content if it's a string
            if isinstance(content, str):
                try:
                    content = json.loads(content)
                except json.JSONDecodeError:
                    logger.warning(f"Failed to parse message content: {content}")
                    continue
            
            # Extract role and content for mem0ai format
            role = content.get('role', msg_data['type'])
            message_content = content.get('content', '')
            
            if role and message_content:
                messages.append({
                    "role": role,
                    "content": str(message_content)
                })
        
        return messages
        
    except Exception as e:
        try:
            error_msg = str(e)
        except Exception:
            # Handle cases where the exception itself is not a proper string
            try:
                error_msg = repr(e)
            except Exception:
                error_msg = f"Exception of type {type(e).__name__} (unable to convert to string)"
        logger.error(f"Error getting conversation messages from thread {thread_id}: {error_msg}")
        return []


async def store_conversation_memory(
    db: DBConnection,
    thread_id: str,
    conversation_messages: Optional[List[Dict[str, Any]]] = None,
    additional_context: Optional[str] = None,
    agent_run_id: Optional[str] = None
) -> bool:
    """
    Store conversation memory at the end of an AI interaction.
    
    This function follows the mem0ai pattern of storing conversation context
    for future reference and context-aware responses. It includes deduplication
    logic to prevent storing the same conversation multiple times.
    
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
        
        # Get user_id from thread
        user_id = await get_user_id_from_thread(db, thread_id)
        if not user_id:
            logger.warning(f"Could not get user_id for thread {thread_id}, skipping memory storage")
            return False
        
        # Get conversation messages if not provided
        if conversation_messages is None:
            conversation_messages = await get_recent_conversation_messages(db, thread_id, limit=10)
        
        if not conversation_messages:
            logger.debug(f"No conversation messages found for thread {thread_id}")
            return False
        
        # Check for recent memory to avoid duplicates using metadata filters
        if agent_run_id:
            # Use metadata filters for efficient deduplication check
            # Only filter by user_id and thread_id as these are the only reliable filterable fields
            dedup_filters = {
                "AND": [
                    {"user_id": user_id}
                ]
            }
            if thread_id:
                dedup_filters["AND"].append({"thread_id": thread_id})

            recent_memories = await memory_service.search_memories(
                query="*",  # Match all memories with these metadata filters
                user_id=user_id,
                thread_id=thread_id,
                limit=5,  # Increase limit to check for potential duplicates
                version="v2",
                filters=dedup_filters
            )

            # Check if we found memories for this thread (exact agent_run_id check will be done via content matching)
            if recent_memories:
                logger.info(f"Found {len(recent_memories)} existing memories for thread {thread_id}, checking for duplicates")
                # For now, we'll proceed with storage and rely on content-based deduplication
                # since agent_run_id may not be filterable in mem0.ai API

        # Compute memory hash for additional deduplication
        memory_hash = _compute_memory_hash(conversation_messages)

        # Additional dedup check using memory_hash for cases without agent_run_id
        if not agent_run_id:
            # Use the same simplified filter structure for hash-based deduplication
            hash_filters = {
                "AND": [
                    {"user_id": user_id}
                ]
            }
            if thread_id:
                hash_filters["AND"].append({"thread_id": thread_id})

            hash_check = await memory_service.search_memories(
                query="*",
                user_id=user_id,
                thread_id=thread_id,
                limit=5,  # Check more memories for potential hash matches
                version="v2",
                filters=hash_filters
            )

            if hash_check:
                logger.info(f"Found {len(hash_check)} existing memories for thread {thread_id}, checking for hash duplicates")
                # For now, we'll proceed with storage and rely on content-based deduplication
                # since memory_hash may not be filterable in mem0.ai API
        
        # Prepare metadata for memory storage
        memory_metadata = {
            "type": "conversation",
            "message_count": len(conversation_messages),
            "stored_at": "conversation_end",
            "memory_hash": memory_hash  # For deduplication
        }

        if agent_run_id:
            memory_metadata["agent_run_id"] = agent_run_id

        if additional_context:
            memory_metadata["additional_context"] = additional_context
        
        # Store memory with mem0ai - pass conversation messages directly for better semantic understanding
        success = await memory_service.add_memory(
            content=conversation_messages,  # Pass messages directly instead of formatted text
            user_id=user_id,
            thread_id=thread_id,
            metadata=memory_metadata
        )
        
        if success:
            logger.info(f"Successfully stored conversation memory for thread {thread_id} (user: {user_id})")
        else:
            logger.warning(f"Failed to store conversation memory for thread {thread_id}")
            
        return success
        
    except Exception as e:
        try:
            error_msg = str(e)
        except Exception:
            # Handle cases where the exception itself is not a proper string
            try:
                error_msg = repr(e)
            except Exception:
                error_msg = f"Exception of type {type(e).__name__} (unable to convert to string)"
        logger.error(f"Error storing conversation memory for thread {thread_id}: {error_msg}", exc_info=True)
        return False


def _format_conversation_for_memory(
    messages: List[Dict[str, Any]], 
    additional_context: Optional[str] = None
) -> str:
    """
    Format conversation messages for memory storage.
    
    Args:
        messages: List of conversation messages
        additional_context: Additional context to include
        
    Returns:
        Formatted memory text
    """
    memory_parts = []
    
    if additional_context:
        memory_parts.append(f"Context: {additional_context}")
    
    # Format conversation
    conversation_parts = []
    for msg in messages:
        role = msg.get('role', 'unknown')
        content = msg.get('content', '')
        
        if role == 'user':
            conversation_parts.append(f"User: {content}")
        elif role == 'assistant':
            conversation_parts.append(f"Assistant: {content}")
    
    if conversation_parts:
        memory_parts.append("Conversation:\n" + "\n".join(conversation_parts))
    
    return "\n\n".join(memory_parts)


async def retrieve_relevant_memories(
    db: DBConnection,
    thread_id: str,
    query: str,
    limit: int = 5
) -> Optional[str]:
    """
    Retrieve relevant memories before sending message to agent.

    This function searches for relevant user memories based on the current
    query/message and returns formatted context to inject before LLM processing.
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

        # Get user_id from thread
        user_id = await get_user_id_from_thread(db, thread_id)
        if not user_id:
            logger.warning(f"Could not get user_id for thread {thread_id}, skipping memory retrieval")
            return None

        # Generate cache key for this request
        cache_key = _generate_memory_cache_key(user_id, thread_id, query, limit)

        # Try to get from cache first
        cached_result = await redis.get(cache_key)
        if cached_result:
            logger.debug(f"Memory cache hit for key: {cache_key}")
            return cached_result.decode('utf-8') if isinstance(cached_result, bytes) else cached_result

        # Cache miss - search for relevant memories using mem0ai v2 API with filters
        # Only use supported filter fields to avoid API errors
        filters = {
            "AND": [
                {"user_id": user_id}
            ]
        }
        if thread_id:
            filters["AND"].append({"thread_id": thread_id})

        relevant_memories = await memory_service.search_memories(
            query=query,
            user_id=user_id,
            thread_id=thread_id,
            limit=limit,
            version="v2",
            filters=filters
        )

        if not relevant_memories:
            logger.debug(f"No relevant memories found for query: {query[:50]}...")
            # Cache empty results too to avoid repeated searches
            await redis.set(cache_key, "", ex=config.MEM0_CACHE_TTL)
            return None

        # Format memories for context injection
        memory_context_parts = [MEMORY_CONTEXT_HEADER]

        for i, memory in enumerate(relevant_memories):
            memory_text = memory.get("memory", memory.get("text", ""))
            if memory_text:
                memory_context_parts.append(f"{i+1}. {memory_text}")

        memory_context_parts.append(MEMORY_CONTEXT_FOOTER)

        memory_context = "\n".join(memory_context_parts)

        # Cache the result
        await redis.set(cache_key, memory_context, ex=config.MEM0_CACHE_TTL)

        logger.debug(
            f"Retrieved {len(relevant_memories)} relevant memories for user {user_id}",
            extra={
                "user_id": user_id,
                "thread_id": thread_id,
                "query": query[:100],
                "memories_count": len(relevant_memories)
            }
        )

        return memory_context

    except Exception as e:
        try:
            error_msg = str(e)
        except Exception:
            # Handle cases where the exception itself is not a proper string
            try:
                error_msg = repr(e)
            except Exception:
                error_msg = f"Exception of type {type(e).__name__} (unable to convert to string)"
        logger.error(f"Error retrieving relevant memories: {error_msg}", exc_info=True)
        return None


# Backwards compatibility - alias for the main function
store_memory_on_completion = store_conversation_memory
