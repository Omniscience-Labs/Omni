import { backendApi } from '@/lib/api-client';

// Composio Toolkit Interface
export interface ComposioToolkit {
  slug: string;
  name: string;
  description?: string;
  logo?: string;
  tags: string[];
  auth_schemes: string[];
}

export interface ComposioToolkitsResponse {
  success: boolean;
  toolkits: ComposioToolkit[];
  error?: string;
}

// Composio Profile Interface
export interface ComposioProfile {
  profile_id: string;
  profile_name: string;
  display_name: string;
  toolkit_slug: string;
  toolkit_name: string;
  mcp_url: string;
  redirect_url?: string;
  is_connected: boolean;
  is_default: boolean;
  created_at: string;
}

export interface ComposioProfilesResponse {
  success: boolean;
  profiles: ComposioProfile[];
  error?: string;
}

export interface CreateComposioProfileRequest {
  toolkit_slug: string;
  profile_name: string;
  display_name?: string;
  user_id?: string;
  mcp_server_name?: string;
  is_default?: boolean;
}

export interface CreateComposioProfileResponse {
  success: boolean;
  profile_id: string;
  redirect_url?: string;
  mcp_url: string;  // The complete MCP URL
  error?: string;
}

export interface ComposioMcpConfigResponse {
  success: boolean;
  mcp_config: {
    name: string;
    customType: string;
    type: string;
    config: {
      url: string;
    };
    enabledTools: string[];
  };
  error?: string;
}

// Composio API Client
export const composioApi = {
  async getToolkits(search?: string): Promise<ComposioToolkitsResponse> {
    const params = new URLSearchParams();
    
    if (search) {
      params.append('search', search);
    }
    
    const result = await backendApi.get<ComposioToolkitsResponse>(
      `/composio/toolkits${params.toString() ? `?${params.toString()}` : ''}`,
      {
        errorContext: { operation: 'load toolkits', resource: 'Composio toolkits' },
      }
    );

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to get toolkits');
    }

    return result.data!;
  },

  async getProfiles(params?: { toolkit_slug?: string; is_active?: boolean }): Promise<ComposioProfile[]> {
    const queryParams = new URLSearchParams();
    
    if (params?.toolkit_slug) {
      queryParams.append('toolkit_slug', params.toolkit_slug);
    }
    
    if (params?.is_active !== undefined) {
      queryParams.append('is_active', params.is_active.toString());
    }
    
    const result = await backendApi.get<ComposioProfilesResponse>(
      `/composio/profiles${queryParams.toString() ? `?${queryParams.toString()}` : ''}`,
      {
        errorContext: { operation: 'load profiles', resource: 'Composio profiles' },
      }
    );

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to get profiles');
    }

    return result.data!.profiles;
  },

  async createProfile(request: CreateComposioProfileRequest): Promise<CreateComposioProfileResponse> {
    const result = await backendApi.post<CreateComposioProfileResponse>(
      '/composio/profiles',
      request,
      {
        errorContext: { operation: 'create profile', resource: 'Composio profile' },
      }
    );

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to create profile');
    }

    return result.data!;
  },

  async getMcpConfigForProfile(profileId: string): Promise<ComposioMcpConfigResponse> {
    const result = await backendApi.get<ComposioMcpConfigResponse>(
      `/composio/profiles/${profileId}/mcp-config`,
      {
        errorContext: { operation: 'get MCP config', resource: 'Composio profile MCP config' },
      }
    );

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to get MCP config');
    }

    return result.data!;
  },

  async discoverTools(profileId: string): Promise<{ success: boolean; tools: any[]; toolkit_name: string; total_tools: number }> {
    const result = await backendApi.post<{ success: boolean; tools: any[]; toolkit_name: string; total_tools: number }>(
      `/composio/discover-tools/${profileId}`,
      {},
      {
        errorContext: { operation: 'discover tools', resource: 'Composio profile tools' },
      }
    );

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to discover tools');
    }

    return result.data!;
  },
}; 