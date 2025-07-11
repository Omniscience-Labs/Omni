import React from 'react';
import { MCPConfigurationNew } from './mcp/mcp-configuration-new';

interface AgentMCPConfigurationProps {
  configuredMCPs: any[];
  customMCPs: any[];
  onMCPChange: (updates: { configured_mcps: any[]; custom_mcps: any[] }) => void;
}

export const AgentMCPConfiguration: React.FC<AgentMCPConfigurationProps> = ({
  configuredMCPs,
  customMCPs,
  onMCPChange,
}) => {
  // Combine all MCPs into a single array for the new component
  const allMCPs = [
    ...(configuredMCPs || []),
    ...(customMCPs || []).map(customMcp => ({
      name: customMcp.name,
      qualifiedName: `custom_${customMcp.type || customMcp.customType}_${customMcp.name.replace(' ', '_').toLowerCase()}`,
      config: customMcp.config,
      enabledTools: customMcp.enabledTools,
      isCustom: true,
      customType: customMcp.type || customMcp.customType
    }))
  ];

  const handleConfigurationChange = (mcps: any[]) => {
    // Separate back into configured and custom MCPs
    const configured = mcps.filter(mcp => !mcp.isCustom);
    const custom = mcps
      .filter(mcp => mcp.isCustom)
      .map(mcp => ({
        name: mcp.name,
        type: mcp.customType,
        customType: mcp.customType,
        config: mcp.config,
        enabledTools: mcp.enabledTools
      }));

    // Call the parent handler with the proper structure
    onMCPChange({
      configured_mcps: configured,
      custom_mcps: custom
    });
  };

  return (
    <MCPConfigurationNew
      configuredMCPs={allMCPs}
      onConfigurationChange={handleConfigurationChange}
    />
  );
}; 