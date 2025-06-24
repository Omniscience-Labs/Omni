import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

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

export const knowledgeBaseKeys = {
  all: ['knowledge-base'] as const,
  threads: () => [...knowledgeBaseKeys.all, 'threads'] as const,
  thread: (threadId: string) => [...knowledgeBaseKeys.threads(), threadId] as const,
  entry: (entryId: string) => [...knowledgeBaseKeys.all, 'entry', entryId] as const,
  context: (threadId: string) => [...knowledgeBaseKeys.all, 'context', threadId] as const,
};

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

export function useKnowledgeBaseEntries(threadId: string, includeInactive = false) {
  const { getHeaders } = useAuthHeaders();
  
  return useQuery({
    queryKey: knowledgeBaseKeys.thread(threadId),
    queryFn: async (): Promise<KnowledgeBaseListResponse> => {
      const headers = await getHeaders();
      const url = new URL(`${API_URL}/knowledge-base/threads/${threadId}`);
      url.searchParams.set('include_inactive', includeInactive.toString());
      
      const response = await fetch(url.toString(), { headers });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch knowledge base entries');
      }
      
      return await response.json();
    },
    enabled: !!threadId,
  });
}

export function useKnowledgeBaseEntry(entryId: string) {
  const { getHeaders } = useAuthHeaders();
  
  return useQuery({
    queryKey: knowledgeBaseKeys.entry(entryId),
    queryFn: async (): Promise<KnowledgeBaseEntry> => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/${entryId}`, { headers });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch knowledge base entry');
      }
      
      return await response.json();
    },
    enabled: !!entryId,
  });
}

export function useKnowledgeBaseContext(threadId: string, maxTokens = 4000) {
  const { getHeaders } = useAuthHeaders();
  
  return useQuery({
    queryKey: knowledgeBaseKeys.context(threadId),
    queryFn: async () => {
      const headers = await getHeaders();
      const url = new URL(`${API_URL}/knowledge-base/threads/${threadId}/context`);
      url.searchParams.set('max_tokens', maxTokens.toString());
      
      const response = await fetch(url.toString(), { headers });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch knowledge base context');
      }
      
      return await response.json();
    },
    enabled: !!threadId,
  });
}

export function useCreateKnowledgeBaseEntry() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();
  
  return useMutation({
    mutationFn: async ({ threadId, data }: { threadId: string; data: CreateKnowledgeBaseEntryRequest }): Promise<KnowledgeBaseEntry> => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/threads/${threadId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to create knowledge base entry');
      }
      
      return await response.json();
    },
    onSuccess: (_, { threadId }) => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.thread(threadId) });
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.context(threadId) });
      toast.success('Knowledge base entry created successfully');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to create knowledge base entry: ${message}`);
    },
  });
}

export function useUpdateKnowledgeBaseEntry() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();
  
  return useMutation({
    mutationFn: async ({ entryId, data }: { entryId: string; data: UpdateKnowledgeBaseEntryRequest }): Promise<KnowledgeBaseEntry> => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/${entryId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to update knowledge base entry');
      }
      
      return await response.json();
    },
    onSuccess: (updatedEntry) => {
      queryClient.setQueryData(knowledgeBaseKeys.entry(updatedEntry.entry_id), updatedEntry);
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.threads() });
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.all });
      toast.success('Knowledge base entry updated successfully');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to update knowledge base entry: ${message}`);
    },
  });
}

export function useDeleteKnowledgeBaseEntry() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();
  return useMutation({
    mutationFn: async (entryId: string): Promise<void> => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/${entryId}`, {
        method: 'DELETE',
        headers,
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to delete knowledge base entry');
      }
    },
    onSuccess: (_, entryId) => {
      queryClient.removeQueries({ queryKey: knowledgeBaseKeys.entry(entryId) });
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.threads() });
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.all });
      toast.success('Knowledge base entry deleted successfully');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to delete knowledge base entry: ${message}`);
    },
  });
} 
