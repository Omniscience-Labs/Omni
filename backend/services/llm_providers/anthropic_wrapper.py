"""
Anthropic API wrapper for handling Claude 3.5/4.5 tool_use format.

This module provides a wrapper around LiteLLM's Anthropic integration that properly
handles Claude's content block format where tool_use blocks are embedded in the content
list rather than as a separate tool_calls field.
"""

from typing import Union, Dict, Any, Optional, List, AsyncGenerator
import json
from core.utils.logger import logger
from core.utils.json_helpers import parse_claude_tool_calls, extract_text_from_claude_content
from core.services.llm import make_llm_api_call, LLMError


async def anthropic_completion(
    messages: List[Dict[str, Any]],
    model_name: str,
    temperature: float = 0,
    max_tokens: Optional[int] = None,
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: str = "auto",
    stream: bool = False,
    enable_thinking: Optional[bool] = False,
    reasoning_effort: Optional[str] = "low",
    **kwargs
) -> Union[Dict[str, Any], AsyncGenerator]:
    """
    Make an Anthropic API call with proper tool_use handling.
    
    This wrapper ensures that:
    1. Messages are properly formatted for Anthropic (content as list of blocks)
    2. Tool responses are properly converted from tool_use blocks
    3. Responses maintain Claude's content block format
    
    Args:
        messages: List of message dictionaries
        model_name: Anthropic model name (e.g., "claude-3-5-sonnet-20241022")
        temperature: Sampling temperature
        max_tokens: Maximum tokens in response
        tools: List of tool definitions
        tool_choice: Tool selection strategy ("auto", "none", or tool name)
        stream: Whether to stream the response
        enable_thinking: Enable reasoning mode
        reasoning_effort: Reasoning effort level ("low", "medium", "high")
        **kwargs: Additional parameters passed to make_llm_api_call
        
    Returns:
        API response or streaming generator
    """
    # Ensure model name is Anthropic format
    if not ("claude" in model_name.lower() or "anthropic" in model_name.lower()):
        logger.warning(f"Model {model_name} may not be Anthropic - tool_use handling may not work correctly")
    
    # Make the API call through LiteLLM
    try:
        response = await make_llm_api_call(
            messages=messages,
            model_name=model_name,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            tool_choice=tool_choice,
            stream=stream,
            enable_thinking=enable_thinking,
            reasoning_effort=reasoning_effort,
            **kwargs
        )
        
        # For streaming responses, wrap to ensure tool_use blocks are parsed correctly
        if stream and hasattr(response, '__aiter__'):
            return _wrap_anthropic_stream(response)
        
        # For non-streaming, ensure response format is correct
        return _normalize_anthropic_response(response)
        
    except Exception as e:
        logger.error(f"Anthropic API call failed: {str(e)}", exc_info=True)
        raise LLMError(f"Anthropic API call failed: {str(e)}")


async def _wrap_anthropic_stream(response: AsyncGenerator) -> AsyncGenerator:
    """
    Wrap streaming response to ensure tool_use blocks are properly handled.
    """
    async for chunk in response:
        # Ensure chunk has proper structure
        if isinstance(chunk, dict):
            # Check if this chunk contains tool_use blocks
            if 'delta' in chunk:
                delta = chunk['delta']
                if isinstance(delta, dict) and 'content' in delta:
                    content = delta['content']
                    # Parse tool_use blocks if present
                    if isinstance(content, list):
                        tool_calls = parse_claude_tool_calls(content)
                        if tool_calls:
                            # Add tool_calls field for compatibility
                            chunk['delta']['tool_calls'] = tool_calls
            
            yield chunk
        else:
            yield chunk


def _normalize_anthropic_response(response: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize Anthropic response to ensure tool_use blocks are accessible.
    
    Claude returns tool_use blocks in the content list, but we also want
    them accessible via tool_calls for compatibility.
    """
    if not isinstance(response, dict):
        return response
    
    # Check if response has choices (LiteLLM format)
    if 'choices' in response:
        for choice in response.get('choices', []):
            message = choice.get('message', {})
            content = message.get('content', '')
            
            # Parse tool_use blocks from content
            if isinstance(content, list):
                tool_calls = parse_claude_tool_calls(content)
                if tool_calls:
                    # Add tool_calls for compatibility
                    message['tool_calls'] = tool_calls
                    choice['message'] = message
    
    # Check direct message format
    elif 'content' in response:
        content = response['content']
        if isinstance(content, list):
            tool_calls = parse_claude_tool_calls(content)
            if tool_calls:
                response['tool_calls'] = tool_calls
    
    return response


def extract_tool_use_from_content(content: Union[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """
    Extract tool_use blocks from Claude content format.
    
    Args:
        content: Content from Claude response (can be string or list of blocks)
        
    Returns:
        List of tool call dictionaries
    """
    return parse_claude_tool_calls(content)


def has_tool_use_blocks(content: Union[str, List[Dict[str, Any]]]) -> bool:
    """
    Check if content contains tool_use blocks.
    
    Args:
        content: Content to check
        
    Returns:
        True if tool_use blocks are present
    """
    if not content:
        return False
    
    if isinstance(content, list):
        return any(
            isinstance(block, dict) and block.get('type') == 'tool_use'
            for block in content
        )
    
    return False

