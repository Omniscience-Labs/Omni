import datetime
from typing import Dict, Any
from dataclasses import dataclass
from agent.suna.config import SunaConfig


@dataclass
class SunaConfiguration:
    """Immutable Suna configuration snapshot"""
    name: str
    description: str
    system_prompt: str
    agentpress_tools: Dict[str, Any]
    configured_mcps: list
    custom_mcps: list
    avatar: str
    avatar_color: str
    restrictions: Dict[str, Any]
    version_tag: str
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for database storage"""
        return {
            "name": self.name,
            "description": self.description, 
            "system_prompt": self.system_prompt,
            "agentpress_tools": self.agentpress_tools,
            "configured_mcps": self.configured_mcps,
            "custom_mcps": self.custom_mcps,
            "avatar": self.avatar,
            "avatar_color": self.avatar_color,
            "is_default": True,
            "metadata": {
                "is_suna_default": True,
                "centrally_managed": True,
                "restrictions": self.restrictions,
                "config_version": self.version_tag,
                "last_central_update": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
        }


class SunaConfigManager:
    """
    🎯 PURE CONFIGURATION MANAGER
    
    CENTRALLY MANAGED FIELDS:
    ✅ System prompt (suna_config.py)
    ✅ Default tools (suna_config.py)
    ✅ Avatar & colors (suna_config.py)
    
    PRESERVED (NEVER TOUCHED):
    🛡️ Integrations (MCPs)
    🛡️ Workflows
    🛡️ Knowledge Base
    🛡️ Triggers
    🛡️ Custom MCPs
    🛡️ User customizations
    
    Responsibilities:
    - Load configuration from suna_config.py
    - Validate configuration
    - Generate version tags
    - NO database operations
    """
    
    def __init__(self):
        self._current_config = None
        self._config_hash = None
    
    def get_current_config(self) -> SunaConfiguration:
        """Get current Suna configuration"""
        # Generate a version tag based on config content
        config_dict = SunaConfig.get_full_config()
        version_tag = self._generate_version_tag(config_dict)
        
        return SunaConfiguration(
            name=SunaConfig.NAME,
            description=SunaConfig.DESCRIPTION,
            system_prompt=SunaConfig.get_system_prompt(),
            agentpress_tools=SunaConfig.DEFAULT_TOOLS.copy(),
            configured_mcps=SunaConfig.DEFAULT_MCPS.copy(),
            custom_mcps=SunaConfig.DEFAULT_CUSTOM_MCPS.copy(),
            avatar=SunaConfig.AVATAR,
            avatar_color=SunaConfig.AVATAR_COLOR,
            restrictions=SunaConfig.USER_RESTRICTIONS.copy(),
            version_tag=version_tag
        )
    
    def has_config_changed(self, last_version_tag: str) -> bool:
        """Check if configuration has changed since last sync"""
        current = self.get_current_config()
        return current.version_tag != last_version_tag
    
    def validate_config(self, config: SunaConfiguration) -> tuple[bool, list[str]]:
        """Validate configuration and return (is_valid, errors)"""
        errors = []
        
        if not config.name.strip():
            errors.append("Name cannot be empty")
            
        if not config.system_prompt.strip():
            errors.append("System prompt cannot be empty")
            
        if not config.agentpress_tools:
            errors.append("At least one tool must be enabled")
            
        return len(errors) == 0, errors
    
    def _generate_version_tag(self, config_dict: Dict[str, Any]) -> str:
        """Generate a version tag based on configuration content"""
        import hashlib
        import json
        
        # Create a stable hash from configuration
        config_str = json.dumps(config_dict, sort_keys=True)
        hash_obj = hashlib.md5(config_str.encode())
        return f"config-{hash_obj.hexdigest()[:8]}" 