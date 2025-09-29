export interface KnowledgeBaseEntry {
    source_metadata: any;
    source_type: string;
    file_size: any;
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

  export interface FileUploadRequest {
    agentId: string;
    file: File;
  }

  export interface GitCloneRequest {
    agentId: string;
    git_url: string;
    branch?: string;
  }

  export interface ProcessingJob {
    job_id: string;
    job_type: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    source_info: Record<string, any>;
    result_info: Record<string, any>;
    entries_created: number;
    total_files: number;
    created_at: string;
    completed_at?: string;
    error_message?: string;
  }

  export interface ProcessingJobsResponse {
    jobs: ProcessingJob[];
  }

  export interface UploadResponse {
    job_id: string;
    message: string;
  }

  export interface CloneResponse {
    job_id: string;
    message: string;
  }

  // Import LlamaCloud types for unified interface
  export interface LlamaCloudKnowledgeBase {
    id: string;
    name: string;
    index_name: string;
    description?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }

  // Unified Knowledge Base Types
  export interface UnifiedKnowledgeBaseEntry {
    id: string;
    name: string;
    description?: string;
    type: 'regular' | 'llamacloud';
    is_active: boolean;
    created_at: string;
    updated_at: string;
    
    // Fields for regular KB entries
    entry_id?: string;
    content?: string;
    usage_context?: 'always' | 'on_request' | 'contextual';
    content_tokens?: number;
    source_type?: string;
    source_metadata?: any;
    file_size?: number;
    file_mime_type?: string;
    
    // Fields for LlamaCloud KB entries
    index_name?: string;
  }

  export interface UnifiedKnowledgeBaseListResponse {
    regular_entries: KnowledgeBaseEntry[];
    llamacloud_entries: LlamaCloudKnowledgeBase[];
    total_regular_count: number;
    total_llamacloud_count: number;
    total_tokens?: number;
  }

  // Unified Assignment Types
  export interface UnifiedAssignmentRequest {
    regular_entry_ids: string[];
    llamacloud_kb_ids: string[];
  }

  export interface UnifiedAssignmentResponse {
    regular_assignments: Record<string, boolean>;
    llamacloud_assignments: Record<string, boolean>;
    total_regular_count: number;
    total_llamacloud_count: number;
  }