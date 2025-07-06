import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { isFlagEnabled } from '@/lib/feature-flags';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

export interface MarketplaceAgent {
  agent_id: string;
  name: string;
  description: string;
  system_prompt: string;
  configured_mcps: any[];
  agentpress_tools: Record<string, any>;
  tags: string[];
  download_count: number;
  marketplace_published_at: string;
  created_at: string;
  creator_name: string;
  avatar?: string;
  avatar_color?: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface MarketplaceAgentsResponse {
  agents: MarketplaceAgent[];
  pagination: PaginationInfo;
}

export function usePublishAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, tags = [] }: { agentId: string; tags?: string[] }): Promise<void> => {
      try {
        const marketplaceEnabled = await isFlagEnabled('agent_marketplace');
        if (!marketplaceEnabled) {
          throw new Error('Marketplace is not enabled');
        }
        
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          throw new Error('You must be logged in to publish agents');
        }
        const response = await fetch(`${API_URL}/agents/${agentId}/publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ tags }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
          throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (err) {
        console.error('Error publishing agent:', err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-agents'] });
    },
  });
}

export function useUnpublishAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (agentId: string): Promise<void> => {
      try {
        const marketplaceEnabled = await isFlagEnabled('agent_marketplace');
        if (!marketplaceEnabled) {
          throw new Error('Marketplace is not enabled');
        }
        
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          throw new Error('You must be logged in to unpublish agents');
        }

        const response = await fetch(`${API_URL}/agents/${agentId}/unpublish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
          throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (err) {
        console.error('Error unpublishing agent:', err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-agents'] });
    },
  });
}
