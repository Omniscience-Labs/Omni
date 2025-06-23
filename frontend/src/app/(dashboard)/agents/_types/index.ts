export type SortOption = 'name' | 'created_at' | 'updated_at' | 'tools_count';
export type SortOrder = 'asc' | 'desc';
export type ViewMode = 'grid' | 'list';

export interface FilterOptions {
  hasDefaultAgent: boolean;
  hasMcpTools: boolean;
  hasAgentpressTools: boolean;
  selectedTools: string[];
}

export interface AgentVersion {
  version_id: string;
  agent_id: string;
  version_number: number;
  version_name: string;
  system_prompt: string;
  configured_mcps?: Array<{ name: string }>;
  custom_mcps?: Array<any>;
  agentpress_tools?: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface Agent {
  agent_id: string;
  name: string;
  description?: string;
  is_default: boolean;
  created_at: string;
  updated_at?: string;
  configured_mcps?: Array<{ name: string }>;
  agentpress_tools?: Record<string, any>;
  current_version_id?: string;
  version_count?: number;
  current_version?: AgentVersion;
}

export interface MutationState {
  isPending: boolean;
}