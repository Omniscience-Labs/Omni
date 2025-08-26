'use client';

import React from 'react';
import { useAgent } from '@/hooks/react-query/agents/use-agents';
import { OmniLogo } from '@/components/sidebar/omni-logo';
import { Skeleton } from '@/components/ui/skeleton';

interface AgentAvatarProps {
  agentId?: string;
  size?: number;
  className?: string;
  fallbackName?: string;
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({ 
  agentId, 
  size = 16, 
  className = "", 
  fallbackName = "Omni" 
}) => {
  const { data: agent, isLoading } = useAgent(agentId || '');

  if (isLoading && agentId) {
    return (
      <div 
        className={`bg-muted animate-pulse rounded ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  if (!agent && !agentId) {
    return <OmniLogo size={size} />;
  }

  const isSuna = agent?.metadata?.is_suna_default;
  if (isSuna) {
    return <OmniLogo size={size} />;
  }

  if (agent?.icon_name) {
    return (
      <div 
        className={`flex items-center justify-center rounded ${className}`}
        style={{ 
          width: size, 
          height: size,
          backgroundColor: agent.icon_background || '#F3F4F6'
        }}
      >
        <DynamicIcon 
          name={agent.icon_name as any} 
          size={size * 0.6} 
          color={agent.icon_color || '#000000'}
        />
      </div>
    );
  }

  if (agent?.profile_image_url) {
    return (
      <img 
        src={agent.profile_image_url} 
        alt={agent.name || fallbackName}
        className={`rounded object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }


  return <OmniLogo size={size} />;
};

interface AgentNameProps {
  agentId?: string;
  fallback?: string;
}

export const AgentName: React.FC<AgentNameProps> = ({ 
  agentId, 
  fallback = "Omni" 
}) => {
  const { data: agent, isLoading } = useAgent(agentId || '');

  if (isLoading && agentId) {
    return <span className="text-muted-foreground">Loading...</span>;
  }

  return <span>{agent?.name || fallback}</span>;
}; 