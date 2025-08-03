import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Check, AlertCircle, Plus, Clock, ExternalLink, Zap, ChevronRight } from 'lucide-react';
import { useCreateComposioProfile } from '@/hooks/react-query/composio/use-composio';
import { useComposioProfiles } from '@/hooks/react-query/composio/use-composio-profiles';
import { ComposioToolsManager } from './composio-tools-manager';
import type { ComposioToolkit, ComposioProfile } from '@/hooks/react-query/composio/utils';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface ComposioConnectorProps {
  app: ComposioToolkit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (profileId: string, appName: string, appSlug: string) => void;
  mode?: 'full' | 'profile-only';
  agentId?: string;
}

type Step = 'profile-select' | 'profile-create' | 'connecting' | 'tools' | 'success';

export const ComposioConnector: React.FC<ComposioConnectorProps> = ({
  app,
  open,
  onOpenChange,
  onComplete,
  mode = 'full',
  agentId
}) => {
  const [step, setStep] = useState<Step>('profile-select');
  const [profileName, setProfileName] = useState(`${app.name} Profile`);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [createdProfileId, setCreatedProfileId] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<ComposioProfile | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [showToolsManager, setShowToolsManager] = useState(false);

  const { mutate: createProfile, isPending: isCreating } = useCreateComposioProfile();
  const { data: profiles, isLoading: isLoadingProfiles } = useComposioProfiles();

  // Get existing profiles for this app
  const existingProfiles = profiles?.filter(p => 
    p.toolkit_slug === app.slug && p.is_connected
  ) || [];

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep('profile-select');
      setProfileName(`${app.name} Profile`);
      setSelectedProfileId('');
      setSelectedProfile(null);
      setCreatedProfileId(null);
      setRedirectUrl(null);
      setShowToolsManager(false);
    }
  }, [open, app.name]);

  const handleProfileSelect = () => {
    if (selectedProfileId === 'new') {
      setStep('profile-create');
    } else if (selectedProfileId) {
      const profile = existingProfiles.find(p => p.profile_id === selectedProfileId);
      if (profile) {
        setSelectedProfile(profile);
        setCreatedProfileId(profile.profile_id);
        if (mode === 'full' && agentId) {
          setStep('tools');
        } else {
          onComplete(profile.profile_id, app.name, app.slug);
          onOpenChange(false);
        }
      }
    }
  };

  const handleCreateProfile = () => {
    createProfile({
      toolkit_slug: app.slug,
      profile_name: profileName,
    }, {
      onSuccess: (response) => {
        setCreatedProfileId(response.profile_id);
        if (response.redirect_url) {
          setRedirectUrl(response.redirect_url);
          setStep('connecting');
          window.open(response.redirect_url, '_blank', 'width=600,height=700');
        } else {
          if (mode === 'full' && agentId) {
            const newProfile = {
              profile_id: response.profile_id,
              profile_name: profileName,
              toolkit_name: app.name,
              toolkit_slug: app.slug,
              is_connected: true,
              created_at: new Date().toISOString(),
              mcp_url: response.mcp_url || '',
              display_name: profileName,
              is_default: false
            };
            setSelectedProfile(newProfile);
            setStep('tools');
          } else {
            setStep('success');
            setTimeout(() => {
              onComplete(response.profile_id, app.name, app.slug);
              onOpenChange(false);
            }, 1500);
          }
        }
      },
      onError: (error: any) => {
        toast.error(error.message || 'Failed to create profile');
      }
    });
  };

  const handleAuthComplete = () => {
    if (createdProfileId && mode === 'full' && agentId) {
      // Find or create profile info
      const profile = existingProfiles.find(p => p.profile_id === createdProfileId) || {
        profile_id: createdProfileId,
        profile_name: profileName,
        toolkit_name: app.name,
        toolkit_slug: app.slug,
        is_connected: true,
        created_at: new Date().toISOString(),
        mcp_url: '',
        display_name: profileName,
        is_default: false
      };
      setSelectedProfile(profile);
      setStep('tools');
    } else if (createdProfileId) {
      setStep('success');
      setTimeout(() => {
        onComplete(createdProfileId, app.name, app.slug);
        onOpenChange(false);
      }, 1500);
    }
  };

  const handleToolsSave = () => {
    if (createdProfileId) {
      onComplete(createdProfileId, app.name, app.slug);
      onOpenChange(false);
    }
  };

  const handleBack = () => {
    switch (step) {
      case 'profile-create':
        setStep('profile-select');
        break;
      case 'connecting':
        setStep('profile-create');
        break;
      case 'tools':
        setStep('profile-select');
        break;
      default:
        break;
    }
  };

  if (showToolsManager && agentId && selectedProfile) {
    return (
      <ComposioToolsManager
        agentId={agentId}
        open={showToolsManager}
        onOpenChange={(open) => {
          if (!open) {
            handleToolsSave();
          }
          setShowToolsManager(open);
        }}
        profileId={selectedProfile.profile_id}
        profileInfo={{
          profile_id: selectedProfile.profile_id,
          profile_name: selectedProfile.profile_name,
          toolkit_name: selectedProfile.toolkit_name,
          toolkit_slug: selectedProfile.toolkit_slug,
        }}
        appLogo={app.logo}
        onToolsUpdate={() => {
          handleToolsSave();
        }}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {app.logo ? (
              <img src={app.logo} alt={app.name} className="w-10 h-10 rounded-lg object-contain bg-muted p-1" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary font-semibold">
                {app.name.charAt(0)}
              </div>
            )}
            <div className="flex-1">
              <DialogTitle className="text-lg font-semibold">
                {step === 'tools' ? `Configure ${app.name} Tools` : `Connect ${app.name}`}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {step === 'connecting' && 'Authenticating your account'}
                {step === 'tools' && `Select tools to add to your agent`}
                {step === 'success' && 'Connection successful'}
              </p>
              {app.description && (step === 'profile-select' || step === 'profile-create') && (
                <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-2">
                  {app.description}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4">
          {step === 'profile-select' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Connection Profile</Label>
                <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a profile..." />
                  </SelectTrigger>
                  <SelectContent className="w-full">
                    {existingProfiles.map((profile) => (
                      <SelectItem key={profile.profile_id} value={profile.profile_id}>
                        <div className="flex items-center justify-between w-full">
                          <div className="flex-1">
                            <div className="font-medium">{profile.profile_name}</div>
                            <div className="text-xs text-muted-foreground">
                              Connected {formatDistanceToNow(new Date(profile.created_at), { addSuffix: true })}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                    <SelectItem value="new">
                      <div className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        <span>Create New Profile</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleProfileSelect}
                  disabled={!selectedProfileId}
                  className="flex-1"
                >
                  {selectedProfileId === 'new' ? 'Continue' : mode === 'full' && agentId ? 'Configure Tools' : 'Use Profile'}
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step: Create Profile */}
          {step === 'profile-create' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profileName">Profile Name</Label>
                <Input
                  id="profileName"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Enter a name for this profile"
                />
                <p className="text-xs text-muted-foreground">
                  Choose a memorable name to identify this connection
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={isCreating}
                  className="flex-1"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={handleCreateProfile}
                  disabled={isCreating || !profileName.trim()}
                  className="flex-1"
                >
                  {isCreating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Connect
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step: Connecting (OAuth) */}
          {step === 'connecting' && (
            <div className="space-y-6">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
                  <ExternalLink className="h-8 w-8 text-primary animate-pulse" />
                </div>
                
                <div>
                  <h3 className="font-medium mb-2">Complete Authentication</h3>
                  <p className="text-sm text-muted-foreground">
                    A new window has opened for you to authorize your {app.name} connection.
                    Complete the process there and return here.
                  </p>
                </div>
              </div>

              {redirectUrl && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    If the window didn't open,{' '}
                    <button
                      onClick={() => window.open(redirectUrl, '_blank')}
                      className="underline font-medium hover:no-underline"
                    >
                      click here to authenticate
                    </button>
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleAuthComplete}
                className="w-full"
              >
                I've Completed Authentication
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step: Tools Selection */}
          {step === 'tools' && selectedProfile && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="text-sm">
                  <span className="text-muted-foreground">Selected Profile:</span>{' '}
                  <span className="font-medium">{selectedProfile.profile_name}</span>
                </div>
              </div>

              <Button
                onClick={() => setShowToolsManager(true)}
                className="w-full"
              >
                <Zap className="h-4 w-4" />
                Select Tools
                <ChevronRight className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                onClick={handleBack}
                className="w-full"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Profile Selection
              </Button>
            </div>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <div className="space-y-6 text-center">
              <div className="space-y-4">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                  <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                
                <div>
                  <h3 className="font-medium mb-2">Successfully Connected!</h3>
                  <p className="text-sm text-muted-foreground">
                    Your {app.name} integration is ready.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}; 