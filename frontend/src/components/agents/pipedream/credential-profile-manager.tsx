'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  MoreVertical,
  Zap,
  CheckCircle2,
  XCircle,
  Settings,
  Trash2,
  RefreshCw,
  Star,
  StarOff,
  Loader2,
  User,
  Link2,
  AlertCircle,
} from 'lucide-react';
import {
  usePipedreamProfiles,
  useCreatePipedreamProfile,
  useUpdatePipedreamProfile,
  useDeletePipedreamProfile,
  useConnectPipedreamProfile,
} from '@/hooks/react-query/pipedream/use-pipedream-profiles';
import type { PipedreamProfile, CreateProfileRequest } from '@/types/pipedream-profiles';
import { formatDistanceToNow } from 'date-fns';

interface CredentialProfileManagerProps {
  appSlug?: string;
  appName?: string;
  onProfileSelect?: (profile: PipedreamProfile) => void;
  className?: string;
}

export const CredentialProfileManager: React.FC<CredentialProfileManagerProps> = ({
  appSlug,
  appName,
  onProfileSelect,
  className,
}) => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<PipedreamProfile | null>(null);
  const [deletingProfile, setDeletingProfile] = useState<PipedreamProfile | null>(null);
  const [newProfileName, setNewProfileName] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const { data: profiles, isLoading, refetch } = usePipedreamProfiles({ app_slug: appSlug });
  const createProfile = useCreatePipedreamProfile();
  const updateProfile = useUpdatePipedreamProfile();
  const deleteProfile = useDeletePipedreamProfile();
  const connectProfile = useConnectPipedreamProfile();

  const handleCreateProfile = async () => {
    if (!newProfileName.trim()) return;

    const request: CreateProfileRequest = {
      profile_name: newProfileName.trim(),
      app_slug: appSlug || '',
      app_name: appName || appSlug || '',
      is_default: isDefault,
    };

    try {
      await createProfile.mutateAsync(request);
      setShowCreateDialog(false);
      setNewProfileName('');
      setIsDefault(false);
    } catch (error) {
      // Error is handled by the mutation hook
    }
  };

  const handleUpdateProfile = async (profile: PipedreamProfile, updates: any) => {
    try {
      await updateProfile.mutateAsync({
        profileId: profile.profile_id,
        request: updates,
      });
      setEditingProfile(null);
    } catch (error) {
      // Error is handled by the mutation hook
    }
  };

  const handleDeleteProfile = async (profile: PipedreamProfile) => {
    try {
      await deleteProfile.mutateAsync(profile.profile_id);
      setDeletingProfile(null);
    } catch (error) {
      // Error is handled by the mutation hook
    }
  };

  const handleConnectProfile = async (profile: PipedreamProfile) => {
    try {
      await connectProfile.mutateAsync({
        profileId: profile.profile_id,
        app: appSlug,
      });
    } catch (error) {
      // Error is handled by the mutation hook
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const profilesForApp = profiles?.filter(p => !appSlug || p.app_slug === appSlug) || [];

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-medium">Credential Profiles</h3>
          <p className="text-sm text-muted-foreground">
            {appName ? `Manage credential profiles for ${appName}` : 'Manage your Pipedream credential profiles'}
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New Profile
        </Button>
      </div>
      {profilesForApp.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h4 className="font-medium mb-2">No credential profiles yet</h4>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Create credential profiles to manage multiple accounts or configurations for {appName || 'your apps'}.
            </p>
            <Button onClick={() => setShowCreateDialog(true)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Create First Profile
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {profilesForApp.map((profile) => (
            <Card key={profile.profile_id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium">{profile.profile_name}</h4>
                      {profile.is_default && (
                        <Badge variant="secondary" className="text-xs">
                          <Star className="h-3 w-3 mr-1" />
                          Default
                        </Badge>
                      )}
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
                    
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>{profile.display_name}</p>
                      {profile.last_used_at && (
                        <p>Last used {formatDistanceToNow(new Date(profile.last_used_at), { addSuffix: true })}</p>
                      )}
                      {profile.enabled_tools.length > 0 && (
                        <p>{profile.enabled_tools.length} tools enabled</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!profile.is_connected && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleConnectProfile(profile)}
                        disabled={connectProfile.isPending}
                      >
                        <Link2 className="h-4 w-4 mr-2" />
                        Connect
                      </Button>
                    )}
                    
                    {onProfileSelect && (
                      <Button
                        size="sm"
                        onClick={() => onProfileSelect(profile)}
                        disabled={!profile.is_connected}
                      >
                        Select
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingProfile(profile)}>
                          <Settings className="h-4 w-4 mr-2" />
                          Edit Profile
                        </DropdownMenuItem>
                        {profile.is_connected && (
                          <DropdownMenuItem onClick={() => handleConnectProfile(profile)}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Reconnect
                          </DropdownMenuItem>
                        )}
                        {!profile.is_default && (
                          <DropdownMenuItem
                            onClick={() => handleUpdateProfile(profile, { is_default: true })}
                          >
                            <Star className="h-4 w-4 mr-2" />
                            Set as Default
                          </DropdownMenuItem>
                        )}
                        {profile.is_default && (
                          <DropdownMenuItem
                            onClick={() => handleUpdateProfile(profile, { is_default: false })}
                          >
                            <StarOff className="h-4 w-4 mr-2" />
                            Remove Default
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeletingProfile(profile)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Profile
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Profile Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Credential Profile</DialogTitle>
            <DialogDescription>
              Create a new credential profile for {appName || 'your app'}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Profile Name</Label>
              <Input
                id="profile-name"
                placeholder="e.g., Personal Account, Work Account"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="is-default"
                checked={isDefault}
                onCheckedChange={setIsDefault}
              />
              <Label htmlFor="is-default">Set as default profile</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateProfile}
              disabled={!newProfileName.trim() || createProfile.isPending}
            >
              {createProfile.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Profile'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      {editingProfile && (
        <Dialog open={!!editingProfile} onOpenChange={() => setEditingProfile(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Profile</DialogTitle>
              <DialogDescription>
                Update the settings for {editingProfile.profile_name}.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-profile-name">Profile Name</Label>
                <Input
                  id="edit-profile-name"
                  defaultValue={editingProfile.profile_name}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditingProfile({ ...editingProfile, profile_name: value });
                  }}
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-is-active"
                  checked={editingProfile.is_active}
                  onCheckedChange={(checked) => {
                    setEditingProfile({ ...editingProfile, is_active: checked });
                  }}
                />
                <Label htmlFor="edit-is-active">Active</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingProfile(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => handleUpdateProfile(editingProfile, {
                  profile_name: editingProfile.profile_name,
                  is_active: editingProfile.is_active,
                })}
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingProfile} onOpenChange={() => setDeletingProfile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the profile "{deletingProfile?.profile_name}"? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingProfile && handleDeleteProfile(deletingProfile)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Profile
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}; 