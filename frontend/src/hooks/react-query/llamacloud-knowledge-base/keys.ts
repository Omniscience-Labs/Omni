// Query keys for LlamaCloud Knowledge Base

export const llamacloudKnowledgeBaseKeys = {
  all: ['llamacloud-knowledge-bases'] as const,
  agent: (agentId: string) => 
    [...llamacloudKnowledgeBaseKeys.all, 'agent', agentId] as const,
  entry: (kbId: string) => 
    [...llamacloudKnowledgeBaseKeys.all, 'entry', kbId] as const,
};
