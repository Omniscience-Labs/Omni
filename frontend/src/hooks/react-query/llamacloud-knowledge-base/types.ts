// LlamaCloud Knowledge Base Types

// Knowledge Base Entity
export interface LlamaCloudKnowledgeBase {
  id: string;
  name: string;
  index_name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// List Response
export interface LlamaCloudKnowledgeBaseListResponse {
  knowledge_bases: LlamaCloudKnowledgeBase[];
  total_count: number;
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
