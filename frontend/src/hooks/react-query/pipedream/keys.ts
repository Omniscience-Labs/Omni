export const pipedreamKeys = {
  all: ['pipedream'] as const,
  connections: () => [...pipedreamKeys.all, 'connections'] as const,
  connectionToken: (app?: string) => [...pipedreamKeys.all, 'connection-token', app] as const,
  health: () => [...pipedreamKeys.all, 'health'] as const,
  config: () => [...pipedreamKeys.all, 'config'] as const,
  workflows: () => [...pipedreamKeys.all, 'workflows'] as const,
  workflowRuns: (workflowId: string, limit: number) => 
    [...pipedreamKeys.workflows(), workflowId, 'runs', limit] as const,
  mcpDiscovery: (options?: { app_slug?: string; oauth_app_id?: string }) => 
    [...pipedreamKeys.all, 'mcp-discovery', options?.app_slug, options?.oauth_app_id] as const,
}; 