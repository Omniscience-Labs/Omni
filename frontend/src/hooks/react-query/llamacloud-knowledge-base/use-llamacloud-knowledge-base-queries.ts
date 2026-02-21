import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { llamacloudKnowledgeBaseKeys } from './keys';
import type {
  LlamaCloudKnowledgeBaseListResponse,
  AccountLlamaCloudKBListResponse,
  AgentUnifiedAssignments,
  CreateLlamaCloudKnowledgeBaseRequest,
  UpdateLlamaCloudKnowledgeBaseRequest,
  TestSearchRequest,
  TestSearchResponse,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

// Helper hook for authentication headers
const useAuthHeaders = () => {
  const getHeaders = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      throw new Error('No access token available');
    }
    
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
  };
  
  return { getHeaders };
};

/**
 * Fetch all LlamaCloud knowledge bases for a specific agent
 */
export function useAgentLlamaCloudKnowledgeBases(agentId: string, includeInactive = false) {
  const { getHeaders } = useAuthHeaders();
  
  return useQuery({
    queryKey: llamacloudKnowledgeBaseKeys.agent(agentId),
    queryFn: async (): Promise<LlamaCloudKnowledgeBaseListResponse> => {
      const headers = await getHeaders();
      const url = new URL(`${API_URL}/knowledge-base/llamacloud/agents/${agentId}`);
      
      if (includeInactive) {
        url.searchParams.set('include_inactive', 'true');
      }
      
      const response = await fetch(url.toString(), { headers });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch LlamaCloud knowledge bases');
      }
      
      return await response.json();
    },
    enabled: !!agentId,
  });
}

/**
 * Create a new LlamaCloud knowledge base
 */
export function useCreateLlamaCloudKnowledgeBase() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();
  
  return useMutation({
    mutationFn: async ({ 
      agentId, 
      kbData 
    }: { 
      agentId: string; 
      kbData: CreateLlamaCloudKnowledgeBaseRequest 
    }) => {
      const headers = await getHeaders();
      const response = await fetch(
        `${API_URL}/knowledge-base/llamacloud/agents/${agentId}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(kbData),
        }
      );
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to create LlamaCloud knowledge base');
      }
      
      return await response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: llamacloudKnowledgeBaseKeys.agent(variables.agentId) 
      });
      toast.success('Knowledge base created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create knowledge base: ${error.message}`);
    },
  });
}

/**
 * Update an existing LlamaCloud knowledge base
 */
export function useUpdateLlamaCloudKnowledgeBase() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();
  
  return useMutation({
    mutationFn: async ({ 
      kbId, 
      kbData 
    }: { 
      kbId: string; 
      kbData: UpdateLlamaCloudKnowledgeBaseRequest 
    }) => {
      const headers = await getHeaders();
      const response = await fetch(
        `${API_URL}/knowledge-base/llamacloud/${kbId}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify(kbData),
        }
      );
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to update LlamaCloud knowledge base');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: llamacloudKnowledgeBaseKeys.all 
      });
      toast.success('Knowledge base updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update knowledge base: ${error.message}`);
    },
  });
}

/**
 * Delete a LlamaCloud knowledge base
 */
export function useDeleteLlamaCloudKnowledgeBase() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();
  
  return useMutation({
    mutationFn: async (kbId: string) => {
      const headers = await getHeaders();
      const response = await fetch(
        `${API_URL}/knowledge-base/llamacloud/${kbId}`,
        {
          method: 'DELETE',
          headers,
        }
      );
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to delete LlamaCloud knowledge base');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: llamacloudKnowledgeBaseKeys.all 
      });
      toast.success('Knowledge base deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete knowledge base: ${error.message}`);
    },
  });
}

/**
 * Fetch all account-level LlamaCloud knowledge bases (not agent-scoped)
 */
export function useAllLlamaCloudKnowledgeBases(includeInactive = false) {
  const { getHeaders } = useAuthHeaders();

  return useQuery({
    queryKey: llamacloudKnowledgeBaseKeys.account(includeInactive),
    queryFn: async (): Promise<AccountLlamaCloudKBListResponse> => {
      const headers = await getHeaders();
      const url = new URL(`${API_URL}/knowledge-base/llamacloud`);
      if (includeInactive) url.searchParams.set('include_inactive', 'true');

      const response = await fetch(url.toString(), { headers });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch knowledge bases');
      }
      return await response.json();
    },
  });
}

/**
 * Create a global LlamaCloud knowledge base (not tied to a specific agent)
 */
export function useCreateGlobalLlamaCloudKnowledgeBase() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();

  return useMutation({
    mutationFn: async (kbData: CreateLlamaCloudKnowledgeBaseRequest) => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/llamacloud`, {
        method: 'POST',
        headers,
        body: JSON.stringify(kbData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || 'Failed to create knowledge base');
      }

      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: llamacloudKnowledgeBaseKeys.account() });
      toast.success('Cloud knowledge base created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create knowledge base: ${error.message}`);
    },
  });
}

/**
 * Fetch unified (file + cloud) agent KB assignments
 */
export function useAgentUnifiedAssignments(agentId: string) {
  const { getHeaders } = useAuthHeaders();

  return useQuery({
    queryKey: llamacloudKnowledgeBaseKeys.agentAssignments(agentId),
    queryFn: async (): Promise<AgentUnifiedAssignments> => {
      const headers = await getHeaders();
      const response = await fetch(
        `${API_URL}/knowledge-base/agents/${agentId}/assignments/unified`,
        { headers }
      );
      if (!response.ok) {
        throw new Error('Failed to fetch assignments');
      }
      return await response.json();
    },
    enabled: !!agentId,
  });
}

/**
 * Toggle a LlamaCloud KB assignment on/off for a specific agent.
 * Preserves existing file entry assignments.
 */
export function useToggleAgentLlamaCloudKBAssignment() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();

  return useMutation({
    mutationFn: async ({
      agentId,
      kbId,
      assign,
      currentAssignments,
    }: {
      agentId: string;
      kbId: string;
      assign: boolean;
      currentAssignments: AgentUnifiedAssignments;
    }) => {
      const headers = await getHeaders();

      const currentKbIds = Object.keys(currentAssignments.llamacloud_assignments);
      const currentFileIds = Object.keys(currentAssignments.regular_assignments);

      const newKbIds = assign
        ? [...new Set([...currentKbIds, kbId])]
        : currentKbIds.filter((id) => id !== kbId);

      const response = await fetch(
        `${API_URL}/knowledge-base/agents/${agentId}/assignments/unified`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            regular_entry_ids: currentFileIds,
            llamacloud_kb_ids: newKbIds,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || 'Failed to update assignment');
      }

      return await response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: llamacloudKnowledgeBaseKeys.agentAssignments(variables.agentId),
      });
      queryClient.invalidateQueries({
        queryKey: llamacloudKnowledgeBaseKeys.agent(variables.agentId),
      });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update assignment: ${error.message}`);
    },
  });
}

/**
 * Test search functionality for a LlamaCloud index
 */
export function useTestLlamaCloudSearch() {
  const { getHeaders } = useAuthHeaders();
  
  return useMutation({
    mutationFn: async ({ 
      agentId, 
      searchData 
    }: { 
      agentId: string; 
      searchData: TestSearchRequest 
    }): Promise<TestSearchResponse> => {
      const headers = await getHeaders();
      const response = await fetch(
        `${API_URL}/knowledge-base/llamacloud/agents/${agentId}/test-search`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(searchData),
        }
      );
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to test search');
      }
      
      return await response.json();
    },
    onError: (error: Error) => {
      toast.error(`Search test failed: ${error.message}`);
    },
  });
}
