import { useQuery } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';

export interface ComposioToolkit {
  slug: string;
  name: string;
  description?: string;
  logo?: string;
  tags: string[];
  auth_schemes: string[];
}

export const useComposioToolkits = (search?: string) => {
  return useQuery({
    queryKey: ['composio', 'toolkits', search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) {
        params.append('search', search);
      }
      
      const result = await backendApi.get<ComposioToolkit[]>(
        `/composio/toolkits?${params.toString()}`,
        {
          errorContext: { operation: 'get toolkits', resource: 'Composio toolkits' },
        }
      );
      
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to fetch Composio toolkits');
      }
      
      return result.data!;
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}; 