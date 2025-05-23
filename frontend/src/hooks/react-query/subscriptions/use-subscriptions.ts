'use client';

import { createMutationHook, createQueryHook } from '@/hooks/use-query';
import {
  getSubscription,
  createPortalSession,
  SubscriptionStatus,
} from '@/lib/api';
import { subscriptionKeys } from './keys';

export const useSubscription = createQueryHook(
  subscriptionKeys.details(),
  getSubscription,
  {
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
  },
);

export const useCreatePortalSession = createMutationHook(
  (params: { return_url: string }) => createPortalSession(params),
  {
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      }
    },
  },
);

export const isPlan = (
  subscriptionData: SubscriptionStatus | null | undefined,
  planId?: string,
): boolean => {
  if (!subscriptionData) return planId === 'free';
  return subscriptionData.plan_name === planId;
};
