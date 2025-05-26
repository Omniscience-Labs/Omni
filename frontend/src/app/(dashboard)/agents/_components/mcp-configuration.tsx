import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, Plus, Settings, ExternalLink, Shield, X, Sparkles, ChevronRight } from 'lucide-react';
import { usePopularMCPServers, useMCPServers, useMCPServerDetails } from '@/hooks/react-query/mcp/use-mcp-servers';
import { cn } from '@/lib/utils';

interface MCPConfiguration {
  name: string;
  qualifiedName: string;
  config: Record<string, any>;
  enabledTools?: string[];
}

interface MCPConfigurationProps {
  configuredMCPs: MCPConfiguration[];
  onConfigurationChange: (mcps: MCPConfiguration[]) => void;
}

interface ConfigDialogProps {
  server: any;
  existingConfig?: MCPConfiguration;
  onSave: (config: MCPConfiguration) => void;
  onCancel: () => void;
}

const ConfigDialog: React.FC<ConfigDialogProps> = ({ server, existingConfig, onSave, onCancel }) => {
  const [config, setConfig] = useState<Record<string, any>>(existingConfig?.config || {});
  const [selectedTools, setSelectedTools] = useState<Set<string>>(
    new Set(existingConfig?.enabledTools || [])
  );

  const { data: serverDetails, isLoading } = useMCPServerDetails(server.qualifiedName);

  const handleSave = () => {
    onSave({
      name: server.displayName || server.qualifiedName,
      qualifiedName: server.qualifiedName,
      config,
      enabledTools: Array.from(selectedTools),
    });
  };

  const handleToolToggle = (toolName: string) => {
    const newTools = new Set(selectedTools);
    if (newTools.has(toolName)) {
      newTools.delete(toolName);
    } else {
      newTools.add(toolName);
    }
    setSelectedTools(newTools);
  };

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle>Configure {server.displayName}</DialogTitle>
        <DialogDescription>
          Set up the connection and select which tools to enable for this MCP server.
        </DialogDescription>
      </DialogHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <ScrollArea className="flex-1 px-1">
          <div className="space-y-6">
            {serverDetails?.connections?.[0]?.configSchema?.properties && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Connection Settings</h3>
                {Object.entries(serverDetails.connections[0].configSchema.properties).map(([key, schema]: [string, any]) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={key}>
                      {schema.title || key}
                      {serverDetails.connections[0].configSchema.required?.includes(key) && (
                        <span className="text-destructive ml-1">*</span>
                      )}
                    </Label>
                    <Input
                      id={key}
                      type={schema.format === 'password' ? 'password' : 'text'}
                      placeholder={schema.description || `Enter ${key}`}
                      value={config[key] || ''}
                      onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
                    />
                    {schema.description && (
                      <p className="text-xs text-muted-foreground">{schema.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Tools Selection */}
            {serverDetails?.tools && serverDetails.tools.length > 0 && (
              <div className="space-y-4 overflow-y-auto max-h-[500px] scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Available Tools</h3>
                  <span className="text-xs text-muted-foreground">
                    {selectedTools.size} of {serverDetails.tools.length} selected
                  </span>
                </div>
                <div className="space-y-2">
                  {serverDetails.tools.map((tool: any) => (
                    <div
                      key={tool.name}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        selectedTools.has(tool.name)
                          ? "bg-primary/5 border-primary"
                          : "hover:bg-muted/50"
                      )}
                      onClick={() => handleToolToggle(tool.name)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTools.has(tool.name)}
                        onChange={() => {}}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{tool.name}</div>
                        {tool.description && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {tool.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          onClick={handleSave}
          disabled={isLoading}
        >
          Save Configuration
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export const MCPConfiguration: React.FC<MCPConfigurationProps> = ({
  configuredMCPs,
  onConfigurationChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showBrowseDialog, setShowBrowseDialog] = useState(false);
  const [configuringServer, setConfiguringServer] = useState<any>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const { data: popularServers } = usePopularMCPServers();
  const { data: searchResults, isLoading: isSearching } = useMCPServers(
    searchQuery.length > 2 ? searchQuery : undefined
  );

  const handleAddMCP = (server: any) => {
    setConfiguringServer(server);
    setEditingIndex(null);
  };

  const handleEditMCP = (index: number) => {
    const mcp = configuredMCPs[index];
    setConfiguringServer({
      qualifiedName: mcp.qualifiedName,
      displayName: mcp.name,
    });
    setEditingIndex(index);
  };

  const handleRemoveMCP = (index: number) => {
    const newMCPs = [...configuredMCPs];
    newMCPs.splice(index, 1);
    onConfigurationChange(newMCPs);
  };

  const handleSaveConfiguration = (config: MCPConfiguration) => {
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

      {/* Configured MCPs */}
      {configuredMCPs.length > 0 && (
        <div className="space-y-2">
          {configuredMCPs.map((mcp, index) => (
            <Card key={index} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{mcp.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {mcp.enabledTools?.length || 0} tools enabled
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEditMCP(index)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveMCP(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Browse MCP Servers Dialog */}
      <Dialog open={showBrowseDialog} onOpenChange={setShowBrowseDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Browse MCP Servers</DialogTitle>
            <DialogDescription>
              Discover and add Model Context Protocol servers from Smithery
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search MCP servers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-4 p-1">
              {!searchQuery && popularServers && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">Popular Servers</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {popularServers.servers.map((server) => (
                      <Card
                        key={server.qualifiedName}
                        className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => handleAddMCP(server)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="text-2xl">{server.icon}</div>
                          <div className="flex-1">
                            <h4 className="font-medium text-sm">{server.displayName}</h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              {server.description}
                            </p>
                            <Badge variant="outline" className="mt-2 text-xs">
                              {server.category}
                            </Badge>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {searchQuery && (
                <div className="space-y-3">
                  {isSearching ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : searchResults?.servers && searchResults.servers.length > 0 ? (
                    <>
                      <h3 className="text-sm font-semibold text-muted-foreground">
                        Search Results ({searchResults.pagination.totalCount})
                      </h3>
                      <div className="space-y-2">
                        {searchResults.servers.map((server) => (
                          <Card
                            key={server.qualifiedName}
                            className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => handleAddMCP(server)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium text-sm">{server.displayName}</h4>
                                  {server.security?.scanPassed && (
                                    <Shield className="h-3 w-3 text-green-500" />
                                  )}
                                  {server.isDeployed && (
                                    <Badge variant="secondary" className="text-xs">
                                      Deployed
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {server.description}
                                </p>
                                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                  <span>{server.qualifiedName}</span>
                                  <span>Used {server.useCount} times</span>
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </Card>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">No servers found</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Configuration Dialog */}
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