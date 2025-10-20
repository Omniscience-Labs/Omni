import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { knowledgeBaseKeys } from './keys';
import { 
  CreateKnowledgeBaseEntryRequest, 
  KnowledgeBaseEntry, 
  KnowledgeBaseListResponse, 
  UpdateKnowledgeBaseEntryRequest,
  FileUploadRequest,
  GitCloneRequest,
  ProcessingJob,
  ProcessingJobsResponse,
  UploadResponse,
  CloneResponse,
  UnifiedKnowledgeBaseListResponse,
  UnifiedAssignmentRequest,
  UnifiedAssignmentResponse
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

export function useUpdateKnowledgeBaseEntry() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();
  
  return useMutation({
    mutationFn: async ({ entryId, data }: { entryId: string; data: UpdateKnowledgeBaseEntryRequest }) => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/${entryId}`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to update knowledge base entry');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.all });
      toast.success('Knowledge base entry updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update knowledge base entry: ${error.message}`);
    },
  });
}

export function useDeleteKnowledgeBaseEntry() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();
  
  return useMutation({
    mutationFn: async (entryId: string) => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/${entryId}`, {
        method: 'DELETE',
        headers,
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to delete knowledge base entry');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.all });
      toast.success('Knowledge base entry deleted successfully');
    },
    onError: (error) => {
      toast.error(`Failed to delete knowledge base entry: ${error.message}`);
    },
  });
}

export function useAgentKnowledgeBaseEntries(agentId: string, includeInactive = false) {
  const { getHeaders } = useAuthHeaders();
  
  return useQuery({
    queryKey: knowledgeBaseKeys.agent(agentId),
    queryFn: async (): Promise<KnowledgeBaseListResponse> => {
      const headers = await getHeaders();
      const url = new URL(`${API_URL}/knowledge-base/agents/${agentId}`);
      url.searchParams.set('include_inactive', includeInactive.toString());
      
      const response = await fetch(url.toString(), { headers });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch agent knowledge base entries');
      }
      
      return await response.json();
    },
    enabled: !!agentId,
  });
}

export function useCreateAgentKnowledgeBaseEntry() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();
  
  return useMutation({
    mutationFn: async ({ agentId, data }: { agentId: string; data: CreateKnowledgeBaseEntryRequest }) => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/agents/${agentId}`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to create agent knowledge base entry');
      }
      
      return await response.json();
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.agent(agentId) });
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.agentContext(agentId) });
      toast.success('Agent knowledge entry created successfully');
    },
    onError: (error) => {
      toast.error(`Failed to create agent knowledge entry: ${error.message}`);
    },
  });
}

export function useAgentKnowledgeBaseContext(agentId: string, maxTokens = 4000) {
  const { getHeaders } = useAuthHeaders();
  
  return useQuery({
    queryKey: knowledgeBaseKeys.agentContext(agentId),
    queryFn: async () => {
      const headers = await getHeaders();
      const url = new URL(`${API_URL}/knowledge-base/agents/${agentId}/context`);
      url.searchParams.set('max_tokens', maxTokens.toString());
      
      const response = await fetch(url.toString(), { headers });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch agent knowledge base context');
      }
      
      return await response.json();
    },
    enabled: !!agentId,
  });
}

// New hooks for file upload and git clone operations
export function useUploadAgentFiles() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();
  
  return useMutation({
    mutationFn: async ({ agentId, file }: FileUploadRequest): Promise<UploadResponse> => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No access token available');
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_URL}/knowledge-base/agents/${agentId}/upload-file`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to upload file');
      }
      
      return await response.json();
    },
    onSuccess: (data, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.agent(agentId) });
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.processingJobs(agentId) });
      toast.success('File uploaded successfully. Processing in background.');
    },
    onError: (error) => {
      toast.error(`Failed to upload file: ${error.message}`);
    },
  });
}

export function useCloneGitRepository() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();
  
  return useMutation({
    mutationFn: async ({ agentId, git_url, branch = 'main' }: GitCloneRequest): Promise<CloneResponse> => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/agents/${agentId}/clone-git-repo`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ git_url, branch }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to clone repository');
      }
      
      return await response.json();
    },
    onSuccess: (data, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.agent(agentId) });
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.processingJobs(agentId) });
      toast.success('Repository cloning started. Processing in background.');
    },
    onError: (error) => {
      toast.error(`Failed to clone repository: ${error.message}`);
    },
  });
}

export function useAgentProcessingJobs(agentId: string) {
  const { getHeaders } = useAuthHeaders();
  
  return useQuery({
    queryKey: knowledgeBaseKeys.processingJobs(agentId),
    queryFn: async (): Promise<ProcessingJobsResponse> => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/agents/${agentId}/processing-jobs`, { headers });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch processing jobs');
      }
      
      const data = await response.json();
      return data;
    },
    enabled: !!agentId,
    // Smart polling: only poll when there are active processing jobs
    refetchInterval: (query) => {
      const data = query.state.data as ProcessingJobsResponse | undefined;
      
      // If no data yet, check once after 2 seconds
      if (!data) {
        return 2000;
      }
      
      // Check if there are any active processing jobs (pending or processing status)
      const hasActiveJobs = data.jobs?.some(job => 
        job.status === 'processing' || job.status === 'pending'
      );
      
      const nextInterval = hasActiveJobs ? 3000 : 30000;
      // If there are active jobs, poll every 3 seconds
      // If no active jobs, poll every 30 seconds (much less frequent)
      return nextInterval;
    },
    // Stop polling when window is not focused to save resources
    refetchIntervalInBackground: false,
  });
}

// New unified hook that gets both regular and LlamaCloud knowledge bases
export function useAgentUnifiedKnowledgeBase(agentId: string, includeInactive = false) {
  const { getHeaders } = useAuthHeaders();
  
  return useQuery({
    queryKey: [...knowledgeBaseKeys.agent(agentId), 'unified'],
    queryFn: async (): Promise<UnifiedKnowledgeBaseListResponse> => {
      const headers = await getHeaders();
      const url = new URL(`${API_URL}/knowledge-base/agents/${agentId}/unified`);
      url.searchParams.set('include_inactive', includeInactive.toString());
      
      const response = await fetch(url.toString(), { headers });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch unified agent knowledge base');
      }
      
      return await response.json();
    },
    enabled: !!agentId,
  });
}

// Unified assignment hooks
export function useAgentUnifiedAssignments(agentId: string) {
  const { getHeaders } = useAuthHeaders();
  
  return useQuery({
    queryKey: [...knowledgeBaseKeys.agent(agentId), 'assignments', 'unified'],
    queryFn: async (): Promise<UnifiedAssignmentResponse> => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/agents/${agentId}/assignments/unified`, { headers });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch unified agent assignments');
      }
      
      return await response.json();
    },
    enabled: !!agentId,
  });
}

export function useUpdateAgentUnifiedAssignments() {
  const queryClient = useQueryClient();
  const { getHeaders } = useAuthHeaders();
  
  return useMutation({
    mutationFn: async ({ agentId, assignments }: { agentId: string; assignments: UnifiedAssignmentRequest }) => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/agents/${agentId}/assignments/unified`, {
        method: 'POST',
        headers,
        body: JSON.stringify(assignments),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to update unified agent assignments');
      }
      
      return await response.json();
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: [...knowledgeBaseKeys.agent(agentId), 'assignments'] });
      queryClient.invalidateQueries({ queryKey: [...knowledgeBaseKeys.agent(agentId), 'unified'] });
      toast.success('Agent knowledge base assignments updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update assignments: ${error.message}`);
    },
  });
}

// New hooks for fetching all user folders (not agent-specific)
export function useAllUserFolders() {
  const { getHeaders } = useAuthHeaders();
  
  return useQuery({
    queryKey: ['knowledge-base', 'folders', 'all'],
    queryFn: async () => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/folders`, { headers });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch folders');
      }
      
      return await response.json();
    },
  });
}

// Hook to fetch entries for a specific folder
export function useFolderEntries(folderId: string) {
  const { getHeaders } = useAuthHeaders();
  
  return useQuery({
    queryKey: ['knowledge-base', 'folders', folderId, 'entries'],
    queryFn: async () => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/folders/${folderId}/entries`, { headers });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch folder entries');
      }
      
      const data = await response.json();
      // Handle both array and object response formats
      return Array.isArray(data) ? { entries: data } : data;
    },
    enabled: !!folderId,
  });
}

// Hook to fetch all root-level LlamaCloud KBs (not agent-specific)
export function useAllRootLlamaCloudKBs() {
  const { getHeaders } = useAuthHeaders();
  
  return useQuery({
    queryKey: ['knowledge-base', 'llamacloud', 'root'],
    queryFn: async () => {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/llamacloud/root`, { headers });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch root LlamaCloud KBs');
      }
      
      return await response.json();
    },
  });
} 
