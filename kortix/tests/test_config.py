"""
Tests for the Kortix SDK configuration module
"""

import pytest
import os
from unittest.mock import patch

from kortix.config import GlobalConfig, global_config


class TestGlobalConfig:
    """Test the GlobalConfig class"""
    
    def test_init_default_values(self):
        """Test that GlobalConfig initializes with correct defaults"""
        config = GlobalConfig()
        assert config._api_key is None
        assert config._api_url is None
        assert config._default_model == "anthropic/claude-sonnet-4-20250514"
    
    def test_set_api_key(self):
        """Test setting API key"""
        config = GlobalConfig()
        config.set_api_key("test-key")
        assert config._api_key == "test-key"
    
    def test_set_api_url(self):
        """Test setting API URL"""
        config = GlobalConfig()
        config.set_api_url("https://api.example.com")
        assert config._api_url == "https://api.example.com"
    
    def test_set_api_url_strips_trailing_slash(self):
        """Test that trailing slash is stripped from API URL"""
        config = GlobalConfig()
        config.set_api_url("https://api.example.com/")
        assert config._api_url == "https://api.example.com"
    
    def test_set_default_model(self):
        """Test setting default model"""
        config = GlobalConfig()
        config.set_default_model("gpt-4")
        assert config._default_model == "gpt-4"
    
    def test_api_key_property_from_config(self):
        """Test getting API key from config"""
        config = GlobalConfig()
        config.set_api_key("test-key")
        assert config.api_key == "test-key"
    
    @patch.dict(os.environ, {'KORTIX_API_KEY': 'env-key'})
    def test_api_key_property_from_env(self):
        """Test getting API key from environment variable"""
        config = GlobalConfig()
        assert config.api_key == "env-key"
    
    def test_api_key_property_missing_raises_error(self):
        """Test that missing API key raises ValueError"""
        config = GlobalConfig()
        with pytest.raises(ValueError, match="API key not set"):
            _ = config.api_key
    
    def test_api_url_property_from_config(self):
        """Test getting API URL from config"""
        config = GlobalConfig()
        config.set_api_url("https://api.example.com")
        assert config.api_url == "https://api.example.com"
    
    @patch.dict(os.environ, {'KORTIX_API_URL': 'https://env.example.com/'})
    def test_api_url_property_from_env(self):
        """Test getting API URL from environment variable"""
        config = GlobalConfig()
        assert config.api_url == "https://env.example.com"
    
    def test_api_url_property_missing_raises_error(self):
        """Test that missing API URL raises ValueError"""
        config = GlobalConfig()
        with pytest.raises(ValueError, match="API URL not set"):
            _ = config.api_url
    
    def test_default_model_property(self):
        """Test getting default model"""
        config = GlobalConfig()
        assert config.default_model == "anthropic/claude-sonnet-4-20250514"


class TestGlobalConfigSingleton:
    """Test the global config singleton"""
    
    def test_global_config_is_global_config_instance(self):
        """Test that global_config is an instance of GlobalConfig"""
        assert isinstance(global_config, GlobalConfig)
    
    def test_global_config_state_persists(self):
        """Test that global_config state persists across uses"""
        # Save original state
        original_key = getattr(global_config, '_api_key', None)
        original_url = getattr(global_config, '_api_url', None)
        
        try:
            # Set values
            global_config.set_api_key("persistent-key")
            global_config.set_api_url("https://persistent.example.com")
            
            # Check persistence
            assert global_config._api_key == "persistent-key"
            assert global_config._api_url == "https://persistent.example.com"
            
        finally:
            # Restore original state
            global_config._api_key = original_key
            global_config._api_url = original_url 