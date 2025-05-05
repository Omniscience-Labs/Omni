import { createQueryKeys } from '@/hooks/use-query';

export const subscriptionKeys = createQueryKeys({
  all: ['subscription'] as const,
  details: () => [...subscriptionKeys.all, 'details'] as const,
});
