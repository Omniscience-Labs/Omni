import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Zap, Server, Store } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MCPConfigurationProps, MCPConfiguration as MCPConfigurationType } from './types';
import { ConfiguredMcpList } from './configured-mcp-list';
import { CustomMCPDialog } from './custom-mcp-dialog';
import { PipedreamRegistry } from '@/components/agents/pipedream/pipedream-registry';
import { ToolsManager } from './tools-manager';

export const MCPConfigurationNew: React.FC<MCPConfigurationProps> = ({
  configuredMCPs,
  onConfigurationChange,
  agentId,
  versionData
}) => {
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [showRegistryDialog, setShowRegistryDialog] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showPipedreamToolsManager, setShowPipedreamToolsManager] = useState(false);
  const [showCustomToolsManager, setShowCustomToolsManager] = useState(false);
  const [selectedMCPForTools, setSelectedMCPForTools] = useState<MCPConfigurationType | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(agentId);

  useEffect(() => {
    setSelectedAgentId(agentId);
  }, [agentId]);

  const handleAgentChange = (newAgentId: string | undefined) => {
    setSelectedAgentId(newAgentId);
  };

  const handleEditMCP = (index: number) => {
    const mcp = configuredMCPs[index];
    if (mcp.customType === 'pipedream') {
      setEditingIndex(index);
      setShowCustomDialog(true);
    } else {
      setEditingIndex(index);
      setShowCustomDialog(true);
    }
  };

  const handleConfigureTools = (index: number) => {
    const mcp = configuredMCPs[index];
    setSelectedMCPForTools(mcp);
    if (mcp.customType === 'pipedream') {
      const profileId = mcp.selectedProfileId || mcp.config?.profile_id;
      if (profileId) {
        setShowPipedreamToolsManager(true);
      } else {
        console.warn('Pipedream MCP has no profile_id:', mcp);
      }
    } else {
      setShowCustomToolsManager(true);
    }
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

  const handlePipedreamToolsUpdate = (enabledTools: string[]) => {
    if (!selectedMCPForTools) return;
    
    const updatedMCPs = configuredMCPs.map(mcp => 
      mcp === selectedMCPForTools 
        ? { ...mcp, enabledTools }
        : mcp
    );
    onConfigurationChange(updatedMCPs);
    setShowPipedreamToolsManager(false);
    setSelectedMCPForTools(null);
  };

  const handleCustomToolsUpdate = (enabledTools: string[]) => {
    if (!selectedMCPForTools) return;
    
    const updatedMCPs = configuredMCPs.map(mcp => 
      mcp === selectedMCPForTools 
        ? { ...mcp, enabledTools }
        : mcp
    );
    onConfigurationChange(updatedMCPs);
    setShowCustomToolsManager(false);
    setSelectedMCPForTools(null);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto">
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
                <Store className="h-4 w-4" />
                Browse Apps
              </Button>
              <Button onClick={() => setShowCustomDialog(true)} variant="outline">
                <Server className="h-4 w-4" />
                Custom MCP
              </Button>
            </div>
          </div>
        )}
        
        {configuredMCPs.length > 0 && (
          <div className="space-y-4">
            <ConfiguredMcpList
              configuredMCPs={configuredMCPs}
              onEdit={handleEditMCP}
              onRemove={handleRemoveMCP}
              onConfigureTools={handleConfigureTools}
            />
          </div>
        )}
      </div>
      
      {configuredMCPs.length > 0 && (
        <div className="flex-shrink-0 pt-4">
          <div className="flex gap-2 justify-center">
            <Button onClick={() => setShowRegistryDialog(true)} variant="default">
              <Store className="h-4 w-4" />
              Browse Apps
            </Button>
            <Button onClick={() => setShowCustomDialog(true)} variant="outline">
              <Server className="h-4 w-4" />
              Custom MCP
            </Button>
          </div>
        </div>
      )}
      
      <Dialog open={showRegistryDialog} onOpenChange={setShowRegistryDialog}>
        <DialogContent className="p-0 max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>Select Integration</DialogTitle>
          </DialogHeader>
          <PipedreamRegistry showAgentSelector={false} selectedAgentId={selectedAgentId} onAgentChange={handleAgentChange} onToolsSelected={handleToolsSelected} versionData={versionData} />
        </DialogContent>
      </Dialog>
      <CustomMCPDialog
        open={showCustomDialog}
        onOpenChange={setShowCustomDialog}
        onSave={handleSaveCustomMCP}
      />
      {selectedMCPForTools && selectedMCPForTools.customType === 'pipedream' && (selectedMCPForTools.selectedProfileId || selectedMCPForTools.config?.profile_id) && (
        <ToolsManager
          mode="pipedream"
          agentId={selectedAgentId}
          profileId={selectedMCPForTools.selectedProfileId || selectedMCPForTools.config?.profile_id}
          appName={selectedMCPForTools.name}
          open={showPipedreamToolsManager}
          onOpenChange={setShowPipedreamToolsManager}
          onToolsUpdate={handlePipedreamToolsUpdate}
          versionData={versionData}
        />
      )}
      {selectedMCPForTools && selectedMCPForTools.customType !== 'pipedream' && (
        <ToolsManager
          mode="custom"
          agentId={selectedAgentId}
          mcpConfig={selectedMCPForTools.config}
          mcpName={selectedMCPForTools.name}
          open={showCustomToolsManager}
          onOpenChange={setShowCustomToolsManager}
          onToolsUpdate={handleCustomToolsUpdate}
          versionData={versionData}
        />
      )}
    </div>
  );
};