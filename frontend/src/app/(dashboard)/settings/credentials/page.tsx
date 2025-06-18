'use client';

import React, { useState } from 'react';
import { Plus, Key, Shield, TestTube, Trash2, CheckCircle, XCircle, Loader2, AlertTriangle, Star, Settings2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { 
  useCredentialProfiles,
  useDeleteCredentialProfile,
  useSetDefaultProfile,
  type CredentialProfile
} from '@/hooks/react-query/mcp/use-credential-profiles';
import { EnhancedAddCredentialDialog } from './_components/enhanced-add-credential-dialog';

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
    if (profile.mcp_qualified_name.startsWith('custom_json_')) return 'JSON/stdio';
    return 'Custom';
  };

  return (
    <Card className={`border-border/50 hover:border-border transition-colors ${profile.is_default ? 'ring-2 ring-primary/20 border-primary/30' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-md bg-primary/10">
                <Key className="h-4 w-4 text-primary" />
              </div>
              <div className="flex items-center gap-2">
                <h3 className="text-md font-medium text-foreground">{profile.profile_name}</h3>
                {profile.is_default && (
                  <Badge variant="default" className="text-xs bg-primary/10 text-primary border-primary/20">
                    <Star className="h-3 w-3 mr-1" />
                    Default
                  </Badge>
                )}
                {isCustomServer && (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                    {getCustomServerType()}
                  </Badge>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {profile.display_name}
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                {profile.mcp_qualified_name}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {profile.config_keys.map((key) => (
                <Badge key={key} variant="outline" className="text-xs">
                  {key === 'url' && isCustomServer ? 'Server URL' : key}
                </Badge>
              ))}
            </div>
            {profile.last_used_at && (
              <p className="text-xs text-muted-foreground/70">
                Last used {new Date(profile.last_used_at).toLocaleDateString()}
              </p>
            )}
          </div>
          
          <div className="flex gap-1.5 ml-4">
            {!profile.is_default && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onSetDefault(profile.profile_id)}
                disabled={isDeleting || isSettingDefault}
                className="h-8 px-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10"
                title="Set as default profile"
              >
                {isSettingDefault ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Star className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(profile.profile_id)}
              disabled={isDeleting || isSettingDefault}
              className="h-8 px-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Credential Profile</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the profile "{profileToDelete.profile_name}" for {profileToDelete.display_name}?
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
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
              'Delete Profile'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function CredentialsPage() {
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
      toast.success('Credential profile deleted successfully');
      setShowDeleteDialog(false);
      setProfileToDelete(null);
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete credential profile');
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

  // Group profiles by MCP server
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

  if (error) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-6">
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/5">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Failed to load credential profiles. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-foreground">
                MCP Credential Profiles
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage multiple credential profiles for each MCP server
              </p>
            </div>
            <Button 
              onClick={() => setShowAddDialog(true)}
              className="px-3 text-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Profile
            </Button>
          </div>

          <Alert className="border-primary/20 bg-primary/5">
            <Shield className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm text-muted-foreground">
              Create multiple credential profiles per MCP server for different use cases. 
              For example, different Slack teams, GitHub organizations, or API keys with different permissions.
            </AlertDescription>
          </Alert>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="border-border/50">
                <CardContent className="p-4">
                  <div className="animate-pulse space-y-2">
                    <div className="h-3 bg-muted/60 rounded w-1/4"></div>
                    <div className="h-2.5 bg-muted/40 rounded w-1/3"></div>
                    <div className="flex gap-1.5">
                      <div className="h-5 bg-muted/40 rounded w-12"></div>
                      <div className="h-5 bg-muted/40 rounded w-16"></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !profiles || profiles.length === 0 ? (
          <Card className="border-dashed border-border/50">
            <CardContent className="p-8 text-center">
              <div className="p-3 rounded-full bg-muted/50 w-fit mx-auto mb-3">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium mb-1 text-foreground">No credential profiles configured</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first credential profile to start using MCP servers with multiple configurations
              </p>
              <Button 
                onClick={() => setShowAddDialog(true)}
                size="sm"
                className="h-8 px-3 text-sm"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Create Your First Profile
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedProfiles || {}).map(([qualifiedName, serverGroup]) => (
              <div key={qualifiedName} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Settings2 className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {serverGroup.serverName}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono">
                      {serverGroup.qualifiedName}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {serverGroup.profiles.length} profile{serverGroup.profiles.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                
                <div className="grid gap-3 pl-6">
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