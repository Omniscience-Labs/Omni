'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/components/AuthProvider';

export function useAdminCheck() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['admin-check', user?.id],
    queryFn: async () => {
      try {
        const response = await apiClient.request('/enterprise/check-admin');
        return {
          isAdmin: response.data?.is_admin || false,
          isOmniAdmin: response.data?.is_omni_admin || false
        };
      } catch (error) {
        console.warn('Admin check failed:', error);
        return {
          isAdmin: false,
          isOmniAdmin: false
        };
      }
    },
    enabled: !!user,
    retry: false,
    staleTime: 30 * 60 * 1000, // 30 minutes - admin status rarely changes
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchInterval: false, // Never auto-refetch
  });
}
