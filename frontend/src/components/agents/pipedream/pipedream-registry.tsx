import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { X, Bot } from 'lucide-react';
import { usePipedreamApps, usePipedreamPopularApps } from '@/hooks/react-query/pipedream/use-pipedream';
import { usePipedreamProfiles } from '@/hooks/react-query/pipedream/use-pipedream-profiles';
import { useAgent } from '@/hooks/react-query/agents/use-agents';
import { PipedreamConnector } from './pipedream-connector';
import { ToolsManager } from '../mcp/tools-manager';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import type { PipedreamApp } from '@/hooks/react-query/pipedream/utils';
import {
  PipedreamHeader,
  ConnectedAppsSection,
  AppsGrid,
  EmptyState,
  PaginationControls
} from './_components';
import { PAGINATION_CONSTANTS } from './constants';
import {
  createConnectedAppsFromProfiles,
  getAgentPipedreamProfiles,
} from './utils';
import type { PipedreamRegistryProps, ConnectedApp } from './types';
import { usePathname } from 'next/navigation';

export const PipedreamRegistry: React.FC<PipedreamRegistryProps> = ({
  onToolsSelected,
  onAppSelected,
  mode = 'full',
  onClose,
  showAgentSelector = false,
  selectedAgentId,
  onAgentChange,
  versionData,
  versionId
}) => {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState<'popular' | 'browse'>('popular');
  const [after, setAfter] = useState<string | undefined>(undefined);
  const [paginationHistory, setPaginationHistory] = useState<string[]>([]);
  const [showStreamlinedConnector, setShowStreamlinedConnector] = useState(false);
  const [selectedAppForConnection, setSelectedAppForConnection] = useState<PipedreamApp | null>(null);
  const [showToolsManager, setShowToolsManager] = useState(false);
  const [selectedToolsProfile, setSelectedToolsProfile] = useState<{
    profileId: string;
    appName: string;
    profileName: string;
  } | null>(null);
  const pathname = usePathname();
  const isHomePage = pathname.includes('dashboard');
  
  const [internalSelectedAgentId, setInternalSelectedAgentId] = useState<string | undefined>(selectedAgentId);

  const queryClient = useQueryClient();
  
  // Only fetch popular apps by default, or when searching
  const { data: popularAppsData, isLoading: isLoadingPopular } = usePipedreamPopularApps();
  
  // Only fetch regular apps when on browse page (page 2+) or searching
  const shouldFetchRegularApps = currentPage === 'browse' || search.trim() !== '';
  const { data: appsData, isLoading, error, refetch } = usePipedreamApps(after, search);
  
  const { data: profiles } = usePipedreamProfiles();
  
  const currentAgentId = selectedAgentId ?? internalSelectedAgentId;
  const { data: agent } = useAgent(currentAgentId || '');
  
  const { data: allAppsData } = usePipedreamApps(undefined, ''); // Keep for connected apps

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

  const effectiveVersionData = useMemo(() => {
    if (versionData) return versionData;
    if (!agent) return undefined;
    
    if (agent.current_version) {
      return {
        configured_mcps: agent.current_version.configured_mcps || [],
        custom_mcps: agent.current_version.custom_mcps || [],
        system_prompt: agent.current_version.system_prompt || '',
        agentpress_tools: agent.current_version.agentpress_tools || {}
      };
    }
    
    return {
      configured_mcps: agent.configured_mcps || [],
      custom_mcps: agent.custom_mcps || [],
      system_prompt: agent.system_prompt || '',
      agentpress_tools: agent.agentpress_tools || {}
    };
  }, [versionData, agent]);

  const agentPipedreamProfiles = useMemo(() => {
    return getAgentPipedreamProfiles(agent, profiles, currentAgentId, effectiveVersionData);
  }, [agent, profiles, currentAgentId, effectiveVersionData]);

  const connectedProfiles = useMemo(() => {
    return profiles?.filter(p => p.is_connected) || [];
  }, [profiles]);

  const connectedApps: ConnectedApp[] = useMemo(() => {
    return createConnectedAppsFromProfiles(connectedProfiles, allAppsData?.apps || []);
  }, [connectedProfiles, allAppsData?.apps]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setAfter(undefined);
    setPaginationHistory([]);
    
    // If searching, switch to browse mode to use regular API
    if (value.trim() !== '') {
      setCurrentPage('browse');
    } else {
      setCurrentPage('popular');
    }
  };

  const handleBrowseMore = () => {
    setCurrentPage('browse');
    setAfter(undefined);
    setPaginationHistory([]);
  };

  const handleBackToPopular = () => {
    setCurrentPage('popular');
    setSearch('');
    setAfter(undefined);
    setPaginationHistory([]);
  };

  const handleNextPage = () => {
    if (appsData?.page_info?.end_cursor) {
      if (after) {
        setPaginationHistory(prev => [...prev, after]);
      } else {
        setPaginationHistory(prev => [...prev, PAGINATION_CONSTANTS.FIRST_PAGE]);
      }
      setAfter(appsData.page_info.end_cursor);
    }
  };

  const handlePrevPage = () => {
    if (paginationHistory.length > 0) {
      const newHistory = [...paginationHistory];
      const previousCursor = newHistory.pop();
      setPaginationHistory(newHistory);
      
      if (previousCursor === PAGINATION_CONSTANTS.FIRST_PAGE) {
        setAfter(undefined);
      } else {
        setAfter(previousCursor);
      }
    }
  };

  const resetPagination = () => {
    setAfter(undefined);
    setPaginationHistory([]);
  };

  const handleConnectionComplete = (profileId: string, selectedTools: string[], appName: string, appSlug: string) => {
    if (onToolsSelected) {
      onToolsSelected(profileId, selectedTools, appName, appSlug);
      toast.success(`Added ${selectedTools.length} tools from ${appName}!`);
    }
  };

  const handleConnectApp = (app: PipedreamApp) => {
    setSelectedAppForConnection(app);
    setShowStreamlinedConnector(true);
    onClose?.();
  };

  const handleConfigureTools = (profile: any) => {
    if (!currentAgentId) {
      toast.error('Please select an agent first');
      return;
    }
    setSelectedToolsProfile({
      profileId: profile.profile_id,
      appName: profile.app_name,
      profileName: profile.profile_name
    });
    setShowToolsManager(true);
  };

  const handleClearFilters = () => {
    setSearch('');
    setCurrentPage('popular');
    resetPagination();
  };

  // Determine which apps to show
  const displayApps = useMemo(() => {
    if (currentPage === 'popular' && !search.trim()) {
      return popularAppsData?.apps || [];
    }
    return appsData?.apps || [];
  }, [currentPage, search, popularAppsData?.apps, appsData?.apps]);

  const isCurrentlyLoading = currentPage === 'popular' ? isLoadingPopular : isLoading;

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <X className="h-12 w-12 mx-auto mb-2" />
            <p className="text-lg font-semibold">Failed to load integrations</p>
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
      <PipedreamHeader 
        search={search}
        onSearchChange={handleSearch}
        showAgentSelector={showAgentSelector}
        currentAgentId={currentAgentId}
        onAgentChange={handleAgentSelect}
        agentName={agent?.name}
      />
      
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="max-w-6xl mx-auto">
            {showAgentSelector && !currentAgentId && (
              <div className="mb-6 text-center py-8 px-6 bg-muted/30 rounded-xl border-2 border-dashed border-border">
                <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Bot className="h-6 w-6 text-muted-foreground" />
                </div>
                <h4 className="text-sm font-medium text-foreground mb-2">
                  Select an agent to get started
                </h4>
                <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                  Choose an agent from the dropdown above to view and manage its integrations
                </p>
              </div>
            )}
            
            {connectedApps.length > 0 && (!showAgentSelector || currentAgentId) && (
              <ConnectedAppsSection
                connectedApps={connectedApps}
                showAgentSelector={showAgentSelector}
                currentAgentId={currentAgentId}
                agent={agent}
                agentPipedreamProfiles={agentPipedreamProfiles}
                mode={mode}
                onAppSelected={onAppSelected}
                onConnectApp={handleConnectApp}
                onConfigureTools={handleConfigureTools}
                onCategorySelect={() => {}} // No longer needed
              />
            )}
            
            {(!showAgentSelector || currentAgentId) && (
              <>
                {displayApps.length > 0 ? (
                  <AppsGrid
                    apps={displayApps}
                    selectedCategory={currentPage === 'popular' ? 'Popular' : 'All'}
                    mode={mode}
                    isLoading={isCurrentlyLoading}
                    currentAgentId={currentAgentId}
                    agent={agent}
                    agentPipedreamProfiles={agentPipedreamProfiles}
                    onAppSelected={onAppSelected}
                    onConnectApp={handleConnectApp}
                    onConfigureTools={handleConfigureTools}
                    onCategorySelect={() => {}} // No longer needed
                    onBrowseMore={currentPage === 'popular' ? handleBrowseMore : undefined}
                    onBackToPopular={currentPage === 'browse' ? handleBackToPopular : undefined}
                  />
                ) : !isCurrentlyLoading ? (
                  <EmptyState
                    selectedCategory={currentPage === 'popular' ? 'Popular' : 'All'}
                    mode={mode}
                    onClearFilters={handleClearFilters}
                  />
                ) : (
                  <AppsGrid
                    apps={[]}
                    selectedCategory={currentPage === 'popular' ? 'Popular' : 'All'}
                    mode={mode}
                    isLoading={isCurrentlyLoading}
                    currentAgentId={currentAgentId}
                    agent={agent}
                    agentPipedreamProfiles={agentPipedreamProfiles}
                    onAppSelected={onAppSelected}
                    onConnectApp={handleConnectApp}
                    onConfigureTools={handleConfigureTools}
                    onCategorySelect={() => {}} // No longer needed
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Only show pagination for browse mode */}
      {currentPage === 'browse' && displayApps.length > 0 && (paginationHistory.length > 0 || appsData?.page_info?.has_more) && (!showAgentSelector || currentAgentId) && (
        <div className="border-t p-4">
          <div className="max-w-6xl mx-auto">
            <PaginationControls
              isLoading={isLoading}
              paginationHistory={paginationHistory}
              hasMore={appsData?.page_info?.has_more || false}
              onPrevPage={handlePrevPage}
              onNextPage={handleNextPage}
            />
          </div>
        </div>
      )}
      
      {selectedAppForConnection && (
        <PipedreamConnector
          app={selectedAppForConnection}
          open={showStreamlinedConnector}
          onOpenChange={setShowStreamlinedConnector}
          onComplete={handleConnectionComplete}
          mode={mode === 'profile-only' ? 'profile-only' : 'full'}
          agentId={currentAgentId}
          saveMode={isHomePage ? 'direct' : 'callback'}
        />
      )}
      {selectedToolsProfile && currentAgentId && (
        <ToolsManager
          mode="pipedream"
          agentId={currentAgentId}
          profileId={selectedToolsProfile.profileId}
          appName={selectedToolsProfile.appName}
          profileName={selectedToolsProfile.profileName}
          open={showToolsManager}
          onOpenChange={(open) => {
            setShowToolsManager(open);
            if (!open) {
              setSelectedToolsProfile(null);
            }
          }}
          onToolsUpdate={(enabledTools) => {
            queryClient.invalidateQueries({ queryKey: ['agent', currentAgentId] });
          }}
          versionData={effectiveVersionData}
          versionId={versionId}
        />
      )}
    </div>
  );
}; 