'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createQueryHook } from '@/hooks/use-query';
import { 
  pipedreamApi, 
  type CreateConnectionTokenRequest,
  type ConnectionTokenResponse,
  type ConnectionResponse,
  type PipedreamHealthCheckResponse,
  type TriggerWorkflowRequest,
  type TriggerWorkflowResponse,
  type WorkflowRun,
  type PipedreamConfigStatus,
} from './utils';
import { pipedreamKeys } from './keys';

export const usePipedreamConnections = createQueryHook(
  pipedreamKeys.connections(),
  async (): Promise<ConnectionResponse> => {
    return await pipedreamApi.getConnections();
  },
  {
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  }
);

export const useCreateConnectionToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: CreateConnectionTokenRequest): Promise<ConnectionTokenResponse> => {
      return await pipedreamApi.createConnectionToken(request);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: pipedreamKeys.connections() });
      queryClient.setQueryData(pipedreamKeys.connectionToken(variables.app), data);
    },
    onError: (error) => {
      console.error('Failed to create connection token:', error);
    },
  });
};

export const useRefreshConnections = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ConnectionResponse> => {
      return await pipedreamApi.getConnections();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(pipedreamKeys.connections(), data);
    },
    onError: (error) => {
      console.error('Failed to refresh connections:', error);
    },
  });
};

export const useInvalidatePipedreamQueries = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: pipedreamKeys.all });
  };
}; 