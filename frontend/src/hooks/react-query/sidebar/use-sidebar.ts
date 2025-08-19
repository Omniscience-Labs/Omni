import { createQueryHook, createMutationHook } from '@/hooks/use-query';
import { getThreads, getProjects, Thread, Project } from '@/lib/api';
import { deleteThread } from '../threads/utils';
import { useCurrentAccount } from '@/hooks/use-current-account';
import { threadKeys } from '../threads/keys';

// Type for thread combined with project data
export type ThreadWithProject = Thread & {
  project?: Project;
};

export const useThreads = () => {
  const currentAccount = useCurrentAccount();
  
  return createQueryHook(
    threadKeys.all,
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

export const useProjects = () => {
  const currentAccount = useCurrentAccount();
  
  return createQueryHook(
    ['projects', currentAccount?.account_id],
    async () => {
      const accountId = currentAccount?.account_id;
      console.log('📁 Fetching projects for account:', currentAccount?.is_team_context ? 'Team:' + currentAccount.name : 'Personal');
      const data = await getProjects(accountId);
      return data;
    },
    {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      enabled: !!currentAccount?.account_id,
    }
  )();
};

// Function to combine threads with their project data
export const processThreadsWithProjects = (threads: Thread[], projects: Project[]): ThreadWithProject[] => {
  return threads.map(thread => ({
    ...thread,
    project: projects.find(p => p.id === thread.project_id)
  }));
};

// Hook for deleting a single thread
export const useDeleteThread = () => 
  createMutationHook(
    ({ threadId, sandboxId }: { threadId: string; sandboxId?: string }) => 
      deleteThread(threadId, sandboxId),
    {
      errorContext: {
        operation: 'delete thread',
        resource: 'thread'
      }
    }
  )();

// Hook for deleting multiple threads
export const useDeleteMultipleThreads = () => 
  createMutationHook(
    async ({ 
      threadIds, 
      threadSandboxMap, 
      onProgress 
    }: { 
      threadIds: string[]; 
      threadSandboxMap?: Record<string, string>;
      onProgress?: (completed: number, total: number) => void;
    }) => {
      const total = threadIds.length;
      let completed = 0;

      const deletePromises = threadIds.map(async (threadId) => {
        const sandboxId = threadSandboxMap?.[threadId];
        await deleteThread(threadId, sandboxId);
        completed++;
        onProgress?.(completed, total);
      });
      
      await Promise.all(deletePromises);
      return { deletedCount: threadIds.length };
    },
    {
      errorContext: {
        operation: 'delete multiple threads',
        resource: 'threads'
      }
    }
  )();