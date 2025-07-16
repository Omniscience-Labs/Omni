'use client';

import Link from 'next/link';
import { SubmitButton } from '@/components/ui/submit-button';
import { Input } from '@/components/ui/input';
import GoogleSignIn from '@/components/GoogleSignIn';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useState, useEffect, Suspense } from 'react';
import { signIn, signUp, forgotPassword } from './actions';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  X,
  CheckCircle,
  AlertCircle,
  MailCheck,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import GitHubSignIn from '@/components/GithubSignIn';
import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { FlickeringGrid } from '@/components/home/ui/flickering-grid';
import { Ripple } from '@/components/ui/ripple';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();
  const mode = searchParams.get('mode');
  const returnUrl = searchParams.get('returnUrl');
  const message = searchParams.get('message');

  const isSignUp = mode === 'signup';
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!isLoading && user) {
      router.push(returnUrl || '/dashboard');
    }
  }, [user, isLoading, router, returnUrl]);

  const isSuccessMessage =
    message &&
    (message.includes('Check your email') ||
      message.includes('Account created') ||
      message.includes('success'));

  // Registration success state
  const [registrationSuccess, setRegistrationSuccess] =
    useState(!!isSuccessMessage);
  const [registrationEmail, setRegistrationEmail] = useState('');

  // Forgot password state
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordStatus, setForgotPasswordStatus] = useState<{
    success?: boolean;
    message?: string;
  }>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  // Set registration success state from URL params
  useEffect(() => {
    if (isSuccessMessage) {
      setRegistrationSuccess(true);
    }
  }, [isSuccessMessage]);

  const handleSignIn = async (prevState: any, formData: FormData) => {
    if (returnUrl) {
      formData.append('returnUrl', returnUrl);
    } else {
      formData.append('returnUrl', '/dashboard');
    }
    const result = await signIn(prevState, formData);

    // Check for success and redirectTo properties
    if (
      result &&
      typeof result === 'object' &&
      'success' in result &&
      result.success &&
      'redirectTo' in result
    ) {
      // Use window.location for hard navigation to avoid stale state
      window.location.href = result.redirectTo as string;
      return null; // Return null to prevent normal form action completion
    }

    return result;
  };

  const handleSignUp = async (prevState: any, formData: FormData) => {
    // Store email for success state
    const email = formData.get('email') as string;
    setRegistrationEmail(email);

    if (returnUrl) {
      formData.append('returnUrl', returnUrl);
    }

    // Add origin for email redirects
    formData.append('origin', window.location.origin);

    const result = await signUp(prevState, formData);

    // Check for success and redirectTo properties (direct login case)
    if (
      result &&
      typeof result === 'object' &&
      'success' in result &&
      result.success &&
      'redirectTo' in result
    ) {
      // Use window.location for hard navigation to avoid stale state
      window.location.href = result.redirectTo as string;
      return null; // Return null to prevent normal form action completion
    }

    // Check if registration was successful but needs email verification
    if (result && typeof result === 'object' && 'message' in result) {
      const resultMessage = result.message as string;
      if (resultMessage.includes('Check your email')) {
        setRegistrationSuccess(true);

        // Update URL without causing a refresh
        const params = new URLSearchParams(window.location.search);
        params.set('message', resultMessage);

        const newUrl =
          window.location.pathname +
          (params.toString() ? '?' + params.toString() : '');

        window.history.pushState({ path: newUrl }, '', newUrl);

        return result;
      }
    }

    return result;
  };

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setForgotPasswordStatus({});

    if (!forgotPasswordEmail || !forgotPasswordEmail.includes('@')) {
      setForgotPasswordStatus({
        success: false,
        message: 'Please enter a valid email address',
      });
      return;
    }

    const formData = new FormData();
    formData.append('email', forgotPasswordEmail);
    formData.append('origin', window.location.origin);

    const result = await forgotPassword(null, formData);

    setForgotPasswordStatus(result);
  };

  const resetRegistrationSuccess = () => {
    setRegistrationSuccess(false);
    // Remove message from URL and set mode to signin
    const params = new URLSearchParams(window.location.search);
    params.delete('message');
    params.set('mode', 'signin');

    const newUrl =
      window.location.pathname +
      (params.toString() ? '?' + params.toString() : '');

    window.history.pushState({ path: newUrl }, '', newUrl);

    router.refresh();
  };

  // Show loading spinner while checking auth state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Registration success view
  if (registrationSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center">
            <div className="bg-green-50 dark:bg-green-950/20 rounded-full p-4 mb-6 inline-flex">
              <MailCheck className="h-12 w-12 text-green-500 dark:text-green-400" />
            </div>

            <h1 className="text-3xl font-semibold text-foreground mb-4">
              Check your email
            </h1>

            <p className="text-muted-foreground mb-2">
              We've sent a confirmation link to:
            </p>

            <p className="text-lg font-medium mb-6">
              {registrationEmail || 'your email address'}
            </p>

            <div className="bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/50 rounded-lg p-4 mb-8">
              <p className="text-sm text-green-800 dark:text-green-400">
                Click the link in the email to activate your account. If you don't see the email, check your spam folder.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/"
                className="flex h-11 items-center justify-center px-6 text-center rounded-lg border border-border bg-background hover:bg-accent transition-colors"
              >
                Return to home
              </Link>
              <button
                onClick={resetRegistrationSuccess}
                className="flex h-11 items-center justify-center px-6 text-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Back to sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
      <div className="min-h-screen bg-background relative">
        <div className="absolute top-6 left-6 z-10">
          <Link href="/" className="flex items-center">
            <KortixLogo size={28} />
          </Link>
        </div>
        <div className="flex min-h-screen">
          <div className="flex-1 flex items-center justify-center p-4 lg:p-8">
            <div className="w-full max-w-sm">
              <div className="mb-8">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to home
                </Link>
                <h1 className="text-2xl font-semibold text-foreground">
                  {isSignUp ? 'Create your account' : 'Log into your account'}
                </h1>
              </div>
            {message && !isSuccessMessage && (
              <div className="mb-6 p-4 rounded-lg flex items-center gap-3 bg-destructive/10 border border-destructive/20 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{message}</span>
              </div>
            )}
            <div className="space-y-3 mb-6">
              <GoogleSignIn returnUrl={returnUrl || undefined} />
              <GitHubSignIn returnUrl={returnUrl || undefined} />
            </div>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-background text-muted-foreground">
                  or continue with email
                </span>
              </div>
            </div>
            <form className="space-y-4">
              <div>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Email address"
                  className="h-11 rounded-xl"
                  required
                />
              </div>
              <div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Password"
                  className="h-11 rounded-xl"
                  required
                />
              </div>
              {isSignUp && (
                <div>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder="Confirm password"
                    className="h-11 rounded-xl"
                    required
                  />
                </div>
              )}
              <div className="space-y-3 pt-2">
                {!isSignUp ? (
                  <>
                    <SubmitButton
                      formAction={handleSignIn}
                      className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      pendingText="Signing in..."
                    >
                      Sign in
                    </SubmitButton>

                    <Link
                      href={`/auth?mode=signup${returnUrl ? `&returnUrl=${returnUrl}` : ''}`}
                      className="text-sm flex h-11 items-center justify-center w-full text-center border border-border bg-background hover:bg-accent transition-colors rounded-xl"
                    >
                      Create new account
                    </Link>
                  </>
                ) : (
                  <>
                    <SubmitButton
                      formAction={handleSignUp}
                      className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      pendingText="Creating account..."
                    >
                      Sign up
                    </SubmitButton>

                    <Link
                      href={`/auth${returnUrl ? `?returnUrl=${returnUrl}` : ''}`}
                      className="flex h-11 items-center justify-center w-full text-center border border-border bg-background hover:bg-accent transition-colors rounded-md"
                    >
                      Back to sign in
                    </Link>
                  </>
                )}
              </div>
              {!isSignUp && (
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setForgotPasswordOpen(true)}
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </form>
            <div className="mt-8 text-center text-xs text-muted-foreground">
              By continuing, you agree to our{' '}
              <Link href="/legal?tab=terms" className="text-primary hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/legal?tab=privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
        <div className="hidden lg:flex flex-1 items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 relative overflow-hidden">
          <div className="absolute inset-0 opacity-60">
            <Ripple />
          </div>
          <div className="absolute inset-0">
            <FlickeringGrid
              className="h-full w-full mix-blend-soft-light opacity-30"
              squareSize={3}
              gridGap={3}
              color="var(--primary)"
              maxOpacity={0.6}
              flickerChance={0.02}
            />
          </div>
          <div className="absolute inset-0">
            <FlickeringGrid
              className="h-full w-full mix-blend-overlay opacity-20"
              squareSize={1.5}
              gridGap={1.5}
              color="var(--secondary)"
              maxOpacity={0.3}
              flickerChance={0.01}
            />
          </div>
        </div>
      </div>
      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Reset Password</DialogTitle>
              <button
                onClick={() => setForgotPasswordOpen(false)}
                className="rounded-sm p-1 hover:bg-accent transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <DialogDescription>
              Enter your email address and we'll send you a link to reset your password.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <Input
              id="forgot-password-email"
              type="email"
              placeholder="Email address"
              value={forgotPasswordEmail}
              onChange={(e) => setForgotPasswordEmail(e.target.value)}
              className="h-11 rounded-xl"
              required
            />
            {forgotPasswordStatus.message && (
              <div
                className={`p-3 rounded-md flex items-center gap-3 ${
                  forgotPasswordStatus.success
                    ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 text-green-800 dark:text-green-400'
                    : 'bg-destructive/10 border border-destructive/20 text-destructive'
                }`}
              >
                {forgotPasswordStatus.success ? (
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                )}
                <span className="text-sm">{forgotPasswordStatus.message}</span>
              </div>
            )}
            <DialogFooter className="gap-2">
              <button
                type="button"
                onClick={() => setForgotPasswordOpen(false)}
                className="h-10 px-4 border border-border bg-background hover:bg-accent transition-colors rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-10 px-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-md"
              >
                Send Reset Link
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
