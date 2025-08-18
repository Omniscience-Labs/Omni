'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useSubscription as useSubscriptionQuery } from '@/hooks/react-query/subscriptions/use-subscriptions';
import { SubscriptionStatus } from '@/lib/api';

interface SubscriptionContextType {
  subscriptionData: SubscriptionStatus | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

interface SubscriptionProviderProps {
  children: ReactNode;
}

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const { 
    data: subscriptionData, 
    isLoading, 
    error, 
    refetch 
  } = useSubscriptionQuery();

  const value: SubscriptionContextType = {
    subscriptionData: subscriptionData || null,
    isLoading,
    error: error as Error | null,
    refetch,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscriptionContext() {
  const context = useContext(SubscriptionContext);
  
  if (!context) {
    throw new Error('useSubscriptionContext must be used within a SubscriptionProvider');
  }
  
  return context;
}

// Convenience hook that provides the same interface as the original useSubscription
// but uses the shared context data with fallback for components outside dashboard
export function useSharedSubscription() {
  const context = useContext(SubscriptionContext);
  
  if (!context) {
    // Fallback to the original hook if context is not available
    // This allows components outside the dashboard to still work
    return useSubscriptionQuery();
  }
  
  const { subscriptionData, isLoading, error, refetch } = context;
  
  return {
    data: subscriptionData,
    isLoading,
    error,
    refetch,
  };
}
