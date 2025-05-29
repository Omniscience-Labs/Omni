import React from 'react';
import { Bot, Calendar, Settings, Sparkles, User } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DEFAULT_AGENTPRESS_TOOLS, getToolDisplayName } from '../_data/tools';

interface Agent {
  agent_id: string;
  name: string;
  description?: string;
  system_prompt: string;
  configured_mcps: Array<{ name: string; qualifiedName: string; config: any; enabledTools?: string[] }>;
  agentpress_tools: Record<string, { enabled: boolean; description: string }>;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

interface AgentPreviewProps {
  agent: Agent;
}

export const AgentPreview = ({ agent }: AgentPreviewProps) => {
  const enabledTools = Object.entries(agent.agentpress_tools || {})
    .filter(([_, tool]) => tool.enabled)
    .map(([toolName]) => toolName);

  const enabledMCPs = agent.configured_mcps || [];

  return (
    <div className="space-y-6">
      
    </div>
  );
}; 