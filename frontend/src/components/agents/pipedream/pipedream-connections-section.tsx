'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DataTable, DataTableColumn } from '@/components/ui/data-table';
import { 
  AlertCircle, 
  Settings,
  User,
  Plus,
  Search,
  X
} from 'lucide-react';
import { usePipedreamProfiles } from '@/hooks/react-query/pipedream/use-pipedream-profiles';
import { usePipedreamApps } from '@/hooks/react-query/pipedream/use-pipedream';
import { CredentialProfileManager } from '@/components/agents/pipedream/credential-profile-manager';
import { PipedreamRegistry } from '@/components/agents/pipedream/pipedream-registry';
import { useQueryClient } from '@tanstack/react-query';
import { pipedreamKeys } from '@/hooks/react-query/pipedream/keys';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { PipedreamProfile } from '@/components/agents/pipedream/pipedream-types';

interface AppTableProps {
  appSlug: string;
  appName: string;
  profiles: PipedreamProfile[];
  appImage?: string;
  onManageProfile: (profile: PipedreamProfile) => void;
}

const AppTable: React.FC<AppTableProps> = ({ appSlug, appName, profiles, appImage, onManageProfile }) => {
  const columns: DataTableColumn<PipedreamProfile>[] = [
    {
      id: 'name',
      header: 'Profile Name',
      width: 'w-1/2',
      cell: (profile) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{profile.profile_name}</span>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      width: 'w-1/4',
      cell: (profile) => (
        <div className="flex items-center gap-2">
          {profile.is_connected ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              Connected
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-destructive" />
              Disconnected
            </div>
          )}
          {!profile.is_active && (
            <Badge variant="outline" className="text-xs">
              Inactive
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      width: 'w-1/4',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (profile) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onManageProfile(profile);
          }}
          className="h-8 px-3 text-xs"
        >
          <Settings className="h-4 w-4 mr-1" />
          Manage
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden border">
            {appImage ? (
              <img
                src={appImage}
                alt={appName}
                className="h-5 w-5 object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <span className={cn(
              "text-sm font-semibold text-muted-foreground",
              appImage ? "hidden" : "block"
            )}>
              {appName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-sm">{appName}</h3>
            <p className="text-xs text-muted-foreground">
              {profiles.length} {profiles.length === 1 ? 'profile' : 'profiles'}
            </p>
          </div>
        </div>
      </div>
      
      <DataTable
        columns={columns}
        data={profiles}
        emptyMessage={`No ${appName} profiles found`}
        className="bg-card border rounded-lg"
      />
    </div>
  );
};

interface PipedreamConnectionsSectionProps {
  onConnectNewApp?: (app: { app_slug: string; app_name: string }) => void;
}

export const PipedreamConnectionsSection: React.FC<PipedreamConnectionsSectionProps> = ({
  onConnectNewApp
}) => {
  const [showProfileManager, setShowProfileManager] = useState(false);
  const [showAppBrowser, setShowAppBrowser] = useState(false);
  const [selectedAppForProfile, setSelectedAppForProfile] = useState<{ app_slug: string; app_name: string } | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<PipedreamProfile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();
  const { data: profiles, isLoading, error } = usePipedreamProfiles();
  const { data: allAppsData } = usePipedreamApps(undefined, '');

  const handleAppSelect = (app: { app_slug: string; app_name: string }) => {
    setShowAppBrowser(false);
    setSelectedAppForProfile(app);
    if (onConnectNewApp) {
      onConnectNewApp(app);
    }
    setShowProfileManager(true);
  };

  const handleManageProfile = (profile: PipedreamProfile) => {
    setSelectedProfile(profile);
    setSelectedAppForProfile({ app_slug: profile.app_slug, app_name: profile.app_name });
    setShowProfileManager(true);
  };

  const handleProfileManagerClose = () => {
    setShowProfileManager(false);
    setSelectedAppForProfile(null);
    setSelectedProfile(null);
    queryClient.invalidateQueries({ queryKey: pipedreamKeys.profiles.all() });
  };

  const profilesByApp = profiles?.reduce((acc, profile) => {
    const key = profile.app_slug;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(profile);
    return acc;
  }, {} as Record<string, PipedreamProfile[]>) || {};

  // Filter profiles based on search query
  const filteredProfilesByApp = useMemo(() => {
    if (!searchQuery.trim()) {
      return profilesByApp;
    }

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, PipedreamProfile[]> = {};

    Object.entries(profilesByApp).forEach(([appSlug, appProfiles]) => {
      const appName = appProfiles[0]?.app_name.toLowerCase() || '';
      const matchingProfiles = appProfiles.filter(profile => 
        profile.profile_name.toLowerCase().includes(query) ||
        profile.app_name.toLowerCase().includes(query)
      );

      // Include the app if the app name matches or if any profiles match
      if (appName.includes(query) || matchingProfiles.length > 0) {
        filtered[appSlug] = appName.includes(query) ? appProfiles : matchingProfiles;
      }
    });

    return filtered;
  }, [profilesByApp, searchQuery]);

  const totalProfiles = profiles?.length || 0;
  const connectedProfiles = profiles?.filter(p => p.is_connected).length || 0;
  const uniqueApps = Object.keys(profilesByApp).length;
  const filteredAppsCount = Object.keys(filteredProfilesByApp).length;
  const filteredProfilesCount = Object.values(filteredProfilesByApp).flat().length;

  if (isLoading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className="rounded-md border">
              <div className="p-4 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load credential profiles. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  if (totalProfiles === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <div className="p-3 rounded-full bg-primary/10 w-fit mx-auto">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">No credential profiles yet</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Connect your favorite apps to create credential profiles for your agents
              </p>
            </div>
            <Button 
              onClick={() => setShowAppBrowser(true)}
              className="h-9"
            >
              <Plus className="h-4 w-4" />
              Connect New App
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {searchQuery 
              ? `${filteredAppsCount} ${filteredAppsCount === 1 ? 'app' : 'apps'} with ${filteredProfilesCount} ${filteredProfilesCount === 1 ? 'profile' : 'profiles'} found`
              : `${uniqueApps} ${uniqueApps === 1 ? 'app' : 'apps'} with ${totalProfiles} ${totalProfiles === 1 ? 'profile' : 'profiles'} (${connectedProfiles} connected)`
            }
          </p>
        </div>
        <Button
          onClick={() => setShowAppBrowser(true)}
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Connect New App
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search apps and profiles..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 pr-10 h-9"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchQuery('')}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Results */}
      {Object.keys(filteredProfilesByApp).length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <div className="space-y-4">
              <div className="p-3 rounded-full bg-muted/50 w-fit mx-auto">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-foreground">No results found</h3>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search terms or browse all apps
                </p>
              </div>
              <Button 
                onClick={() => setSearchQuery('')}
                variant="outline"
                size="sm"
              >
                Clear search
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(filteredProfilesByApp)
            .sort(([, a], [, b]) => {
              const aConnected = a.filter(p => p.is_connected).length;
              const bConnected = b.filter(p => p.is_connected).length;
              if (aConnected !== bConnected) return bConnected - aConnected;
              return b.length - a.length;
            })
            .map(([appSlug, appProfiles]) => {
              const registryApp = allAppsData?.apps?.find(app => 
                app.name_slug === appSlug || 
                app.name.toLowerCase() === appProfiles[0].app_name.toLowerCase()
              );
              
              return (
                <AppTable
                  key={appSlug}
                  appSlug={appSlug}
                  appName={appProfiles[0].app_name}
                  profiles={appProfiles}
                  appImage={registryApp?.img_src}
                  onManageProfile={handleManageProfile}
                />
              );
            })}
        </div>
      )}

      <Dialog open={showAppBrowser} onOpenChange={setShowAppBrowser}>
        <DialogContent className="p-0 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>Browse Apps</DialogTitle>
            <DialogDescription>
              Select an app to create a credential profile
            </DialogDescription>
          </DialogHeader>
          <PipedreamRegistry
            mode="simple"
            onAppSelected={handleAppSelect}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showProfileManager} onOpenChange={handleProfileManagerClose}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedAppForProfile 
                ? `Manage ${selectedAppForProfile.app_name} Profiles`
                : 'Manage Pipedream Profiles'
              }
            </DialogTitle>
            <DialogDescription>
              {selectedAppForProfile
                ? `Create and manage credential profiles for ${selectedAppForProfile.app_name}`
                : 'Create and manage credential profiles for your Pipedream apps'
              }
            </DialogDescription>
          </DialogHeader>
          <CredentialProfileManager
            appSlug={selectedAppForProfile?.app_slug}
            appName={selectedAppForProfile?.app_name}
            onProfileSelect={() => {
              queryClient.invalidateQueries({ queryKey: pipedreamKeys.profiles.all() });
              handleProfileManagerClose();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}; 