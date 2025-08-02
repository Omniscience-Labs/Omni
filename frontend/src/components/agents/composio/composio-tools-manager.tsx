import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, Loader2, Save, AlertCircle } from 'lucide-react';
import { useComposioProfiles } from '@/hooks/react-query/composio/use-composio-profiles';
import { backendApi } from '@/lib/api-client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface ComposioToolsManagerProps {
  agentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId?: string; // Optional: pre-select a profile
  onToolsUpdate?: (enabledTools: string[]) => void;
}

interface Tool {
  name: string;
  description: string;
  inputSchema?: any;
}

export const ComposioToolsManager: React.FC<ComposioToolsManagerProps> = ({
  agentId,
  open,
  onOpenChange,
  profileId,
  onToolsUpdate
}) => {
  const [selectedProfile, setSelectedProfile] = useState<string>(profileId || '');
  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data: profiles, isLoading: isLoadingProfiles } = useComposioProfiles();

  // Auto-discover tools when profile changes
  useEffect(() => {
    if (selectedProfile) {
      discoverTools(selectedProfile);
    }
  }, [selectedProfile]);

  // Pre-select profile if provided
  useEffect(() => {
    if (profileId && !selectedProfile) {
      setSelectedProfile(profileId);
    }
  }, [profileId]);

  const discoverTools = async (profileId: string) => {
    setIsDiscovering(true);
    setError(null);
    setTools([]);
    setSelectedTools(new Set());

    try {
      const result = await backendApi.post<{
        success: boolean;
        tools: Tool[];
        toolkit_name: string;
        total_tools: number;
      }>(`/composio/profiles/${profileId}/discover-tools`, {}, {
        errorContext: { operation: 'discover tools', resource: 'Composio profile' }
      });

      if (!result.success || !result.data) {
        throw new Error(result.error?.message || 'Failed to discover tools');
      }

      setTools(result.data.tools);
      // Pre-select all tools by default
      setSelectedTools(new Set(result.data.tools.map(t => t.name)));
      
      toast.success(`Discovered ${result.data.total_tools} tools from ${result.data.toolkit_name}`);
    } catch (error) {
      console.error('Failed to discover tools:', error);
      setError(error.message || 'Failed to discover tools');
      toast.error('Failed to discover tools');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleToolToggle = (toolName: string) => {
    const newSelected = new Set(selectedTools);
    if (newSelected.has(toolName)) {
      newSelected.delete(toolName);
    } else {
      newSelected.add(toolName);
    }
    setSelectedTools(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedTools.size === filteredTools.length) {
      setSelectedTools(new Set());
    } else {
      setSelectedTools(new Set(filteredTools.map(t => t.name)));
    }
  };

  const handleSave = async () => {
    if (!selectedProfile || selectedTools.size === 0) {
      toast.error('Please select at least one tool');
      return;
    }

    setIsSaving(true);
    try {
      // Get the MCP config for this profile
      const configResult = await backendApi.get<{
        success: boolean;
        mcp_config: any;
      }>(`/composio/profiles/${selectedProfile}/mcp-config`, {
        errorContext: { operation: 'get MCP config', resource: 'Composio profile' }
      });

      if (!configResult.success || !configResult.data) {
        throw new Error('Failed to get MCP configuration');
      }

      const mcpConfig = configResult.data.mcp_config;
      // Add selected tools to the config
      mcpConfig.enabledTools = Array.from(selectedTools);

      // Update agent's custom MCPs
      const updateResult = await backendApi.post(`/agents/${agentId}/custom-mcp-tools`, {
        url: mcpConfig.config.url,
        type: 'composio',
        enabled_tools: Array.from(selectedTools)
      }, {
        errorContext: { operation: 'update agent tools', resource: 'agent custom MCPs' }
      });

      if (!updateResult.success) {
        throw new Error(updateResult.error?.message || 'Failed to update agent');
      }

      toast.success(`Added ${selectedTools.size} Composio tools to agent`);
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      
      if (onToolsUpdate) {
        onToolsUpdate(Array.from(selectedTools));
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save tools:', error);
      toast.error(error.message || 'Failed to save tools');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredTools = tools.filter(tool => 
    tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tool.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const connectedProfiles = profiles?.filter(p => p.is_connected) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Composio Tools</DialogTitle>
          <DialogDescription>
            Select tools from your Composio integrations to add to the agent
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Profile Selection */}
          {!profileId && (
            <div className="mb-4">
              <label className="text-sm font-medium mb-2 block">Select Integration</label>
              <div className="grid grid-cols-1 gap-2">
                {isLoadingProfiles ? (
                  <Skeleton className="h-10" />
                ) : connectedProfiles.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No connected Composio integrations found. Please connect an app first.
                    </AlertDescription>
                  </Alert>
                ) : (
                  connectedProfiles.map((profile) => (
                    <Button
                      key={profile.profile_id}
                      variant={selectedProfile === profile.profile_id ? "default" : "outline"}
                      className="justify-start"
                      onClick={() => setSelectedProfile(profile.profile_id)}
                    >
                      <span>{profile.profile_name}</span>
                      <Badge variant="secondary" className="ml-2">
                        {profile.toolkit_name}
                      </Badge>
                    </Button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Tools Section */}
          {selectedProfile && (
            <>
              {/* Search and Actions */}
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tools..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    disabled={isDiscovering}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={isDiscovering || tools.length === 0}
                >
                  {selectedTools.size === filteredTools.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>

              {/* Tools List */}
              <div className="flex-1 overflow-y-auto border rounded-lg">
                {isDiscovering ? (
                  <div className="p-8 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground">Discovering available tools...</p>
                  </div>
                ) : error ? (
                  <Alert className="m-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : tools.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No tools discovered from this integration
                  </div>
                ) : filteredTools.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No tools match your search
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredTools.map((tool) => (
                      <div
                        key={tool.name}
                        className="flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          checked={selectedTools.has(tool.name)}
                          onCheckedChange={() => handleToolToggle(tool.name)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{tool.name}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {tool.description}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {selectedTools.size} of {tools.length} tools selected
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={selectedTools.size === 0 || isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Tools
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}; 