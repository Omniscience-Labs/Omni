"use client";

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import { SlackIcon } from '@/components/ui/icons/slack';
import { getTriggerIcon } from './utils';
import { 
  useOAuthIntegrations, 
  useInstallOAuthIntegration, 
  useUninstallOAuthIntegration,
  useOAuthCallbackHandler 
} from '@/hooks/react-query/triggers/use-oauth-integrations';

interface OneClickIntegrationsProps {
  agentId: string;
}

const OAUTH_PROVIDERS = {
  slack: {
    name: 'Slack',
    icon: <SlackIcon className="h-4 w-4" />
  },
  discord: {
    name: 'Discord',
    icon: <span className="">{getTriggerIcon('discord')}</span>
  },
  teams: {
    name: 'Microsoft Teams',
    icon: <span className="">{getTriggerIcon('teams')}</span>
  }
} as const;

type ProviderKey = keyof typeof OAUTH_PROVIDERS;

export const OneClickIntegrations: React.FC<OneClickIntegrationsProps> = ({
  agentId
}) => {
  const { data: integrationStatus, isLoading, error } = useOAuthIntegrations(agentId);
  const installMutation = useInstallOAuthIntegration();
  const uninstallMutation = useUninstallOAuthIntegration();
  const { handleCallback } = useOAuthCallbackHandler();

  useEffect(() => {
    handleCallback();
  }, []);

  const handleInstall = async (provider: ProviderKey) => {
    try {
      await installMutation.mutateAsync({
        agent_id: agentId,
        provider: provider
      });
    } catch (error) {
      console.error(`Error installing ${provider}:`, error);
    }
  };

  const handleUninstall = async (triggerId: string) => {
    try {
      await uninstallMutation.mutateAsync(triggerId);
    } catch (error) {
      console.error('Error uninstalling integration:', error);
    }
  };

  const getIntegrationForProvider = (provider: ProviderKey) => {
    return integrationStatus?.integrations.find(integration => 
      integration.provider === provider
    );
  };

  const isProviderInstalled = (provider: ProviderKey) => {
    return !!getIntegrationForProvider(provider);
  };

  if (error) {
    return (
      <div className="p-4 border border-destructive/20 bg-destructive/5 rounded-lg">
        <div className="flex items-center space-x-3">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <h3 className="text-lg font-semibold text-destructive">Error Loading Integrations</h3>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Failed to load integrations'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {Object.entries(OAUTH_PROVIDERS).map(([providerId, config]) => {
        const provider = providerId as ProviderKey;
        const integration = getIntegrationForProvider(provider);
        const isInstalled = isProviderInstalled(provider);
        const isLoading = installMutation.isPending || uninstallMutation.isPending;
        return (
          <Button
            key={providerId}
            variant="outline"
            onClick={() => isInstalled ? handleUninstall(integration!.trigger_id) : handleInstall(provider)}
            disabled={isLoading}
            className="flex items-center"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              config.icon
            )}
            {isInstalled ? `Disconnect ${config.name}` : `Connect to ${config.name}`}
          </Button>
        );
      })}
    </div>
  );
}; 