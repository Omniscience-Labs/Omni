import React from 'react';
import { Badge } from '@/components/ui/badge';
import { User } from 'lucide-react';
import type { ConnectedAppsSectionProps } from '../types';
import { AppCard } from './AppCard';


export const ConnectedAppsSection: React.FC<ConnectedAppsSectionProps> = ({
  connectedApps,
  showAgentSelector,
  currentAgentId,
  agent,
  agentPipedreamProfiles = [],
  mode = 'full',
  onAppSelected,
  onConnectApp,
  onConfigureTools,
  onCategorySelect
}) => {
  const getSectionTitle = () => {
    if (showAgentSelector && currentAgentId && agent) {
      return 'Available Connections';
    }
    return mode === 'profile-only' ? 'Connected Accounts' : 'My Connections';
  };

  const getUsedProfilesCount = () => {
    return agentPipedreamProfiles.length;
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <User className="h-4 w-4 text-green-600 dark:text-green-400" />
        <h2 className="text-md font-semibold text-gray-900 dark:text-white">
          {getSectionTitle()}
        </h2>
        <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200 dark:border-green-900 dark:bg-green-900/20 dark:text-green-400 text-xs">
          {connectedApps.length} connected
        </Badge>
        {showAgentSelector && currentAgentId && getUsedProfilesCount() > 0 && (
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs">
            {getUsedProfilesCount()} in use
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {connectedApps.map((app) => (
          <AppCard 
            key={`${app.id}-${currentAgentId || 'default'}`} 
            app={app}
            mode={mode}
            currentAgentId={currentAgentId}
            agentName={agent?.name}
            agentPipedreamProfiles={agentPipedreamProfiles}
            onAppSelected={onAppSelected}
            onConnectApp={onConnectApp}
            onConfigureTools={onConfigureTools}
            handleCategorySelect={onCategorySelect}
          />
        ))}
      </div>
    </div>
  );
}; 