from typing import List, Optional, Any

from ..domain.entities import MCPRequirementValue, ConfigType
from ..protocols import Logger


class ConfigBuilder:
    def __init__(self, logger: Logger):
        self._logger = logger
    
    def build_unified_config(
        self, 
        system_prompt: str,
        agentpress_tools: ConfigType,
        configured_mcps: List[ConfigType],
        custom_mcps: List[ConfigType],
        avatar: Optional[str] = None,
        avatar_color: Optional[str] = None
    ) -> ConfigType:
        from agent.config_helper import build_unified_config
        return build_unified_config(
            system_prompt=system_prompt,
            agentpress_tools=agentpress_tools,
            configured_mcps=configured_mcps,
            custom_mcps=custom_mcps,
            avatar=avatar,
            avatar_color=avatar_color
        )
    
    async def build_mcp_config(
        self,
        requirement: MCPRequirementValue,
        profile: Any,
        logger: Logger
    ) -> ConfigType:
        if requirement.is_custom():
            return {
                'name': requirement.display_name,
                'type': requirement.custom_type,
                'customType': requirement.custom_type,
                'config': profile.config if hasattr(profile, 'config') else profile,
                'enabledTools': requirement.enabled_tools
            }
        else:
            return {
                'name': requirement.display_name,
                'qualifiedName': profile.mcp_qualified_name,
                'config': profile.config,
                'enabledTools': requirement.enabled_tools,
                'selectedProfileId': profile.profile_id if hasattr(profile, 'profile_id') else None
            } 