'use client';

import { createMutationHook, createQueryHook } from '@/hooks/use-query';
import {
  createCheckoutSession,
  checkBillingStatus,
  getAvailableModels,
  CreateCheckoutSessionRequest
} from '@/lib/api';
import { modelKeys } from './keys';

export const useAvailableModels = createQueryHook(
  modelKeys.available,
  getAvailableModels,
  {
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  }
);

export const useBillingStatus = createQueryHook(
  ['billing', 'status'],
  checkBillingStatus,
  {
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  }
);

export const useCreateCheckoutSession = createMutationHook(
  (request: CreateCheckoutSessionRequest) => createCheckoutSession(request),
  {
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    errorContext: {
      operation: 'create checkout session',
      resource: 'billing'
    }
  }
); 