'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchBar } from './search-bar';
import { EmptyState } from '../empty-state';
import { AgentsGrid } from '../agents-grid';
import { LoadingState } from '../loading-state';
import { Pagination } from '../pagination';

interface MyAgentsTabProps {
  agentsSearchQuery: string;
  setAgentsSearchQuery: (value: string) => void;
  agentsLoading: boolean;
  agents: any[];
  agentsPagination: any;
  viewMode: 'grid' | 'list';
  onCreateAgent: () => void;
  onEditAgent: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  onToggleDefault: (agentId: string, currentDefault: boolean) => void;
  onClearFilters: () => void;
  deleteAgentMutation: any;
  setAgentsPage: (page: number) => void;
}

export const MyAgentsTab = ({
  agentsSearchQuery,
  setAgentsSearchQuery,
  agentsLoading,
  agents,
  agentsPagination,
  viewMode,
  onCreateAgent,
  onEditAgent,
  onDeleteAgent,
  onToggleDefault,
  onClearFilters,
  deleteAgentMutation,
  setAgentsPage
}: MyAgentsTabProps) => {
  return (
    <div className="space-y-6 mt-8">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
        <SearchBar
          placeholder="Search your agents..."
          value={agentsSearchQuery}
          onChange={setAgentsSearchQuery}
        />
        <Button onClick={onCreateAgent} className='rounded-xl'>
          <Plus className="h-4 w-4" />
          Create Agent
        </Button>
      </div>

      {agentsLoading ? (
        <LoadingState viewMode={viewMode} />
      ) : agents.length === 0 ? (
        <EmptyState
          hasAgents={(agentsPagination?.total || 0) > 0}
          onCreateAgent={onCreateAgent}
          onClearFilters={onClearFilters}
        />
      ) : (
        <AgentsGrid
          agents={agents}
          onEditAgent={onEditAgent}
          onDeleteAgent={onDeleteAgent}
          onToggleDefault={onToggleDefault}
          deleteAgentMutation={deleteAgentMutation}
        />
      )}

      {agentsPagination && agentsPagination.pages > 1 && (
        <Pagination
          currentPage={agentsPagination.page}
          totalPages={agentsPagination.pages}
          onPageChange={setAgentsPage}
          isLoading={agentsLoading}
        />
      )}
    </div>
  );
}; 