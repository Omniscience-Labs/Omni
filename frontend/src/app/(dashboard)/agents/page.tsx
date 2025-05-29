'use client';

import React, { useState } from 'react';
import { Plus, AlertCircle } from 'lucide-react';
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
import { useAgentsFiltering } from './_hooks/use-agents-filtering';
import { useRouter } from 'next/navigation';
import { DEFAULT_AGENTPRESS_TOOLS } from './_data/tools';

type ViewMode = 'grid' | 'list';

export default function AgentsPage() {
  const router = useRouter();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const { 
    data: agents = [], 
    isLoading, 
    error,
    refetch: loadAgents 
  } = useAgents();
  
  const updateAgentMutation = useUpdateAgent();
  const deleteAgentMutation = useDeleteAgent();
  const createAgentMutation = useCreateAgent();
  const { optimisticallyUpdateAgent, revertOptimisticUpdate } = useOptimisticAgentUpdate();

  const {
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    filters,
    setFilters,
    filteredAndSortedAgents,
    allTools,
    activeFiltersCount,
    clearFilters
  } = useAgentsFiltering(agents);

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
      const defaultAgentData = {
        name: 'New Agent',
        description: 'A newly created agent',
        system_prompt: 'You are a helpful assistant. Provide clear, accurate, and helpful responses to user queries.',
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Your Agents
            </h1>
            <p className="text-md text-muted-foreground max-w-2xl">
              Create and manage your AI agents with custom instructions and tools
            </p>
          </div>
          <Button 
            onClick={handleCreateNewAgent}
            disabled={createAgentMutation.isPending}
            className="self-start sm:self-center"
          >
            {createAgentMutation.isPending ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-5 w-5" />
                New Agent
              </>
            )}
          </Button>
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

        <ResultsInfo
          isLoading={isLoading}
          totalAgents={agents.length}
          filteredCount={filteredAndSortedAgents.length}
          searchQuery={searchQuery}
          activeFiltersCount={activeFiltersCount}
          clearFilters={clearFilters}
        />

        {isLoading ? (
          <LoadingState viewMode={viewMode} />
        ) : filteredAndSortedAgents.length === 0 ? (
          <EmptyState
            hasAgents={agents.length > 0}
            onCreateAgent={handleCreateNewAgent}
            onClearFilters={clearFilters}
          />
        ) : (
          <AgentsGrid
            agents={filteredAndSortedAgents}
            onEditAgent={handleEditAgent}
            onDeleteAgent={handleDeleteAgent}
            onToggleDefault={handleToggleDefault}
            deleteAgentMutation={deleteAgentMutation}
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