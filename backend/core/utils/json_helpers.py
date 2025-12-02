"""
JSON helper utilities for handling both legacy (string) and new (dict/list) formats.

These utilities help with the transition from storing JSON as strings to storing
them as proper JSONB objects in the database.
"""

import json
from typing import Any, Union, Dict, List


def ensure_dict(value: Union[str, Dict[str, Any], None], default: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Ensure a value is a dictionary.
    
    Handles:
    - None -> returns default or {}
    - Dict -> returns as-is
    - JSON string -> parses and returns dict
    - Other -> returns default or {}
    
    Args:
        value: The value to ensure is a dict
        default: Default value if conversion fails
        
    Returns:
        A dictionary
    """
    if default is None:
        default = {}
        
    if value is None:
        return default
        
    if isinstance(value, dict):
        return value
        
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
            return default
        except (json.JSONDecodeError, TypeError):
            return default
            
    return default


def ensure_list(value: Union[str, List[Any], None], default: List[Any] = None) -> List[Any]:
    """
    Ensure a value is a list.
    
    Handles:
    - None -> returns default or []
    - List -> returns as-is
    - JSON string -> parses and returns list
    - Other -> returns default or []
    
    Args:
        value: The value to ensure is a list
        default: Default value if conversion fails
        
    Returns:
        A list
    """
    if default is None:
        default = []
        
    if value is None:
        return default
        
    if isinstance(value, list):
        return value
        
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return parsed
            return default
        except (json.JSONDecodeError, TypeError):
            return default
            
    return default


def safe_json_parse(value: Union[str, Dict, List, Any], default: Any = None) -> Any:
    """
    Safely parse a value that might be JSON string or already parsed.
    
    This handles the transition period where some data might be stored as
    JSON strings (old format) and some as proper objects (new format).
    
    Args:
        value: The value to parse
        default: Default value if parsing fails
        
    Returns:
        Parsed value or default
    """
    if value is None:
        return default
        
    # If it's already a dict or list, return as-is
    if isinstance(value, (dict, list)):
        return value
        
    # If it's a string, try to parse it
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            # If it's not valid JSON, return the string itself
            return value
            
    # For any other type, return as-is
    return value


def to_json_string(value: Any) -> str:
    """
    Convert a value to a JSON string if needed.
    
    This is used for backwards compatibility when yielding data that
    expects JSON strings.
    
    Args:
        value: The value to convert
        
    Returns:
        JSON string representation
    """
    if isinstance(value, str):
        # If it's already a string, check if it's valid JSON
        try:
            json.loads(value)
            return value  # It's already a JSON string
        except (json.JSONDecodeError, TypeError):
            # It's a plain string, encode it as JSON
            return json.dumps(value)
    
    # For all other types, convert to JSON
    return json.dumps(value)


def format_for_yield(message_object: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format a message object for yielding, ensuring content and metadata are JSON strings.
    
    This maintains backward compatibility with clients expecting JSON strings
    while the database now stores proper objects.
    
    Args:
        message_object: The message object from the database
        
    Returns:
        Message object with content and metadata as JSON strings
    """
    if not message_object:
        return message_object
        
    # Create a copy to avoid modifying the original
    formatted = message_object.copy()
    
    # Ensure content is a JSON string
    if 'content' in formatted and not isinstance(formatted['content'], str):
        formatted['content'] = json.dumps(formatted['content'])
        
    # Ensure metadata is a JSON string
    if 'metadata' in formatted and not isinstance(formatted['metadata'], str):
        formatted['metadata'] = json.dumps(formatted['metadata'])
        
    return formatted


def parse_claude_tool_calls(content: Union[str, List[Dict[str, Any]], Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Parse Claude tool_use blocks from message content.
    
    Supports Claude 3.5/4.5 format where content is a list of blocks:
    - {"type": "text", "text": "..."}
    - {"type": "tool_use", "id": "...", "name": "...", "input": {...}}
    
    Also supports legacy formats for backward compatibility:
    - OpenAI-style: {"tool_calls": [...]}
    - String content (will try to parse)
    
    Args:
        content: Message content - can be string, list of blocks, or dict
        
    Returns:
        List of tool call objects with structure:
        {
            "id": "...",
            "name": "...",
            "input": {...},
            "type": "function"  # For compatibility
        }
    """
    tool_calls = []
    
    # Handle None or empty content
    if not content:
        return tool_calls
    
    # Parse string content if needed
    if isinstance(content, str):
        try:
            parsed = json.loads(content)
            content = parsed
        except (json.JSONDecodeError, TypeError):
            # Not JSON, return empty (no tool calls in plain text)
            return tool_calls
    
    # Handle list of content blocks (Claude format)
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict):
                block_type = block.get('type')
                
                # Claude tool_use block format
                if block_type == 'tool_use':
                    tool_use_id = block.get('id')
                    tool_name = block.get('name', '')
                    tool_input = block.get('input', {})
                    
                    if tool_use_id and tool_name:
                        tool_calls.append({
                            "id": tool_use_id,
                            "name": tool_name,
                            "input": tool_input,
                            "type": "function",  # For compatibility
                            "function": {  # For OpenAI-style compatibility
                                "name": tool_name,
                                "arguments": json.dumps(tool_input) if isinstance(tool_input, dict) else str(tool_input)
                            }
                        })
    
    # Handle dict with tool_calls (OpenAI-style or legacy)
    elif isinstance(content, dict):
        # Check for top-level tool_calls
        if 'tool_calls' in content:
            for tool_call in content.get('tool_calls', []):
                if isinstance(tool_call, dict):
                    # OpenAI-style format
                    if 'function' in tool_call:
                        tool_calls.append({
                            "id": tool_call.get('id', ''),
                            "name": tool_call['function'].get('name', ''),
                            "input": safe_json_parse(tool_call['function'].get('arguments', '{}')),
                            "type": tool_call.get('type', 'function'),
                            "function": tool_call['function']
                        })
                    # Claude tool_use format in tool_calls array
                    elif tool_call.get('type') == 'tool_use':
                        tool_calls.append({
                            "id": tool_call.get('id', ''),
                            "name": tool_call.get('name', ''),
                            "input": tool_call.get('input', {}),
                            "type": "function",
                            "function": {
                                "name": tool_call.get('name', ''),
                                "arguments": json.dumps(tool_call.get('input', {}))
                            }
                        })
        
        # Check if content itself is a tool_use block
        elif content.get('type') == 'tool_use':
            tool_calls.append({
                "id": content.get('id', ''),
                "name": content.get('name', ''),
                "input": content.get('input', {}),
                "type": "function",
                "function": {
                    "name": content.get('name', ''),
                    "arguments": json.dumps(content.get('input', {}))
                }
            })
    
    return tool_calls


def extract_text_from_claude_content(content: Union[str, List[Dict[str, Any]], Dict[str, Any]]) -> str:
    """
    Extract text content from Claude message format.
    
    Handles Claude 3.5/4.5 content blocks format:
    - {"type": "text", "text": "..."}
    - {"type": "tool_use", ...}
    
    Args:
        content: Message content - can be string, list of blocks, or dict
        
    Returns:
        Extracted text content as string
    """
    # Handle None or empty
    if not content:
        return ""
    
    # If already a string, return as-is
    if isinstance(content, str):
        # Try to parse as JSON first
        try:
            parsed = json.loads(content)
            content = parsed
        except (json.JSONDecodeError, TypeError):
            return content  # Return as-is if not JSON
    
    # Handle list of content blocks (Claude format)
    if isinstance(content, list):
        text_parts = []
        for block in content:
            if isinstance(block, dict):
                block_type = block.get('type')
                if block_type == 'text':
                    text_parts.append(block.get('text', ''))
        return ''.join(text_parts)
    
    # Handle dict - extract text field or content field
    if isinstance(content, dict):
        # Check for text field
        if 'text' in content:
            return str(content['text'])
        # Check for content field (might be string or list)
        if 'content' in content:
            return extract_text_from_claude_content(content['content'])
        # Fallback: try to get string representation
        return str(content.get('content', ''))
    
    # Fallback: convert to string
    return str(content) 