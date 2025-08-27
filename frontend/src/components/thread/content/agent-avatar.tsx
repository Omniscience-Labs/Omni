'use client';

import React, { useState } from 'react';
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
  const [imageError, setImageError] = useState(false);

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

  if (agent?.profile_image_url && !imageError) {
    return (
      <img 
        src={agent.profile_image_url} 
        alt={agent.name || fallbackName}
        className={`rounded object-cover ${className}`}
        style={{ width: size, height: size }}
        onError={() => {
          console.warn(`Failed to load agent profile image: ${agent.profile_image_url}`);
          setImageError(true);
        }}
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