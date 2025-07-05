"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, Check } from 'lucide-react';
import { SlackIcon } from '@/components/ui/icons/slack';
import { toast } from 'sonner';
import { getTriggerIcon } from './utils';

interface OAuthIntegrationButtonProps {
  provider: 'slack' | 'discord' | 'teams';
  agentId: string;
  isInstalled?: boolean;
  workspaceName?: string;
  onInstallComplete?: (result: any) => void;
}

const PROVIDER_CONFIG = {
  slack: {
    name: 'Slack',
    color: 'bg-[#4A154B] hover:bg-[#4A154B]/90 text-white',
    description: 'Connect to Slack workspaces',
    icon: <SlackIcon className="h-5 w-5" />
  },
  discord: {
    name: 'Discord', 
    color: 'bg-[#5865F2] hover:bg-[#5865F2]/90 text-white',
    description: 'Connect to Discord servers',
    icon: getTriggerIcon('discord')
  },
  teams: {
    name: 'Microsoft Teams',
    color: 'bg-[#6264A7] hover:bg-[#6264A7]/90 text-white', 
    description: 'Connect to Teams organizations',
    icon: getTriggerIcon('teams')
  }
};

export const OAuthIntegrationButton: React.FC<OAuthIntegrationButtonProps> = ({
  provider,
  agentId,
  isInstalled = false,
  workspaceName,
  onInstallComplete
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const config = PROVIDER_CONFIG[provider];

  const handleInstall = async () => {
    try {
      setIsLoading(true);
      
      // Call the unified OAuth API
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/integrations/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          provider: provider
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to initiate installation');
      }

      const data = await response.json();
      
      // Store the agent ID in session storage for callback handling
      sessionStorage.setItem('oauth_agent_id', agentId);
      sessionStorage.setItem('oauth_provider', provider);
      
      // Redirect to OAuth provider
      window.location.href = data.install_url;
      
    } catch (error) {
      console.error(`Error installing ${provider}:`, error);
      toast.error(`Failed to install ${config.name} integration`);
      setIsLoading(false);
    }
  };

  const getAccessToken = async () => {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  if (isInstalled) {
    return (
      <div className="flex items-center justify-between p-4 rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
        <div className="flex items-center space-x-3">
          {config.icon}
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-medium">{config.name}</span>
              <Badge variant="outline" className="text-green-700 border-green-300 bg-green-100 dark:text-green-300 dark:border-green-700 dark:bg-green-900/20">
                <Check className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            </div>
            {workspaceName && (
              <p className="text-sm text-muted-foreground">
                Connected to {workspaceName}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Button
      onClick={handleInstall}
      disabled={isLoading}
      className={`h-auto p-4 flex items-center justify-between w-full ${config.color}`}
    >
      <div className="flex items-center space-x-3">
        {config.icon}
        <div className="text-left">
          <div className="font-medium">{config.name}</div>
          <div className="text-xs opacity-90">{config.description}</div>
        </div>
      </div>
      
      <div className="flex items-center space-x-2">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ExternalLink className="h-4 w-4" />
        )}
      </div>
    </Button>
  );
}; 