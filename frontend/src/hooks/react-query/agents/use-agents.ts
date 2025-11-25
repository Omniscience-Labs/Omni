import { createMutationHook, createQueryHook } from '@/hooks/use-query';
import { useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { toast } from 'sonner';
import { agentKeys } from './keys';
import { Agent, AgentUpdateRequest, AgentsParams, createAgent, deleteAgent, getAgent, getAgents, getThreadAgent, updateAgent } from './utils';
import { useRef, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_AGENTPRESS_TOOLS } from '@/components/agents/tools';

// Standard default params for consistent caching across components
const DEFAULT_AGENTS_PARAMS: AgentsParams = {
  limit: 100,
  sort_by: 'name',
  sort_order: 'asc'
};

export const useAgents = (
  params: AgentsParams = {},
  customOptions?: Omit<
    UseQueryOptions<Awaited<ReturnType<typeof getAgents>>, Error, Awaited<ReturnType<typeof getAgents>>, ReturnType<typeof agentKeys.list>>,
    'queryKey' | 'queryFn'
  >,
) => {
  // Normalize params - use defaults if empty object to improve cache hit rate
  const normalizedParams = Object.keys(params).length === 0 ? DEFAULT_AGENTS_PARAMS : params;
  
  return createQueryHook(
    agentKeys.list(normalizedParams),
    () => getAgents(normalizedParams),
    {
      staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 min
      gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache for 10 min
      refetchOnWindowFocus: false, // Don't refetch on window focus
      refetchOnMount: false, // Don't refetch on mount if data is fresh
    }
  )(customOptions);
};

export const useAgent = (agentId: string) => {
  return createQueryHook(
    agentKeys.detail(agentId),
    () => getAgent(agentId),
    {
      enabled: !!agentId,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    }
  )();
};

export const useCreateAgent = () => {
  const queryClient = useQueryClient();
  
  return createMutationHook(
    createAgent,
    {
      onSuccess: (data) => {
        // Set the new agent detail immediately
        queryClient.setQueryData(agentKeys.detail(data.agent_id), data);
        
        // Optimistically update all list queries
        queryClient.setQueriesData(
          { queryKey: agentKeys.lists() },
          (old: any) => {
            if (!old || !old.agents) return old;
            return {
              ...old,
              agents: [data, ...old.agents],
              pagination: old.pagination ? {
                ...old.pagination,
                total: (old.pagination.total || 0) + 1
              } : undefined
            };
          }
        );
        
        // Defer invalidation to reduce immediate refetches
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
        }, 1000);
        
        toast.success('Agent created successfully');
      },
      onError: async (error) => {
        const { AgentCountLimitError } = await import('@/lib/api');
        if (error instanceof AgentCountLimitError) {
          return;
        }
        console.error('Error creating agent:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to create agent');
      },
    }
  )();
};

export const useCreateNewAgent = () => {
  const router = useRouter();
  const createAgentMutation = useCreateAgent();
  
  return createMutationHook(
    async (_: void) => {
      const defaultAgentData = {
        name: 'New Agent',
        description: 'A newly created agent, open for configuration',
        configured_mcps: [],
        agentpress_tools: DEFAULT_AGENTPRESS_TOOLS,
        is_default: false,
        icon_name: 'brain',
        icon_color: '#000000',
        icon_background: '#F3F4F6',
      };

      const newAgent = await createAgentMutation.mutateAsync(defaultAgentData);
      return newAgent;
    },
    {
      onSuccess: (newAgent) => {
      },
      onError: (error) => {
        console.error('Error creating agent:', error);
        toast.error('Failed to create agent. Please try again.');
      },
    }
  )();
};

export const useUpdateAgent = () => {
  const queryClient = useQueryClient();
  
  return createMutationHook(
    ({ agentId, ...data }: { agentId: string } & AgentUpdateRequest) => 
      updateAgent(agentId, data),
    {
      onSuccess: (data, variables) => {
        // Update the specific agent detail query
        queryClient.setQueryData(agentKeys.detail(variables.agentId), data);
        
        // Optimistically update all list queries instead of invalidating
        // This prevents unnecessary refetches
        queryClient.setQueriesData(
          { queryKey: agentKeys.lists() },
          (old: any) => {
            if (!old || !old.agents) return old;
            const updatedAgents = old.agents.map((agent: any) =>
              agent.agent_id === variables.agentId ? data : agent
            );
            return { ...old, agents: updatedAgents };
          }
        );
        
        // Only invalidate if we need fresh data (e.g., after a delay)
        // This reduces immediate refetches
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
        }, 1000);
      },
    }
  )();
};

export const useDeleteAgent = () => {
  const queryClient = useQueryClient();
  
  return createMutationHook(
    deleteAgent,
    {
      onMutate: async (agentId) => {
        // Cancel any outgoing refetches
        await queryClient.cancelQueries({ queryKey: agentKeys.lists() });
        
        // Snapshot the previous value
        const previousAgents = queryClient.getQueriesData({ queryKey: agentKeys.lists() });
        
        // Optimistically update to remove the agent
        queryClient.setQueriesData({ queryKey: agentKeys.lists() }, (old: any) => {
          if (!old || !old.agents) return old;
          
          return {
            ...old,
            agents: old.agents.filter((agent: any) => agent.agent_id !== agentId),
            pagination: old.pagination ? {
              ...old.pagination,
              total: Math.max(0, old.pagination.total - 1)
            } : undefined
          };
        });
        
        return { previousAgents };
      },
      onError: (err, agentId, context) => {
        // Revert the optimistic update on error
        if (context?.previousAgents) {
          context.previousAgents.forEach(([queryKey, data]) => {
            queryClient.setQueryData(queryKey, data);
          });
        }
        toast.error('Failed to delete agent. Please try again.');
      },
      onSuccess: (_, agentId) => {
        // Remove the individual agent query
        queryClient.removeQueries({ queryKey: agentKeys.detail(agentId) });
        toast.success('Agent deleted successfully');
      },
      onSettled: () => {
        // Always invalidate to ensure consistency
        queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
      },
    }
  )();
};

export const useOptimisticAgentUpdate = () => {
  const queryClient = useQueryClient();
  
  return {
    optimisticallyUpdateAgent: (agentId: string, updates: Partial<Agent>) => {
      queryClient.setQueryData(
        agentKeys.detail(agentId),
        (oldData: Agent | undefined) => {
          if (!oldData) return oldData;
          return { ...oldData, ...updates };
        }
      );
    },
    
    revertOptimisticUpdate: (agentId: string) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(agentId) });
    },
  };
};

export const useAgentDeletionState = () => {
  const [deletingAgents, setDeletingAgents] = useState<Set<string>>(new Set());
  const deleteAgentMutation = useDeleteAgent();

  const deleteAgent = useCallback(async (agentId: string) => {
    // Add to deleting set immediately for UI feedback
    setDeletingAgents(prev => new Set(prev).add(agentId));
    
    try {
      await deleteAgentMutation.mutateAsync(agentId);
    } finally {
      // Remove from deleting set regardless of success/failure
      setDeletingAgents(prev => {
        const newSet = new Set(prev);
        newSet.delete(agentId);
        return newSet;
      });
    }
  }, [deleteAgentMutation]);

  return {
    deleteAgent,
    isDeletingAgent: (agentId: string) => deletingAgents.has(agentId),
    isDeleting: deleteAgentMutation.isPending,
  };
};

export const useThreadAgent = (threadId: string) => {
  return createQueryHook(
    agentKeys.threadAgent(threadId),
    () => getThreadAgent(threadId),
    {
      enabled: !!threadId,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    }
  )();
};