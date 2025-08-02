'use client';

import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { 
  composioApi, 
  type ComposioToolkitsResponse,
  type CreateComposioProfileRequest,
  type CreateComposioProfileResponse,
} from './utils';
import { composioKeys } from './keys';
import { toast } from 'sonner';

export const useComposioToolkits = (search?: string) => {
  return useQuery({
    queryKey: composioKeys.toolkits(search),
    queryFn: async (): Promise<ComposioToolkitsResponse> => {
      const result = await composioApi.getToolkits(search);
      console.log('🔍 Composio Toolkits:', result);
      return result;
    },
    staleTime: 5 * 60 * 1000, 
    retry: 2,
  });
};

export const useCreateComposioProfile = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (request: CreateComposioProfileRequest): Promise<CreateComposioProfileResponse> => {
      return await composioApi.createProfile(request);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: composioKeys.profiles.all() });
      toast.success(`Connected to ${variables.profile_name}!`);
      
      // If there's a redirect URL, open it automatically
      if (data.redirect_url) {
        console.log('🔗 Opening OAuth URL:', data.redirect_url);
        window.open(data.redirect_url, '_blank', 'width=600,height=700,resizable=yes,scrollbars=yes');
      }
    },
    onError: (error) => {
      console.error('Failed to create Composio profile:', error);
      toast.error(error.message || 'Failed to create profile');
    },
  });
};

export const useInvalidateComposioQueries = () => {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: composioKeys.all });
  };
}; 