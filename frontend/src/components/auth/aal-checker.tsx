"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGetAAL } from '@/hooks/react-query/phone-verification';
import { useAuth } from '@/components/AuthProvider';
import { Loader2 } from 'lucide-react';

interface AALCheckerProps {
  children: React.ReactNode;
  redirectTo?: string;
}

/**
 * AALChecker component that validates MFA requirements after authentication.
 * 
 * This component follows the standard Supabase AAL flow AND enforces phone verification
 * requirements for new users (created after cutoff date):
 * 
 * For new users:
 * - If no MFA enrolled: Force phone verification enrollment
 * - If MFA enrolled but not verified: Redirect to verification
 * - If MFA verified: Allow access
 * 
 * For existing users (grandfathered):
 * - Follow standard AAL flow without forcing enrollment
 * - aal1 -> aal1: Allow access (optional MFA)
 * - aal1 -> aal2: Redirect to verification
 * - aal2 -> aal2: Allow access
 * - aal2 -> aal1: Force reauthentication
 */
export function AALChecker({ children, redirectTo = '/auth/phone-verification' }: AALCheckerProps) {
  const { user, isLoading: authLoading } = useAuth();
  const { data: aalData, isLoading: aalLoading, error: aalError } = useGetAAL();
  const router = useRouter();

  useEffect(() => {
    // Only check AAL if user is authenticated and AAL data is available
    if (!authLoading && user && aalData && !aalLoading) {
      const { action_required, current_level, next_level, verification_required } = aalData;

      console.log('AAL Check:', {
        action_required,
        current_level,
        next_level,
        phone_verification_required: verification_required,
        message: aalData.message
      });

      // Handle new users who need phone verification
      if (verification_required) {
        if (current_level === "aal1" && next_level === "aal1") {
          // New user has no MFA enrolled - force enrollment
          console.log('New user without MFA enrolled, redirecting to phone verification:', redirectTo);
          router.push(redirectTo);
          return;
        }
        // If new user has MFA enrolled, follow standard AAL flow below
      }

      // Standard AAL flow (for all users)
      switch (action_required) {
        case 'verify_mfa':
          // User has MFA enrolled but needs to verify it
          console.log('Redirecting to MFA verification:', redirectTo);
          router.push(redirectTo);
          break;
        
        case 'reauthenticate':
          // User has stale JWT due to MFA changes, force reauthentication
          console.log('MFA state changed, forcing reauthentication');
          router.push('/auth?message=Please sign in again due to security changes');
          break;
        
        case 'none':
          // No action required, user can proceed
          console.log('AAL check passed, no action required');
          break;
        
        case 'unknown':
        default:
          // Unknown AAL state, log and allow access (fail open)
          console.warn('Unknown AAL state:', { current_level, next_level, action_required });
          break;
      }
    }
  }, [user, authLoading, aalData, aalLoading, router, redirectTo]);

  // Show loading while checking authentication or AAL status
  if (authLoading || (user && aalLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Checking authentication...</span>
      </div>
    );
  }

  // If not authenticated, don't render children (let auth redirect handle it)
  if (!user) {
    return null;
  }

  // If AAL check failed, allow access (fail open for UX)
  if (aalError) {
    console.error('AAL check failed:', aalError);
  }

  // Check if new user needs phone verification enrollment
  if (aalData?.verification_required && 
      aalData?.current_level === "aal1" && 
      aalData?.next_level === "aal1") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Setting up required verification...</span>
      </div>
    );
  }

  // If AAL check indicates MFA verification is needed, don't render children
  // (the useEffect above will handle the redirect)
  if (aalData?.action_required === 'verify_mfa') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Redirecting to verification...</span>
      </div>
    );
  }

  // If AAL check indicates reauthentication is needed, don't render children
  if (aalData?.action_required === 'reauthenticate') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Redirecting to sign in...</span>
      </div>
    );
  }

  // AAL check passed or no action required, render children
  return <>{children}</>;
} 