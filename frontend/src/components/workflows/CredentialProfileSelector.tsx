"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Plus, 
  Settings, 
  Star, 
  Clock,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { 
  useCredentialProfilesForMcp, 
  useCreateCredentialProfile,
  useSetDefaultProfile,
  type CredentialProfile 
} from '@/hooks/react-query/mcp/use-credential-profiles';
import { KeyValueEditor } from './KeyValueEditor';

interface CredentialProfileSelectorProps {
  mcpQualifiedName: string;
  mcpDisplayName: string;
  selectedProfileId?: string;
  onProfileSelect: (profileId: string | null, profile: CredentialProfile | null) => void;
  disabled?: boolean;
}

export function CredentialProfileSelector({
  mcpQualifiedName,
  mcpDisplayName,
  selectedProfileId,
  onProfileSelect,
  disabled = false
}: CredentialProfileSelectorProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileConfig, setNewProfileConfig] = useState<Record<string, string>>({});
  
  const { 
    data: profiles = [], 
    isLoading,
    error 
  } = useCredentialProfilesForMcp(mcpQualifiedName);
  
  const createProfileMutation = useCreateCredentialProfile();
  const setDefaultMutation = useSetDefaultProfile();
  
  const selectedProfile = profiles.find(p => p.profile_id === selectedProfileId);
  
  const handleCreateProfile = async () => {
    if (!newProfileName.trim()) return;
    
    try {
      const newProfile = await createProfileMutation.mutateAsync({
        mcp_qualified_name: mcpQualifiedName,
        profile_name: newProfileName,
        display_name: `${mcpDisplayName} - ${newProfileName}`,
        config: newProfileConfig,
        is_default: profiles.length === 0, // Make first profile default
      });
      
      // Select the newly created profile
      onProfileSelect(newProfile.profile_id, newProfile);
      
      // Reset form
      setNewProfileName('');
      setNewProfileConfig({});
      setShowCreateDialog(false);
    } catch (error) {
      console.error('Failed to create profile:', error);
    }
  };
  
  const handleSetDefault = async (profileId: string) => {
    try {
      await setDefaultMutation.mutateAsync(profileId);
    } catch (error) {
      console.error('Failed to set default profile:', error);
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Failed to load credential profiles</span>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Credential Profile</Label>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={disabled}>
              <Plus className="h-4 w-4 mr-1" />
              New Profile
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Credential Profile</DialogTitle>
              <DialogDescription>
                Create a new credential profile for {mcpDisplayName}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="profile-name">Profile Name</Label>
                <Input
                  id="profile-name"
                  placeholder="e.g., Team A, Production, Personal"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                />
              </div>
              
              <div>
                <Label>Configuration</Label>
                <KeyValueEditor
                  values={newProfileConfig}
                  onChange={setNewProfileConfig}
                  placeholder={{
                    key: "Configuration Key",
                    value: "Configuration Value"
                  }}
                />
              </div>
              
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowCreateDialog(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateProfile}
                  disabled={!newProfileName.trim() || createProfileMutation.isPending}
                >
                  {createProfileMutation.isPending ? 'Creating...' : 'Create Profile'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      
      {profiles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <Settings className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-3">
              No credential profiles found for {mcpDisplayName}
            </p>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowCreateDialog(true)}
              disabled={disabled}
            >
              <Plus className="h-4 w-4 mr-1" />
              Create First Profile
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <Select
            value={selectedProfileId || ''}
            onValueChange={(value) => {
              const profile = profiles.find(p => p.profile_id === value);
              onProfileSelect(value || null, profile || null);
            }}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a credential profile..." />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((profile) => (
                <SelectItem key={profile.profile_id} value={profile.profile_id}>
                  <div className="flex items-center gap-2">
                    <span>{profile.profile_name}</span>
                    {profile.is_default && (
                      <Badge variant="secondary" className="text-xs">
                        <Star className="h-3 w-3 mr-1" />
                        Default
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {selectedProfile && (
            <Card className="bg-muted/30">
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium">{selectedProfile.profile_name}</h4>
                      {selectedProfile.is_default && (
                        <Badge variant="secondary" className="text-xs">
                          <Star className="h-3 w-3 mr-1" />
                          Default
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedProfile.display_name}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        {selectedProfile.config_keys.length} config keys
                      </div>
                      {selectedProfile.last_used_at && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last used: {new Date(selectedProfile.last_used_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {!selectedProfile.is_default && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetDefault(selectedProfile.profile_id)}
                      disabled={setDefaultMutation.isPending}
                    >
                      <Star className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
} 