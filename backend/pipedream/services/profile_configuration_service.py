from typing import Dict, Any
from ..protocols import ProfileConfigurationService


class ProfileConfigurationService:
    def validate_config(self, config: Dict[str, Any]) -> bool:
        required_fields = ['app_slug', 'app_name', 'external_user_id']
        
        for field in required_fields:
            if field not in config or not config[field]:
                return False
        
        if 'enabled_tools' in config and not isinstance(config['enabled_tools'], list):
            return False
        
        return True
    
    def merge_config(self, existing_config: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
        merged_config = existing_config.copy()
        
        for key, value in updates.items():
            if key in ['enabled_tools'] and isinstance(value, list):
                merged_config[key] = value
            elif key in ['app_slug', 'app_name', 'external_user_id', 'oauth_app_id', 'description']:
                merged_config[key] = value
        
        return merged_config 