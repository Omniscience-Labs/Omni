import React from 'react';
import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MCPConfigurationNew } from './mcp/mcp-configuration-new';

interface AgentMCPConfigurationProps {
  mcps: Array<{ name: string; qualifiedName: string; config: any; enabledTools?: string[]; isCustom?: boolean; customType?: 'http' | 'sse' }>;
  customMcps?: Array<{ name: string; type: 'http' | 'sse'; config: any; enabledTools: string[] }>;
  onMCPsChange: (mcps: Array<{ name: string; qualifiedName: string; config: any; enabledTools?: string[]; isCustom?: boolean; customType?: 'http' | 'sse' }>) => void;
  onCustomMCPsChange?: (customMcps: Array<{ name: string; type: 'http' | 'sse'; config: any; enabledTools: string[] }>) => void;
  onBatchMCPChange?: (updates: { configured_mcps: any[]; custom_mcps: any[] }) => void;
}

export const AgentMCPConfiguration = ({ mcps, customMcps = [], onMCPsChange, onCustomMCPsChange, onBatchMCPChange }: AgentMCPConfigurationProps) => {
  const allMcps = React.useMemo(() => {
    const combined = [...mcps];
    customMcps.forEach(customMcp => {
      combined.push({
        name: customMcp.name,
        qualifiedName: `custom_${customMcp.type}_${customMcp.name.replace(' ', '_').toLowerCase()}`,
        config: customMcp.config,
        enabledTools: customMcp.enabledTools,
        isCustom: true,
        customType: customMcp.type as 'http' | 'sse'
      });
    });
    
    return combined;
  }, [mcps, customMcps]);

  const handleConfigurationChange = (updatedMcps: Array<{ name: string; qualifiedName: string; config: any; enabledTools?: string[]; isCustom?: boolean; customType?: 'http' | 'sse' }>) => {
    const standardMcps = updatedMcps.filter(mcp => !mcp.isCustom);
    const customMcpsList = updatedMcps.filter(mcp => mcp.isCustom);
    
    const transformedCustomMcps = customMcpsList.map(mcp => ({
      name: mcp.name,
      type: (mcp.customType || 'http') as 'http' | 'sse',
      config: mcp.config,
      enabledTools: mcp.enabledTools || []
    }));

    if (onBatchMCPChange) {
      onBatchMCPChange({
        configured_mcps: standardMcps,
        custom_mcps: transformedCustomMcps
      });
    } else {
      onMCPsChange(standardMcps);
      if (onCustomMCPsChange) {
        onCustomMCPsChange(transformedCustomMcps);
      }
    }
  };

  return (
    <Card className='px-0 bg-transparent border-none shadow-none'>
      <CardContent className='px-0'>
        <MCPConfigurationNew
          configuredMCPs={allMcps}
          onConfigurationChange={handleConfigurationChange}
        />
      </CardContent>
    </Card>
  );
}; 