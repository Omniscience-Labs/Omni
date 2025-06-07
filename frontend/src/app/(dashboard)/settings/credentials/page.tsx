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
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              <h3 className="font-medium">{credential.display_name}</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {credential.mcp_qualified_name}
            </p>
            <div className="flex flex-wrap gap-1">
              {credential.config_keys.map((key) => (
                <Badge key={key} variant="outline" className="text-xs">
                  {key}
                </Badge>
              ))}
            </div>
            {credential.last_used_at && (
              <p className="text-xs text-muted-foreground">
                Last used: {new Date(credential.last_used_at).toLocaleDateString()}
              </p>
            )}
          </div>
          
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onTest(credential.mcp_qualified_name)}
              disabled={isTesting || isDeleting}
            >
              {isTesting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Testing...
                </>
              ) : (
                <>
                  <TestTube className="h-4 w-4 mr-1" />
                  Test
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDelete(credential.mcp_qualified_name)}
              disabled={isTesting || isDeleting}
              className="text-destructive hover:text-destructive"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </>
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
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load credentials. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                MCP Credentials
              </h1>
              <p className="text-muted-foreground">
                Manage your encrypted API credentials for MCP servers
              </p>
            </div>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Credential
            </Button>
          </div>

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              All credentials are encrypted and stored securely. You only need to set up each MCP service once, 
              and your credentials will be automatically used when installing agents that require them.
            </AlertDescription>
          </Alert>
        </div>

        {isLoading ? (
          <div className="grid gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-muted rounded w-1/3"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                    <div className="flex gap-2">
                      <div className="h-6 bg-muted rounded w-16"></div>
                      <div className="h-6 bg-muted rounded w-20"></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : credentials?.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No credentials configured</h3>
              <p className="text-muted-foreground mb-6">
                Add your first MCP credential to start using secure agents from the marketplace
              </p>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Credential
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
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