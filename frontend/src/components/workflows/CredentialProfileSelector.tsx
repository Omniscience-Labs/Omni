"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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
  useSetDefaultProfile,
  type CredentialProfile 
} from '@/hooks/react-query/mcp/use-credential-profiles';

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
  const { 
    data: profiles = [], 
    isLoading,
    error 
  } = useCredentialProfilesForMcp(mcpQualifiedName);
  
  const setDefaultMutation = useSetDefaultProfile();
  
  const selectedProfile = profiles.find(p => p.profile_id === selectedProfileId);
  
  const handleSetDefault = async (profileId: string) => {
    try {
      await setDefaultMutation.mutateAsync(profileId);
    } catch (error) {
      console.error('Failed to set default profile:', error);
    }
  };

  const handleCreateNewProfile = () => {
    window.open('/settings/credentials', '_blank');
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
        <Button 
          variant="outline" 
          size="sm" 
          disabled={disabled}
          onClick={handleCreateNewProfile}
        >
          <Plus className="h-4 w-4" />
          New Profile
        </Button>
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
              onClick={handleCreateNewProfile}
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
                      <Badge variant="outline" className="text-xs">
                        Default
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {selectedProfile && (
            <Card className="bg-muted/30 py-0">
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium">{selectedProfile.profile_name}</h4>
                      {selectedProfile.is_default && (
                        <Badge variant="outline" className="text-xs">
                          Default
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedProfile.display_name}
                    </p>
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