import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getAgentVersions, 
  createAgentVersion, 
  activateAgentVersion,
  getAgentVersion,
  AgentVersion,
  AgentVersionCreateRequest
} from './utils';
import { agentKeys } from './keys';
import { toast } from 'sonner';

export const useAgentVersions = (agentId: string) => {
  return useQuery({
    queryKey: ['agent-versions', agentId],
    queryFn: () => getAgentVersions(agentId),
    enabled: !!agentId,
  });
};

export const useAgentVersion = (agentId: string, versionId: string | null | undefined) => {
  return useQuery({
    queryKey: ['agent-version', agentId, versionId],
    queryFn: () => getAgentVersion(agentId, versionId!),
    enabled: !!agentId && !!versionId,
  });
};

export const useCreateAgentVersion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ agentId, data }: { agentId: string; data: AgentVersionCreateRequest }) =>
      createAgentVersion(agentId, data),
    onSuccess: (newVersion, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-versions', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success(`Created version ${newVersion.version_name}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create version');
    },
  });
};

export const useActivateAgentVersion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ agentId, versionId }: { agentId: string; versionId: string }) =>
      activateAgentVersion(agentId, versionId),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent-versions', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Version activated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to activate version');
    },
  });
}; 