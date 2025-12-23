'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStoreCredential, useUserCredentials } from '@/hooks/react-query/secure-mcp/use-secure-mcp';

interface WorkspaceCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
}

export function WorkspaceCredentialsDialog({ open, onOpenChange, accountId }: WorkspaceCredentialsDialogProps) {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [arcadiaLink, setArcadiaLink] = useState('');
  const [gmailProfileData, setGmailProfileData] = useState('');
  
  const { data: credentials, isLoading } = useUserCredentials();
  const novaActCredential = credentials?.find((c: any) => c.mcp_qualified_name === 'nova_act.inbound_orders');
  const hasApiKey = novaActCredential?.config_keys?.includes('nova_act_api_key') || false;
  const hasErpSession = novaActCredential?.config_keys?.includes('erp_session') || false;
  const hasGmailProfile = novaActCredential?.config_keys?.includes('gmail_profile_data') || false;
  
  const storeCredentialMutation = useStoreCredential();

  const handleSaveCredentials = async () => {
    if (!apiKey.trim()) {
      toast.error('Nova ACT API key is required');
      return;
    }

    if (!gmailProfileData.trim()) {
      toast.error('Gmail profile data is required for Arcadia authentication');
      return;
    }

    const config: Record<string, any> = {
      nova_act_api_key: apiKey,
      gmail_profile_data: gmailProfileData.trim(),
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
      setGmailProfileData('');
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

            {/* Gmail Profile Data */}
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
            disabled={!apiKey.trim() || !gmailProfileData.trim() || storeCredentialMutation.isPending}
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

