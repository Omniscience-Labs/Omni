export const workflowKeys = {
  all: ['workflows'] as const,
  lists: () => [...workflowKeys.all, 'list'] as const,
  list: (filters: string) => [...workflowKeys.lists(), { filters }] as const,
  details: () => [...workflowKeys.all, 'detail'] as const,
  detail: (id: string) => [...workflowKeys.details(), id] as const,
  flow: (id: string) => [...workflowKeys.detail(id), 'flow'] as const,
  executions: (id: string) => [...workflowKeys.detail(id), 'executions'] as const,
  execution: (workflowId: string, executionId: string) => [...workflowKeys.executions(workflowId), executionId] as const,
  templates: () => [...workflowKeys.all, 'templates'] as const,
  tools: () => [...workflowKeys.all, 'tools'] as const,
  mcpTools: () => [...workflowKeys.all, 'mcp-tools'] as const,
  builderNodes: () => [...workflowKeys.all, 'builder-nodes'] as const,
}; 