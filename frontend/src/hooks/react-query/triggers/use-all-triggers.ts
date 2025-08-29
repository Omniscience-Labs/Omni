import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export interface TriggerWithAgent {
  trigger_id: string;
  agent_id: string;
  trigger_type: string;
  provider_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  webhook_url?: string;
  created_at: string;
  updated_at: string;
  config?: Record<string, any>;
  agent_name?: string;
  agent_description?: string;
  icon_name?: string;
  icon_color?: string;
  icon_background?: string;
  profile_image_url?: string;
}

const fetchAllTriggers = async (): Promise<TriggerWithAgent[]> => {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('You must be logged in to fetch triggers');
  }
  
  const response = await fetch(`${API_URL}/triggers/all`, {
    headers: { 
      'Content-Type': 'application/json', 
      'Authorization': `Bearer ${session.access_token}` 
    },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch triggers' }));
    throw new Error(error.detail || 'Failed to fetch triggers');
  }
  
  return response.json();
};

export const useAllTriggers = () => {
  return useQuery({
    queryKey: ['all-triggers'],
    queryFn: fetchAllTriggers,
    staleTime: 1 * 60 * 1000,
    refetchInterval: 30 * 1000,
  });
}; 