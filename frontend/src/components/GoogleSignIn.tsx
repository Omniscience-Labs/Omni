'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { createClient } from '@/lib/supabase/client';
import { useAuthMethodTracking } from '@/lib/stores/auth-tracking';
import { toast } from 'sonner';
import { FcGoogle } from "react-icons/fc";
import { Loader2 } from 'lucide-react';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (element: HTMLElement, config: any) => void;
          prompt: (notification?: (notification: any) => void) => void;
        };
      };
    };
  }
}

interface GoogleSignInProps {
  returnUrl?: string;
}

export default function GoogleSignIn({ returnUrl }: GoogleSignInProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const { wasLastMethod, markAsUsed } = useAuthMethodTracking('google');
  const supabase = createClient();

  const handleGoogleResponse = async (response: any) => {
    try {
      setIsLoading(true);
      markAsUsed();

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.credential,
      });

      if (error) {
        const redirectTo = `${window.location.origin}/auth/callback${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
        console.log('OAuth redirect URI:', redirectTo);
        
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
          },
        });

        if (oauthError) {
          throw oauthError;
        }
      } else {
        window.location.href = returnUrl || '/dashboard';
      }
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      
      if (error.message?.includes('redirect_uri_mismatch')) {
        const redirectUri = `${window.location.origin}/auth/callback`;
        toast.error(
          `Google OAuth configuration error. Add this exact URL to your Google Cloud Console: ${redirectUri}`,
          { duration: 10000 }
        );
      } else {
        toast.error(error.message || 'Failed to sign in with Google');
      }
      
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const initializeGoogleSignIn = () => {
      if (!window.google || !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return;

      window.google.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
        auto_select: false,
        cancel_on_tap_outside: false,
      });

      setIsGoogleLoaded(true);
    };

    if (window.google) {
      initializeGoogleSignIn();
    }
  }, [returnUrl, markAsUsed, supabase]);

  const handleScriptLoad = () => {
    if (window.google && process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
      window.google.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
        auto_select: false,
        cancel_on_tap_outside: false,
      });

      setIsGoogleLoaded(true);
    }
  };

  const handleGoogleSignIn = () => {
    if (!window.google || !isGoogleLoaded) {
      toast.error('Google Sign-In is still loading. Please try again.');
      return;
    }

    try {
      window.google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          console.log('One Tap not displayed, using OAuth flow');
          setIsLoading(true);
          
          const redirectTo = `${window.location.origin}/auth/callback${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
          console.log('OAuth redirect URI:', redirectTo);
          
          supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo,
            },
          }).then(({ error }) => {
            if (error) {
              console.error('OAuth error:', error);
              
              if (error.message?.includes('redirect_uri_mismatch')) {
                const redirectUri = `${window.location.origin}/auth/callback`;
                toast.error(
                  `Google OAuth configuration error. Add this exact URL to your Google Cloud Console: ${redirectUri}`,
                  { duration: 10000 }
                );
              } else {
                toast.error(error.message || 'Failed to sign in with Google');
              }
              
              setIsLoading(false);
            }
          });
        }
      });
    } catch (error) {
      console.error('Error triggering Google sign-in:', error);
      setIsLoading(true);
      
      const redirectTo = `${window.location.origin}/auth/callback${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
      supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      }).then(({ error }) => {
        if (error) {
          console.error('OAuth error:', error);
          
          if (error.message?.includes('redirect_uri_mismatch')) {
            const redirectUri = `${window.location.origin}/auth/callback`;
            toast.error(
              `Google OAuth configuration error. Add this exact URL to your Google Cloud Console: ${redirectUri}`,
              { duration: 10000 }
            );
          } else {
            toast.error(error.message || 'Failed to sign in with Google');
          }
          
          setIsLoading(false);
        }
      });
    }
  };

  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
    return (
      <div className="w-full text-center text-sm text-gray-500 py-3">
        Google Sign-In not configured
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={handleGoogleSignIn}
        disabled={isLoading || !isGoogleLoaded}
        className="w-full h-12 flex items-center justify-center text-sm font-medium tracking-wide rounded-full bg-background text-foreground border border-border hover:bg-accent/30 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed font-sans"
        aria-label={isLoading ? 'Signing in with Google...' : 'Sign in with Google'}
        type="button"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <FcGoogle className="w-4 h-4 mr-2" />
        )}
        <span className="font-medium">
          {isLoading ? 'Signing in...' : 'Continue with Google'}
        </span>
      </button>
      
      {wasLastMethod && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background shadow-sm">
          <div className="w-full h-full bg-green-500 rounded-full animate-pulse" />
        </div>
      )}
      
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={handleScriptLoad}
      />
    </div>
  );
}