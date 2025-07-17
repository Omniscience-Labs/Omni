'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import Script from 'next/script';
import { createClient } from '@/lib/supabase/client';
import { useTheme } from 'next-themes';
import { useAuthMethodTracking } from '@/lib/stores/auth-tracking';
import { FcGoogle } from "react-icons/fc";

declare global {
  interface Window {
    handleGoogleSignIn?: (response: GoogleSignInResponse) => void;
    google: {
      accounts: {
        id: {
          initialize: (config: GoogleInitializeConfig) => void;
          renderButton: (
            element: HTMLElement,
            options: GoogleButtonOptions,
          ) => void;
          prompt: (
            callback?: (notification: GoogleNotification) => void,
          ) => void;
          cancel: () => void;
        };
      };
    };
  }
}

interface GoogleSignInResponse {
  credential: string;
  clientId?: string;
  select_by?: string;
}

interface GoogleInitializeConfig {
  client_id: string | undefined;
  callback: ((response: GoogleSignInResponse) => void) | undefined;
  nonce?: string;
  use_fedcm?: boolean;
  context?: string;
  itp_support?: boolean;
}

interface GoogleButtonOptions {
  type?: string;
  theme?: string;
  size?: string;
  text?: string;
  shape?: string;
  logoAlignment?: string;
  width?: number;
}

interface GoogleNotification {
  isNotDisplayed: () => boolean;
  getNotDisplayedReason: () => string;
  isSkippedMoment: () => boolean;
  getSkippedReason: () => string;
  isDismissedMoment: () => boolean;
  getDismissedReason: () => string;
}

interface GoogleSignInProps {
  returnUrl?: string;
}

export default function GoogleSignIn({ returnUrl }: GoogleSignInProps) {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const { resolvedTheme } = useTheme();

  const { wasLastMethod, markAsUsed } = useAuthMethodTracking('google');

  const handleGoogleSignIn = useCallback(
    async (response: GoogleSignInResponse) => {
      try {
        setIsLoading(true);
        const supabase = createClient();

        console.log('Starting Google sign in process');
        markAsUsed();

        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: response.credential,
        });

        if (error) throw error;

        console.log(
          'Google sign in successful, preparing redirect to:',
          returnUrl || '/dashboard',
        );
        setTimeout(() => {
          console.log('Executing redirect now to:', returnUrl || '/dashboard');
          window.location.href = returnUrl || '/dashboard';
        }, 500);
      } catch (error) {
        console.error('Error signing in with Google:', error);
        setIsLoading(false);
      }
    },
    [returnUrl, markAsUsed],
  );

  const handleManualGoogleSignIn = useCallback(() => {
    if (window.google && googleClientId && isGoogleLoaded) {
      setIsLoading(true);
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          console.log('Google sign-in was not displayed or skipped');
          setIsLoading(false);
        }
      });
    }
  }, [googleClientId, isGoogleLoaded]);

  useEffect(() => {
    window.handleGoogleSignIn = handleGoogleSignIn;

    if (window.google && googleClientId) {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleSignIn,
        use_fedcm: true,
        context: 'signin',
        itp_support: true,
      });
      setIsGoogleLoaded(true);
    }

    return () => {
      delete window.handleGoogleSignIn;
      if (window.google) {
        window.google.accounts.id.cancel();
      }
    };
  }, [googleClientId, handleGoogleSignIn]);

  if (!googleClientId) {
    return (
      <button
        disabled
        className="w-full h-12 flex items-center justify-center text-sm font-medium tracking-wide rounded-full bg-background text-foreground border border-border hover:bg-accent/30 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed font-sans opacity-60 cursor-not-allowed"
      >
        <FcGoogle className="w-5 h-5 mr-2" />
        Google Sign-In Not Configured
      </button>
    );
  }

  return (
    <>
      <div
        id="g_id_onload"
        data-client_id={googleClientId}
        data-context="signin"
        data-ux_mode="popup"
        data-auto_prompt="false"
        data-itp_support="true"
        data-callback="handleGoogleSignIn"
        style={{ display: 'none' }}
      />

      <div className="relative">
        <button
          onClick={handleManualGoogleSignIn}
          disabled={isLoading || !isGoogleLoaded}
          className="w-full h-12 flex items-center justify-center text-sm font-medium tracking-wide rounded-full bg-background text-foreground border border-border hover:bg-accent/30 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed font-sans"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              <FcGoogle className="w-5 h-5 mr-2" />
              Continue with Google
            </>
          )}
        </button>
        {wasLastMethod && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background shadow-sm">
            <div className="w-full h-full bg-green-500 rounded-full animate-pulse" />
          </div>
        )}
      </div>

      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => {
          if (window.google && googleClientId) {
            window.google.accounts.id.initialize({
              client_id: googleClientId,
              callback: handleGoogleSignIn,
              use_fedcm: true,
              context: 'signin',
              itp_support: true,
            });
            setIsGoogleLoaded(true);
          }
        }}
      />
    </>
  );
}
