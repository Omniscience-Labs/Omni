'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePhoneVerificationStatus } from '@/hooks/react-query/phone-verification';
import { Loader2 } from 'lucide-react';

interface PhoneVerificationGuardProps {
  children: React.ReactNode;
}

export function PhoneVerificationGuard({ children }: PhoneVerificationGuardProps) {
  const router = useRouter();
  const { data: status, isLoading, error, refetch } = usePhoneVerificationStatus();

  useEffect(() => {
    if (status && status.verification_required && !status.is_verified) {
      router.push('/auth/phone-verification');
    }
  }, [status, router]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Checking verification status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 p-8 text-center">
          <h2 className="text-lg font-semibold">Verification Check Failed</h2>
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Only show children if user has verified phone or verification is not required
  if (status?.is_verified || !status?.verification_required) {
    return <>{children}</>;
  }

  // Show full-screen lock for users requiring phone verification
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 p-8 text-center max-w-md">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
          <svg
            className="w-8 h-8 text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Phone Verification Required
          </h1>
          <p className="text-muted-foreground">
            To ensure the security of your account, we need to verify your phone number before you can access the application.
          </p>
        </div>

        <div className="w-full space-y-4">
          <button
            onClick={() => router.push('/auth/phone-verification')}
            className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium"
          >
            Verify Phone Number
          </button>
          
          <p className="text-xs text-muted-foreground">
            This is a one-time verification process for account security.
          </p>
        </div>
      </div>
    </div>
  );
}
