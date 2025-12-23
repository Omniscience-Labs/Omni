'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Key, Loader2, AlertCircle, CheckCircle2, RefreshCw, ExternalLink, Calendar, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useStoreCredential, useUserCredentials, useDeleteCredential } from '@/hooks/react-query/secure-mcp/use-secure-mcp';
import { apiClient } from '@/lib/api-client';
import { useCurrentAccount } from '@/hooks/use-current-account';

interface WorkspaceCredentialsManagerProps {
  workspaceSlug: string;
  accountId: string;
}

export function WorkspaceCredentialsManager({ workspaceSlug, accountId }: WorkspaceCredentialsManagerProps) {
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
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ arcadia: boolean; gmail: boolean } | null>(null);
  const [scriptStatus, setScriptStatus] = useState<{ sdk: boolean; scripts: boolean } | null>(null);
  
  const { data: credentials, isLoading } = useUserCredentials();

  const novaActCredential = credentials?.find((c: any) => c.mcp_qualified_name === 'nova_act.inbound_orders');
  const hasApiKey = novaActCredential?.config_keys?.includes('nova_act_api_key') || false;
  const hasErpSession = novaActCredential?.config_keys?.includes('erp_session') || false;
  
  const storeCredentialMutation = useStoreCredential();
  const deleteCredentialMutation = useDeleteCredential();

  // Check browser profile status
  React.useEffect(() => {
    if (userId) {
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
  }, [userId]);

  // Check script folder status
  React.useEffect(() => {
    if (userId) {
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
  }, [userId]);

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

    // Build config object with all fields
    const config: Record<string, any> = {
      nova_act_api_key: apiKey,
    };

    // Add optional fields if provided
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
    } catch (error: any) {
      toast.error(error.message || 'Failed to save credentials');
    }
  };

  const handleDeleteCredential = async () => {
    if (!confirm('Are you sure you want to delete these credentials? This will disable inbound order automation.')) {
      return;
    }

    try {
      await deleteCredentialMutation.mutateAsync('nova_act.inbound_orders');
      toast.success('Credentials deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['secure-mcp', 'credentials'] });
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete credentials');
    }
  };

  const handleTriggerSetup = async () => {
    // This would trigger the setup tool via an API call
    // For now, we'll show instructions
    toast.info('Use the "Setup Inbound Order Credentials" tool in an agent conversation to complete browser profile setup');
    setSetupDialogOpen(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Workspace Credentials
            </CardTitle>
            <CardDescription>
              Manage Nova ACT credentials and browser profile for {workspaceSlug}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Credentials Configuration Section */}
            <div className="space-y-4">
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

              <div className="space-y-4 border-t pt-4">
                <h3 className="text-sm font-semibold">Python SDK & Scripts</h3>
                
                <div>
                  <Label htmlFor="sdk-folder">Python SDK Folder *</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      id="sdk-folder"
                      type="file"
                      accept=".tar.gz,.tgz,.zip,application/gzip,application/x-gzip,application/x-tar,application/zip"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setSdkFile(file);
                          handleUploadScripts('sdk', file);
                        }
                      }}
                      disabled={isUploadingScripts || storeCredentialMutation.isPending}
                      className="flex-1"
                    />
                    {scriptStatus?.sdk && (
                      <Badge variant="outline" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Uploaded
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Upload Python SDK archive. Extracted to <code className="px-1 py-0.5 bg-muted rounded">/workspace/inbound_mcp/</code>
                  </p>
                </div>

                <div>
                  <Label htmlFor="scripts-folder">Stagehand Scripts Folder *</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      id="scripts-folder"
                      type="file"
                      accept=".tar.gz,.tgz,.zip,application/gzip,application/x-gzip,application/x-tar,application/zip"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setScriptsFile(file);
                          handleUploadScripts('scripts', file);
                        }
                      }}
                      disabled={isUploadingScripts || storeCredentialMutation.isPending}
                      className="flex-1"
                    />
                    {scriptStatus?.scripts && (
                      <Badge variant="outline" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Uploaded
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Upload Stagehand scripts archive. Extracted to <code className="px-1 py-0.5 bg-muted rounded">/workspace/stagehand-test/</code>
                  </p>
                </div>

                {isUploadingScripts && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading and extracting scripts...
                  </div>
                )}
              </div>

              <Button
                onClick={handleSaveCredentials}
                disabled={!apiKey.trim() || isUploadingProfiles || isUploadingScripts || storeCredentialMutation.isPending}
                className="w-full"
              >
                {storeCredentialMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save All Credentials'
                )}
              </Button>
            </div>

            {/* Browser Profile Status */}
            {novaActCredential && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Browser Profile Status</Label>
                  {hasErpSession ? (
                    <Badge variant="default">Configured</Badge>
                  ) : (
                    <Badge variant="secondary">Not Configured</Badge>
                  )}
                </div>

                {hasErpSession ? (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>
                      Browser profile is configured. Profile path and expiration details are stored securely.
                      Use the "Setup Inbound Order Credentials" tool to refresh the session if needed.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Browser profile not configured. Use the "Setup Inbound Order Credentials" tool in an agent conversation to set up Google SSO authentication.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-4 border-t">
              {novaActCredential && (
                <>
                  <Dialog open={setupDialogOpen} onOpenChange={setSetupDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" disabled={!hasApiKey}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Setup Browser Profile
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Setup Browser Profile</DialogTitle>
                        <DialogDescription>
                          This will launch a browser session for Google SSO authentication. The session will be saved for workspace reuse.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            To complete browser profile setup, use the "Setup Inbound Order Credentials" tool in an agent conversation.
                            The tool will launch a headed browser where you can complete Google SSO authentication.
                          </AlertDescription>
                        </Alert>
                        <div className="text-sm text-muted-foreground">
                          <p className="font-medium mb-2">Steps:</p>
                          <ol className="list-decimal list-inside space-y-1">
                            <li>Open an agent conversation</li>
                            <li>Use the "Setup Inbound Order Credentials" tool</li>
                            <li>Complete Google SSO in the launched browser</li>
                            <li>Browser profile will be saved automatically</li>
                          </ol>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setSetupDialogOpen(false)}>
                          Close
                        </Button>
                        <Button onClick={handleTriggerSetup}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open Agent Conversation
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Button
                    variant="destructive"
                    onClick={handleDeleteCredential}
                    disabled={deleteCredentialMutation.isPending}
                  >
                    {deleteCredentialMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Deleting...
                      </>
                    ) : (
                      'Delete Credentials'
                    )}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

