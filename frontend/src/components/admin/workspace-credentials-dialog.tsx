'use client';

import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useStoreCredential, useUserCredentials } from '@/hooks/react-query/secure-mcp/use-secure-mcp';
import { apiClient } from '@/lib/api-client';
import { useCurrentAccount } from '@/hooks/use-current-account';

interface WorkspaceCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
}

export function WorkspaceCredentialsDialog({ open, onOpenChange, accountId }: WorkspaceCredentialsDialogProps) {
  const queryClient = useQueryClient();
  const currentAccount = useCurrentAccount();
  const userId = currentAccount?.account_id || accountId;
  const [apiKey, setApiKey] = useState('');
  const [arcadiaLink, setArcadiaLink] = useState('');
  const [arcadiaProfileFile, setArcadiaProfileFile] = useState<File | null>(null);
  const [gmailProfileFile, setGmailProfileFile] = useState<File | null>(null);
  const [sdkFile, setSdkFile] = useState<File | null>(null);
  const [scriptsFile, setScriptsFile] = useState<File | null>(null);
  const [isUploadingProfiles, setIsUploadingProfiles] = useState(false);
  const [isUploadingScripts, setIsUploadingScripts] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ arcadia: boolean; gmail: boolean } | null>(null);
  const [scriptStatus, setScriptStatus] = useState<{ sdk: boolean; scripts: boolean } | null>(null);
  
  const { data: credentials, isLoading } = useUserCredentials();
  const novaActCredential = credentials?.find((c: any) => c.mcp_qualified_name === 'nova_act.inbound_orders');
  const hasApiKey = novaActCredential?.config_keys?.includes('nova_act_api_key') || false;
  const hasErpSession = novaActCredential?.config_keys?.includes('erp_session') || false;
  
  const storeCredentialMutation = useStoreCredential();

  // Check browser profile status
  React.useEffect(() => {
    if (open && userId) {
      const checkProfileStatus = async () => {
        try {
          const response = await apiClient.get(`/admin/browser-profiles/${userId}/status`);
          if (response.data) {
            setProfileStatus({
              arcadia: response.data.arcadia_profile?.exists || false,
              gmail: response.data.gmail_profile?.exists || false,
            });
          }
        } catch (error) {
          setProfileStatus({ arcadia: false, gmail: false });
        }
      };
      checkProfileStatus();
    }
  }, [open, userId]);

  // Check script folder status
  React.useEffect(() => {
    if (open && userId) {
      const checkScriptStatus = async () => {
        try {
          const response = await apiClient.get(`/admin/script-uploads/${userId}/status`);
          if (response.data) {
            setScriptStatus({
              sdk: response.data.sdk?.exists || false,
              scripts: response.data.scripts?.exists || false,
            });
          }
        } catch (error) {
          setScriptStatus({ sdk: false, scripts: false });
        }
      };
      checkScriptStatus();
    }
  }, [open, userId]);

  const handleUploadProfile = async (profileType: 'arcadia' | 'gmail', file: File) => {
    setIsUploadingProfiles(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('profile_type', profileType);

      const response = await apiClient.upload(`/admin/browser-profiles/${userId}/upload`, formData);
      
      if (response.success && response.data) {
        toast.success(`${profileType === 'arcadia' ? 'Arcadia' : 'Gmail'} profile uploaded and extracted successfully`);
        // Refresh profile status
        const statusResponse = await apiClient.get(`/admin/browser-profiles/${userId}/status`);
        if (statusResponse.data) {
          setProfileStatus({
            arcadia: statusResponse.data.arcadia_profile?.exists || false,
            gmail: statusResponse.data.gmail_profile?.exists || false,
          });
        }
      } else {
        throw new Error(response.error?.message || 'Upload failed');
      }
    } catch (error: any) {
      toast.error(error?.message || `Failed to upload ${profileType} profile`);
    } finally {
      setIsUploadingProfiles(false);
    }
  };

  const handleUploadScripts = async (scriptType: 'sdk' | 'scripts', file: File) => {
    setIsUploadingScripts(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('script_type', scriptType);

      const response = await apiClient.upload(`/admin/script-uploads/${userId}/upload`, formData);
      
      if (response.success && response.data) {
        toast.success(`${scriptType === 'sdk' ? 'SDK' : 'Scripts'} folder uploaded and extracted successfully`);
        // Refresh script status
        const statusResponse = await apiClient.get(`/admin/script-uploads/${userId}/status`);
        if (statusResponse.data) {
          setScriptStatus({
            sdk: statusResponse.data.sdk?.exists || false,
            scripts: statusResponse.data.scripts?.exists || false,
          });
        }
      } else {
        throw new Error(response.error?.message || 'Upload failed');
      }
    } catch (error: any) {
      toast.error(error?.message || `Failed to upload ${scriptType} folder`);
    } finally {
      setIsUploadingScripts(false);
    }
  };

  const handleSaveCredentials = async () => {
    if (!apiKey.trim()) {
      toast.error('Nova ACT API key is required');
      return;
    }

    const config: Record<string, any> = {
      nova_act_api_key: apiKey,
    };

    if (arcadiaLink.trim()) {
      config.arcadia_link = arcadiaLink.trim();
    }

    try {
      await storeCredentialMutation.mutateAsync({
        mcp_qualified_name: 'nova_act.inbound_orders',
        display_name: 'Nova ACT Inbound Orders',
        config,
      });
      
      toast.success('Credentials saved successfully');
      setApiKey('');
      setArcadiaLink('');
      setArcadiaProfileFile(null);
      setGmailProfileFile(null);
      queryClient.invalidateQueries({ queryKey: ['secure-mcp', 'credentials'] });
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save credentials');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Configure Inbound Order Credentials
          </DialogTitle>
          <DialogDescription>
            Set up Nova ACT API key and related configuration for Cold Chain Enterprise automation
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status Badges */}
            <div className="flex gap-2">
              {hasApiKey && (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  API Key Configured
                </Badge>
              )}
              {hasErpSession && (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Browser Profile Ready
                </Badge>
              )}
            </div>

            {/* API Key */}
            <div>
              <Label htmlFor="api-key">Nova ACT API Key *</Label>
              <Input
                id="api-key"
                type="password"
                placeholder={hasApiKey ? '••••••••••••' : 'Enter Nova ACT API key'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={storeCredentialMutation.isPending}
                className="mt-2"
              />
              {hasApiKey && (
                <div className="flex items-center gap-2 mt-1">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  <p className="text-xs text-muted-foreground">
                    API key is configured
                  </p>
                </div>
              )}
            </div>

            {/* Arcadia Link */}
            <div>
              <Label htmlFor="arcadia-link">Arcadia Link (User Profile)</Label>
              <Input
                id="arcadia-link"
                type="url"
                placeholder={novaActCredential?.config_keys?.includes('arcadia_link') ? 'Configured' : 'https://arcadia.example.com/user/profile'}
                value={arcadiaLink}
                onChange={(e) => setArcadiaLink(e.target.value)}
                disabled={storeCredentialMutation.isPending}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Link to user profile in Arcadia warehouse portal
              </p>
            </div>

            {/* Browser Profile Uploads */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="arcadia-profile">Arcadia Browser Profile Archive *</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    id="arcadia-profile"
                    type="file"
                    accept=".tar.gz"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setArcadiaProfileFile(file);
                        handleUploadProfile('arcadia', file);
                      }
                    }}
                    disabled={isUploadingProfiles || storeCredentialMutation.isPending}
                    className="flex-1"
                  />
                  {profileStatus?.arcadia && (
                    <Badge variant="outline" className="text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Uploaded
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload <code className="px-1 py-0.5 bg-muted rounded">arcadia_profile.tar.gz</code> archive. Extracted to <code className="px-1 py-0.5 bg-muted rounded">/workspace/contexts/arcadia_profile/</code>
                </p>
              </div>

              <div>
                <Label htmlFor="gmail-profile">Gmail Browser Profile Archive *</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    id="gmail-profile"
                    type="file"
                    accept=".tar.gz"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setGmailProfileFile(file);
                        handleUploadProfile('gmail', file);
                      }
                    }}
                    disabled={isUploadingProfiles || storeCredentialMutation.isPending}
                    className="flex-1"
                  />
                  {profileStatus?.gmail && (
                    <Badge variant="outline" className="text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Uploaded
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload <code className="px-1 py-0.5 bg-muted rounded">gmail_profile.tar.gz</code> archive. Extracted to <code className="px-1 py-0.5 bg-muted rounded">/workspace/contexts/gmail_profile/</code>
                </p>
              </div>

              {isUploadingProfiles && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading and extracting profile...
                </div>
              )}
            </div>

            {/* Browser Profile Status */}
            {!hasErpSession && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Browser profile not configured. Use the "Setup Inbound Order Credentials" tool in an agent conversation to set up Google SSO authentication.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveCredentials}
            disabled={!apiKey.trim() || isUploadingProfiles || isUploadingScripts || storeCredentialMutation.isPending}
          >
            {storeCredentialMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save Credentials'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

