'use client';

import { createMutationHook, createQueryHook } from '@/hooks/use-query';
import {
  getSubscription,
  getSubscriptionCommitment,
  createPortalSession,
  SubscriptionStatus,
  CommitmentInfo,
} from '@/lib/api';
import { subscriptionKeys } from './keys';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

export const useSubscription = createQueryHook(
  subscriptionKeys.details(),
  getSubscription,
  {
    staleTime: 1000 * 60 * 10, // 10 minutes - subscription status doesn't change frequently
    gcTime: 1000 * 60 * 15, // 15 minutes cache time
    refetchOnWindowFocus: false, // Don't refetch on every window focus
    refetchOnMount: false, // Don't refetch on every component mount if data exists
    refetchOnReconnect: true, // Only refetch when network reconnects
  },
);

// Smart subscription hook that adapts refresh based on streaming state
export const useSubscriptionWithStreaming = (isStreaming: boolean = false) => {
  const [isVisible, setIsVisible] = useState(true);

  // Track page visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return useQuery({
    queryKey: subscriptionKeys.details(),
    queryFn: getSubscription,
    staleTime: 1000 * 60 * 5, // 5 minutes - longer stale time
    gcTime: 1000 * 60 * 15, // 15 minutes cache time
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnMount: false, // Don't refetch on mount if data exists
    refetchInterval: (data) => {
      // No refresh if tab is hidden
      if (!isVisible) return false;
      
      // If actively streaming: refresh every 2 minutes instead of 5 seconds
      // Billing data doesn't need to be that real-time
      if (isStreaming) return 2 * 60 * 1000;
      
      // If visible but not streaming: refresh every 10 minutes
      return 10 * 60 * 1000;
    },
    refetchIntervalInBackground: false, // Stop when tab backgrounded
  });
};

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

export const useSubscriptionCommitment = (subscriptionId?: string) => {
  return useQuery({
    queryKey: subscriptionKeys.commitment(subscriptionId || ''),
    queryFn: () => getSubscriptionCommitment(subscriptionId!),
    enabled: !!subscriptionId,
    staleTime: 1000 * 60 * 15, // 15 minutes - commitment info changes very rarely
    gcTime: 1000 * 60 * 30, // 30 minutes cache time
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch on mount if data exists
    refetchOnReconnect: false, // Commitment data rarely changes
  });
};

export const isPlan = (
  subscriptionData: SubscriptionStatus | null | undefined,
  planId?: string,
): boolean => {
  if (!subscriptionData) return planId === 'free';
  return subscriptionData.plan_name === planId;
};
