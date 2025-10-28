"""
LLM API interface for making calls to various language models.

This module provides a unified interface for making API calls to different LLM providers
using LiteLLM with simplified error handling and clean parameter management.
"""

from typing import Union, Dict, Any, Optional, AsyncGenerator, List
import os
import asyncio
import litellm
from litellm.router import Router
from litellm.files.main import ModelResponse
from core.utils.logger import logger
from core.utils.config import config
from core.agentpress.error_processor import ErrorProcessor

# Configure LiteLLM
<<<<<<< HEAD
os.environ['LITELLM_LOG'] = 'INFO'  # Reduced verbosity
=======
# os.environ['LITELLM_LOG'] = 'DEBUG'
# litellm.set_verbose = True  # Enable verbose logging
>>>>>>> upstream/PRODUCTION
litellm.modify_params = True
litellm.drop_params = True

# Enable additional debug logging
# import logging
# litellm_logger = logging.getLogger("LiteLLM")
# litellm_logger.setLevel(logging.DEBUG)

# Constants
MAX_RETRIES = 3
provider_router = None


class LLMError(Exception):
    """Exception for LLM-related errors."""
    pass

def setup_api_keys() -> None:
    """Set up API keys from environment variables."""
    if not config:
        logger.warning("Config not loaded - skipping API key setup")
        return
        
    providers = [
        "OPENAI",
        "ANTHROPIC",
        "GROQ",
        "OPENROUTER",
        "XAI",
        "MORPH",
        "GEMINI",
        "OPENAI_COMPATIBLE",
    ]
    
    for provider in providers:
<<<<<<< HEAD
        key = getattr(config, f"{provider}_API_KEY")
        if key:
            # logger.debug(f"API key set for provider: {provider}")
            pass
        else:
            logger.warning(f"No API key found for provider: {provider}")

    # Set up OpenRouter API base if not already set
    if config.OPENROUTER_API_KEY and config.OPENROUTER_API_BASE:
        os.environ["OPENROUTER_API_BASE"] = config.OPENROUTER_API_BASE
        # logger.debug(f"Set OPENROUTER_API_BASE to {config.OPENROUTER_API_BASE}")


    # Set up AWS Bedrock credentials
    aws_access_key = config.AWS_ACCESS_KEY_ID
    aws_secret_key = config.AWS_SECRET_ACCESS_KEY
    aws_region = config.AWS_REGION_NAME

    if aws_access_key and aws_secret_key and aws_region:
        logger.debug(f"AWS Bedrock configured for region: {aws_region}")
        # Configure LiteLLM to use AWS credentials
        os.environ["AWS_ACCESS_KEY_ID"] = aws_access_key
        os.environ["AWS_SECRET_ACCESS_KEY"] = aws_secret_key
        os.environ["AWS_REGION_NAME"] = aws_region
    else:
        logger.warning(f"Missing AWS credentials for Bedrock integration - access_key: {bool(aws_access_key)}, secret_key: {bool(aws_secret_key)}, region: {aws_region}")

=======
        try:
            key = getattr(config, f"{provider}_API_KEY", None)
            if key:
                # logger.debug(f"API key set for provider: {provider}")
                pass
            else:
                logger.debug(f"No API key found for provider: {provider} (this is normal if not using this provider)")
        except AttributeError as e:
            logger.debug(f"Could not access {provider}_API_KEY: {e}")

    # Set up OpenRouter API base if not already set
    if hasattr(config, 'OPENROUTER_API_KEY') and hasattr(config, 'OPENROUTER_API_BASE'):
        if config.OPENROUTER_API_KEY and config.OPENROUTER_API_BASE:
            os.environ["OPENROUTER_API_BASE"] = config.OPENROUTER_API_BASE
            # logger.debug(f"Set OPENROUTER_API_BASE to {config.OPENROUTER_API_BASE}")

    # Set up AWS Bedrock bearer token authentication
    if hasattr(config, 'AWS_BEARER_TOKEN_BEDROCK'):
        bedrock_token = config.AWS_BEARER_TOKEN_BEDROCK
        if bedrock_token:
            os.environ["AWS_BEARER_TOKEN_BEDROCK"] = bedrock_token
            logger.debug("AWS Bedrock bearer token configured")
        else:
            logger.debug("AWS_BEARER_TOKEN_BEDROCK not configured - Bedrock models will not be available")

>>>>>>> upstream/PRODUCTION
def setup_provider_router(openai_compatible_api_key: str = None, openai_compatible_api_base: str = None):
    global provider_router
    
    # Get config values safely
    config_openai_key = getattr(config, 'OPENAI_COMPATIBLE_API_KEY', None) if config else None
    config_openai_base = getattr(config, 'OPENAI_COMPATIBLE_API_BASE', None) if config else None
    
    model_list = [
        {
            "model_name": "openai-compatible/*", # support OpenAI-Compatible LLM provider
            "litellm_params": {
                "model": "openai/*",
                "api_key": openai_compatible_api_key or config_openai_key,
                "api_base": openai_compatible_api_base or config_openai_base,
            },
        },
        {
            "model_name": "*", # supported LLM provider by LiteLLM
            "litellm_params": {
                "model": "*",
            },
        },
    ]
    
    # Configure fallbacks: MAP-tagged Bedrock models -> Direct Anthropic API
    fallbacks = [
        # MAP-tagged Bedrock Haiku 4.5 -> Anthropic Haiku 4.5
        {
            "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/cyuh6gekrmmh": [
                "anthropic/claude-haiku-4-5-20251001-v1:0"
            ]
        },
        # MAP-tagged Bedrock Sonnet 4.5 -> Anthropic Sonnet 4.5
        {
            "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/pe55zlhpikcf": [
                "anthropic/claude-sonnet-4-5-20250929"
            ]
        },
        # MAP-tagged Bedrock Sonnet 4 -> Anthropic Sonnet 4
        {
            "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/4vac4byw7fqr": [
                "anthropic/claude-sonnet-4-20250514"
            ]
        },
        # Legacy fallbacks (keeping for backward compatibility)
        {
            "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:inference-profile/global.anthropic.claude-sonnet-4-5-20250929-v1:0": [
                "anthropic/claude-sonnet-4-5-20250929"
            ]
        },
        {
            "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:inference-profile/us.anthropic.claude-sonnet-4-20250514-v1:0": [
                "anthropic/claude-sonnet-4-20250514"
            ]
        },
        # Bedrock Sonnet 3.7 -> Anthropic Sonnet 3.7
        {
            "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:inference-profile/us.anthropic.claude-3-7-sonnet-20250219-v1:0": [
                "anthropic/claude-3-7-sonnet-latest"
            ]
        }
    ]
    
    provider_router = Router(
        model_list=model_list,
        retry_after=15,
        fallbacks=fallbacks,
    )
    
    logger.info(f"Configured LiteLLM Router with {len(fallbacks)} fallback rules")

<<<<<<< HEAD
def _configure_token_limits(params: Dict[str, Any], model_name: str, max_tokens: Optional[int]) -> None:
    """Configure token limits based on model type."""
    # Only set max_tokens if explicitly provided - let providers use their defaults otherwise
    if max_tokens is None:
        # logger.debug(f"No max_tokens specified, using provider defaults for model: {model_name}")
        return
    
    if model_name.startswith("bedrock/") and "claude-3-7" in model_name:
        # For Claude 3.7 in Bedrock, do not set max_tokens or max_tokens_to_sample
        # as it causes errors with inference profiles
        # logger.debug(f"Skipping max_tokens for Claude 3.7 model: {model_name}")
        return
    
    is_openai_o_series = 'o1' in model_name
    is_openai_gpt5 = 'gpt-5' in model_name
    param_name = "max_completion_tokens" if (is_openai_o_series or is_openai_gpt5) else "max_tokens"
    params[param_name] = max_tokens
    # logger.debug(f"Set {param_name}={max_tokens} for model: {model_name}")

def _configure_anthropic(params: Dict[str, Any], model_name: str, messages: List[Dict[str, Any]]) -> None:
    """Configure Anthropic-specific parameters."""
    if not ("claude" in model_name.lower() or "anthropic" in model_name.lower()):
        return
    
    # Include prompt caching and context-1m beta features
    params["extra_headers"] = {
        "anthropic-beta": "prompt-caching-2024-07-31,context-1m-2025-08-07"
    }
    # logger.debug(f"Added Anthropic-specific headers for prompt caching and context-1m")

def _configure_openrouter(params: Dict[str, Any], model_name: str) -> None:
    """Configure OpenRouter-specific parameters."""
    if not model_name.startswith("openrouter/"):
        return
    
    # logger.debug(f"Preparing OpenRouter parameters for model: {model_name}")

    # Add optional site URL and app name from config
    site_url = config.OR_SITE_URL
    app_name = config.OR_APP_NAME
    if site_url or app_name:
        extra_headers = params.get("extra_headers", {})
        if site_url:
            extra_headers["HTTP-Referer"] = site_url
        if app_name:
            extra_headers["X-Title"] = app_name
        params["extra_headers"] = extra_headers
        # logger.debug(f"Added OpenRouter site URL and app name to headers")

def _configure_bedrock(params: Dict[str, Any], model_name: str, model_id: Optional[str]) -> None:
    """Configure Bedrock-specific parameters."""
    if not model_name.startswith("bedrock/"):
        return
    
    # logger.debug(f"Preparing AWS Bedrock parameters for model: {model_name}")

    # Auto-set model_id for Claude 3.7 Sonnet if not provided
    if not model_id and "anthropic.claude-3-7-sonnet" in model_name:
        params["model_id"] = "arn:aws:bedrock:us-west-2:935064898258:inference-profile/us.anthropic.claude-3-7-sonnet-20250219-v1:0"
        # logger.debug(f"Auto-set model_id for Claude 3.7 Sonnet: {params['model_id']}")

def _configure_openai_gpt5(params: Dict[str, Any], model_name: str) -> None:
    """Configure OpenAI GPT-5 specific parameters."""
    if "gpt-5" not in model_name:
        return
    

    # Drop unsupported temperature param (only default 1 allowed)
    if "temperature" in params and params["temperature"] != 1:
        params.pop("temperature", None)

    # Request priority service tier when calling OpenAI directly

    # Pass via both top-level and extra_body for LiteLLM compatibility
    if not model_name.startswith("openrouter/"):
        params["service_tier"] = "priority"
        extra_body = params.get("extra_body", {})
        if "service_tier" not in extra_body:
            extra_body["service_tier"] = "priority"
        params["extra_body"] = extra_body

def _configure_kimi_k2(params: Dict[str, Any], model_name: str) -> None:
    """Configure Kimi K2-specific parameters."""
    is_kimi_k2 = "kimi-k2" in model_name.lower() or model_name.startswith("moonshotai/kimi-k2")
    if not is_kimi_k2:
        return
    
    params["provider"] = {
        "order": ["groq", "moonshotai"] #, "groq", "together/fp8", "novita/fp8", "baseten/fp8", 
    }

def _configure_thinking(params: Dict[str, Any], model_name: str, enable_thinking: Optional[bool], reasoning_effort: Optional[str]) -> None:
    """Configure reasoning/thinking parameters for supported models."""
    if not enable_thinking:
        return
    

    effort_level = reasoning_effort or 'low'
    is_anthropic = "anthropic" in model_name.lower() or "claude" in model_name.lower()
    is_xai = "xai" in model_name.lower() or model_name.startswith("xai/")
    is_openai_gpt5 = "gpt-5" in model_name.lower() and ("openai" in model_name.lower() or "openrouter" in model_name.lower())
    is_qwen_thinking = "qwen" in model_name.lower() and "thinking" in model_name.lower()
    
    if is_anthropic:
        params["reasoning_effort"] = effort_level
        params["temperature"] = 1.0  # Required by Anthropic when reasoning_effort is used
        logger.info(f"Anthropic thinking enabled with reasoning_effort='{effort_level}'")
    elif is_xai:
        params["reasoning_effort"] = effort_level
        logger.info(f"xAI thinking enabled with reasoning_effort='{effort_level}'")
    elif is_openai_gpt5:
        params["reasoning_effort"] = effort_level
        logger.info(f"GPT-5 thinking enabled with reasoning_effort='{effort_level}'")
    elif is_qwen_thinking:
        params["reasoning_effort"] = effort_level
        logger.info(f"Qwen thinking enabled with reasoning_effort='{effort_level}'")

=======
def _configure_openai_compatible(params: Dict[str, Any], model_name: str, api_key: Optional[str], api_base: Optional[str]) -> None:
    """Configure OpenAI-compatible provider setup."""
    if not model_name.startswith("openai-compatible/"):
        return
    
    # Get config values safely
    config_openai_key = getattr(config, 'OPENAI_COMPATIBLE_API_KEY', None) if config else None
    config_openai_base = getattr(config, 'OPENAI_COMPATIBLE_API_BASE', None) if config else None
    
    # Check if have required config either from parameters or environment
    if (not api_key and not config_openai_key) or (
        not api_base and not config_openai_base
    ):
        raise LLMError(
            "OPENAI_COMPATIBLE_API_KEY and OPENAI_COMPATIBLE_API_BASE is required for openai-compatible models. If just updated the environment variables, wait a few minutes or restart the service to ensure they are loaded."
        )
    
    setup_provider_router(api_key, api_base)
    logger.debug(f"Configured OpenAI-compatible provider with custom API base")
>>>>>>> upstream/PRODUCTION

def _add_tools_config(params: Dict[str, Any], tools: Optional[List[Dict[str, Any]]], tool_choice: str) -> None:
    """Add tools configuration to parameters."""
    if tools is None:
        return
    
    params.update({
        "tools": tools,
        "tool_choice": tool_choice
    })
<<<<<<< HEAD
    logger.debug(f"🔧 [TOOLS_CONFIG] Added {len(tools)} tools to API parameters with tool_choice={tool_choice}")

def prepare_params(
    messages: List[Dict[str, Any]],
    model_name: str,
    temperature: float = 0,
    max_tokens: Optional[int] = None,
    response_format: Optional[Any] = None,
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: str = "auto",
    api_key: Optional[str] = None,
    api_base: Optional[str] = None,
    stream: bool = False,
    top_p: Optional[float] = None,
    model_id: Optional[str] = None,
    enable_thinking: Optional[bool] = False,
    reasoning_effort: Optional[str] = "low",
) -> Dict[str, Any]:
    from core.ai_models import model_manager
    resolved_model_name = model_manager.resolve_model_id(model_name)
    # logger.debug(f"Model resolution: '{model_name}' -> '{resolved_model_name}'")
    
    params = {
        "model": resolved_model_name,
        "messages": messages,
        "temperature": temperature,
        "response_format": response_format,
        "top_p": top_p,
        "stream": stream,
        "num_retries": MAX_RETRIES,
    }
    
    # Enable usage tracking for streaming requests
    if stream:
        params["stream_options"] = {"include_usage": True}
        # logger.debug(f"Added stream_options for usage tracking: {params['stream_options']}")

    if api_key:
        params["api_key"] = api_key
    if api_base:
        params["api_base"] = api_base
    if model_id:
        params["model_id"] = model_id

    if model_name.startswith("openai-compatible/"):
        # Check if have required config either from parameters or environment
        if (not api_key and not config.OPENAI_COMPATIBLE_API_KEY) or (
            not api_base and not config.OPENAI_COMPATIBLE_API_BASE
        ):
            raise LLMError(
                "OPENAI_COMPATIBLE_API_KEY and OPENAI_COMPATIBLE_API_BASE is required for openai-compatible models. If just updated the environment variables,  wait a few minutes or restart the service to ensure they are loaded."
            )
        
        setup_provider_router(api_key, api_base)

    # Handle token limits
    _configure_token_limits(params, resolved_model_name, max_tokens)
    # Add tools if provided
    _add_tools_config(params, tools, tool_choice)
    # Add Anthropic-specific parameters
    _configure_anthropic(params, resolved_model_name, params["messages"])
    # Add OpenRouter-specific parameters
    _configure_openrouter(params, resolved_model_name)
    # Add Bedrock-specific parameters
    _configure_bedrock(params, resolved_model_name, model_id)

    # Add OpenAI GPT-5 specific parameters
    _configure_openai_gpt5(params, resolved_model_name)
    # Add Kimi K2-specific parameters
    _configure_kimi_k2(params, resolved_model_name)
    _configure_thinking(params, resolved_model_name, enable_thinking, reasoning_effort)

    return params
=======
    # logger.debug(f"Added {len(tools)} tools to API parameters")

>>>>>>> upstream/PRODUCTION

async def make_llm_api_call(
    messages: List[Dict[str, Any]],
    model_name: str,
    response_format: Optional[Any] = None,
    temperature: float = 0,
    max_tokens: Optional[int] = None,
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: str = "auto",
    api_key: Optional[str] = None,
    api_base: Optional[str] = None,
    stream: bool = True,  # Always stream for better UX
    top_p: Optional[float] = None,
    model_id: Optional[str] = None,
    headers: Optional[Dict[str, str]] = None,
    extra_headers: Optional[Dict[str, str]] = None,
) -> Union[Dict[str, Any], AsyncGenerator, ModelResponse]:
    """Make an API call to a language model using LiteLLM."""
    logger.info(f"Making LLM API call to model: {model_name} with {len(messages)} messages")
    
<<<<<<< HEAD
    # DEBUG: Log if any messages have cache_control
    cache_messages = [i for i, msg in enumerate(messages) if 
                     isinstance(msg.get('content'), list) and 
                     msg['content'] and 
                     isinstance(msg['content'][0], dict) and 
                     'cache_control' in msg['content'][0]]
    if cache_messages:
        logger.info(f"🔥 CACHE CONTROL: Found cache_control in messages at positions: {cache_messages}")
    else:
        logger.info(f"❌ NO CACHE CONTROL: No cache_control found in any messages")
    
    # Check token count for context window issues
    # try:
    #     from litellm import token_counter
    #     total_tokens = token_counter(model=model_name, messages=messages)
    #     logger.debug(f"Estimated input tokens: {total_tokens}")
        
    #     if total_tokens > 200000:
    #         logger.warning(f"High token count detected: {total_tokens}")
    # except Exception:
    #     pass  # Token counting is optional
    
    # Prepare parameters
    params = prepare_params(
        messages=messages,
        model_name=model_name,
        temperature=temperature,
        max_tokens=max_tokens,
        response_format=response_format,
        tools=tools,
        tool_choice=tool_choice,
        api_key=api_key,
        api_base=api_base,
        stream=stream,
        top_p=top_p,
        model_id=model_id,
        enable_thinking=enable_thinking,
        reasoning_effort=reasoning_effort,
    )
    
    try:
        # logger.debug(f"Calling LiteLLM acompletion for {model_name}")
=======
    # Prepare parameters using centralized model configuration
    from core.ai_models import model_manager
    resolved_model_name = model_manager.resolve_model_id(model_name)
    # logger.debug(f"Model resolution: '{model_name}' -> '{resolved_model_name}'")
    
    # Only pass headers/extra_headers if they are not None to avoid overriding model config
    override_params = {
        "messages": messages,
        "temperature": temperature,
        "response_format": response_format,
        "top_p": top_p,
        "stream": stream,
        "api_key": api_key,
        "api_base": api_base
    }
    
    # Only add headers if they are provided (not None)
    if headers is not None:
        override_params["headers"] = headers
    if extra_headers is not None:
        override_params["extra_headers"] = extra_headers
    
    params = model_manager.get_litellm_params(resolved_model_name, **override_params)
    
    # logger.debug(f"Parameters from model_manager.get_litellm_params: {params}")
    
    if model_id:
        params["model_id"] = model_id
    
    if stream:
        params["stream_options"] = {"include_usage": True}
    
    # Apply additional configurations that aren't in the model config yet
    _configure_openai_compatible(params, model_name, api_key, api_base)
    _add_tools_config(params, tools, tool_choice)
    
    try:
        # Log the complete parameters being sent to LiteLLM
        # logger.debug(f"Calling LiteLLM acompletion for {resolved_model_name}")
        # logger.debug(f"Complete LiteLLM parameters: {params}")
        
        # # Save parameters to txt file for debugging
        # import json
        # import os
        # from datetime import datetime
        
        # debug_dir = "debug_logs"
        # os.makedirs(debug_dir, exist_ok=True)
        
        # timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        # filename = f"{debug_dir}/llm_params_{timestamp}.txt"
        
        # with open(filename, 'w') as f:
        #     f.write(f"Timestamp: {datetime.now().isoformat()}\n")
        #     f.write(f"Model Name: {model_name}\n")
        #     f.write(f"Resolved Model Name: {resolved_model_name}\n")
        #     f.write(f"Parameters:\n{json.dumps(params, indent=2, default=str)}\n")
        
        # logger.debug(f"LiteLLM parameters saved to: {filename}")
        
>>>>>>> upstream/PRODUCTION
        response = await provider_router.acompletion(**params)
        
        # For streaming responses, we need to handle errors that occur during iteration
        if hasattr(response, '__aiter__') and stream:
            return _wrap_streaming_response(response)
        
        return response
        
    except Exception as e:
        # Use ErrorProcessor to handle the error consistently
        processed_error = ErrorProcessor.process_llm_error(e, context={"model": model_name})
        ErrorProcessor.log_error(processed_error)
        raise LLMError(processed_error.message)

<<<<<<< HEAD

=======
>>>>>>> upstream/PRODUCTION
async def _wrap_streaming_response(response) -> AsyncGenerator:
    """Wrap streaming response to handle errors during iteration."""
    try:
        async for chunk in response:
            yield chunk
    except Exception as e:
        # Convert streaming errors to processed errors
        processed_error = ErrorProcessor.process_llm_error(e)
        ErrorProcessor.log_error(processed_error)
        raise LLMError(processed_error.message)

setup_api_keys()
setup_provider_router()


if __name__ == "__main__":
    from litellm import completion
    import os

    setup_api_keys()

    response = completion(
        model="bedrock/anthropic.claude-sonnet-4-20250115-v1:0",
        messages=[{"role": "user", "content": "Hello! Testing 1M context window."}],
        max_tokens=100,
        extra_headers={
            "anthropic-beta": "context-1m-2025-08-07"  # 👈 Enable 1M context
        }
    )

