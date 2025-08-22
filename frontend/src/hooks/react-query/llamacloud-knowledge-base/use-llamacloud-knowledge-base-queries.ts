import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { llamacloudKnowledgeBaseKeys } from './keys';
import { 
  CreateLlamaCloudKnowledgeBaseRequest, 
  LlamaCloudKnowledgeBase, 
  LlamaCloudKnowledgeBaseListResponse, 
  UpdateLlamaCloudKnowledgeBaseRequest,
  TestSearchRequest,
  TestSearchResponse
} from './types';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

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

// Get all LlamaCloud knowledge bases for an agent
export function useAgentLlamaCloudKnowledgeBases(agentId: string, includeInactive = false) {
  const { getHeaders } = useAuthHeaders();
  
  return useQuery({
    queryKey: llamacloudKnowledgeBaseKeys.agent(agentId),
    queryFn: async (): Promise<LlamaCloudKnowledgeBaseListResponse> => {
      const headers = await getHeaders();
      const url = new URL(`${API_URL}/knowledge-base/llamacloud/agents/${agentId}`);
      url.searchParams.set('include_inactive', includeInactive.toString());
      
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

// Get a specific LlamaCloud knowledge base
export function useLlamaCloudKnowledgeBase(kbId: string) {
  const { getHeaders } = useAuthHeaders();
  
  return useQuery({
    queryKey: llamacloudKnowledgeBaseKeys.entry(kbId),
    queryFn: async (): Promise<LlamaCloudKnowledgeBase> => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/llamacloud/${kbId}`, { headers });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch LlamaCloud knowledge base');
      }
      
      return await response.json();
    },
    enabled: !!kbId,
  });
}

// Create a new LlamaCloud knowledge base
export function useCreateLlamaCloudKnowledgeBase() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();
  
  return useMutation({
    mutationFn: async ({ agentId, kbData }: { agentId: string; kbData: CreateLlamaCloudKnowledgeBaseRequest }) => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/llamacloud/agents/${agentId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(kbData),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to create LlamaCloud knowledge base');
      }
      
      return await response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: llamacloudKnowledgeBaseKeys.agent(variables.agentId) });
      toast.success('LlamaCloud knowledge base created successfully');
    },
    onError: (error) => {
      toast.error(`Failed to create LlamaCloud knowledge base: ${error.message}`);
    },
  });
}

// Update a LlamaCloud knowledge base
export function useUpdateLlamaCloudKnowledgeBase() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();
  
  return useMutation({
    mutationFn: async ({ kbId, kbData }: { kbId: string; kbData: UpdateLlamaCloudKnowledgeBaseRequest }) => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/llamacloud/${kbId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(kbData),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to update LlamaCloud knowledge base');
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: llamacloudKnowledgeBaseKeys.all });
      toast.success('LlamaCloud knowledge base updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update LlamaCloud knowledge base: ${error.message}`);
    },
  });
}

// Delete a LlamaCloud knowledge base
export function useDeleteLlamaCloudKnowledgeBase() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();
  
  return useMutation({
    mutationFn: async (kbId: string) => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/llamacloud/${kbId}`, {
        method: 'DELETE',
        headers,
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to delete LlamaCloud knowledge base');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: llamacloudKnowledgeBaseKeys.all });
      toast.success('LlamaCloud knowledge base deleted successfully');
    },
    onError: (error) => {
      toast.error(`Failed to delete LlamaCloud knowledge base: ${error.message}`);
    },
  });
}

// Test search functionality
export function useTestLlamaCloudSearch() {
  const { getHeaders } = useAuthHeaders();
  
  return useMutation({
    mutationFn: async ({ agentId, searchData }: { agentId: string; searchData: TestSearchRequest }): Promise<TestSearchResponse> => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/llamacloud/agents/${agentId}/test-search`, {
        method: 'POST',
        headers,
        body: JSON.stringify(searchData),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to test LlamaCloud search');
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Search test successful: ${data.message}`);
      } else {
        toast.warning(data.message);
      }
    },
    onError: (error) => {
      toast.error(`Search test failed: ${error.message}`);
    },
  });
}
