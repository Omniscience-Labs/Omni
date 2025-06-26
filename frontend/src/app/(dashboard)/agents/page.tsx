'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Plus, AlertCircle, Loader2, File, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UpdateAgentDialog } from './_components/update-agent-dialog';
import { useAgents, useUpdateAgent, useDeleteAgent, useOptimisticAgentUpdate, useCreateAgent } from '@/hooks/react-query/agents/use-agents';
import { SearchAndFilters } from './_components/search-and-filters';
import { ResultsInfo } from './_components/results-info';
import { EmptyState } from './_components/empty-state';
import { AgentsGrid } from './_components/agents-grid';
import { AgentsList } from './_components/agents-list';
import { LoadingState } from './_components/loading-state';
import { Pagination } from './_components/pagination';
import { useRouter } from 'next/navigation';
import { DEFAULT_AGENTPRESS_TOOLS } from './_data/tools';
import { AgentsParams } from '@/hooks/react-query/agents/utils';
import { useFeatureFlag, useFeatureFlags } from '@/lib/feature-flags';
import { generateRandomAvatar } from './_utils/_avatar-generator';
import { Skeleton } from '@/components/ui/skeleton';

type ViewMode = 'grid' | 'list';
type SortOption = 'name' | 'created_at' | 'updated_at' | 'tools_count';
type SortOrder = 'asc' | 'desc';

interface FilterOptions {
  hasDefaultAgent: boolean;
  hasMcpTools: boolean;
  hasAgentpressTools: boolean;
  selectedTools: string[];
}

export default function AgentsPage() {
  const { enabled: customAgentsEnabled, loading: flagLoading } = useFeatureFlag("custom_agents");
  const router = useRouter();
  useEffect(() => {
    if (!flagLoading && !customAgentsEnabled) {
      router.replace("/dashboard");
    }
  }, [flagLoading, customAgentsEnabled, router]);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  
  // Server-side parameters
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filters, setFilters] = useState<FilterOptions>({
    hasDefaultAgent: false,
    hasMcpTools: false,
    hasAgentpressTools: false,
    selectedTools: []
  });

  // Build query parameters
  const queryParams: AgentsParams = useMemo(() => {
    const params: AgentsParams = {
      page,
      limit: 20,
      search: searchQuery || undefined,
      sort_by: sortBy,
      sort_order: sortOrder,
    };

    if (filters.hasDefaultAgent) {
      params.has_default = true;
    }
    if (filters.hasMcpTools) {
      params.has_mcp_tools = true;
    }
    if (filters.hasAgentpressTools) {
      params.has_agentpress_tools = true;
    }
    if (filters.selectedTools.length > 0) {
      params.tools = filters.selectedTools.join(',');
    }

    return params;
  }, [page, searchQuery, sortBy, sortOrder, filters]);

  const { 
    data: agentsResponse, 
    isLoading, 
    error,
    refetch: loadAgents 
  } = useAgents(queryParams);
  
  const updateAgentMutation = useUpdateAgent();
  const deleteAgentMutation = useDeleteAgent();
  const createAgentMutation = useCreateAgent();
  const { optimisticallyUpdateAgent, revertOptimisticUpdate } = useOptimisticAgentUpdate();

  const agents = agentsResponse?.agents || [];
  const pagination = agentsResponse?.pagination;

  // Get all tools for filter options (we'll need to fetch this separately or compute from current page)
  const allTools = useMemo(() => {
    const toolsSet = new Set<string>();
    agents.forEach(agent => {
      agent.configured_mcps?.forEach(mcp => toolsSet.add(`mcp:${mcp.name}`));
      Object.entries(agent.agentpress_tools || {}).forEach(([tool, toolData]) => {
        if (toolData && typeof toolData === 'object' && 'enabled' in toolData && toolData.enabled) {
          toolsSet.add(`agentpress:${tool}`);
        }
      });
    });
    return Array.from(toolsSet).sort();
  }, [agents]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.hasDefaultAgent) count++;
    if (filters.hasMcpTools) count++;
    if (filters.hasAgentpressTools) count++;
    count += filters.selectedTools.length;
    return count;
  }, [filters]);

  const clearFilters = () => {
    setSearchQuery('');
    setFilters({
      hasDefaultAgent: false,
      hasMcpTools: false,
      hasAgentpressTools: false,
      selectedTools: []
    });
    setPage(1);
  };

  // Reset page when search or filters change
  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, sortBy, sortOrder, filters]);

  const handleDeleteAgent = async (agentId: string) => {
    try {
      await deleteAgentMutation.mutateAsync(agentId);
    } catch (error) {
      console.error('Error deleting agent:', error);
    }
  };

  const handleToggleDefault = async (agentId: string, currentDefault: boolean) => {
    optimisticallyUpdateAgent(agentId, { is_default: !currentDefault });
    try {
      await updateAgentMutation.mutateAsync({
        agentId,
        is_default: !currentDefault
      });
    } catch (error) {
      revertOptimisticUpdate(agentId);
      console.error('Error updating agent:', error);
    }
  };

  const handleEditAgent = (agentId: string) => {
    setEditingAgentId(agentId);
    setEditDialogOpen(true);
  };

  const handleCreateNewAgent = async () => {
    try {
      const { avatar, avatar_color } = generateRandomAvatar();
      
      const defaultAgentData = {
        name: 'New Agent',
        description: 'A newly created agent',
        system_prompt: 'You are a helpful assistant. Provide clear, accurate, and helpful responses to user queries.',
        avatar,
        avatar_color,
        configured_mcps: [],
        agentpress_tools: Object.fromEntries(
          Object.entries(DEFAULT_AGENTPRESS_TOOLS).map(([key, value]) => [
            key, 
            { enabled: value.enabled, description: value.description }
          ])
        ),
        is_default: false,
      };

      const newAgent = await createAgentMutation.mutateAsync(defaultAgentData);
      router.push(`/agents/new/${newAgent.agent_id}`);
    } catch (error) {
      console.error('Error creating agent:', error);
    }
  };

  if (flagLoading) {
    return (
      <div className="container max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Your Agents
            </h1>
            <p className="text-md text-muted-foreground max-w-2xl">
              Create and manage your AI agents with custom instructions and tools
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="p-2 bg-neutral-100 dark:bg-sidebar rounded-2xl overflow-hidden group">
              <div className="h-24 flex items-center justify-center relative bg-gradient-to-br from-opacity-90 to-opacity-100">
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
              <div className="space-y-2 mt-4 mb-4">
                <Skeleton className="h-6 w-32 rounded" />
                <Skeleton className="h-4 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!customAgentsEnabled) {
    return null;
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'An error occurred loading agents'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-8">
        <div className='w-full space-y-4 bg-gradient-to-b from-primary/10 to-primary/5 border rounded-xl h-60 flex items-center justify-center'>
          <div className="space-y-4">
            <div className="space-y-2 text-center">
              <div className='flex items-center justify-center gap-2'>
                <Bot className='h-6 w-6 text-primary' />
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Agents
                </h1>
              </div>
              <p className="text-md text-muted-foreground max-w-2xl">
                Create and manage your agents with custom instructions and tools
              </p>
            </div>
            <SearchAndFilters
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              sortBy={sortBy}
              setSortBy={setSortBy}
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
              filters={filters}
              setFilters={setFilters}
              activeFiltersCount={activeFiltersCount}
              clearFilters={clearFilters}
              viewMode={viewMode}
              setViewMode={setViewMode}
              allTools={allTools}
            />
          </div>
        </div>
        <ResultsInfo
          isLoading={isLoading}
          totalAgents={pagination?.total || 0}
          filteredCount={agents.length}
          searchQuery={searchQuery}
          activeFiltersCount={activeFiltersCount}
          clearFilters={clearFilters}
          currentPage={pagination?.page || 1}
          totalPages={pagination?.pages || 1}
        />

        {isLoading ? (
          <LoadingState viewMode={viewMode} />
        ) : agents.length === 0 ? (
          <EmptyState
            hasAgents={(pagination?.total || 0) > 0}
            onCreateAgent={handleCreateNewAgent}
            onClearFilters={clearFilters}
          />
        ) : (
          <AgentsGrid
            agents={agents}
            onEditAgent={handleEditAgent}
            onDeleteAgent={handleDeleteAgent}
            onToggleDefault={handleToggleDefault}
            deleteAgentMutation={deleteAgentMutation}
          />
        )}

        {pagination && pagination.pages > 1 && (
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.pages}
            onPageChange={setPage}
            isLoading={isLoading}
          />
        )}

        <UpdateAgentDialog
          agentId={editingAgentId}
          isOpen={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setEditingAgentId(null);
          }}
          onAgentUpdated={loadAgents}
        />
      </div>
    </div>
  );
}