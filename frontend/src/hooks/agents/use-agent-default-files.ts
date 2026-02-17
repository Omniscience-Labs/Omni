'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';
import { toast } from 'sonner';
import { agentKeys } from './keys';

export type DefaultFile = {
  id: string;
  name: string;
  size: number;
  mime_type: string | null;
  uploaded_at: string;
};

export function useAgentDefaultFiles(agentId: string) {
  return useQuery<DefaultFile[]>({
    queryKey: agentKeys.defaultFiles(agentId),
    queryFn: async () => {
      const res = await backendApi.get<DefaultFile[]>(`/agent/${agentId}/default-files`, {
        showErrors: true,
      });
      if (res.error) throw new Error(res.error.message);
      return res.data ?? [];
    },
    enabled: !!agentId,
  });
}

export function useUploadAgentDefaultFile(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const res = await backendApi.upload<{ id: string; name: string }>(
        `/agent/${agentId}/default-files`,
        formData,
        { showErrors: true }
      );
      if (res.error) throw new Error(res.error.message);
      return res.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.defaultFiles(agentId) });
      toast.success('File uploaded');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    },
  });
}

export function useDeleteAgentDefaultFile(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fileId: string) => {
      const res = await backendApi.delete(`/agent/${agentId}/default-files/${fileId}`, {
        showErrors: true,
      });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.defaultFiles(agentId) });
      toast.success('File removed');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    },
  });
}
