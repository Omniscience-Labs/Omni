export const composioKeys = {
  all: ['composio'] as const,
  toolkits: (search?: string) => [...composioKeys.all, 'toolkits', search || ''] as const,
  toolkit: (slug: string) => [...composioKeys.all, 'toolkit', slug] as const,
  authConfigs: () => [...composioKeys.all, 'auth-configs'] as const,
  authConfig: (id: string) => [...composioKeys.all, 'auth-config', id] as const,
  connectedAccounts: () => [...composioKeys.all, 'connected-accounts'] as const,
  connectedAccount: (id: string) => [...composioKeys.all, 'connected-account', id] as const,
  mcpServers: () => [...composioKeys.all, 'mcp-servers'] as const,
  mcpServer: (id: string) => [...composioKeys.all, 'mcp-server', id] as const,
  
  profiles: {
    all: () => [...composioKeys.all, 'profiles'] as const,
    list: (params?: { toolkit_slug?: string; is_active?: boolean }) => 
      [...composioKeys.profiles.all(), 'list', params?.toolkit_slug || '', params?.is_active ?? ''] as const,
    detail: (profileId: string) => [...composioKeys.profiles.all(), 'detail', profileId] as const,
    mcpConfig: (profileId: string) => [...composioKeys.profiles.all(), 'mcp-config', profileId] as const,
  }
}; 