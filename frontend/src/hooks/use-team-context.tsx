'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAccounts } from './use-accounts';

interface TeamAccount {
  account_id: string;
  name: string;
  slug: string;
  personal_account: boolean;
  created_at: string;
  account_role?: string;
}

interface TeamContextType {
  currentTeam: TeamAccount | null;
  isLoading: boolean;
  switchTeam: (team: TeamAccount) => Promise<void>;
  refreshTeamData: () => Promise<void>;
  isPersonalContext: boolean;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamContextProvider({ children }: { children: ReactNode }) {
  const [currentTeam, setCurrentTeam] = useState<TeamAccount | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { data: accounts } = useAccounts();

  // Determine if we're in personal context
  const isPersonalContext = !currentTeam || currentTeam.personal_account;

  // Load team context from URL
  useEffect(() => {
    loadTeamContext();
  }, [pathname, accounts]);

  const loadTeamContext = async () => {
    try {
      // Skip if no accounts loaded yet
      if (!accounts || accounts.length === 0) return;
      
      // Extract potential team slug from URL
      const pathSegments = pathname.split('/').filter(Boolean);
      const firstSegment = pathSegments[0];
      
      // Check if we're in a team context
      const nonTeamRoutes = ['dashboard', 'agents', 'chat', 'settings', 'auth', 'legal', 'monitoring', 'share', 'invitation', 'api'];
      
      if (firstSegment && !nonTeamRoutes.includes(firstSegment)) {
        // Potential team route - verify it's a valid team
        const team = accounts.find(a => !a.personal_account && a.slug === firstSegment);
        
        if (team) {
          setCurrentTeam(team);
          localStorage.setItem('currentTeamId', team.account_id);
        } else {
          // Invalid team slug, clear context
          setCurrentTeam(null);
          localStorage.removeItem('currentTeamId');
        }
      } else {
        // Not in team context
        setCurrentTeam(null);
        localStorage.removeItem('currentTeamId');
      }
    } catch (error) {
      console.error('Error loading team context:', error);
      setCurrentTeam(null);
    }
  };

  const switchTeam = async (team: TeamAccount) => {
    try {
      setIsLoading(true);
      
      // Add visual feedback
      document.body.style.cursor = 'wait';
      
      if (team.personal_account) {
        // Switching to personal account
        setCurrentTeam(null);
        localStorage.removeItem('currentTeamId');
        // Small delay for visual feedback
        await new Promise(resolve => setTimeout(resolve, 200));
        router.push('/dashboard');
      } else {
        // Switching to team account
        setCurrentTeam(team);
        localStorage.setItem('currentTeamId', team.account_id);
        // Small delay for visual feedback
        await new Promise(resolve => setTimeout(resolve, 200));
        router.push(`/${team.slug}/dashboard`);
      }
    } catch (error) {
      console.error('Error switching team:', error);
    } finally {
      setIsLoading(false);
      document.body.style.cursor = 'auto';
    }
  };

  const refreshTeamData = async () => {
    if (currentTeam && !currentTeam.personal_account) {
      try {
        const supabase = createClient();
        
        // Use the basejump RPC function to get account data
        const { data, error } = await supabase.rpc('get_account', {
          account_id: currentTeam.account_id
        });
        
        if (data && !error) {
          const updatedTeam = {
            account_id: data.account_id,
            name: data.name,
            slug: data.slug,
            personal_account: data.personal_account,
            created_at: data.created_at,
            account_role: data.account_role
          };
          setCurrentTeam(updatedTeam);
          localStorage.setItem('currentTeamId', updatedTeam.account_id);
        }
      } catch (error) {
        console.error('Error refreshing team data:', error);
      }
    }
  };

  return (
    <TeamContext.Provider value={{
      currentTeam,
      isLoading,
      switchTeam,
      refreshTeamData,
      isPersonalContext
    }}>
      {children}
    </TeamContext.Provider>
  );
}

export const useTeamContext = () => {
  const context = useContext(TeamContext);
  if (context === undefined) {
    throw new Error('useTeamContext must be used within a TeamContextProvider');
  }
  return context;
};
