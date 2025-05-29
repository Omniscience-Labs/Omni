'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function GitHubOAuthPopup() {
  useEffect(() => {
    const supabase = createClient();
    const returnUrl = sessionStorage.getItem('returnUrl') || '/dashboard';

    const finish = (type: 'success' | 'error', message?: string) => {
      try {
        if (window.opener) {
          window.opener.postMessage(
            type === 'success'
              ? { type: 'github-auth-success', returnUrl }
              : {
                  type: 'github-auth-error',
                  message: message || 'GitHub sign-in failed',
                },
            window.opener.origin || '*',
          );
        }
      } catch (err) {
        console.warn('Failed to post message to opener:', err);
      }

      setTimeout(() => window.close(), 150); // Give time for message delivery
    };

    const handleOAuth = async () => {
      const isOAuthCallback = new URLSearchParams(window.location.search).has(
        'code',
      );

      if (isOAuthCallback) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session) {
            return finish('success');
          }

          // Fallback if session is not yet populated
          supabase.auth.onAuthStateChange((_event, session) => {
            if (session) finish('success');
          });

          return;
        } catch (err: any) {
          console.error('Session error:', err);
          return finish('error', err.message);
        }
      }

      // Start the GitHub OAuth flow
      try {
        await supabase.auth.signInWithOAuth({
          provider: 'github',
          options: {
            redirectTo: `${window.location.origin}/auth/github-popup`,
          },
        });
      } catch (err: any) {
        console.error('OAuth start error:', err);
        finish('error', err.message);
      }
    };

    handleOAuth();
  }, []);

  return (
    <main className="flex items-center justify-center h-screen text-muted-foreground text-sm">
      Completing GitHub sign-in...
    </main>
  );
}
