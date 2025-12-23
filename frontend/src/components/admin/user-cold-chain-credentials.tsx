'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Loader2, Package, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useUserCredentials, useDeleteCredential } from '@/hooks/react-query/secure-mcp/use-secure-mcp';
import { useCurrentAccount } from '@/hooks/use-current-account';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface UserColdChainCredentialsProps {
  userId: string;
  workspaceSlug?: string;
}

export function UserColdChainCredentials({ userId, workspaceSlug }: UserColdChainCredentialsProps) {
  const [apiKey, setApiKey] = useState('');
  const [arcadiaLink, setArcadiaLink] = useState('');
  const [sdkFolderFile, setSdkFolderFile] = useState<File | null>(null);
  const [isUploadingFolder, setIsUploadingFolder] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const currentAccount = useCurrentAccount();
  const effectiveWorkspaceSlug = workspaceSlug || currentAccount?.slug;
  // Allow Cold Chain automation for enterprise workspaces in all environments (local, staging, production)
  // In staging/local, workspace slugs might be different (e.g., 'varnica', 'varnica.dev')
  // Also allow if in local/staging mode for any workspace (for testing)
  const allowedWorkspaces = ['cold-chain-enterprise', 'operator', 'varnica', 'varnica.dev'];
  // Use same logic as agent-tools-configuration.tsx for consistency
  const isLocalOrStaging = process.env.NEXT_PUBLIC_ENV_MODE === 'LOCAL' || process.env.NEXT_PUBLIC_ENV_MODE === 'STAGING';
  // Allow if workspace is in allowed list OR if in local/staging (same as tool visibility check)
  const isAllowedWorkspace = isLocalOrStaging || (
    effectiveWorkspaceSlug && allowedWorkspaces.includes(effectiveWorkspaceSlug)
  );
  const queryClient = useQueryClient();

  const { data: credentials, isLoading } = useUserCredentials();
  const deleteCredential = useDeleteCredential();
  
  // Admin mutation to store credentials for a specific user
  const storeCredential = useMutation({
    mutationFn: async (data: { mcp_qualified_name: string; display_name: string; config: Record<string, any> }) => {
      const response = await apiClient.request(`/admin/users/${userId}/credentials`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['secure-mcp', 'credentials'] });
    },
  });

  // Find the Cold Chain credential for this user
  const coldChainCredential = credentials?.find(
    (c: any) => c.mcp_qualified_name === 'nova_act.inbound_orders' && c.account_id === userId
  );

  const hasApiKey = coldChainCredential?.config_keys?.includes('nova_act_api_key') || false;
  const hasErpSession = coldChainCredential?.config_keys?.includes('erp_session') || false;
  const hasArcadiaLink = coldChainCredential?.config_keys?.includes('arcadia_link') || false;
  // SDK folder status (includes SDK, scripts, and browser profiles)
  const [sdkFolderStatus, setSdkFolderStatus] = useState<{ 
    has_sdk: boolean; 
    has_scripts: boolean; 
    has_contexts: boolean;
  } | null>(null);

  // Check SDK folder status (includes SDK, scripts, and browser profiles)
  useEffect(() => {
    const checkSdkFolderStatus = async () => {
      try {
        const response = await apiClient.get(`/admin/sdk-folder-upload/${userId}/status`);
        if (response.data) {
          setSdkFolderStatus({
            has_sdk: response.data.sdk?.exists || false,
            has_scripts: response.data.scripts?.exists || false,
            has_contexts: response.data.contexts?.exists || false,
          });
        }
      } catch (error) {
        // Silently fail - folder might not exist yet
        setSdkFolderStatus({ has_sdk: false, has_scripts: false, has_contexts: false });
      }
    };
    checkSdkFolderStatus();
  }, [userId]);

  // Load existing values if credential exists
  useEffect(() => {
    if (coldChainCredential && !isEditing) {
      // Note: We can't read the actual encrypted values, but we can show placeholders
      setApiKey(hasApiKey ? '••••••••••••••••' : '');
      setArcadiaLink(hasArcadiaLink ? 'Configured' : '');
    }
  }, [coldChainCredential, hasApiKey, hasArcadiaLink, isEditing]);

  const handleUploadSdkFolder = async (file: File) => {
    setIsUploadingFolder(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiClient.upload(`/admin/sdk-folder-upload/${userId}/upload`, formData);
      
      if (response.success && response.data) {
        toast.success('SDK folder uploaded and extracted successfully');
        // Refresh SDK folder status
        const statusResponse = await apiClient.get(`/admin/sdk-folder-upload/${userId}/status`);
        if (statusResponse.data) {
          setSdkFolderStatus({
            has_sdk: statusResponse.data.sdk?.exists || false,
            has_scripts: statusResponse.data.scripts?.exists || false,
            has_contexts: statusResponse.data.contexts?.exists || false,
          });
        }
        setSdkFolderFile(null);
      } else {
        throw new Error(response.error?.message || 'Upload failed');
      }
    } catch (error: any) {
      // Extract detailed error message from validation errors
      let errorMessage = error?.message || 'Failed to upload SDK folder';
      if (error?.details?.detail) {
        // FastAPI validation errors are in details.detail array
        const validationErrors = Array.isArray(error.details.detail) 
          ? error.details.detail.map((e: any) => `${e.loc?.join('.')}: ${e.msg}`).join(', ')
          : JSON.stringify(error.details.detail);
        errorMessage = `Validation error: ${validationErrors}`;
      } else if (error?.details?.message) {
        errorMessage = error.details.message;
      }
      console.error('SDK folder upload error:', error);
      toast.error(errorMessage);
    } finally {
      setIsUploadingFolder(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      toast.error('Nova ACT API key is required');
      return;
    }

    try {
      const config: Record<string, any> = {
        nova_act_api_key: apiKey,
      };

      if (arcadiaLink.trim()) {
        config.arcadia_link = arcadiaLink;
      }

      await storeCredential.mutateAsync({
        mcp_qualified_name: 'nova_act.inbound_orders',
        display_name: 'Nova ACT Inbound Orders',
        config,
      });

      toast.success('Cold Chain credentials saved successfully');
      setIsEditing(false);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save credentials');
    }
  };

  const handleDelete = async () => {
    if (!coldChainCredential?.credential_id) return;

    if (!confirm('Are you sure you want to delete these credentials? This will remove all Cold Chain automation settings for this user.')) {
      return;
    }

    try {
      await deleteCredential.mutateAsync(coldChainCredential.credential_id);
      toast.success('Credentials deleted successfully');
      setApiKey('');
      setArcadiaLink('');
      setSdkFolderFile(null);
      setIsEditing(false);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete credentials');
    }
  };

  if (!isAllowedWorkspace) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-sm text-muted-foreground">
            Cold Chain automation is available for enterprise workspaces. 
            {isLocalOrStaging ? (
              <span className="block mt-1 text-xs">Available in local/staging for testing.</span>
            ) : (
              <span className="block mt-1">Current workspace: <code className="px-1 py-0.5 bg-muted rounded">{effectiveWorkspaceSlug || 'unknown'}</code></span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            <div>
              <CardTitle>Cold Chain Automation</CardTitle>
              <CardDescription>
                Configure Nova ACT API credentials and ERP settings for this user
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasApiKey && (
              <Badge variant="outline" className="text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                API Key Set
              </Badge>
            )}
            {hasErpSession && (
              <Badge variant="outline" className="text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Browser Profile Ready
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            {!isEditing && coldChainCredential ? (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Nova ACT API Key</Label>
                    {hasApiKey ? (
                      <Badge variant="outline" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-600">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Not Set
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Arcadia Link</Label>
                    {hasArcadiaLink ? (
                      <Badge variant="outline" className="text-xs">
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Optional
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">SDK Folder</Label>
                    {sdkFolderStatus?.has_sdk && sdkFolderStatus?.has_scripts && sdkFolderStatus?.has_contexts ? (
                      <Badge variant="outline" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Complete
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-600">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Required
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Browser Session</Label>
                    {hasErpSession ? (
                      <Badge variant="outline" className="text-xs text-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Authenticated
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-600">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Not Configured
                      </Badge>
                    )}
                  </div>
                  
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    className="flex-1"
                  >
                    Edit Credentials
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={deleteCredential.isPending}
                  >
                    {deleteCredential.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Delete'
                    )}
                  </Button>
                </div>

                {!hasErpSession && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50 p-3">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <AlertCircle className="h-4 w-4 inline mr-1" />
                      Browser profile not configured. User needs to run the "setup" action in an agent conversation after credentials are saved.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="api-key">
                    Nova ACT API Key <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="api-key"
                    type="password"
                    placeholder="Enter Nova ACT API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={storeCredential.isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Required for Cold Chain automation. Get your API key from Nova ACT dashboard.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="arcadia-link">Arcadia Link (Optional)</Label>
                  <Input
                    id="arcadia-link"
                    type="url"
                    placeholder="https://arcadia.example.com/user/profile"
                    value={arcadiaLink}
                    onChange={(e) => setArcadiaLink(e.target.value)}
                    disabled={storeCredential.isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    User profile link in Arcadia warehouse portal (optional).
                  </p>
                </div>

                <div className="space-y-4 border-t pt-4">
                  <h3 className="text-sm font-semibold">SDK Folder (Development Mode)</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="sdk-folder">
                      Complete SDK Folder <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="sdk-folder"
                        type="file"
                        accept=".tar.gz,.tgz,.zip,application/gzip,application/x-gzip,application/x-tar,application/zip"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setSdkFolderFile(file);
                          }
                        }}
                        disabled={isUploadingFolder || storeCredential.isPending}
                        className="flex-1"
                      />
                      {sdkFolderFile && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleUploadSdkFolder(sdkFolderFile)}
                          disabled={isUploadingFolder || storeCredential.isPending}
                        >
                          {isUploadingFolder ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="h-3 w-3 mr-1" />
                              Upload
                            </>
                          )}
                        </Button>
                      )}
                      {sdkFolderStatus?.has_sdk && sdkFolderStatus?.has_scripts && sdkFolderStatus?.has_contexts && (
                        <Badge variant="outline" className="text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Complete
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Upload complete SDK folder archive (<code className="px-1 py-0.5 bg-muted rounded">omni_inbound_mcp_sdk.zip</code> or <code className="px-1 py-0.5 bg-muted rounded">.tar.gz</code>) containing:
                      <br />• <code className="px-1 py-0.5 bg-muted rounded">inbound_mcp/</code> (Python SDK)
                      <br />• <code className="px-1 py-0.5 bg-muted rounded">stagehand-test/</code> (Scripts)
                      <br />• <code className="px-1 py-0.5 bg-muted rounded">stagehand-test/contexts/</code> (Browser profiles)
                      <br />Extracted to <code className="px-1 py-0.5 bg-muted rounded">/workspace/omni_inbound_mcp_sdk/</code>
                    </p>
                    {sdkFolderStatus && (
                      <div className="text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          {sdkFolderStatus.has_sdk ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-amber-600" />
                          )}
                          <span>SDK: {sdkFolderStatus.has_sdk ? 'Ready' : 'Missing'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {sdkFolderStatus.has_scripts ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-amber-600" />
                          )}
                          <span>Scripts: {sdkFolderStatus.has_scripts ? 'Ready' : 'Missing'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {sdkFolderStatus.has_contexts ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-amber-600" />
                          )}
                          <span>Browser Profiles: {sdkFolderStatus.has_contexts ? 'Ready' : 'Missing'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={storeCredential.isPending || !apiKey.trim() || isUploadingFolder}
                    className="flex-1"
                  >
                    {storeCredential.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      'Save Credentials'
                    )}
                  </Button>
                  {coldChainCredential && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        setApiKey(hasApiKey ? '••••••••••••••••' : '');
                        setArcadiaLink(hasArcadiaLink ? 'Configured' : '');
                        setSdkFolderFile(null);
                      }}
                      disabled={storeCredential.isPending}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

