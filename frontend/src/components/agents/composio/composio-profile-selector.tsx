import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useComposioProfiles } from '@/hooks/react-query/composio/use-composio-profiles';
import { composioApi } from '@/hooks/react-query/composio/utils';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface ComposioProfileSelectorProps {
  agentId: string;
  onProfileAdded?: (mcpConfig: any) => void;
}

export const ComposioProfileSelector: React.FC<ComposioProfileSelectorProps> = ({
  agentId,
  onProfileAdded
}) => {
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);
  
  const { data: profiles, isLoading } = useComposioProfiles();

  const handleAddToAgent = async () => {
    if (!selectedProfileId) {
      toast.error('Please select a Composio profile');
      return;
    }

    setIsAdding(true);
    try {
      // Get the MCP configuration for this profile
      const response = await composioApi.getMcpConfigForProfile(selectedProfileId);
      const mcpConfig = response.mcp_config;

      // Here you would add the MCP config to the agent's custom_mcps
      // This is just an example - integrate with your actual agent update logic
      console.log('MCP Config to add:', mcpConfig);
      console.log('Agent ID:', agentId);

      // Example structure that would be added to custom_mcps:
      // {
      //   "name": "Gmail (Composio)",
      //   "customType": "sse",
      //   "type": "sse",
      //   "config": {
      //     "url": "https://mcp.composio.dev/composio/server/abc123?user_id=xyz"
      //   },
      //   "enabledTools": []
      // }

      toast.success('Composio profile added to agent!');
      
      if (onProfileAdded) {
        onProfileAdded(mcpConfig);
      }
      
      // Reset selection
      setSelectedProfileId('');
    } catch (error) {
      console.error('Failed to add Composio profile:', error);
      toast.error('Failed to add profile to agent');
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading) {
    return <div>Loading profiles...</div>;
  }

  const connectedProfiles = profiles?.filter(p => p.is_connected) || [];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Add Composio Integration</label>
        <div className="flex gap-2">
          <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select a Composio profile" />
            </SelectTrigger>
            <SelectContent>
              {connectedProfiles.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">
                  No connected Composio profiles found
                </div>
              ) : (
                connectedProfiles.map((profile) => (
                  <SelectItem key={profile.profile_id} value={profile.profile_id}>
                    <div className="flex items-center gap-2">
                      <span>{profile.profile_name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({profile.toolkit_name})
                      </span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button 
            onClick={handleAddToAgent} 
            disabled={!selectedProfileId || isAdding}
            size="sm"
          >
            {isAdding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              'Add to Agent'
            )}
          </Button>
        </div>
      </div>

      {selectedProfileId && (
        <Alert>
          <AlertDescription>
            <strong>Note:</strong> This will add the Composio integration as a custom MCP to your agent. 
            The integration will have access to all tools provided by the connected service.
          </AlertDescription>
        </Alert>
      )}

      {connectedProfiles.length > 0 && (
        <div className="text-sm text-muted-foreground">
          <p>Your connected Composio integrations:</p>
          <ul className="mt-1 space-y-1">
            {connectedProfiles.map((profile) => (
              <li key={profile.profile_id} className="flex items-center gap-2">
                <span>• {profile.profile_name}</span>
                <span className="text-xs">({profile.toolkit_name})</span>
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  {profile.mcp_url.split('/').pop()?.split('?')[0] || 'N/A'}
                </code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}; 