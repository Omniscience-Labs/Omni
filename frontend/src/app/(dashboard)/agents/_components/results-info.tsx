import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, FileText, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCreateAgent } from '@/hooks/react-query/agents/use-agents';
import { DEFAULT_AGENTPRESS_TOOLS } from '../_data/tools';
import { generateRandomAvatar } from '../_utils/_avatar-generator';

interface ResultsInfoProps {
  isLoading: boolean;
  totalAgents: number;
  filteredCount: number;
  searchQuery: string;
  activeFiltersCount: number;
  clearFilters: () => void;
  currentPage?: number;
  totalPages?: number;
}

export const ResultsInfo = ({
  isLoading,
  totalAgents,
  filteredCount,
  searchQuery,
  activeFiltersCount,
  clearFilters,
  currentPage,
  totalPages
}: ResultsInfoProps) => {
  const router = useRouter();
  const createAgentMutation = useCreateAgent();

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
      router.push(`/agents/config/${newAgent.agent_id}`);
    } catch (error) {
      console.error('Error creating agent:', error);
    }
  };

  const handleMyTemplates = () => {
    router.push('/marketplace/my-templates');
  };

  if (isLoading || totalAgents === 0) {
    return null;
  }

  const showingText = () => {
    if (currentPage && totalPages && totalPages > 1) {
      return `Showing page ${currentPage} of ${totalPages} (${totalAgents} total agents)`;
    }
    return `Showing ${filteredCount} of ${totalAgents} agents`;
  };

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {showingText()}
        {searchQuery && ` for "${searchQuery}"`}
      </span>
      <div className="flex items-center gap-2">
        {activeFiltersCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-auto p-0">
            Clear all filters
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleMyTemplates}>
          <FileText className="h-4 w-4" />
          My Templates
        </Button>
        <Button 
          size="sm" 
          onClick={handleCreateNewAgent}
          disabled={createAgentMutation.isPending}
        >
          {createAgentMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Plus className="h-4 w-4" />
              New Agent
            </>
          )}
        </Button>
      </div>
    </div>
  );
}