import React from 'react';
import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MCPConfiguration } from './mcp-configuration';
import { MCPConfigurationNew } from './mcp/mcp-configuration-new';

interface AgentMCPConfigurationProps {
  mcps: Array<{ name: string; qualifiedName: string; config: any; enabledTools?: string[] }>;
  onMCPsChange: (mcps: Array<{ name: string; qualifiedName: string; config: any; enabledTools?: string[] }>) => void;
}

export const AgentMCPConfiguration = ({ mcps, onMCPsChange }: AgentMCPConfigurationProps) => {
  return (
    <Card className='px-0 bg-transparent border-none shadow-none'>
      <CardContent className='px-0'>
        <MCPConfigurationNew
          configuredMCPs={mcps}
          onConfigurationChange={onMCPsChange}
        />
      </CardContent>
    </Card>
  );
}; 