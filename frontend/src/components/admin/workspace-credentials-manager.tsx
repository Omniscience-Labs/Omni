'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Key, Loader2, AlertCircle, CheckCircle2, RefreshCw, ExternalLink, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { useStoreCredential, useUserCredentials, useDeleteCredential } from '@/hooks/react-query/secure-mcp/use-secure-mcp';

interface WorkspaceCredentialsManagerProps {
  workspaceSlug: string;
  accountId: string;
}

export function WorkspaceCredentialsManager({ workspaceSlug, accountId }: WorkspaceCredentialsManagerProps) {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [arcadiaLink, setArcadiaLink] = useState('');
  const [gmailProfileData, setGmailProfileData] = useState('');
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  
  const { data: credentials, isLoading } = useUserCredentials();

  const novaActCredential = credentials?.find((c: any) => c.mcp_qualified_name === 'nova_act.inbound_orders');
  const hasApiKey = novaActCredential?.config_keys?.includes('nova_act_api_key') || false;
  const hasErpSession = novaActCredential?.config_keys?.includes('erp_session') || false;
  const hasGmailProfile = novaActCredential?.config_keys?.includes('gmail_profile_data') || false;
  
  const storeCredentialMutation = useStoreCredential();
  const deleteCredentialMutation = useDeleteCredential();

  const handleSaveCredentials = async () => {
    if (!apiKey.trim()) {
      toast.error('Nova ACT API key is required');
      return;
    }

    if (!gmailProfileData.trim()) {
      toast.error('Gmail profile data is required for Arcadia authentication');
      return;
    }

    // Build config object with all fields
    const config: Record<string, any> = {
      nova_act_api_key: apiKey,
      gmail_profile_data: gmailProfileData.trim(),
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
      setGmailProfileData('');
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

              <div>
                <Label htmlFor="gmail-profile">Gmail Profile Cached Data *</Label>
                <textarea
                  id="gmail-profile"
                  rows={6}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-2"
                  placeholder="Paste Gmail OAuth token JSON or cached authentication data here..."
                  value={gmailProfileData}
                  onChange={(e) => setGmailProfileData(e.target.value)}
                  disabled={storeCredentialMutation.isPending}
                />
                {hasGmailProfile && (
                  <div className="flex items-center gap-2 mt-1">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    <p className="text-xs text-muted-foreground">
                      Gmail profile data is configured
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Required for Arcadia login. Paste your Gmail OAuth token JSON or cached authentication data. This will be used by the SDK to authenticate with Arcadia.
                </p>
              </div>

              <Button
                onClick={handleSaveCredentials}
                disabled={!apiKey.trim() || !gmailProfileData.trim() || storeCredentialMutation.isPending}
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

