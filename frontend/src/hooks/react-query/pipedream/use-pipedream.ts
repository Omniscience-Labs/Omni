'use client';

import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { createQueryHook } from '@/hooks/use-query';
import { backendApi } from '@/lib/api-client';
import { 
  pipedreamApi, 
  type CreateConnectionTokenRequest,
  type ConnectionTokenResponse,
  type ConnectionResponse,
  type PipedreamAppResponse,
  type PipedreamToolsResponse,
} from './utils';
import { pipedreamKeys } from './keys';

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

export const usePipedreamApps = (page: number = 1, search?: string, category?: string) => {
  return useQuery({
    queryKey: ['pipedream', 'apps', page, search, category],
    queryFn: async (): Promise<PipedreamAppResponse> => {
      return await pipedreamApi.getApps(page, search, category);
    },
    staleTime: 5 * 60 * 1000, 
    retry: 2,
  });
};

export const usePipedreamAppsSearch = (query: string, page: number = 1, category?: string) => {
  return useQuery({
    queryKey: ['pipedream', 'apps', 'search', query, page, category],
    queryFn: async (): Promise<PipedreamAppResponse> => {
      return await pipedreamApi.searchApps(query, page, category);
    },
    staleTime: 5 * 60 * 1000, 
    retry: 2,
    enabled: !!query && query.length > 0,
  });
};

export const usePipedreamAvailableTools = createQueryHook(
  pipedreamKeys.availableTools(),
  async (forceRefresh: boolean = false): Promise<PipedreamToolsResponse> => {
    const params = new URLSearchParams();
    if (forceRefresh) {
      params.append('force_refresh', 'true');
    }
    
    const url = `/pipedream/mcp/available-tools${params.toString() ? `?${params.toString()}` : ''}`;
    const result = await backendApi.get<PipedreamToolsResponse>(url, {
      errorContext: { operation: 'load available tools', resource: 'Pipedream tools' },
    });
    if (result.success && result.data) {
      if (result.data.success) {
        return result.data;
      } else {
        throw new Error(result.data.error || 'Failed to get available tools');
      }
    } else {
      throw new Error(result.error?.message || 'Failed to get available tools');
    }
  },
  {
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: (failureCount, error) => {
      if (failureCount < 2) {
        const errorMessage = error?.message?.toLowerCase() || '';
        return !errorMessage.includes('unauthorized') && !errorMessage.includes('forbidden');
      }
      return false;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  }
); 
