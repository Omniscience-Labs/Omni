// Query keys for LlamaCloud Knowledge Base

export const llamacloudKnowledgeBaseKeys = {
  all: ['llamacloud-knowledge-bases'] as const,
  agent: (agentId: string) =>
    [...llamacloudKnowledgeBaseKeys.all, 'agent', agentId] as const,
  entry: (kbId: string) =>
    [...llamacloudKnowledgeBaseKeys.all, 'entry', kbId] as const,
  account: (includeInactive = false) =>
    [...llamacloudKnowledgeBaseKeys.all, 'account', includeInactive] as const,
  agentAssignments: (agentId: string) =>
    [...llamacloudKnowledgeBaseKeys.all, 'assignments', agentId] as const,
};
