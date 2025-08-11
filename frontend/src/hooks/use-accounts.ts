import useSWR, { SWRConfiguration } from 'swr';
import { createClient } from '@/lib/supabase/client';
import { GetAccountsResponse } from '@usebasejump/shared';

export const useAccounts = (options?: SWRConfiguration) => {
  const supabaseClient = createClient();
  
  return useSWR<GetAccountsResponse>(
    async () => {
      const { data: { user } } = await supabaseClient.auth.getUser();
      return user ? ['accounts', user.id] : null;
    },
    async () => {
      const { data, error } = await supabaseClient.rpc('get_accounts');

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    options,
  );
};
