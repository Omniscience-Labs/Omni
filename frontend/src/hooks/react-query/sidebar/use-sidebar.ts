import { createQueryHook } from '@/hooks/use-query';
import { getThreads } from '@/lib/api';
import { useCurrentAccount } from '@/hooks/use-current-account';
import { threadKeys } from '../threads/keys';

export const useThreads = () => {
  const currentAccount = useCurrentAccount();
  
  return createQueryHook(
    threadKeys.lists(),
    async () => {
      const accountId = currentAccount?.account_id;
      console.log('🧵 Fetching threads for account:', currentAccount?.is_team_context ? 'Team:' + currentAccount.name : 'Personal');
      const data = await getThreads(undefined, accountId);
      return data;
    },
    {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      enabled: !!currentAccount?.account_id,
    }
  )();
};