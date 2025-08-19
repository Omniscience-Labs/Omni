'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import { User, Session } from '@supabase/supabase-js';
import { SupabaseClient } from '@supabase/supabase-js';
import { checkAndInstallOmniAgent } from '@/lib/utils/install-suna-agent';

type AuthContextType = {
  supabase: SupabaseClient;
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // ALL HOOKS FIRST - must be called in same order every render
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const supabase = createClient();

  useEffect(() => {
    // Handle supabase client availability inside useEffect
    if (!supabase || !supabase.auth) {
      console.error('❌ useEffect: Supabase client not available');
      setIsLoading(false);
      return;
    }
    const getInitialSession = async () => {
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
      } catch (error) {
      } finally {
        setIsLoading(false);
      }
    };

    getInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (isLoading) setIsLoading(false);
        switch (event) {
          case 'SIGNED_IN':
            if (newSession?.user) {
              await checkAndInstallOmniAgent(newSession.user.id, newSession.user.created_at);
            }
            break;
          case 'SIGNED_OUT':
            break;
          case 'TOKEN_REFRESHED':
            break;
          case 'MFA_CHALLENGE_VERIFIED':
            break;
          default:
        }
      },
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [supabase]); // Removed isLoading from dependencies to prevent infinite loops

  // Now handle client creation errors AFTER all hooks
  if (!supabase) {
    console.error('❌ CRITICAL: Failed to create Supabase client');
    return <div>Authentication system unavailable. Please check configuration.</div>;
  }
  
  if (!supabase.auth) {
    console.error('❌ CRITICAL: Supabase client missing auth module');
    return <div>Authentication module unavailable.</div>;
  }

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('❌ Error signing out:', error);
    }
  };

  const value = {
    supabase,
    session,
    user,
    isLoading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    console.error('❌ CRITICAL: useAuth called outside AuthProvider!');
    console.trace('useAuth call stack:');
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  // Only log if there are issues
  if (!context.supabase) {
    console.warn('⚠️ useAuth: No supabase client in context');
  }
  
  return context;
};
