import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { X, Bot, Search, Sparkles, TrendingUp, Star, Filter } from 'lucide-react';
import { useComposioToolkits } from '@/hooks/react-query/composio/use-composio';
import { useComposioProfiles } from '@/hooks/react-query/composio/use-composio-profiles';
import { useAgent } from '@/hooks/react-query/agents/use-agents';
import { ComposioConnector } from './composio-connector';
import { ComposioToolsManager } from './composio-tools-manager';
import type { ComposioToolkit } from '@/hooks/react-query/composio/utils';
import { ComposioAppCard } from './composio-app-card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { AgentSelector } from '../../thread/chat-input/agent-selector';

interface ComposioRegistryProps {
  onToolsSelected?: (profileId: string, selectedTools: string[], appName: string, appSlug: string) => void;
  onAppSelected?: (app: ComposioToolkit) => void;
  mode?: 'full' | 'profile-only';
  onClose?: () => void;
  showAgentSelector?: boolean;
  selectedAgentId?: string;
  onAgentChange?: (agentId: string | undefined) => void;
}

const AppCardSkeleton = () => (
  <div className="group relative overflow-hidden rounded-2xl border border-border bg-card transition-all">
    <div className="p-6">
      <div className="flex items-center gap-4 mb-4">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="space-y-2 mb-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-full rounded-xl" />
      </div>
    </div>
  </div>
);

const AppsGridSkeleton = ({ count = 8 }: { count?: number }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {Array.from({ length: count }).map((_, index) => (
      <AppCardSkeleton key={index} />
    ))}
  </div>
);

export const ComposioRegistry: React.FC<ComposioRegistryProps> = ({
  onToolsSelected,
  onAppSelected,
  mode = 'full',
  onClose,
  showAgentSelector = false,
  selectedAgentId,
  onAgentChange,
}) => {
  const [search, setSearch] = useState('');
  const [showStreamlinedConnector, setShowStreamlinedConnector] = useState(false);
  const [selectedAppForConnection, setSelectedAppForConnection] = useState<ComposioToolkit | null>(null);
  const [showToolsManager, setShowToolsManager] = useState(false);
  const [selectedProfileForTools, setSelectedProfileForTools] = useState<string | null>(null);
  
  const [internalSelectedAgentId, setInternalSelectedAgentId] = useState<string | undefined>(selectedAgentId);

  const queryClient = useQueryClient();
  
  const { data: toolkitsData, isLoading, error, refetch } = useComposioToolkits(search.trim() || undefined);
  const { data: profiles } = useComposioProfiles();
  
  const currentAgentId = selectedAgentId ?? internalSelectedAgentId;
  const { data: agent } = useAgent(currentAgentId || '');

  React.useEffect(() => {
    setInternalSelectedAgentId(selectedAgentId);
  }, [selectedAgentId]);

  const handleAgentSelect = (agentId: string | undefined) => {
    if (onAgentChange) {
      onAgentChange(agentId);
    } else {
      setInternalSelectedAgentId(agentId);
    }
    if (agentId !== currentAgentId) {
      queryClient.invalidateQueries({ queryKey: ['agent'] });
      if (agentId) {
        queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      }
    }
  };

  const connectedProfiles = useMemo(() => {
    return profiles?.filter(p => p.is_connected) || [];
  }, [profiles]);

  const connectedApps = useMemo(() => {
    if (!toolkitsData?.toolkits || !connectedProfiles.length) {
      return [];
    }
    
    return connectedProfiles.map(profile => {
      const toolkit = toolkitsData.toolkits.find(t => t.slug === profile.toolkit_slug);
      return toolkit ? {
        ...toolkit,
        profile_id: profile.profile_id,
        profile_name: profile.profile_name,
        is_connected: true,
      } : null;
    }).filter(Boolean);
  }, [connectedProfiles, toolkitsData?.toolkits]);

  const handleSearch = (value: string) => {
    setSearch(value);
  };

  const handleConnectionComplete = (profileId: string, appName: string, appSlug: string) => {
    if (mode === 'full' && currentAgentId) {
      // If we have an agent selected, open tools manager
      setSelectedProfileForTools(profileId);
      setShowToolsManager(true);
    } else if (onToolsSelected) {
      // Otherwise, just notify parent
      onToolsSelected(profileId, [], appName, appSlug);
      toast.success(`Connected to ${appName}!`);
    }
  };

  const handleConnectApp = (app: ComposioToolkit) => {
    setSelectedAppForConnection(app);
    setShowStreamlinedConnector(true);
    onClose?.();
  };

  const handleConfigureTools = (profile: any) => {
    if (!currentAgentId) {
      toast.error('Please select an agent first');
      return;
    }
    setSelectedProfileForTools(profile.profile_id);
    setShowToolsManager(true);
  };

  const handleClearSearch = () => {
    setSearch('');
  };

  const handleToolsUpdate = (enabledTools: string[]) => {
    const profile = connectedProfiles.find(p => p.profile_id === selectedProfileForTools);
    if (profile && onToolsSelected) {
      onToolsSelected(selectedProfileForTools!, enabledTools, profile.toolkit_name, profile.toolkit_slug);
    }
  };

  const displayApps = useMemo(() => {
    return toolkitsData?.toolkits || [];
  }, [toolkitsData?.toolkits]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <X className="h-12 w-12 mx-auto mb-2" />
            <p className="text-lg font-semibold">Failed to load Composio integrations</p>
          </div>
          <Button onClick={() => refetch()} className="bg-primary hover:bg-primary/90">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="sticky flex items-center justify-between top-0 z-10 flex-shrink-0 border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-muted-foreground/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-foreground">
                  {agent?.name ? `${agent.name} Composio Integrations` : 'Composio Integrations'}
                </h1>
                <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-400">
                  OAuth2 Apps
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {agent?.name ? 'Connect Composio apps to enhance your agent\'s capabilities' : 'Connect professional tools via Composio'}
              </p>
            </div>
          </div>
          {showAgentSelector && (
            <AgentSelector
              selectedAgentId={currentAgentId}
              onAgentSelect={handleAgentSelect}
              isSunaAgent={agent?.metadata?.is_suna_default}
            />
          )}
        </div>
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search Composio apps..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 h-11 w-full bg-muted/50 border-0 focus:bg-background focus:ring-2 focus:ring-primary/20 rounded-xl transition-all"
          />
          {search && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSearch}
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="max-w-7xl mx-auto space-y-8">
            {showAgentSelector && !currentAgentId && (
              <div className="text-center py-12 px-6 bg-gradient-to-br from-muted/30 to-muted/10 rounded-2xl border border-dashed border-border">
                <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl flex items-center justify-center mb-4">
                  <Bot className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Select an Agent
                </h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  Choose an agent from the dropdown above to view and manage its Composio integrations
                </p>
              </div>
            )}
            
            {connectedApps.length > 0 && (!showAgentSelector || currentAgentId) && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="border border-green-200 dark:border-green-900 h-8 w-8 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                    <Star className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h2 className="text-md font-semibold text-foreground">
                      Your Connected Apps
                    </h2>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {connectedApps.map((app: any) => (
                    <ComposioAppCard 
                      key={`${app.slug}-connected`} 
                      app={app}
                      mode={mode}
                      onConnectApp={handleConnectApp}
                      isConnected={true}
                      onConfigureTools={() => handleConfigureTools(app)}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {(!showAgentSelector || currentAgentId) && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 border border-orange-200 dark:border-orange-900 rounded-lg bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <h2 className="text-md font-semibold text-foreground">
                        {search.trim() ? 'Search Results' : 'Available Apps'}
                      </h2>
                    </div>
                  </div>
                </div>
                {isLoading ? (
                  <AppsGridSkeleton count={8} />
                ) : displayApps.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {displayApps.map((app) => (
                      <ComposioAppCard 
                        key={app.slug} 
                        app={app}
                        mode={mode}
                        onConnectApp={handleConnectApp}
                        isConnected={connectedProfiles.some(p => p.toolkit_slug === app.slug)}
                        onConfigureTools={() => {
                          const profile = connectedProfiles.find(p => p.toolkit_slug === app.slug);
                          if (profile) handleConfigureTools(profile);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center flex flex-col items-center justify-center py-12">
                    <div className="text-6xl mb-4">🔍</div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      No apps found
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                      {search.trim() 
                        ? `No apps match "${search}". Try a different search term.`
                        : 'No Composio apps available at the moment.'
                      }
                    </p>
                    {search.trim() && (
                      <Button
                        onClick={handleClearSearch}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        <Filter className="h-4 w-4" />
                        Clear Search
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Modals */}
      {selectedAppForConnection && (
        <ComposioConnector
          app={selectedAppForConnection}
          open={showStreamlinedConnector}
          onOpenChange={setShowStreamlinedConnector}
          onComplete={handleConnectionComplete}
          mode={mode === 'profile-only' ? 'profile-only' : 'full'}
        />
      )}
      
      {showToolsManager && currentAgentId && selectedProfileForTools && (
        <ComposioToolsManager
          agentId={currentAgentId}
          open={showToolsManager}
          onOpenChange={setShowToolsManager}
          profileId={selectedProfileForTools}
          onToolsUpdate={handleToolsUpdate}
        />
      )}
    </div>
  );
}; 