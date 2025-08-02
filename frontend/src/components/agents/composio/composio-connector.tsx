import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { useCreateComposioProfile } from '@/hooks/react-query/composio/use-composio';
import type { ComposioToolkit } from '@/hooks/react-query/composio/utils';
import { toast } from 'sonner';

interface ComposioConnectorProps {
  app: ComposioToolkit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (profileId: string, appName: string, appSlug: string) => void;
  mode?: 'full' | 'profile-only';
}

export const ComposioConnector: React.FC<ComposioConnectorProps> = ({
  app,
  open,
  onOpenChange,
  onComplete,
  mode = 'full',
}) => {
  const [profileName, setProfileName] = useState(`${app.name} Profile`);
  const [step, setStep] = useState<'configure' | 'connecting' | 'success'>('configure');
  const [createdProfileId, setCreatedProfileId] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  const createProfileMutation = useCreateComposioProfile();

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep('configure');
      setProfileName(`${app.name} Profile`);
      setCreatedProfileId(null);
      setRedirectUrl(null);
    }
  }, [open, app.name]);

  // Auto-redirect when OAuth URL is received
  useEffect(() => {
    if (redirectUrl && step === 'connecting') {
      // Small delay to let user see the "connecting" state
      const timer = setTimeout(() => {
        setStep('success');
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [redirectUrl, step]);

  const handleConnect = async () => {
    if (!profileName.trim()) {
      toast.error('Please enter a profile name');
      return;
    }

    setStep('connecting');

    try {
      const result = await createProfileMutation.mutateAsync({
        toolkit_slug: app.slug,
        profile_name: profileName.trim(),
        display_name: profileName.trim(),
      });

      setCreatedProfileId(result.profile_id);
      setRedirectUrl(result.redirect_url || null);

      // If no redirect URL, go straight to success
      if (!result.redirect_url) {
        setStep('success');
      }
    } catch (error) {
      console.error('Failed to create Composio profile:', error);
      setStep('configure');
    }
  };

  const handleComplete = () => {
    if (createdProfileId && onComplete) {
      onComplete(createdProfileId, app.name, app.slug);
    }
    onOpenChange(false);
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              {app.logo ? (
                <img
                  src={app.logo}
                  alt={`${app.name} logo`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5 text-primary font-semibold">
                  {app.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            Connect to {app.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {step === 'configure' && (
            <>
              <div className="space-y-2">
                <label htmlFor="profileName" className="text-sm font-medium">
                  Profile Name
                </label>
                <Input
                  id="profileName"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder={`${app.name} Profile`}
                  disabled={createProfileMutation.isPending}
                />
                <p className="text-xs text-muted-foreground">
                  This will be saved as a reusable credential profile
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Create secure credential profile</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>OAuth authorization with {app.name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Ready to use in agents</span>
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={handleConnect}
                  disabled={createProfileMutation.isPending || !profileName.trim()}
                  className="flex-1"
                >
                  {createProfileMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Connect'
                  )}
                </Button>
              </div>
            </>
          )}

          {step === 'connecting' && (
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">Setting up connection...</h3>
                <p className="text-sm text-muted-foreground">
                  {redirectUrl ? 
                    'Opening OAuth authorization window...' : 
                    'Creating your credential profile...'
                  }
                </p>
              </div>
              {redirectUrl && (
                <Alert>
                  <ExternalLink className="h-4 w-4" />
                  <AlertDescription>
                    Complete the authorization in the new window that opened.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {step === 'success' && (
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">Connection created!</h3>
                <p className="text-sm text-muted-foreground">
                  Your {app.name} profile has been saved and is ready to use.
                </p>
              </div>
              
              {redirectUrl && (
                <Alert className="text-left">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Complete the setup:</strong> Make sure to complete the OAuth authorization in the popup window to fully activate your connection.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  Close
                </Button>
                {mode === 'full' && onComplete && (
                  <Button onClick={handleComplete} className="flex-1">
                    Continue
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}; 