import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { backendApi } from '@/lib/api-client';
import { agentKeys } from './keys';

export interface PipedreamTool {
  name: string;
  description: string;
  enabled: boolean;
}

export interface PipedreamToolsResponse {
  profile_id: string;
  app_name: string;
  profile_name: string;
  tools: PipedreamTool[];
  has_mcp_config: boolean;
}

export interface UpdatePipedreamToolsRequest {
  enabled_tools: string[];
}

export const usePipedreamToolsForAgent = (agentId: string, profileId: string) => {
  return useQuery({
    queryKey: ['pipedream-tools', agentId, profileId],
    queryFn: async (): Promise<PipedreamToolsResponse> => {
      const response = await backendApi.get(`/agents/${agentId}/pipedream-tools/${profileId}`);
      return response.data;
    },
    enabled: !!agentId && !!profileId,
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error: any) => {
      if (error?.response?.status === 404 || error?.response?.status === 400) {
        return false;
      }
      return failureCount < 2;
    },
  });
};

export const useUpdatePipedreamToolsForAgent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      agentId,
      profileId,
      enabledTools,
    }: {
      agentId: string;
      profileId: string;
      enabledTools: string[];
    }) => {
      const response = await backendApi.put(
        `/agents/${agentId}/pipedream-tools/${profileId}`,
        { enabled_tools: enabledTools }
      );
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['pipedream-tools', variables.agentId, variables.profileId],
      });
      queryClient.invalidateQueries({
        queryKey: agentKeys.detail(variables.agentId),
      });
      queryClient.invalidateQueries({
        queryKey: ['agent-tools', variables.agentId],
      });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.detail || 'Failed to update Pipedream tools';
      toast.error(message);
    },
  });
};


export const usePipedreamToolsData = (agentId: string, profileId: string) => {
  const { data, isLoading, error, refetch } = usePipedreamToolsForAgent(agentId, profileId);
  const updateMutation = useUpdatePipedreamToolsForAgent();

  const handleUpdateTools = (enabledTools: string[]) => {
    updateMutation.mutate({ agentId, profileId, enabledTools });
  };

  return {
    data,
    isLoading,
    error,
    refetch,
    handleUpdateTools,
    isUpdating: updateMutation.isPending,
  };
}; 