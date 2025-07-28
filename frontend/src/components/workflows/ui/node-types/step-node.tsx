import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { AlertTriangle, MoreHorizontal, Edit2, Check, ChevronsUpDown, Plus, Store, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReactFlow } from '@xyflow/react';
import { toast } from 'sonner';

// Import agent configuration components
import { PipedreamRegistry } from '@/components/agents/pipedream/pipedream-registry';
import { CustomMCPDialog } from '@/components/agents/mcp/custom-mcp-dialog';
import { useAgent, useUpdateAgent } from '@/hooks/react-query/agents/use-agents';
import { useQueryClient } from '@tanstack/react-query';

const normalizeToolName = (toolName: string, toolType: 'agentpress' | 'mcp') => {
  if (toolType === 'agentpress') {
    const agentPressMapping: Record<string, string> = {
      'sb_shell_tool': 'Shell Tool',
      'sb_files_tool': 'Files Tool',
      'sb_browser_tool': 'Browser Tool',
      'sb_deploy_tool': 'Deploy Tool',
      'sb_expose_tool': 'Expose Tool',
      'web_search_tool': 'Web Search',
      'sb_vision_tool': 'Vision Tool',
      'data_providers_tool': 'Data Providers',
    };
    return agentPressMapping[toolName] || toolName;
  } else {
    return toolName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
};

const StepNode = ({ id, data, selected }: any) => {
  const { setNodes } = useReactFlow();
  
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isToolSelectOpen, setIsToolSelectOpen] = useState(false);
  const [showPipedreamRegistry, setShowPipedreamRegistry] = useState(false);
  const [showCustomMCPDialog, setShowCustomMCPDialog] = useState(false);
  const [editData, setEditData] = useState({
    name: data.name || '',
    description: data.description || '',
    tool: data.tool || '',
  });

  const agentId = (data.agentId || '').toString();
  const { data: agent } = useAgent(agentId);
  const updateAgentMutation = useUpdateAgent();
  const queryClient = useQueryClient();
  
  const agentTools = data.agentTools || { agentpress_tools: [], mcp_tools: [] };
  
  const versionData = data.versionData;
  const onToolsUpdate = data.onToolsUpdate;
  
  const handleSave = () => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              name: editData.name,
              description: editData.description,
              tool: editData.tool,
              hasIssues: !editData.name || editData.name === 'New Step' || !editData.description,
            },
          };
        }
        return node;
      })
    );
    setIsEditOpen(false);
  };

  const handleToolSelect = (toolName: string) => {
    setEditData({ ...editData, tool: toolName });
    setIsToolSelectOpen(false);
  };

  const handlePipedreamToolsSelected = async (profileId: string, selectedTools: string[], appName: string, appSlug: string) => {
    try {
      const pipedreamMCP = {
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
        selectedProfileId: profileId
      };

      // Update agent with new MCP
      const existingCustomMCPs = agent?.custom_mcps || [];
      const nonPipedreamMCPs = existingCustomMCPs.filter((mcp: any) => 
        mcp.type !== 'pipedream' || mcp.config?.profile_id !== profileId
      );

      await updateAgentMutation.mutateAsync({
        agentId,
        custom_mcps: [
          ...nonPipedreamMCPs,
          {
            name: appName,
            type: 'json',
            config: pipedreamMCP.config,
            enabledTools: selectedTools
          }
        ]
      });

      // Auto-select the first tool
      if (selectedTools.length > 0) {
        setEditData({ ...editData, tool: `pipedream_${appSlug}:${selectedTools[0]}` });
      }

      // Invalidate queries to refresh tools
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent-tools', agentId] });
      
      // Trigger parent tools update
      if (onToolsUpdate) {
        onToolsUpdate();
      }
      
      setShowPipedreamRegistry(false);
      toast.success(`Added ${selectedTools.length} tools from ${appName}!`);
    } catch (error) {
      toast.error('Failed to add integration');
    }
  };

  const handleCustomMCPSave = async (customConfig: any) => {
    try {
      const existingCustomMCPs = agent?.custom_mcps || [];
      
      await updateAgentMutation.mutateAsync({
        agentId,
        custom_mcps: [
          ...existingCustomMCPs,
          {
            name: customConfig.name,
            type: customConfig.type,
            config: customConfig.config,
            enabledTools: customConfig.enabledTools
          }
        ]
      });

      // Auto-select the first tool
      if (customConfig.enabledTools.length > 0) {
        setEditData({ ...editData, tool: `${customConfig.name}:${customConfig.enabledTools[0]}` });
      }

      // Invalidate queries to refresh tools
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent-tools', agentId] });
      
      // Trigger parent tools update
      if (onToolsUpdate) {
        onToolsUpdate();
      }
      
      setShowCustomMCPDialog(false);
      toast.success('Custom MCP server added successfully');
    } catch (error) {
      toast.error('Failed to add custom MCP server');
    }
  };

  const getDisplayToolName = (toolName: string) => {
    if (!toolName) return null;
    
    // Check in agentTools prop first
    const agentpressTool = agentTools.agentpress_tools?.find((t: any) => t.name === toolName);
    if (agentpressTool) {
      return normalizeToolName(agentpressTool.name, 'agentpress');
    }
    
    const mcpTool = agentTools.mcp_tools?.find((t: any) => 
      `${t.server}:${t.name}` === toolName || t.name === toolName
    );
    if (mcpTool) {
      return normalizeToolName(mcpTool.name, 'mcp');
    }
    
    return toolName;
  };

  // Get comprehensive tool stats
  const getToolStats = () => {
    const agentpressCount = agentTools.agentpress_tools?.filter((t: any) => t.enabled).length || 0;
    const mcpCount = agentTools.mcp_tools?.length || 0;
    return { agentpressCount, mcpCount, total: agentpressCount + mcpCount };
  };

  const stats = getToolStats();

  return (
    <div 
      className={cn(
        "react-flow__node-step",
        selected && "selected",
        data.hasIssues && "has-issues"
      )}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        className="react-flow__handle"
      />
      <div className="node-content">
        <div className="node-header">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {data.hasIssues && (
                <AlertTriangle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
              )}
              <h3 className="node-title">
                {data.name || 'Unnamed Step'}
              </h3>
            </div>
          </div>
          <div className="node-actions">
            <Popover open={isEditOpen} onOpenChange={setIsEditOpen}>
                <PopoverTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
              <PopoverContent className="w-80" align="end" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium text-sm mb-3">Edit Step</h3>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={editData.name}
                      onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                      placeholder="Step name"
                      className="h-8"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Description</Label>
                    <Textarea
                      value={editData.description}
                      onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                      placeholder="Step description"
                      rows={2}
                      className="resize-none text-sm"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Tool</Label>
                      <span className="text-xs text-muted-foreground">
                        {stats.total} available
                      </span>
                    </div>
                    <Popover open={isToolSelectOpen} onOpenChange={setIsToolSelectOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={isToolSelectOpen}
                          className="w-full justify-between h-8 text-sm"
                        >
                          {editData.tool ? (
                            <span className="text-sm">{getDisplayToolName(editData.tool)}</span>
                          ) : (
                            <span className="text-muted-foreground">Select tool</span>
                          )}
                          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[320px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search tools..." className="h-8" />
                          <CommandEmpty>No tools found.</CommandEmpty>
                          <CommandList>
                            {!agent ? (
                              <CommandItem disabled>Loading tools...</CommandItem>
                            ) : stats.total > 0 ? (
                              <>
                                {agentTools.agentpress_tools?.filter((tool: any) => tool.enabled).length > 0 && (
                                  <CommandGroup heading={`Default Tools (${agentTools.agentpress_tools.filter((tool: any) => tool.enabled).length})`}>
                                    {agentTools.agentpress_tools.filter((tool: any) => tool.enabled).map((tool: any) => (
                                      <CommandItem
                                        key={tool.name}
                                        value={`${normalizeToolName(tool.name, 'agentpress')} ${tool.name}`}
                                        onSelect={() => handleToolSelect(tool.name)}
                                      >
                                        <div className="flex items-center gap-2">
                                          <span>{tool.icon || '🔧'}</span>
                                          <span>{normalizeToolName(tool.name, 'agentpress')}</span>
                                        </div>
                                        <Check
                                          className={cn(
                                            "ml-auto h-3 w-3",
                                            editData.tool === tool.name ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                                {agentTools.mcp_tools?.length > 0 && (
                                  <CommandGroup heading={`Integrations (${agentTools.mcp_tools.length})`}>
                                    {agentTools.mcp_tools.map((tool: any) => (
                                      <CommandItem
                                        key={`${tool.server || 'default'}-${tool.name}`}
                                        value={`${normalizeToolName(tool.name, 'mcp')} ${tool.name} ${tool.server || ''}`}
                                        onSelect={() => handleToolSelect(tool.server ? `${tool.server}:${tool.name}` : tool.name)}
                                      >
                                        <div className="flex items-center gap-2">
                                          <span>{tool.icon || '🔧'}</span>
                                          <div className="flex flex-col">
                                            <span>{normalizeToolName(tool.name, 'mcp')}</span>
                                            {tool.server && (
                                              <span className="text-xs text-muted-foreground">{tool.server}</span>
                                            )}
                                          </div>
                                        </div>
                                        <Check
                                          className={cn(
                                            "ml-auto h-3 w-3",
                                            editData.tool === (tool.server ? `${tool.server}:${tool.name}` : tool.name) ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                                <CommandSeparator />
                                <CommandGroup heading="Add New">
                                  <CommandItem
                                    onSelect={() => {
                                      setIsToolSelectOpen(false);
                                      setShowPipedreamRegistry(true);
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <Store className="h-4 w-4 text-blue-500" />
                                      <div className="flex flex-col">
                                        <span>Browse App Registry</span>
                                        <span className="text-xs text-muted-foreground">GitHub, Slack, Google Drive...</span>
                                      </div>
                                    </div>
                                    <Plus className="ml-auto h-3 w-3" />
                                  </CommandItem>
                                  <CommandItem
                                    onSelect={() => {
                                      setIsToolSelectOpen(false);
                                      setShowCustomMCPDialog(true);
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <Server className="h-4 w-4 text-green-500" />
                                      <div className="flex flex-col">
                                        <span>Add Custom MCP</span>
                                        <span className="text-xs text-muted-foreground">Connect custom APIs</span>
                                      </div>
                                    </div>
                                    <Plus className="ml-auto h-3 w-3" />
                                  </CommandItem>
                                </CommandGroup>
                              </>
                            ) : (
                              <CommandItem disabled>No tools available</CommandItem>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditData({
                          name: data.name || '',
                          description: data.description || '',
                          tool: data.tool || '',
                        });
                        setIsEditOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-1" align="end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onDelete(id);
                  }}
                  className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete step
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        
        {/* Node Description */}
        {data.description && (
          <p className="node-description">{data.description}</p>
        )}
        
        {/* Tool Badge */}
        {data.tool && (
          <div className="node-tool-badge">
            <span className="text-xs">🔧</span>
            <span>{getDisplayToolName(data.tool)}</span>
          </div>
        )}
        
        {/* Error indicator */}
        {data.hasIssues && (
          <div className="node-error">Please configure this step</div>
        )}
      </div>
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="react-flow__handle"
      />

      {/* Pipedream Registry Dialog */}
      <Dialog open={showPipedreamRegistry} onOpenChange={setShowPipedreamRegistry}>
        <DialogContent className="p-0 max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>Browse App Registry</DialogTitle>
          </DialogHeader>
                     <PipedreamRegistry
             showAgentSelector={false}
             selectedAgentId={agentId}
             onAgentChange={() => {}}
             onToolsSelected={handlePipedreamToolsSelected}
             versionData={versionData ? {
               configured_mcps: versionData.configured_mcps || [],
               custom_mcps: versionData.custom_mcps || [],
               system_prompt: versionData.system_prompt || '',
               agentpress_tools: versionData.agentpress_tools || {}
             } : undefined}
             versionId={versionData?.version_id || 'current'}
           />
        </DialogContent>
      </Dialog>

      {/* Custom MCP Dialog */}
      <CustomMCPDialog
        open={showCustomMCPDialog}
        onOpenChange={setShowCustomMCPDialog}
        onSave={handleCustomMCPSave}
      />
    </div>
  );
};

export default memo(StepNode); 