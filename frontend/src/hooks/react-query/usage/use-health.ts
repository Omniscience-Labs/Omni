'use client';

import { createQueryHook } from '@/hooks/use-query';
import { checkApiHealth } from '@/lib/api';
import { healthKeys } from '../files/keys';

export const useApiHealth = createQueryHook(
  healthKeys.api(),
  checkApiHealth,
  {
    staleTime: 5 * 60 * 1000, // 5 minutes - health checks don't need to be frequent
    refetchInterval: false, // CRITICAL: Remove polling - only check on mount or manual refetch
    refetchOnWindowFocus: false, // Don't refetch on window focus - reduces unnecessary requests
    retry: 3,
  }
);  