export interface MCPConfiguration {
  name: string;
  qualifiedName: string;
  config: Record<string, any>;
  enabledTools?: string[];
  isCustom?: boolean;
  customType?: 'json' | 'sse';
}
  
export interface MCPConfigurationProps {
  configuredMCPs: MCPConfiguration[];
  onConfigurationChange: (mcps: MCPConfiguration[]) => void;
}
