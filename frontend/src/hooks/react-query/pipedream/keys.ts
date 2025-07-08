export const pipedreamKeys = {
  all: ['pipedream'] as const,
  connections: () => [...pipedreamKeys.all, 'connections'] as const,
  connectionToken: (app?: string) => [...pipedreamKeys.all, 'connection-token', app || 'default'] as const,
  health: () => [...pipedreamKeys.all, 'health'] as const,
  config: () => [...pipedreamKeys.all, 'config'] as const,
  workflows: () => [...pipedreamKeys.all, 'workflows'] as const,
  workflowRuns: (workflowId: string) => [...pipedreamKeys.all, 'workflow-runs', workflowId] as const,
  apps: (page: number, search?: string, category?: string) => [...pipedreamKeys.all, 'apps', page, search || '', category || ''] as const,
  availableTools: () => [...pipedreamKeys.all, 'available-tools'] as const,
  mcpDiscovery: (options?: { app_slug?: string; oauth_app_id?: string; custom?: boolean }) => 
    [...pipedreamKeys.all, 'mcp-discovery', options?.app_slug, options?.oauth_app_id, options?.custom] as const,
}; 