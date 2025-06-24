export interface KnowledgeBaseEntry {
    entry_id: string;
    name: string;
    description?: string;
    content: string;
    usage_context: 'always' | 'on_request' | 'contextual';
    is_active: boolean;
    content_tokens?: number;
    created_at: string;
    updated_at: string;
  }
  
  export interface KnowledgeBaseListResponse {
    entries: KnowledgeBaseEntry[];
    total_count: number;
    total_tokens: number;
  }
  
  export interface CreateKnowledgeBaseEntryRequest {
    name: string;
    description?: string;
    content: string;
    usage_context?: 'always' | 'on_request' | 'contextual';
  }
  
  export interface UpdateKnowledgeBaseEntryRequest {
    name?: string;
    description?: string;
    content?: string;
    usage_context?: 'always' | 'on_request' | 'contextual';
    is_active?: boolean;
  }