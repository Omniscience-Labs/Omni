// LlamaCloud Knowledge Base Query Keys - separate from existing knowledge base

export const llamacloudKnowledgeBaseKeys = {
  all: ['llamacloud-knowledge-base'] as const,
  agent: (agentId: string) => [...llamacloudKnowledgeBaseKeys.all, 'agent', agentId] as const,
  entry: (entryId: string) => [...llamacloudKnowledgeBaseKeys.all, 'entry', entryId] as const,
  testSearch: (agentId: string, query: string) => [...llamacloudKnowledgeBaseKeys.all, 'test-search', agentId, query] as const,
};
