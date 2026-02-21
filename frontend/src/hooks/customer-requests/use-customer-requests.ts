import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';

export interface CustomerRequest {
  id: string;
  account_id: string;
  user_id: string;
  user_email?: string;
  title: string;
  description: string;
  request_type: 'feature' | 'bug' | 'improvement' | 'agent' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  attachments?: string[];
  environment?: string;
  linear_issue_id?: string;
  linear_issue_url?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomerRequestInput {
  title: string;
  description: string;
  request_type: 'feature' | 'bug' | 'improvement' | 'agent' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  attachments?: string[];
}

export function useCustomerRequests() {
  return useQuery<CustomerRequest[]>({
    queryKey: ['customer-requests'],
    queryFn: async () => {
      const response = await backendApi.get<CustomerRequest[]>('/customer-requests');
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch customer requests');
      }
      return response.data;
    },
  });
}

export function useCreateCustomerRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCustomerRequestInput) => {
      const response = await backendApi.post<CustomerRequest>('/customer-requests', input);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to create customer request');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-requests'] });
    },
  });
}
