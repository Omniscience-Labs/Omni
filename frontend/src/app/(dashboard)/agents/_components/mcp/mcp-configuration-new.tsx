import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Settings, Zap, Code2, Server, Store } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { MCPConfigurationProps, MCPConfiguration as MCPConfigurationType } from './types';
import { ConfiguredMcpList } from './configured-mcp-list';
import { CustomMCPDialog } from './custom-mcp-dialog';
import { PipedreamRegistry } from '@/components/agents/pipedream/pipedream-registry';

export const MCPConfigurationNew: React.FC<MCPConfigurationProps> = ({
  configuredMCPs,
  onConfigurationChange,
}) => {
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [showRegistryDialog, setShowRegistryDialog] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleEditMCP = (index: number) => {
    const mcp = configuredMCPs[index];
    if (mcp.customType === 'pipedream') {
      return;
    }
    setEditingIndex(index);
  };

  const handleRemoveMCP = (index: number) => {
    const newMCPs = [...configuredMCPs];
    newMCPs.splice(index, 1);
    onConfigurationChange(newMCPs);
  };

  const handleSaveCustomMCP = (customConfig: any) => {
    const mcpConfig: MCPConfigurationType = {
      name: customConfig.name,
      qualifiedName: `custom_${customConfig.type}_${Date.now()}`,
      config: customConfig.config,
      enabledTools: customConfig.enabledTools,
      selectedProfileId: customConfig.selectedProfileId,
      isCustom: true,
      customType: customConfig.type as 'http' | 'sse'
    };
    onConfigurationChange([...configuredMCPs, mcpConfig]);
  };

  const handleToolsSelected = (profileId: string, selectedTools: string[], appName: string, appSlug: string) => {
    const pipedreamMCP: MCPConfigurationType = {
      name: appName,
      qualifiedName: `pipedream_${appSlug}_${profileId}`,
      config: {
        url: 'https://remote.mcp.pipedream.net',
        headers: {
          'x-pd-app-slug': appSlug,
        },
        profile_id: profileId
      },
      enabledTools: selectedTools,
      isCustom: true,
      customType: 'pipedream',
      selectedProfileId: profileId
    };
    const nonPipedreamMCPs = configuredMCPs.filter(mcp => 
      mcp.customType !== 'pipedream' || 
      mcp.selectedProfileId !== profileId
    );
    onConfigurationChange([...nonPipedreamMCPs, pipedreamMCP]);
    setShowRegistryDialog(false);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-6 border">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                Give your agent access to external tools and services.
              </p>
              {configuredMCPs.length > 0 && (
                <div className="flex items-center mt-3 space-x-2">
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      {configuredMCPs.length} integration{configuredMCPs.length !== 1 ? 's' : ''} configured
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowRegistryDialog(true)}
              className="transition-all duration-200"
            >
              <Store className="h-4 w-4" />
              Browse Apps
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCustomDialog(true)}
              className="transition-all duration-200"
            >
              <Server className="h-4 w-4" />
              Custom MCP
            </Button>
          </div>
        </div>
      </div>
      
      {configuredMCPs.length === 0 && (
        <div className="text-center py-12 px-6 bg-muted/30 rounded-xl border-2 border-dashed border-border">
          <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
            <Zap className="h-6 w-6 text-muted-foreground" />
          </div>
          <h4 className="text-sm font-medium text-foreground mb-2">
            No integrations configured
          </h4>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Browse the app registry to connect your apps through Pipedream or add custom MCP servers
          </p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => setShowRegistryDialog(true)} variant="default">
              <Store className="h-4 w-4 mr-2" />
              Browse Apps
            </Button>
            <Button onClick={() => setShowCustomDialog(true)} variant="outline">
              <Server className="h-4 w-4 mr-2" />
              Custom MCP
            </Button>
          </div>
        </div>
      )}
      
      {configuredMCPs.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/30">
            <h4 className="text-sm font-medium text-foreground">
              Configured Integrations
            </h4>
          </div>
          <div className="p-2 divide-y divide-border">
            <ConfiguredMcpList
              configuredMCPs={configuredMCPs}
              onEdit={handleEditMCP}
              onRemove={handleRemoveMCP}
            />
          </div>
        </div>
      )}
      <Dialog open={showRegistryDialog} onOpenChange={setShowRegistryDialog}>
        <DialogContent className="p-0 max-w-6xl max-h-[90vh] overflow-y-auto">
          <PipedreamRegistry onToolsSelected={handleToolsSelected} />
        </DialogContent>
      </Dialog>
      <CustomMCPDialog
        open={showCustomDialog}
        onOpenChange={setShowCustomDialog}
        onSave={handleSaveCustomMCP}
      />
    </div>
  );
};