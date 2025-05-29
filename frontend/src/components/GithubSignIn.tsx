'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { Icons } from './home/icons';

interface GitHubSignInProps {
  returnUrl?: string;
}

export default function GitHubSignIn({ returnUrl }: GitHubSignInProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === 'github-auth-success') {
        sessionStorage.removeItem('isGitHubAuthInProgress');
        setIsLoading(false);
        window.location.href =
          event.data.returnUrl || returnUrl || '/dashboard';
      }

      if (event.data?.type === 'github-auth-error') {
        sessionStorage.removeItem('isGitHubAuthInProgress');
        setIsLoading(false);
        toast.error(event.data.message || 'GitHub sign-in failed.');
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [returnUrl]);

  const handleGitHubSignIn = () => {
    const popup = window.open(
      `${window.location.origin}/auth/github-popup`,
      'GitHubOAuth',
      'width=500,height=600',
    );

    if (!popup) {
      toast.error('Popup was blocked. Please enable popups and try again.');
      return;
    }

    setTimeout(() => {
      sessionStorage.setItem('isGitHubAuthInProgress', '1');
      setIsLoading(true);

      const interval = setInterval(() => {
        if (popup.closed) {
          clearInterval(interval);
          setIsLoading(false);

          // Delay toast to allow success postMessage to clear the flag
          setTimeout(() => {
            if (sessionStorage.getItem('isGitHubAuthInProgress')) {
              sessionStorage.removeItem('isGitHubAuthInProgress');
              toast.error('GitHub sign-in was not completed.');
            }
          }, 300);
        }
      }, 500);
    }, 0);
  };

  return (
    <button
      onClick={handleGitHubSignIn}
      disabled={isLoading}
      className="w-full h-[56px] flex items-center justify-center gap-3 rounded-full border border-border bg-background hover:bg-[rgba(255,255,255,0.08)] transition-all text-sm font-normal tracking-normal"
      style={{
        fontFamily: '"Google Sans", Arial, sans-serif',
        fontWeight: 400,
        boxShadow: 'none',
      }}
      aria-label="Sign in with GitHub"
    >
      <span className="flex items-center justify-center w-6 h-6">
        <Icons.github className="w-9 h-9" />
      </span>
      {isLoading ? 'Waiting for GitHub...' : 'Continue with GitHub'}
    </button>

  );
}
