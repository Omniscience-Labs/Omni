import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { MCPConfigurationProps, MCPConfiguration as MCPConfigurationType } from './types';
import { ConfiguredMcpList } from './configured-mcp-list';
import { BrowseDialog } from './browse-dialog';
import { ConfigDialog } from './config-dialog';

export const MCPConfigurationNew: React.FC<MCPConfigurationProps> = ({
  configuredMCPs,
  onConfigurationChange,
}) => {
  const [showBrowseDialog, setShowBrowseDialog] = useState(false);
  const [configuringServer, setConfiguringServer] = useState<any>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleAddMCP = (server: any) => {
    setConfiguringServer(server);
    setEditingIndex(null);
    setShowBrowseDialog(false);
  };

  const handleEditMCP = (index: number) => {
    const mcp = configuredMCPs[index];
    setConfiguringServer({
      qualifiedName: mcp.qualifiedName,
      displayName: mcp.name,
      name: mcp.name,
    });
    setEditingIndex(index);
  };

  const handleRemoveMCP = (index: number) => {
    const newMCPs = [...configuredMCPs];
    newMCPs.splice(index, 1);
    onConfigurationChange(newMCPs);
  };

  const handleSaveConfiguration = (config: MCPConfigurationType) => {
    if (editingIndex !== null) {
      const newMCPs = [...configuredMCPs];
      newMCPs[editingIndex] = config;
      onConfigurationChange(newMCPs);
    } else {
      onConfigurationChange([...configuredMCPs, config]);
    }
    setConfiguringServer(null);
    setEditingIndex(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">MCP Servers</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Connect Model Context Protocol servers to extend agent capabilities
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowBrowseDialog(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add MCP
        </Button>
      </div>
      <ConfiguredMcpList
        configuredMCPs={configuredMCPs}
        onEdit={handleEditMCP}
        onRemove={handleRemoveMCP}
      />
      <BrowseDialog
        open={showBrowseDialog}
        onOpenChange={setShowBrowseDialog}
        onServerSelect={handleAddMCP}
      />
      {configuringServer && (
        <Dialog open={!!configuringServer} onOpenChange={() => setConfiguringServer(null)}>
          <ConfigDialog
            server={configuringServer}
            existingConfig={editingIndex !== null ? configuredMCPs[editingIndex] : undefined}
            onSave={handleSaveConfiguration}
            onCancel={() => setConfiguringServer(null)}
          />
        </Dialog>
      )}
    </div>
  );
};