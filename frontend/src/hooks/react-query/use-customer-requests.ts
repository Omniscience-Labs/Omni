import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

interface CustomerRequest {
  id: string;
  account_id: string;
  title: string;
  description: string;
  request_type: 'feature' | 'bug' | 'improvement' | 'agent' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  linear_issue_id?: string;
  linear_issue_url?: string;
  created_at: string;
  updated_at: string;
}

interface CreateCustomerRequestInput {
  title: string;
  description: string;
  request_type: 'feature' | 'bug' | 'improvement' | 'agent' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export function useCustomerRequests() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['customer-requests'],
    queryFn: async (): Promise<CustomerRequest[]> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${BACKEND_URL}/customer-requests`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch customer requests');
      }

      return response.json();
    },
  });
}

export function useCreateCustomerRequest() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (input: CreateCustomerRequestInput) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${BACKEND_URL}/customer-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create customer request');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-requests'] });
    },
  });
}

