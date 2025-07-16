from ..domain.entities import MCPRequirementValue, ConfigType


class MCPRequirementFactory:
    @staticmethod
    def from_configured_mcp(mcp: ConfigType) -> MCPRequirementValue:
        qualified_name = mcp.get('qualifiedName') or mcp.get('qualified_name')
        if not qualified_name:
            raise ValueError(f"Missing qualifiedName in configured MCP: {mcp}")
        
        display_name = mcp.get('name') or mcp.get('display_name') or qualified_name
        enabled_tools = mcp.get('enabled_tools') or mcp.get('enabledTools') or []
        config = mcp.get('config', {})
        required_config = list(config.keys()) if isinstance(config, dict) else []
        
        return MCPRequirementValue(
            qualified_name=qualified_name,
            display_name=display_name,
            enabled_tools=enabled_tools,
            required_config=required_config
        )
    
    @staticmethod
    def from_custom_mcp(custom_mcp: ConfigType) -> MCPRequirementValue:
        if 'name' not in custom_mcp:
            raise ValueError(f"Missing name in custom MCP: {custom_mcp}")
        
        custom_type = custom_mcp.get('customType') or custom_mcp.get('type') or 'http'
        config = custom_mcp.get('config', {})
        
        if custom_type == 'pipedream':
            app_slug = None
            if isinstance(config, dict):
                app_slug = config.get('app_slug')
                if not app_slug and 'headers' in config:
                    headers = config.get('headers', {})
                    if isinstance(headers, dict):
                        app_slug = headers.get('x-pd-app-slug')
            
            qualified_name = f"pipedream:{app_slug}" if app_slug else f"pipedream:{custom_mcp['name'].lower().replace(' ', '_')}"
        else:
            qualified_name = custom_mcp['name'].lower().replace(' ', '_')
        
        display_name = custom_mcp['name']
        enabled_tools = custom_mcp.get('enabled_tools') or custom_mcp.get('enabledTools') or []
        required_config = list(config.keys()) if isinstance(config, dict) else []
        
        return MCPRequirementValue(
            qualified_name=qualified_name,
            display_name=display_name,
            enabled_tools=enabled_tools,
            required_config=required_config,
            custom_type=custom_type
        ) 