'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useAccounts } from './use-accounts';

const TEAM_CONTEXT_KEY = 'team_context';

// Routes that should check for stored team context
const contextAwareRoutes = ['dashboard', 'agents', 'chat', 'settings'];

export interface CurrentAccount {
  account_id: string;
  name: string;
  personal_account: boolean;
  slug: string;
  is_team_context: boolean;
}

export function useCurrentAccount(): CurrentAccount | null {
  const pathname = usePathname();
  const { data: accounts } = useAccounts();

  return useMemo(() => {
    try {
      if (!accounts || !Array.isArray(accounts)) return null;

    // Extract team slug from URL path
    const teamMatch = pathname?.match(/^\/([^\/]+)(?:\/|$)/);
    const teamSlug = teamMatch?.[1];

    // For context-aware routes (agents, dashboard, etc.), check for stored team context
    if (contextAwareRoutes.includes(teamSlug)) {
      try {
        // Ensure we're in the browser before accessing sessionStorage
        if (typeof window === 'undefined') return null;
        const storedContext = sessionStorage.getItem(TEAM_CONTEXT_KEY);
        if (storedContext) {
          const context = JSON.parse(storedContext);
          const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
          
          // If team context was stored recently (within 5 minutes), use it
          if (context.timestamp > fiveMinutesAgo) {
            const teamAccount = accounts.find(
              (account) => account && !account.personal_account && account.account_id === context.account_id
            );
            
            if (teamAccount) {
              console.log('🏢 Using stored team context:', context.name);
              return {
                account_id: teamAccount.account_id,
                name: teamAccount.name,
                personal_account: false,
                slug: teamAccount.slug,
                is_team_context: true,
              };
            }
          } else {
            // Context expired, clean it up
            console.log('⏰ Team context expired, clearing');
            sessionStorage.removeItem(TEAM_CONTEXT_KEY);
          }
        }
      } catch (error) {
        console.warn('Failed to read team context from sessionStorage:', error);
        sessionStorage.removeItem(TEAM_CONTEXT_KEY);
      }
    }

    // Check if we're on a team-specific route (e.g., /{team-slug}/dashboard)
    if (teamSlug && !contextAwareRoutes.includes(teamSlug)) {
      const teamAccount = accounts.find(
        (account) => account && !account.personal_account && account.slug === teamSlug
      );
      
      if (teamAccount) {
        console.log('🏢 Using team context from URL:', teamAccount.name);
        return {
          account_id: teamAccount.account_id,
          name: teamAccount.name,
          personal_account: false,
          slug: teamAccount.slug,
          is_team_context: true,
        };
      }
    }

    // Default to personal account if no team context
    console.log('👤 Using personal account context');
    const personalAccount = accounts.find((account) => account?.personal_account);
    return personalAccount ? {
      account_id: personalAccount.account_id,
      name: personalAccount.name,
      personal_account: true,
      slug: personalAccount.slug,
      is_team_context: false,
    } : null;
    } catch (error) {
      console.error('Error in useCurrentAccount:', error);
      return null;
    }
  }, [pathname, accounts]);
}
