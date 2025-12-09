'use client';

import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { useAccountState } from '@/hooks/billing';
import { AccountState } from '@/lib/api/billing';
import { useAuth } from '@/components/AuthProvider';

// Compatible types matching the old API structure
interface SubscriptionInfo {
  tier: {
    name: string;
    display_name: string;
    credits?: number;
  };
  subscription: {
    cancel_at?: string | null;
    cancel_at_period_end?: boolean;
  } | null;
}

interface CreditBalance {
  balance: number;
  lifetime_used: number;
  can_purchase_credits: boolean;
}

// Helper functions to map AccountState to the expected format
function mapToSubscriptionInfo(accountState: AccountState | undefined): SubscriptionInfo | null {
  if (!accountState) return null;
  
  return {
    tier: {
      name: accountState.tier.name,
      display_name: accountState.tier.display_name,
      credits: accountState.tier.monthly_credits,
    },
    subscription: accountState.subscription.subscription_id ? {
      cancel_at: accountState.subscription.cancellation_effective_date || null,
      cancel_at_period_end: accountState.subscription.cancel_at_period_end,
    } : null,
  };
}

function mapToCreditBalance(accountState: AccountState | undefined): CreditBalance | null {
  if (!accountState) return null;
  
  // Calculate lifetime_used: total credits allocated minus current balance
  // This is an approximation since AccountState doesn't track lifetime_used directly
  const lifetimeUsed = Math.max(0, (accountState.tier.monthly_credits || 0) - accountState.credits.total);
  
  return {
    balance: accountState.credits.total,
    lifetime_used: lifetimeUsed,
    can_purchase_credits: accountState.subscription.can_purchase_credits,
  };
}

interface SubscriptionContextType {
  subscriptionData: SubscriptionInfo | null;
  creditBalance: CreditBalance | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  refetchBalance: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

interface SubscriptionProviderProps {
  children: ReactNode;
}


export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const { user } = useAuth();
  const isAuthenticated = !!user;

  const { 
    data: accountState, 
    isLoading, 
    error, 
    refetch 
  } = useAccountState({ enabled: isAuthenticated });

  // Map AccountState to the expected format
  const subscriptionData = useMemo(() => mapToSubscriptionInfo(accountState), [accountState]);
  const creditBalance = useMemo(() => mapToCreditBalance(accountState), [accountState]);

  const value: SubscriptionContextType = {
    subscriptionData,
    creditBalance,
    isLoading,
    error: error as Error | null,
    refetch,
    refetchBalance: refetch, // Both refetch the same AccountState query
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

export function useHasCredits(minimumCredits = 0) {
  const { creditBalance } = useSubscriptionContext();
  
  if (!creditBalance) {
    return false;
  }
  
  return creditBalance.balance >= minimumCredits;
}

export function useSubscriptionTier() {
  const { subscriptionData } = useSubscriptionContext();
  
  if (!subscriptionData || !subscriptionData.tier) {
    return 'free';
  }
  
  return subscriptionData.tier.name;
}

export function useSharedSubscription() {
  const context = useSubscriptionContext();
  
  return {
    data: context.subscriptionData,
    isLoading: context.isLoading,
    error: context.error,
    refetch: context.refetch,
  };
}

export function useSubscriptionData() {
  const context = useContext(SubscriptionContext);
  const { user } = useAuth();
  const { data: accountState, isLoading, error, refetch } = useAccountState({ enabled: !!user });
  
  if (context) {
    return {
      data: context.subscriptionData ? {
        ...context.subscriptionData,
        current_usage: context.creditBalance?.lifetime_used || 0,
        cost_limit: context.subscriptionData.tier?.credits || 0,
        credit_balance: context.creditBalance?.balance || 0,
        can_purchase_credits: context.creditBalance?.can_purchase_credits || false,
        subscription: context.subscriptionData.subscription ? {
          ...context.subscriptionData.subscription,
          cancel_at_period_end: context.subscriptionData.subscription.cancel_at ? true : false
        } : null
      } : null,
      isLoading: context.isLoading,
      error: context.error,
      refetch: context.refetch,
    };
  }
  
  // If no context, use AccountState directly and map it
  const subscriptionData = mapToSubscriptionInfo(accountState);
  const creditBalance = mapToCreditBalance(accountState);
  
  return {
    data: subscriptionData ? {
      ...subscriptionData,
      current_usage: creditBalance?.lifetime_used || 0,
      cost_limit: subscriptionData.tier?.credits || 0,
      credit_balance: creditBalance?.balance || 0,
      can_purchase_credits: creditBalance?.can_purchase_credits || false,
      subscription: subscriptionData.subscription ? {
        ...subscriptionData.subscription,
        cancel_at_period_end: subscriptionData.subscription.cancel_at ? true : false
      } : null
    } : null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
