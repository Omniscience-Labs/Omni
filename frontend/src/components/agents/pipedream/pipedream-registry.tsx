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
  CategorySidebar,
  PipedreamHeader,
  ConnectedAppsSection,
  AppsGrid,
  EmptyState,
  PaginationControls
} from './_components';
import { PAGINATION_CONSTANTS } from './constants';
import {
  getSimplifiedCategories,
  createConnectedAppsFromProfiles,
  getAgentPipedreamProfiles,
  filterAppsByCategory
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
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [after, setAfter] = useState<string | undefined>(undefined);
  const [paginationHistory, setPaginationHistory] = useState<string[]>([]);
  const [showStreamlinedConnector, setShowStreamlinedConnector] = useState(false);
  const [selectedAppForConnection, setSelectedAppForConnection] = useState<PipedreamApp | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
  const { data: appsData, isLoading, error, refetch } = usePipedreamApps(after, search);
  const { data: popularAppsData, isLoading: isLoadingPopular } = usePipedreamPopularApps();
  const { data: profiles } = usePipedreamProfiles();
  
  const currentAgentId = selectedAgentId ?? internalSelectedAgentId;
  const { data: agent } = useAgent(currentAgentId || '');
  
  const { data: allAppsData } = usePipedreamApps(undefined, '');

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

  const allApps = useMemo(() => {
    return allAppsData?.apps || [];
  }, [allAppsData?.apps]);

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

  const categories = useMemo(() => {
    return getSimplifiedCategories();
  }, []);

  const connectedProfiles = useMemo(() => {
    return profiles?.filter(p => p.is_connected) || [];
  }, [profiles]);

  const filteredAppsData = useMemo(() => {
    if (selectedCategory === 'Popular') {
      return popularAppsData ? {
        ...popularAppsData,
        apps: popularAppsData.apps || []
      } : undefined;
    }
    
    if (!appsData) return appsData;
    
    if (selectedCategory === 'All') {
      return appsData;
    }
    
    const filteredApps = filterAppsByCategory(appsData.apps, selectedCategory);
    
    return {
      ...appsData,
      apps: filteredApps,
      page_info: {
        ...appsData.page_info,
        count: filteredApps.length
      }
    };
  }, [appsData, popularAppsData, selectedCategory]);

  const connectedApps: ConnectedApp[] = useMemo(() => {
    return createConnectedAppsFromProfiles(connectedProfiles, allApps);
  }, [connectedProfiles, allApps]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setAfter(undefined);
    setPaginationHistory([]);
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setAfter(undefined);
    setPaginationHistory([]);
    if (category === 'Popular' && search) {
      setSearch('');
    }
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
    setSelectedCategory('All');
    resetPagination();
  };

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
    <div className="h-full flex">
      <div className={cn(
        "transition-all duration-300 ease-in-out",
        sidebarCollapsed ? "w-12" : "w-62"
      )}>
        <CategorySidebar 
          isCollapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          categories={categories}
          selectedCategory={selectedCategory}
          onCategorySelect={handleCategorySelect}
          allApps={allApps}
        />
      </div>
      <div className="flex-1 relative">
        <PipedreamHeader 
          search={search}
          onSearchChange={handleSearch}
          showAgentSelector={showAgentSelector}
          currentAgentId={currentAgentId}
          onAgentChange={handleAgentSelect}
        />
        
        <div className="absolute inset-0 pt-[100px] pb-[60px]">
          <div className="h-full overflow-y-auto p-4">
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
                    Choose an agent from the dropdown above to view and manage its Pipedream integrations
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
                  onCategorySelect={handleCategorySelect}
                />
              )}
              
              {(!showAgentSelector || currentAgentId) && (
                <>
                  {filteredAppsData?.apps && filteredAppsData.apps.length > 0 ? (
                    <AppsGrid
                      apps={filteredAppsData.apps}
                      selectedCategory={selectedCategory}
                      mode={mode}
                      isLoading={selectedCategory === 'Popular' ? isLoadingPopular : isLoading}
                      currentAgentId={currentAgentId}
                      agent={agent}
                      agentPipedreamProfiles={agentPipedreamProfiles}
                      onAppSelected={onAppSelected}
                      onConnectApp={handleConnectApp}
                      onConfigureTools={handleConfigureTools}
                      onCategorySelect={handleCategorySelect}
                    />
                  ) : !(selectedCategory === 'Popular' ? isLoadingPopular : isLoading) ? (
                    <EmptyState
                      selectedCategory={selectedCategory}
                      mode={mode}
                      onClearFilters={handleClearFilters}
                    />
                  ) : (
                    <AppsGrid
                      apps={[]}
                      selectedCategory={selectedCategory}
                      mode={mode}
                      isLoading={selectedCategory === 'Popular' ? isLoadingPopular : isLoading}
                      currentAgentId={currentAgentId}
                      agent={agent}
                      agentPipedreamProfiles={agentPipedreamProfiles}
                      onAppSelected={onAppSelected}
                      onConnectApp={handleConnectApp}
                      onConfigureTools={handleConfigureTools}
                      onCategorySelect={handleCategorySelect}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        
        {filteredAppsData?.apps && filteredAppsData.apps.length > 0 && (paginationHistory.length > 0 || appsData?.page_info?.has_more) && (!showAgentSelector || currentAgentId) && (
          <PaginationControls
            isLoading={isLoading}
            paginationHistory={paginationHistory}
            hasMore={appsData?.page_info?.has_more || false}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
          />
        )}
      </div>
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