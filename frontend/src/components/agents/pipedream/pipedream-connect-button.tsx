'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCreatePipedreamProfile, useConnectPipedreamProfile } from '@/hooks/react-query/pipedream/use-pipedream-profiles';
import { PipedreamAppBrowser } from './pipedream-app-browser';
import type { CreateProfileRequest } from '@/types/pipedream-profiles';

interface PipedreamConnectButtonProps {
  app?: string;
  onConnect?: () => void;
  className?: string;
  createProfile?: boolean;
}

export const PipedreamConnectButton: React.FC<PipedreamConnectButtonProps> = ({
  app,
  onConnect,
  className,
  createProfile = false
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [showAppBrowser, setShowAppBrowser] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [selectedApp, setSelectedApp] = useState<{ app_slug: string; app_name: string } | null>(null);
  
  const createProfileMutation = useCreatePipedreamProfile();
  const connectProfileMutation = useConnectPipedreamProfile();

  const handleConnect = async () => {
    if (createProfile) {
      // Show app browser first
      setShowAppBrowser(true);
    } else {
      // Direct connection without profile (legacy flow)
      setIsConnecting(true);
      try {
        const { pipedreamApi } = await import('@/hooks/react-query/pipedream/utils');
        const response = await pipedreamApi.createConnectionToken({ app });
        
        if (response.success && response.link) {
          const connectWindow = window.open(response.link, '_blank', 'width=600,height=700');
          
          if (connectWindow) {
            const checkClosed = setInterval(() => {
              if (connectWindow.closed) {
                clearInterval(checkClosed);
                setIsConnecting(false);
                onConnect?.();
              }
            }, 1000);
            
            setTimeout(() => {
              clearInterval(checkClosed);
              if (!connectWindow.closed) {
                setIsConnecting(false);
              }
            }, 5 * 60 * 1000);
          } else {
            setIsConnecting(false);
            toast.error('Failed to open connection window. Please check your popup blocker.');
          }
        } else {
          setIsConnecting(false);
          toast.error(response.error || 'Failed to create connection');
        }
      } catch (error) {
        setIsConnecting(false);
        console.error('Connection error:', error);
        toast.error('Failed to connect to app');
      }
    }
  };

  const handleAppSelect = (app: { app_slug: string; app_name: string }) => {
    setSelectedApp(app);
    setProfileName(`${app.app_name} Profile`);
    setShowProfileDialog(true);
  };

  const handleCreateProfile = async () => {
    if (!profileName.trim() || !selectedApp) return;

    const request: CreateProfileRequest = {
      profile_name: profileName.trim(),
      app_slug: selectedApp.app_slug,
      app_name: selectedApp.app_name,
      is_default: isDefault,
    };

    try {
      // Create the profile with a generated external_user_id
      const profile = await createProfileMutation.mutateAsync(request);
      
      // Now connect the profile using its external_user_id
      const connectResult = await connectProfileMutation.mutateAsync({
        profileId: profile.profile_id,
        app: selectedApp.app_slug
      });
      
      if (connectResult.link) {
        const connectWindow = window.open(connectResult.link, '_blank', 'width=600,height=700');
        
        if (connectWindow) {
          const checkClosed = setInterval(() => {
            if (connectWindow.closed) {
              clearInterval(checkClosed);
              setShowProfileDialog(false);
              setProfileName('');
              setIsDefault(false);
              setSelectedApp(null);
              toast.success(`Successfully connected ${selectedApp.app_name} profile!`);
              onConnect?.();
            }
          }, 1000);
          
          setTimeout(() => {
            clearInterval(checkClosed);
            if (!connectWindow.closed) {
              setShowProfileDialog(false);
              toast.info('Connection window closed. Please check if the connection was successful.');
            }
          }, 5 * 60 * 1000);
        } else {
          toast.error('Failed to open connection window. Please check your popup blocker.');
        }
      }
    } catch (error) {
      toast.error('Failed to create profile');
    }
  };

  return (
    <>
      <Button
        onClick={handleConnect}
        disabled={isConnecting}
        className={className}
        size="sm"
      >
        {isConnecting ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <Zap className="h-3 w-3" />
            {createProfile ? 'Connect New App' : (app ? 'Connect' : 'Connect Apps')}
          </>
        )}
      </Button>

      {/* App Browser */}
      <PipedreamAppBrowser
        open={showAppBrowser}
        onOpenChange={setShowAppBrowser}
        onSelectApp={handleAppSelect}
      />

      {/* Profile Creation Dialog */}
      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create {selectedApp?.app_name} Profile</DialogTitle>
            <DialogDescription>
              Name your profile to identify different {selectedApp?.app_name} accounts or configurations.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Profile Name</Label>
              <Input
                id="profile-name"
                placeholder="e.g., Personal Account, Work Account"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Choose a descriptive name to identify this profile
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="is-default"
                checked={isDefault}
                onCheckedChange={setIsDefault}
              />
              <Label htmlFor="is-default">Set as default {selectedApp?.app_name} profile</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProfileDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateProfile}
              disabled={!profileName.trim() || createProfileMutation.isPending || connectProfileMutation.isPending}
            >
              {createProfileMutation.isPending || connectProfileMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                'Create & Connect'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}; 