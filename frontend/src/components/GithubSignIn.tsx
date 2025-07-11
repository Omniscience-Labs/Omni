'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { Icons } from './home/icons';

interface GitHubSignInProps {
  returnUrl?: string;
}

interface AuthMessage {
  type: 'github-auth-success' | 'github-auth-error';
  message?: string;
  returnUrl?: string;
}

export default function GitHubSignIn({ returnUrl }: GitHubSignInProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { resolvedTheme } = useTheme();

  // Cleanup function to handle auth state
  const cleanupAuthState = useCallback(() => {
    sessionStorage.removeItem('isGitHubAuthInProgress');
    setIsLoading(false);
  }, []);

  // Handle success message
  const handleSuccess = useCallback(
    (data: AuthMessage) => {
      cleanupAuthState();

      // Add a small delay to ensure state is properly cleared
      setTimeout(() => {
        window.location.href = data.returnUrl || returnUrl || '/dashboard';
      }, 100);
    },
    [cleanupAuthState, returnUrl],
  );

  // Handle error message
  const handleError = useCallback(
    (data: AuthMessage) => {
      cleanupAuthState();
      toast.error(data.message || 'GitHub sign-in failed. Please try again.');
    },
    [cleanupAuthState],
  );

  // Message event handler
  useEffect(() => {
    const handleMessage = (event: MessageEvent<AuthMessage>) => {
      // Security: Only accept messages from same origin
      if (event.origin !== window.location.origin) {
        console.warn(
          'Rejected message from unauthorized origin:',
          event.origin,
        );
        return;
      }

      // Validate message structure
      if (!event.data?.type || typeof event.data.type !== 'string') {
        return;
      }

      switch (event.data.type) {
        case 'github-auth-success':
          handleSuccess(event.data);
          break;
        case 'github-auth-error':
          handleError(event.data);
          break;
        default:
          // Ignore unknown message types
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleSuccess, handleError]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      cleanupAuthState();
    };
  }, [cleanupAuthState]);

  const handleGitHubSignIn = async () => {
    if (isLoading) return;

    let popupInterval: NodeJS.Timeout | null = null;

    try {
      setIsLoading(true);

      // Store return URL for the popup
      if (returnUrl) {
        sessionStorage.setItem('github-returnUrl', returnUrl || '/dashboard');
      }

      // Open popup with proper dimensions and features
      const popup = window.open(
        `${window.location.origin}/auth/github-popup`,
        'GitHubOAuth',
        'width=500,height=600,scrollbars=yes,resizable=yes,status=yes,location=yes',
      );

      if (!popup) {
        throw new Error(
          'Popup was blocked. Please enable popups and try again.',
        );
      }

      // Set loading state and track popup
      sessionStorage.setItem('isGitHubAuthInProgress', '1');

      // Monitor popup closure
      popupInterval = setInterval(() => {
        if (popup.closed) {
          if (popupInterval) {
            clearInterval(popupInterval);
            popupInterval = null;
          }

          // Small delay to allow postMessage to complete
          setTimeout(() => {
            if (sessionStorage.getItem('isGitHubAuthInProgress')) {
              cleanupAuthState();
              toast.error('GitHub sign-in was cancelled or not completed.');
            }
          }, 500);
        }
      }, 1000);
    } catch (error) {
      console.error('GitHub sign-in error:', error);
      if (popupInterval) {
        clearInterval(popupInterval);
      }
      cleanupAuthState();
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to start GitHub sign-in',
      );
    }
  };

  return (
    // Matched the button with the GoogleSignIn component
    <button
      onClick={handleGitHubSignIn}
      disabled={isLoading}
      className="relative w-full h-12 flex items-center justify-center text-sm font-normal tracking-wide rounded-full bg-background text-foreground border border-border hover:bg-accent/30 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed font-sans"
      aria-label={
        isLoading ? 'Signing in with GitHub...' : 'Sign in with GitHub'
      }
      type="button"
    >
      <div className="absolute left-0 inset-y-0 flex items-center pl-1 w-10">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-foreground dark:bg-foreground dark:text-background">
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Icons.github className="w-5 h-5" />
          )}
        </div>
      </div>

      <span className="ml-9 font-light">
        {isLoading ? 'Signing in...' : 'Continue with GitHub'}
      </span>
    </button>
  );
}