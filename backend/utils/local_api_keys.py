"""
Local API key management for LLMs.

This module provides functionality to manage API keys in local mode
by reading and writing to the .env file.
"""

import os
from typing import Dict, Optional, List
from utils.logger import logger
from utils.config import config, EnvMode
from dotenv import load_dotenv, set_key, find_dotenv
from utils.constants import PROVIDERS

def get_local_api_keys(providers: List[str]) -> Dict[str, str]:
    """Get API keys from .env file in local mode."""
    try:
        # Load current env vars
        load_dotenv(override=True)
        
        return {provider: os.getenv(provider) or "" for provider in providers}
        
    except Exception as e:
        logger.error(f"Failed to get local API keys: {e}")
        return {}

def save_local_api_keys(api_keys: Dict[str, str]) -> bool:
    """Save API keys to .env file in local mode."""
    try:
        # Find .env file
        env_path = find_dotenv()
        if not env_path:
            logger.error("Could not find .env file")
            return False
        
        # Update each API key
        for key, value in api_keys.items():
            set_key(env_path, key, value)
            logger.info(f"Updated {key} in .env file")
            
        return True
        
    except Exception as e:
        logger.error(f"Failed to save local API keys: {e}")
        return False 