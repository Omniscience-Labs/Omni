// LlamaCloud Knowledge Base Types

// Knowledge Base Entity (agent-scoped, id = kb_id)
export interface LlamaCloudKnowledgeBase {
  id: string;
  name: string;
  index_name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Account-level KB entity (returned by GET /llamacloud, uses kb_id field)
export interface AccountLlamaCloudKnowledgeBase {
  kb_id: string;
  name: string;
  index_name: string;
  description?: string;
  summary?: string;
  usage_context?: string;
  folder_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// List Response
export interface LlamaCloudKnowledgeBaseListResponse {
  knowledge_bases: LlamaCloudKnowledgeBase[];
  total_count: number;
}

// Account list response
export interface AccountLlamaCloudKBListResponse {
  knowledge_bases: AccountLlamaCloudKnowledgeBase[];
  total_count: number;
}

// Unified agent assignments
export interface AgentUnifiedAssignments {
  regular_assignments: Record<string, boolean>;
  llamacloud_assignments: Record<string, boolean>;
  total_regular_count: number;
  total_llamacloud_count: number;
}

// Create Request
export interface CreateLlamaCloudKnowledgeBaseRequest {
  name: string;
  index_name: string;
  description?: string;
}

// Update Request (all fields optional)
export interface UpdateLlamaCloudKnowledgeBaseRequest {
  name?: string;
  index_name?: string;
  description?: string;
  is_active?: boolean;
}

// Test Search Types
export interface TestSearchRequest {
  index_name: string;
  query: string;
}

export interface TestSearchResponse {
  success: boolean;
  message: string;
  results: SearchResult[];
  index_name: string;
  query: string;
}

export interface SearchResult {
  rank: number;
  score: number;
  text: string;
  metadata: Record<string, any>;
}
