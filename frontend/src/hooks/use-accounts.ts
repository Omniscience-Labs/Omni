import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { GetAccountsResponse } from '@usebasejump/shared';

export const useAccounts = (options?: UseQueryOptions<GetAccountsResponse>) => {
  const supabaseClient = createClient();
  
  if (!supabaseClient) {
    console.error('❌ CRITICAL: No Supabase client in useAccounts');
  }
  
  return useQuery<GetAccountsResponse>({
    queryKey: ['accounts'],
    queryFn: async () => {
      if (!supabaseClient) {
        console.error('❌ useAccounts: No Supabase client available');
        throw new Error('Supabase client not available');
      }
      
      if (!supabaseClient.rpc) {
        console.error('❌ useAccounts: Supabase client missing rpc method');
        throw new Error('Supabase client invalid - missing rpc method');
      }
      
      try {
        const { data, error } = await supabaseClient.rpc('get_accounts');
        
        if (error) {
          console.error('❌ useAccounts RPC error:', error);
          throw new Error(error.message);
        }
        return data;
      } catch (err) {
        console.error('❌ useAccounts execution error:', err);
        throw err;
      }
    },
    enabled: !!supabaseClient, // Only run query if client is available
    ...options,
  });
};