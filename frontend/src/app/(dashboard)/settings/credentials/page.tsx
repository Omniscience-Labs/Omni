'use client';

import React, { useState } from 'react';
import { Plus, Key, Shield, TestTube, Trash2, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { 
  useUserCredentials, 
  useTestCredential, 
  useDeleteCredential,
  type MCPCredential
} from '@/hooks/react-query/secure-mcp/use-secure-mcp';
import { EnhancedAddCredentialDialog } from './_components/enhanced-add-credential-dialog';

interface CredentialCardProps {
  credential: MCPCredential;
  onTest: (qualifiedName: string) => void;
  onDelete: (qualifiedName: string) => void;
  isTestingId?: string;
  isDeletingId?: string;
}

const CredentialCard: React.FC<CredentialCardProps> = ({ 
  credential, 
  onTest, 
  onDelete, 
  isTestingId, 
  isDeletingId 
}) => {
  const isTesting = isTestingId === credential.mcp_qualified_name;
  const isDeleting = isDeletingId === credential.mcp_qualified_name;

  return (
    <Card className="border-border/50 hover:border-border transition-colors">
      <CardContent className="p-4 py-0">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-md bg-primary/10">
                <Key className="h-4 w-4 text-primary" />
              </div>
              <h3 className="text-md font-medium text-foreground">{credential.display_name}</h3>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              {credential.mcp_qualified_name}
            </p>
            <div className="flex flex-wrap gap-1">
              {credential.config_keys.map((key) => (
                <Badge key={key} variant="outline">
                  {key}
                </Badge>
              ))}
            </div>
            {credential.last_used_at && (
              <p className="text-xs text-muted-foreground/70">
                Last used {new Date(credential.last_used_at).toLocaleDateString()}
              </p>
            )}
          </div>
          
          <div className="flex gap-1.5 ml-4">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(credential.mcp_qualified_name)}
              disabled={isTesting || isDeleting}
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

export default function CredentialsPage() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: credentials, isLoading, error, refetch } = useUserCredentials();
  const testCredentialMutation = useTestCredential();
  const deleteCredentialMutation = useDeleteCredential();

  const handleTest = async (qualifiedName: string) => {
    setTestingId(qualifiedName);
    try {
      const result = await testCredentialMutation.mutateAsync(qualifiedName);
      if (result.success) {
        toast.success('Connection test successful!');
      } else {
        toast.error(`Connection test failed: ${result.message}`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Connection test failed');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (qualifiedName: string) => {
    setDeletingId(qualifiedName);
    try {
      await deleteCredentialMutation.mutateAsync(qualifiedName);
      toast.success('Credential deleted successfully');
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete credential');
    } finally {
      setDeletingId(null);
    }
  };

  if (error) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-6">
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/5">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Failed to load credentials. Please try again later.
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
                MCP Credentials
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage your encrypted API credentials for MCP servers
              </p>
            </div>
            <Button 
              onClick={() => setShowAddDialog(true)}
              size="sm"
              className="h-8 px-3 text-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Credential
            </Button>
          </div>

          <Alert className="border-primary/20 bg-primary/5">
            <Shield className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm text-muted-foreground">
              All credentials are encrypted and stored securely. Set up each MCP service once, 
              and credentials will be automatically used when installing agents.
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
        ) : credentials?.length === 0 ? (
          <Card className="border-dashed border-border/50">
            <CardContent className="p-8 text-center">
              <div className="p-3 rounded-full bg-muted/50 w-fit mx-auto mb-3">
                <Key className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium mb-1 text-foreground">No credentials configured</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add your first MCP credential to start using secure agents
              </p>
              <Button 
                onClick={() => setShowAddDialog(true)}
                size="sm"
                className="h-8 px-3 text-sm"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Your First Credential
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {credentials?.map((credential) => (
              <CredentialCard
                key={credential.credential_id}
                credential={credential}
                onTest={handleTest}
                onDelete={handleDelete}
                isTestingId={testingId}
                isDeletingId={deletingId}
              />
            ))}
          </div>
        )}

        <EnhancedAddCredentialDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          onSuccess={() => refetch()}
        />
      </div>
    </div>
  );
} 