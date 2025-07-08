import { createQueryHook } from '@/hooks/use-query';
import { backendApi } from '@/lib/api-client';
import { pipedreamKeys } from './keys';

export interface CreateConnectionTokenRequest {
  app?: string;
}

export interface ConnectionTokenResponse {
  success: boolean;
  link?: string;
  token?: string;
  external_user_id: string;
  app?: string;
  expires_at?: string;
  error?: string;
}

export interface ConnectionResponse {
  success: boolean;
  connections: Connection[];
  count: number;
  error?: string;
}

export interface Connection {
  id: string;
  app: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface PipedreamHealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  project_id: string;
  environment: string;
  has_access_token: boolean;
  error?: string;
}

export interface TriggerWorkflowRequest {
  workflow_id: string;
  payload: Record<string, any>;
}

export interface TriggerWorkflowResponse {
  success: boolean;
  workflow_id: string;
  run_id?: string;
  status?: string;
  error?: string;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: string;
  completed_at?: string;
  error?: string;
  [key: string]: any;
}

export interface PipedreamConfigStatus {
  success: boolean;
  project_id: string;
  environment: string;
  has_client_id: boolean;
  has_client_secret: boolean;
  base_url: string;
}

export const usePipedreamConnections = createQueryHook(
  pipedreamKeys.connections(),
  async (): Promise<ConnectionResponse> => {
    return await pipedreamApi.getConnections();
  },
  {
    staleTime: 10 * 60 * 1000, // 10 minutes instead of 2 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes cache time
    refetchOnWindowFocus: false, // 🚨 DISABLE this to prevent excessive refetching
    refetchOnMount: false, // Only refetch if data is stale
    refetchInterval: false, // No polling
  }
);

export const pipedreamApi = {
  async createConnectionToken(request: CreateConnectionTokenRequest = {}): Promise<ConnectionTokenResponse> {
    const result = await backendApi.post<ConnectionTokenResponse>(
      '/pipedream/connection-token',
      request,
      {
        errorContext: { operation: 'create connection token', resource: 'Pipedream connection' },
      }
    );

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to create connection token');
    }

    return result.data!;
  },

  async getConnections(): Promise<ConnectionResponse> {
    const result = await backendApi.get<ConnectionResponse>(
      '/pipedream/connections',
      {
        errorContext: { operation: 'load connections', resource: 'Pipedream connections' },
      }
    );

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to get connections');
    }

    return result.data!;
  },

  async healthCheck(): Promise<PipedreamHealthCheckResponse> {
    const result = await backendApi.get<PipedreamHealthCheckResponse>(
      '/pipedream/health',
      {
        errorContext: { operation: 'health check', resource: 'Pipedream service' },
      }
    );

    if (!result.success) {
      throw new Error(result.error?.message || 'Health check failed');
    }

    return result.data!;
  },
}; 