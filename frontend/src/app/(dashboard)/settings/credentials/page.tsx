'use client';

import React, { useEffect, useState } from 'react';
import { 
  Plus, 
  Key, 
  Shield, 
  Trash2, 
  Loader2, 
  AlertTriangle, 
  Star, 
  Settings2, 
  Users,
  Sparkles,
  Clock,
  Server,
  Globe,
  Zap,
  MoreHorizontal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { 
  useCredentialProfiles,
  useDeleteCredentialProfile,
  useSetDefaultProfile,
  type CredentialProfile
} from '@/hooks/react-query/mcp/use-credential-profiles';
import { EnhancedAddCredentialDialog } from './_components/enhanced-add-credential-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { useFeatureFlag } from '@/lib/feature-flags';

interface CredentialProfileCardProps {
  profile: CredentialProfile;
  onDelete: (profileId: string) => void;
  onSetDefault: (profileId: string) => void;
  isDeletingId?: string;
  isSettingDefaultId?: string;
}

const CredentialProfileCard: React.FC<CredentialProfileCardProps> = ({ 
  profile, 
  onDelete, 
  onSetDefault,
  isDeletingId, 
  isSettingDefaultId 
}) => {
  const isDeleting = isDeletingId === profile.profile_id;
  const isSettingDefault = isSettingDefaultId === profile.profile_id;
  const isCustomServer = profile.mcp_qualified_name.startsWith('custom_');
  
  const getCustomServerType = () => {
    if (profile.mcp_qualified_name.startsWith('custom_sse_')) return 'SSE';
    if (profile.mcp_qualified_name.startsWith('custom_http_')) return 'HTTP';
    if (profile.mcp_qualified_name.startsWith('custom_json_')) return 'JSON';
    return 'Custom';
  };

  const getServerIcon = () => {
    if (isCustomServer) {
      const type = getCustomServerType();
      if (type === 'SSE') return <Globe className="h-3.5 w-3.5" />;
      if (type === 'HTTP') return <Server className="h-3.5 w-3.5" />;
      return <Settings2 className="h-3.5 w-3.5" />;
    }
    return <Key className="h-3.5 w-3.5" />;
  };

  return (
    <Card className={`group transition-all bg-sidebar duration-200 py-0 border-border/60 ${
      profile.is_default 
        ? 'ring-1 ring-primary/10 border-primary/10 bg-primary/5' 
        : 'hover:border-border hover:bg-accent/20'
    }`}>
      <CardContent className="p-3">
        <div className="space-y-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className={`p-1.5 rounded-md transition-colors ${
                profile.is_default 
                  ? 'bg-primary/20 text-primary' 
                  : 'bg-muted/70 text-muted-foreground group-hover:bg-muted'
              }`}>
                {getServerIcon()}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-foreground truncate">{profile.profile_name}</h3>
                <p className="text-xs text-muted-foreground truncate">{profile.display_name}</p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  disabled={isDeleting || isSettingDefault}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {!profile.is_default && (
                  <DropdownMenuItem
                    onClick={() => onSetDefault(profile.profile_id)}
                    disabled={isSettingDefault}
                  >
                    {isSettingDefault ? (
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    ) : (
                      <Star className="h-3.5 w-3.5" />
                    )}
                    Set as Default
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => onDelete(profile.profile_id)}
                  disabled={isDeleting}
                  className="text-destructive focus:text-destructive"
                >
                  {isDeleting ? (
                    <Loader2 className="text-destructive h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="text-destructiveh-3.5 w-3.5" />
                  )}
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {profile.is_default && (
              <Badge variant="default" className="text-xs h-5 bg-primary/15 text-primary border-primary/30">
                <Star className="h-2.5 w-2.5 mr-1" />
                Default
              </Badge>
            )}
            {isCustomServer && (
              <Badge variant="outline" className="text-xs h-5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                <Sparkles className="h-2.5 w-2.5 mr-1" />
                {getCustomServerType()}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs h-5 bg-muted/50 text-muted-foreground">
              {profile.config_keys.length} key{profile.config_keys.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          {/* Last Used */}
          {profile.last_used_at && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />
              <span>{new Date(profile.last_used_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileToDelete: CredentialProfile | null;
  onConfirm: () => void;
  isDeleting: boolean;
}

const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
  open,
  onOpenChange,
  profileToDelete,
  onConfirm,
  isDeleting
}) => {
  if (!profileToDelete) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            Delete Profile
          </DialogTitle>
          <DialogDescription className="text-left">
            Delete <span className="font-medium">"{profileToDelete.profile_name}"</span> for {profileToDelete.display_name}?
            <br />
            <span className="text-destructive text-sm">This action cannot be undone.</span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function CredentialsPage() {
  const { enabled: customAgentsEnabled, loading: flagLoading } = useFeatureFlag("custom_agents");
  const router = useRouter();
  useEffect(() => {
    if (!flagLoading && !customAgentsEnabled) {
      router.replace("/dashboard");
    }
  }, [flagLoading, customAgentsEnabled, router]);

  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<CredentialProfile | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: profiles, isLoading, error, refetch } = useCredentialProfiles();
  const deleteProfileMutation = useDeleteCredentialProfile();
  const setDefaultProfileMutation = useSetDefaultProfile();

  const handleDelete = (profileId: string) => {
    const profile = profiles?.find(p => p.profile_id === profileId);
    if (profile) {
      setProfileToDelete(profile);
      setShowDeleteDialog(true);
    }
  };

  const confirmDelete = async () => {
    if (!profileToDelete) return;
    
    setDeletingId(profileToDelete.profile_id);
    try {
      await deleteProfileMutation.mutateAsync(profileToDelete.profile_id);
      toast.success('Profile deleted successfully');
      setShowDeleteDialog(false);
      setProfileToDelete(null);
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete profile');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSetDefault = async (profileId: string) => {
    setSettingDefaultId(profileId);
    try {
      await setDefaultProfileMutation.mutateAsync(profileId);
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Failed to set default profile');
    } finally {
      setSettingDefaultId(null);
    }
  };

  const groupedProfiles = profiles?.reduce((acc, profile) => {
    const key = profile.mcp_qualified_name;
    if (!acc[key]) {
      acc[key] = {
        serverName: profile.display_name,
        qualifiedName: profile.mcp_qualified_name,
        profiles: []
      };
    }
    acc[key].profiles.push(profile);
    return acc;
  }, {} as Record<string, { serverName: string; qualifiedName: string; profiles: CredentialProfile[] }>);

  if (flagLoading) {
    return (
      <div className="h-screen max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">MCP Credential Profiles</h1>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="p-2 bg-neutral-100 dark:bg-sidebar rounded-2xl overflow-hidden group">
              <div className="h-24 flex items-center justify-center relative bg-gradient-to-br from-opacity-90 to-opacity-100">
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
              <div className="space-y-2 mt-4 mb-4">
                <Skeleton className="h-6 w-32 rounded" />
                <Skeleton className="h-4 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!customAgentsEnabled) {
    return null;
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-6xl px-6 py-6">
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load credential profiles. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-6 py-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">MCP Credential Profiles</h1>
            </div>
          </div>
          
          <Button onClick={() => setShowAddDialog(true)} className="h-9">
            <Plus className="h-4 w-4" />
            Add Profile
          </Button>
        </div>

        <Alert className="border-primary/30 bg-primary/5">
          <Zap className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            Create multiple profiles per MCP server for different use cases (teams, organizations, environments).
          </AlertDescription>
        </Alert>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-8 h-8 rounded-lg"></Skeleton>
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32 rounded"></Skeleton>
                    <Skeleton className="h-3 w-24 rounded"></Skeleton>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <Card key={j} className="bg-sidebar border-border/50">
                      <CardContent className="p-3">
                        <div className="animate-pulse space-y-2">
                          <div className="flex items-center gap-2">
                            <Skeleton className="w-6 h-6 rounded"></Skeleton>
                            <div className="space-y-1 flex-1">
                              <Skeleton className="h-3 w-20 rounded"></Skeleton>
                              <Skeleton className="h-2.5 w-16 rounded"></Skeleton>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Skeleton className="h-4 w-12 rounded"></Skeleton>
                            <Skeleton className="h-4 w-8 rounded"></Skeleton>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : !profiles || profiles.length === 0 ? (
          <Card className="border-dashed border-border/60 bg-muted/20">
            <CardContent className="p-8 text-center">
              <div className="space-y-4">
                <div className="p-3 rounded-full bg-muted/60 w-fit mx-auto">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-foreground">No profiles yet</h3>
                  <p className="text-sm text-muted-foreground">
                    Create your first credential profile to get started
                  </p>
                </div>
                <Button onClick={() => setShowAddDialog(true)} className="h-9">
                  <Plus className="h-4 w-4" />
                  Create First Profile
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedProfiles || {}).map(([qualifiedName, serverGroup]) => (
              <div key={qualifiedName} className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <Settings2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{serverGroup.serverName}</h3>
                    <p className="text-xs text-muted-foreground font-mono truncate">{serverGroup.qualifiedName}</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {serverGroup.profiles.length}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {serverGroup.profiles.map((profile) => (
                    <CredentialProfileCard
                      key={profile.profile_id}
                      profile={profile}
                      onDelete={handleDelete}
                      onSetDefault={handleSetDefault}
                      isDeletingId={deletingId}
                      isSettingDefaultId={settingDefaultId}
                    />
                  ))}
                </div>
                {Object.keys(groupedProfiles || {}).indexOf(qualifiedName) < Object.keys(groupedProfiles || {}).length - 1 && (
                  <Separator className="my-6" />
                )}
              </div>
            ))}
          </div>
        )}
        <EnhancedAddCredentialDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          onSuccess={() => refetch()}
        />

        <DeleteConfirmationDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          profileToDelete={profileToDelete}
          onConfirm={confirmDelete}
          isDeleting={!!deletingId}
        />
      </div>
    </div>
  );
} 