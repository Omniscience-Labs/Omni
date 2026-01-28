"""
Context Management for AgentPress Threads with Supermemory Integration.

This module handles token counting, thread summarization, and long-term 
memory retrieval using Supermemory to prevent context window limitations 
while maintaining user-specific historical context.
"""

import json
import os
from typing import List, Dict, Any, Optional, Union

from litellm.utils import token_counter
from anthropic import Anthropic
from core.services.supabase import DBConnection
from core.utils.logger import logger
from core.ai_models import model_manager
from core.agentpress.prompt_caching import apply_anthropic_caching_strategy
# New Import for Supermemory Service
from core.services.memory_service import MemoryService

DEFAULT_TOKEN_THRESHOLD = 120000

# Module-level singleton clients for memory efficiency
_anthropic_client = None
_bedrock_client = None
_clients_initialized = False


def _get_anthropic_client_singleton():
    """Module-level lazy initialization of Anthropic client (singleton)."""
    global _anthropic_client, _clients_initialized
    if _anthropic_client is None and not _clients_initialized:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if api_key:
            _anthropic_client = Anthropic(api_key=api_key)
        _clients_initialized = True
    return _anthropic_client


def _get_bedrock_client_singleton():
    """Module-level lazy initialization of Bedrock client (singleton)."""
    global _bedrock_client
    if _bedrock_client is None:
        try:
            import boto3
            _bedrock_client = boto3.client('bedrock-runtime', region_name='us-west-2')
        except Exception as e:
            logger.debug(f"Could not initialize Bedrock client: {e}")
    return _bedrock_client


class ContextManager:
    """Manages thread context including token counting, summarization, and Supermemory."""
    
    def __init__(self, token_threshold: int = DEFAULT_TOKEN_THRESHOLD):
        """Initialize the ContextManager."""
        self.db = DBConnection()
        self.token_threshold = token_threshold
        # Initialize Supermemory Service
        self.memory_service = MemoryService()
        
        # Tool output management
        self.keep_recent_tool_outputs = 5  
        # Compression strategy
        self.compression_target_ratio = 0.6  
        self.keep_recent_user_messages = 10  
        self.keep_recent_assistant_messages = 10  

    # --- SUPERMEMORY METHODS ---

    async def get_long_term_context(self, user_id: str, query: str, enterprise_id: str = None) -> str:
        """
        Retrieves relevant long-term memories for the user based on their current query.
        
        Args:
            user_id: The unique identifier for the user.
            query: The current user message to search against.
            enterprise_id: Optional enterprise identifier for broader context.
            
        Returns:
            A formatted string of relevant past context.
        """
        try:
            logger.info(f"🧠 Retrieving long-term context from Supermemory for user: {user_id} (ent: {enterprise_id})")
            # Run sync call in executor to avoid blocking
            import asyncio
            loop = asyncio.get_running_loop()
            context = await loop.run_in_executor(
                None, 
                lambda: self.memory_service.get_context(user_id=user_id, query=query, enterprise_id=enterprise_id)
            )
            
            if context:
                return f"\n### RELEVANT USER HISTORY & PREFERENCES:\n{context}\n"
            return ""
        except Exception as e:
            logger.error(f"Failed to retrieve Supermemory context: {e}")
            return ""

    async def save_conversation_turn(self, user_id: str, user_message: str, assistant_response: str, enterprise_id: str = None):
        """
        Saves a full conversation turn to Supermemory for future retrieval.
        """
        try:
            import asyncio
            loop = asyncio.get_running_loop()
            
            # Save User Input
            await loop.run_in_executor(
                None,
                lambda: self.memory_service.save_chat_turn(user_id=user_id, message=user_message, role="user", enterprise_id=enterprise_id)
            )
            # Save Assistant Response
            await loop.run_in_executor(
                None,
                lambda: self.memory_service.save_chat_turn(user_id=user_id, message=assistant_response, role="assistant", enterprise_id=enterprise_id)
            )
            logger.info(f"✅ Conversation turn saved to Supermemory for user: {user_id} (ent: {enterprise_id})")
        except Exception as e:
            logger.error(f"Failed to save to Supermemory: {e}")

    # --- TOKEN COUNTING & COMPRESSION ---

    def _get_anthropic_client(self):
        """Get the singleton Anthropic client."""
        return _get_anthropic_client_singleton()
    
    def _get_bedrock_client(self):
        """Get the singleton Bedrock client."""
        return _get_bedrock_client_singleton()

    async def count_tokens(self, model: str, messages: List[Dict[str, Any]], system_prompt: Optional[Dict[str, Any]] = None, apply_caching: bool = True) -> int:
        """Count tokens using the correct tokenizer for the model."""
        messages_to_count = messages
        system_to_count = system_prompt
        
        if apply_caching and ('claude' in model.lower() or 'anthropic' in model.lower()):
            try:
                prepared = await apply_anthropic_caching_strategy(
                    system_prompt, messages, model, thread_id=None, force_recalc=False
                )
                system_to_count = None
                messages_to_count = []
                for msg in prepared:
                    if msg.get('role') == 'system':
                        system_to_count = msg
                    else:
                        messages_to_count.append(msg)
            except Exception as e:
                logger.debug(f"Failed to apply caching for counting: {e}")
        
        if 'claude' in model.lower() or 'anthropic' in model.lower():
            try:
                client = self._get_anthropic_client()
                if client:
                    clean_model = model.split('/')[-1] if '/' in model else model
                    clean_messages = []
                    for msg in messages_to_count:
                        if msg.get('role') == 'system':
                            continue  
                        clean_messages.append({
                            'role': msg.get('role'),
                            'content': msg.get('content')
                        })
                    
                    system_content = None
                    if system_to_count and isinstance(system_to_count, dict):
                        system_content = system_to_count.get('content')
                    
                    count_params = {'model': clean_model, 'messages': clean_messages}
                    if system_content:
                        count_params['system'] = system_content
                    
                    result = client.messages.count_tokens(**count_params)
                    return result.input_tokens
            except Exception as e:
                logger.debug(f"Anthropic token counting failed, falling back to LiteLLM: {e}")
        
        elif 'bedrock' in model.lower():
            try:
                bedrock_client = self._get_bedrock_client()
                if bedrock_client:
                    model_id_mapping = {
                        "heol2zyy5v48": "anthropic.claude-3-5-haiku-20241022-v1:0",
                        "few7z4l830xh": "anthropic.claude-3-5-sonnet-20241022-v2:0",
                        "tyj1ks3nj9qf": "anthropic.claude-sonnet-4-20250514-v1:0",
                    }
                    
                    bedrock_model_id = None
                    if "application-inference-profile" in model:
                        profile_id = model.split("/")[-1]
                        bedrock_model_id = model_id_mapping.get(profile_id)
                    
                    if not bedrock_model_id:
                        bedrock_model_id = "anthropic.claude-3-5-haiku-20241022-v1:0"
                    
                    def clean_content_for_bedrock(content):
                        if isinstance(content, str):
                            return [{'text': content}]
                        elif isinstance(content, list):
                            cleaned = []
                            for block in content:
                                if isinstance(block, dict):
                                    if 'text' in block:
                                        cleaned.append({'text': block['text']})
                                        if 'cache_control' in block:
                                            cleaned.append({'cachePoint': {'type': 'default'}})
                            return cleaned if cleaned else [{'text': str(content)}]
                        return [{'text': str(content)}]
                    
                    bedrock_messages = []
                    system_content = None
                    
                    for msg in messages_to_count:
                        if msg.get('role') == 'system':
                            system_content = clean_content_for_bedrock(msg.get('content'))
                            continue
                        
                        bedrock_messages.append({
                            'role': msg.get('role'),
                            'content': clean_content_for_bedrock(msg.get('content'))
                        })
                    
                    input_to_count = {'messages': bedrock_messages}
                    if system_content:
                        input_to_count['system'] = system_content
                    elif system_to_count:
                        input_to_count['system'] = clean_content_for_bedrock(system_to_count.get('content'))
                    
                    response = bedrock_client.count_tokens(
                        modelId=bedrock_model_id,
                        input={'converse': input_to_count}
                    )
                    
                    return response['inputTokens']
            except Exception as e:
                logger.debug(f"Bedrock token counting failed, falling back to LiteLLM: {e}")
        
        if system_to_count:
            return token_counter(model=model, messages=[system_to_count] + messages_to_count)
        else:
            return token_counter(model=model, messages=messages_to_count)

    async def estimate_token_usage(self, prompt_messages: List[Dict[str, Any]], completion_content: str, model: str) -> Dict[str, Any]:
        """Estimate token usage for billing when exact usage is unavailable."""
        try:
            prompt_tokens = await self.count_tokens(model, prompt_messages, apply_caching=False)
            completion_tokens = 0
            if completion_content:
                completion_tokens = token_counter(model=model, text=completion_content)
            
            total_tokens = prompt_tokens + completion_tokens
            logger.warning(f"⚠️ ESTIMATED TOKEN USAGE: prompt={prompt_tokens}, completion={completion_tokens}, total={total_tokens}")
            
            return {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "estimated": True
            }
        except Exception as e:
            logger.error(f"Context manager estimation failed: {e}")
            return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "estimated": True}

    def is_tool_result_message(self, msg: Dict[str, Any]) -> bool:
        """Check if a message is a tool result message."""
        if not isinstance(msg, dict):
            return False
        if msg.get('role') == 'tool' or 'tool_call_id' in msg:
            return True
        if msg.get('role') == 'user':
            content = msg.get('content')
            if isinstance(content, str):
                try:
                    parsed = json.loads(content)
                    if isinstance(parsed, dict) and ('success' in parsed or 'output' in parsed):
                        return True
                except:
                    pass
        return False

    def group_messages_by_tool_calls(self, messages: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        """Group messages into atomic units respecting tool call pairing."""
        if not messages: return []
        groups, current_group = [], []
        expected_tool_call_ids = set()
        
        for msg in messages:
            tool_call_ids = self.get_tool_call_ids_from_message(msg)
            if tool_call_ids:
                if current_group: groups.append(current_group)
                current_group = [msg]
                expected_tool_call_ids = set(tool_call_ids)
            elif self.is_tool_result_message(msg):
                tc_id = msg.get('tool_call_id')
                if tc_id in expected_tool_call_ids:
                    current_group.append(msg)
                    expected_tool_call_ids.discard(tc_id)
                    if not expected_tool_call_ids:
                        groups.append(current_group)
                        current_group = []
                else:
                    if current_group: groups.append(current_group)
                    groups.append([msg])
                    current_group, expected_tool_call_ids = [], set()
            else:
                if current_group: groups.append(current_group)
                groups.append([msg])
                current_group, expected_tool_call_ids = [], set()
        if current_group: groups.append(current_group)
        return groups
    
    def validate_tool_call_pairing(self, messages: List[Dict[str, Any]]) -> tuple[bool, List[str], List[str]]:
        """
        Validate that all tool calls have corresponding results and vice versa.
        Returns: (is_valid, orphaned_tool_result_ids, unanswered_tool_call_ids)
        """
        tool_calls = {}  # id -> message_index
        tool_results = {} # id -> message_index
        
        # First pass: map all calls and results
        for i, msg in enumerate(messages):
            # Track tool calls
            if msg.get('role') == 'assistant' and 'tool_calls' in msg:
                for tc in msg.get('tool_calls', []):
                    if tc.get('id'):
                        tool_calls[tc['id']] = i
            
            # Track tool results
            if self.is_tool_result_message(msg):
                tc_id = msg.get('tool_call_id')
                if tc_id:
                    tool_results[tc_id] = i
        
        orphaned_ids = [tr_id for tr_id in tool_results if tr_id not in tool_calls]
        unanswered_ids = [tc_id for tc_id in tool_calls if tc_id not in tool_results]
        
        is_valid = len(orphaned_ids) == 0 and len(unanswered_ids) == 0
        return is_valid, orphaned_ids, unanswered_ids

    def repair_tool_call_pairing(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Attempt to repair message history by removing orphaned results and 
        injecting failure responses for unanswered calls.
        """
        is_valid, orphaned_ids, unanswered_ids = self.validate_tool_call_pairing(messages)
        if is_valid:
            return messages
            
        new_messages = []
        orphaned_set = set(orphaned_ids)
        unanswered_set = set(unanswered_ids)
        
        # Filter out orphaned results
        for msg in messages:
            if self.is_tool_result_message(msg):
                if msg.get('tool_call_id') in orphaned_set:
                    logger.warning(f"🔧 Removing orphaned tool result: {msg.get('tool_call_id')}")
                    continue
            new_messages.append(msg)
            
        # Inject error responses for unanswered calls
        # We need to insert them immediately after the message that made the call
        # or at the end if that's where we are.
        # This is complex because we need to preserve order.
        
        final_messages = []
        for msg in new_messages:
            final_messages.append(msg)
            
            if msg.get('role') == 'assistant' and 'tool_calls' in msg:
                for tc in msg.get('tool_calls', []):
                    tc_id = tc.get('id')
                    if tc_id in unanswered_set:
                        logger.warning(f"🔧 Injecting error for unanswered tool call: {tc_id}")
                        final_messages.append({
                            "role": "tool",
                            "tool_call_id": tc_id,
                            "content": json.dumps({
                                "status": "error",
                                "error": "Tool execution failed: Response missing from history (auto-repaired)"
                            })
                        })
                        
        return final_messages

    def get_tool_call_ids_from_message(self, msg: Dict[str, Any]) -> List[str]:
        if not isinstance(msg, dict) or msg.get('role') != 'assistant': return []
        return [tc.get('id') for tc in msg.get('tool_calls', []) if tc.get('id')]

    def flatten_message_groups(self, groups: List[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        return [msg for group in groups for msg in group]

    def remove_old_tool_outputs(self, messages: List[Dict[str, Any]], keep_last_n: int = 8) -> List[Dict[str, Any]]:
        tool_indices = [i for i, msg in enumerate(messages) if self.is_tool_result_message(msg)]
        if len(tool_indices) <= keep_last_n: return messages
        
        to_compress = set(tool_indices[:-keep_last_n])
        result = []
        for i, msg in enumerate(messages):
            if i in to_compress:
                compressed = msg.copy()
                compressed['content'] = f"[Tool output compressed] ID: {msg.get('message_id')}"
                result.append(compressed)
            else:
                result.append(msg)
        return result

    async def compress_messages(self, messages: List[Dict[str, Any]], llm_model: str, max_tokens: Optional[int] = 41000, actual_total_tokens: Optional[int] = None, system_prompt: Optional[Dict[str, Any]] = None, thread_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Core tiered compression logic."""
        context_window = model_manager.get_context_window(llm_model)
        max_tokens = context_window - 32000 # Safety margin
        
        max_tokens = context_window - 32000 # Safety margin
        
        # Use provided total if available to skip re-counting
        if actual_total_tokens is not None:
            current_tokens = actual_total_tokens
        else:
            current_tokens = await self.count_tokens(llm_model, messages, system_prompt, apply_caching=True)
            
        if current_tokens <= max_tokens:
            return self.middle_out_messages(messages)

        # Tiered Compression
        result = self.remove_old_tool_outputs(messages, self.keep_recent_tool_outputs)
        current_tokens = await self.count_tokens(llm_model, result, system_prompt, apply_caching=True)
        
        if current_tokens > max_tokens:
            result = self.middle_out_messages(result, max_messages=100)
            
        return result

    def middle_out_messages(self, messages: List[Dict[str, Any]], max_messages: int = 320) -> List[Dict[str, Any]]:
        """Remove messages from the middle while preserving tool-call integrity."""
        if len(messages) <= max_messages: return messages
        groups = self.group_messages_by_tool_calls(messages)
        if len(groups) < 4: return messages
        
        keep_each_end = max(2, len(groups) // 4)
        kept_groups = groups[:keep_each_end] + groups[-keep_each_end:]
        return self.flatten_message_groups(kept_groups)