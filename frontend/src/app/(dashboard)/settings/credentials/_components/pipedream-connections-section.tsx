'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Zap, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2,
  Calendar,
  Settings,
  User,
  Star,
  XCircle,
  Plus,
} from 'lucide-react';
import { usePipedreamProfiles } from '@/hooks/react-query/pipedream/use-pipedream-profiles';
import { CredentialProfileManager } from '@/components/agents/pipedream/credential-profile-manager';
import { PipedreamConnectButton } from '@/components/agents/pipedream/pipedream-connect-button';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PipedreamProfile } from '@/types/pipedream-profiles';

interface PipedreamProfileCardProps {
  profile: PipedreamProfile;
  onManage: () => void;
}

const PipedreamProfileCard: React.FC<PipedreamProfileCardProps> = ({ profile, onManage }) => {
  const getAppLogoUrl = (appSlug: string) => {
    const logoSlug = appSlug.toLowerCase().replace(/_/g, '-');
    return `https://logo.clearbit.com/${logoSlug}.com`;
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'Never';
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  };

  return (
    <Card className="p-0 group transition-all duration-200 border-border/50 hover:border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center overflow-hidden bg-muted/50">
              <img
                src={getAppLogoUrl(profile.app_slug)}
                alt={`${profile.app_name} logo`}
                className="w-full h-full object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent && !parent.querySelector('.fallback-logo')) {
                    const fallback = document.createElement('div');
                    fallback.className = 'fallback-logo w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm';
                    fallback.textContent = profile.app_name.charAt(0).toUpperCase();
                    parent.appendChild(fallback);
                  }
                }}
              />
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-sm truncate flex items-center gap-2">
                  {profile.profile_name}
                  {profile.is_default && (
                    <Star className="h-3 w-3 text-yellow-500" />
                  )}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {profile.app_name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {profile.is_connected ? (
                  <Badge variant="default" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    <XCircle className="h-3 w-3 mr-1" />
                    Not Connected
                  </Badge>
                )}
                {!profile.is_active && (
                  <Badge variant="destructive" className="text-xs">
                    Inactive
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>Used {formatDate(profile.last_used_at)}</span>
                </div>
                {profile.enabled_tools.length > 0 && (
                  <span>{profile.enabled_tools.length} tools</span>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={onManage}
                className="h-7 text-xs"
              >
                <Settings className="h-3 w-3 mr-1" />
                Manage
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const PipedreamConnectionsSection: React.FC = () => {
  const [showProfileManager, setShowProfileManager] = useState(false);
  const { data: profiles, isLoading, error, refetch } = usePipedreamProfiles();

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success('Refreshed credential profiles');
    } catch (error) {
      toast.error('Failed to refresh profiles');
    }
  };

  // Group profiles by app
  const profilesByApp = profiles?.reduce((acc, profile) => {
    const key = profile.app_slug;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(profile);
    return acc;
  }, {} as Record<string, PipedreamProfile[]>) || {};

  const totalProfiles = profiles?.length || 0;
  const connectedProfiles = profiles?.filter(p => p.is_connected).length || 0;
  const uniqueApps = Object.keys(profilesByApp).length;

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="bg-card border-border/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                    <div className="flex gap-1">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load credential profiles. Please try again.
          </AlertDescription>
        </Alert>
      ) : totalProfiles === 0 ? (
        <Card className="border-dashed border-border/60 bg-muted/20">
          <CardContent className="p-8 text-center">
            <div className="space-y-4">
              <div className="p-3 rounded-full bg-blue-500/10 w-fit mx-auto">
                <User className="h-6 w-6 text-blue-500" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-foreground">No credential profiles yet</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Create credential profiles to manage multiple accounts for your Pipedream apps
                </p>
              </div>
              <PipedreamConnectButton 
                createProfile={true}
                onConnect={handleRefresh}
                className="h-9"
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {totalProfiles} profile{totalProfiles !== 1 ? 's' : ''}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {uniqueApps} app{uniqueApps !== 1 ? 's' : ''}
              </Badge>
              {connectedProfiles > 0 && (
                <Badge variant="default" className="text-xs">
                  {connectedProfiles} connected
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <PipedreamConnectButton 
                createProfile={true}
                onConnect={handleRefresh}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowProfileManager(true)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Manage
              </Button>
            </div>
          </div>
          <div className="space-y-6">
            {Object.entries(profilesByApp).map(([appSlug, appProfiles]) => (
              <div key={appSlug} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {appProfiles[0].app_name}
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    {appProfiles.length} profile{appProfiles.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {appProfiles.map((profile) => (
                    <PipedreamProfileCard
                      key={profile.profile_id}
                      profile={profile}
                      onManage={() => setShowProfileManager(true)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Profile Manager Dialog */}
      <Dialog open={showProfileManager} onOpenChange={setShowProfileManager}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Pipedream Profiles</DialogTitle>
            <DialogDescription>
              Create and manage credential profiles for your Pipedream apps
            </DialogDescription>
          </DialogHeader>
          <CredentialProfileManager
            onProfileSelect={() => {
              refetch();
              setShowProfileManager(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}; 