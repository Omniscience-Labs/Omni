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
      
      // Routes that should clear team context (auth flows, etc.)
      const clearContextRoutes = ['auth', 'legal', 'monitoring', 'share', 'invitation', 'api'];
      // Routes that can work with team context (preserve existing context)
      const globalRoutes = ['dashboard', 'agents', 'chat', 'settings'];
      
      if (clearContextRoutes.includes(firstSegment)) {
        // Clear team context for auth/system routes
        console.log('🔄 Clearing team context for system route:', firstSegment);
        setCurrentTeam(null);
        localStorage.removeItem('currentTeamId');
      } else if (firstSegment && !globalRoutes.includes(firstSegment)) {
        // Potential team-specific route - verify it's a valid team
        const team = accounts.find(a => !a.personal_account && a.slug === firstSegment);
        
        if (team) {
          // Convert team to proper TeamAccount type
          const teamAccount: TeamAccount = {
            account_id: team.account_id,
            name: team.name,
            slug: team.slug,
            personal_account: team.personal_account,
            created_at: team.created_at instanceof Date ? team.created_at.toISOString() : String(team.created_at),
            account_role: team.role
          };
          console.log('🏢 Setting team context from URL:', team.name, team.account_id);
          setCurrentTeam(teamAccount);
          localStorage.setItem('currentTeamId', team.account_id);
        } else {
          // Invalid team slug, fallback to preserved context or clear
          const savedTeamId = localStorage.getItem('currentTeamId');
          if (savedTeamId) {
            // Try to restore team from saved context
            const savedTeam = accounts.find(a => a.account_id === savedTeamId);
            if (savedTeam) {
              const teamAccount: TeamAccount = {
                account_id: savedTeam.account_id,
                name: savedTeam.name,
                slug: savedTeam.slug,
                personal_account: savedTeam.personal_account,
                created_at: savedTeam.created_at instanceof Date ? savedTeam.created_at.toISOString() : String(savedTeam.created_at),
                account_role: savedTeam.role
              };
              setCurrentTeam(teamAccount);
            } else {
              setCurrentTeam(null);
              localStorage.removeItem('currentTeamId');
            }
          } else {
            setCurrentTeam(null);
          }
        }
      } else {
        // Global routes (/dashboard, /agents, etc.) - preserve existing team context
        const savedTeamId = localStorage.getItem('currentTeamId');
        console.log('🌐 Global route detected:', firstSegment || 'root', 'savedTeamId:', savedTeamId);
        if (savedTeamId) {
          // Restore team context from localStorage
          const savedTeam = accounts.find(a => a.account_id === savedTeamId);
          if (savedTeam) {
            const teamAccount: TeamAccount = {
              account_id: savedTeam.account_id,
              name: savedTeam.name,
              slug: savedTeam.slug,
              personal_account: savedTeam.personal_account,
              created_at: savedTeam.created_at instanceof Date ? savedTeam.created_at.toISOString() : String(savedTeam.created_at),
              account_role: savedTeam.role
            };
            console.log('🏢 Restoring team context from localStorage:', savedTeam.name);
            setCurrentTeam(teamAccount);
          } else {
            // Saved team no longer exists, clear context
            console.log('❌ Saved team no longer exists, clearing context');
            setCurrentTeam(null);
            localStorage.removeItem('currentTeamId');
          }
        } else {
          // No saved context, clear current team
          console.log('👤 No saved team context, using personal context');
          setCurrentTeam(null);
        }
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
