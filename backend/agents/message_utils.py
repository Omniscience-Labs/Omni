"""
Message utilities for converting between OpenAI and Anthropic message formats.

This module handles conversion between:
- OpenAI format: tool_calls as separate field
- Anthropic format: tool_use blocks embedded in content list
"""

from typing import List, Dict, Any, Optional
import json
from core.utils.logger import logger
from core.utils.json_helpers import parse_claude_tool_calls, safe_json_parse


def convert_openai_to_anthropic(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Convert OpenAI-format messages to Anthropic format.
    
    OpenAI format:
    {
        "role": "assistant",
        "content": "...",
        "tool_calls": [{"id": "...", "function": {"name": "...", "arguments": "..."}}]
    }
    
    Anthropic format:
    {
        "role": "assistant",
        "content": [
            {"type": "text", "text": "..."},
            {"type": "tool_use", "id": "...", "name": "...", "input": {...}}
        ]
    }
    
    Args:
        messages: List of messages in OpenAI format
        
    Returns:
        List of messages in Anthropic format
    """
    converted = []
    
    for message in messages:
        converted_msg = message.copy()
        role = message.get('role')
        content = message.get('content', '')
        tool_calls = message.get('tool_calls', [])
        
        # Handle assistant messages with tool_calls
        if role == 'assistant' and tool_calls:
            # Ensure content is a list
            if not isinstance(content, list):
                # Convert string content to text block
                content_blocks = []
                if content:
                    content_blocks.append({'type': 'text', 'text': str(content)})
                else:
                    content_blocks.append({'type': 'text', 'text': ''})
            else:
                content_blocks = content.copy()
            
            # Convert tool_calls to tool_use blocks
            for tool_call in tool_calls:
                if isinstance(tool_call, dict):
                    # OpenAI format: {"id": "...", "function": {"name": "...", "arguments": "..."}}
                    if 'function' in tool_call:
                        function = tool_call['function']
                        tool_name = function.get('name', '')
                        tool_args = function.get('arguments', '{}')
                        
                        # Parse arguments if string
                        if isinstance(tool_args, str):
                            tool_input = safe_json_parse(tool_args)
                        else:
                            tool_input = tool_args
                        
                        tool_use_block = {
                            'type': 'tool_use',
                            'id': tool_call.get('id', ''),
                            'name': tool_name,
                            'input': tool_input
                        }
                        content_blocks.append(tool_use_block)
                    
                    # Already in tool_use format
                    elif tool_call.get('type') == 'tool_use':
                        content_blocks.append(tool_call)
            
            converted_msg['content'] = content_blocks
            # Remove tool_calls (Anthropic uses content blocks)
            converted_msg.pop('tool_calls', None)
        
        # Handle tool messages (convert to Anthropic format)
        elif role == 'tool':
            # OpenAI format: {"role": "tool", "content": "...", "tool_call_id": "..."}
            # Anthropic format: {"role": "user", "content": [{"type": "tool_result", ...}]}
            tool_call_id = message.get('tool_call_id', '')
            tool_content = message.get('content', '')
            
            # Convert to Anthropic tool_result block
            tool_result_block = {
                'type': 'tool_result',
                'tool_use_id': tool_call_id,
                'content': tool_content
            }
            
            converted_msg = {
                'role': 'user',
                'content': [tool_result_block]
            }
        
        converted.append(converted_msg)
    
    return converted


def convert_anthropic_to_openai(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Convert Anthropic-format messages to OpenAI format.
    
    Args:
        messages: List of messages in Anthropic format
        
    Returns:
        List of messages in OpenAI format
    """
    converted = []
    
    for message in messages:
        converted_msg = message.copy()
        role = message.get('role')
        content = message.get('content', '')
        
        # Handle assistant messages with content blocks
        if role == 'assistant' and isinstance(content, list):
            # Extract text and tool_use blocks
            text_parts = []
            tool_calls = []
            
            for block in content:
                if isinstance(block, dict):
                    block_type = block.get('type')
                    
                    if block_type == 'text':
                        text_parts.append(block.get('text', ''))
                    
                    elif block_type == 'tool_use':
                        # Convert tool_use to OpenAI tool_call format
                        tool_call = {
                            'id': block.get('id', ''),
                            'type': 'function',
                            'function': {
                                'name': block.get('name', ''),
                                'arguments': json.dumps(block.get('input', {}))
                            }
                        }
                        tool_calls.append(tool_call)
            
            # Set content (join text parts or use first text block)
            if text_parts:
                converted_msg['content'] = '\n'.join(text_parts) if len(text_parts) > 1 else text_parts[0]
            else:
                converted_msg['content'] = ''
            
            # Add tool_calls if present
            if tool_calls:
                converted_msg['tool_calls'] = tool_calls
        
        # Handle tool_result blocks (convert to tool role)
        elif role == 'user' and isinstance(content, list):
            tool_result_blocks = [
                block for block in content
                if isinstance(block, dict) and block.get('type') == 'tool_result'
            ]
            
            if tool_result_blocks:
                # Create separate tool messages for each tool_result
                for tool_result in tool_result_blocks:
                    tool_msg = {
                        'role': 'tool',
                        'tool_call_id': tool_result.get('tool_use_id', ''),
                        'content': tool_result.get('content', '')
                    }
                    converted.append(tool_msg)
                
                # Also include any text content
                text_blocks = [
                    block.get('text', '') for block in content
                    if isinstance(block, dict) and block.get('type') == 'text'
                ]
                if text_blocks:
                    converted_msg = {
                        'role': 'user',
                        'content': '\n'.join(text_blocks)
                    }
                    converted.append(converted_msg)
                continue
        
        converted.append(converted_msg)
    
    return converted


def extract_tool_calls_from_message(message: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Extract tool calls from a message regardless of format.
    
    Supports both OpenAI and Anthropic formats.
    
    Args:
        message: Message dictionary
        
    Returns:
        List of tool call dictionaries
    """
    # Check OpenAI format
    if 'tool_calls' in message:
        return message['tool_calls']
    
    # Check Anthropic format (content blocks)
    content = message.get('content', '')
    if isinstance(content, list):
        return parse_claude_tool_calls(content)
    
    return []


def has_tool_calls(message: Dict[str, Any]) -> bool:
    """
    Check if a message contains tool calls.
    
    Args:
        message: Message dictionary
        
    Returns:
        True if message contains tool calls
    """
    # Check OpenAI format
    if 'tool_calls' in message and message['tool_calls']:
        return True
    
    # Check Anthropic format
    content = message.get('content', '')
    if isinstance(content, list):
        return any(
            isinstance(block, dict) and block.get('type') == 'tool_use'
            for block in content
        )
    
    return False

