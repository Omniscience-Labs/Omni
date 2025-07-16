import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { AlertTriangle, MoreHorizontal, Edit2, Check, ChevronsUpDown } from 'lucide-react';
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
} from '@/components/ui/command';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReactFlow } from '@xyflow/react';

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
  const [editData, setEditData] = useState({
    name: data.name || '',
    description: data.description || '',
    tool: data.tool || '',
  });

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
              hasIssues: !editData.name || editData.name === 'New Step',
            },
          };
        }
        return node;
      })
    );
    setIsEditOpen(false);
  };

  const getDisplayToolName = (toolName: string) => {
    if (!toolName) return null;
    
    if (data.agentTools) {
      const agentpressTool = data.agentTools.agentpress_tools?.find((t: any) => t.name === toolName);
      if (agentpressTool) {
        return normalizeToolName(agentpressTool.name, 'agentpress');
      }
      
      const mcpTool = data.agentTools.mcp_tools?.find((t: any) => 
        `${t.server}:${t.name}` === toolName || t.name === toolName
      );
      if (mcpTool) {
        return normalizeToolName(mcpTool.name, 'mcp');
      }
    }
    
    return toolName;
  };

  return (
    <div 
      className={`react-flow__node-step ${selected ? 'selected' : ''}`}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="workflow-node-content">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {data.hasIssues && (
                <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
              )}
              <h3 className="font-medium text-sm">
                {data.name} {data.stepNumber ? data.stepNumber : ''}
              </h3>
            </div>
            {data.description && (
              <p className="text-xs text-muted-foreground mt-1">{data.description}</p>
            )}
            {data.tool && (
              <div className="text-xs text-primary mt-2">
                🔧 {getDisplayToolName(data.tool)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
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
                      placeholder="Step description (optional)"
                      rows={2}
                      className="resize-none text-sm"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Tool (optional)</Label>
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
                      <PopoverContent className="w-[280px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search tools..." className="h-8" />
                          <CommandEmpty>No tools found.</CommandEmpty>
                          <CommandList>
                            {data.isLoadingTools ? (
                              <CommandItem disabled>Loading tools...</CommandItem>
                            ) : data.agentTools ? (
                              <>
                                {data.agentTools.agentpress_tools?.filter((tool: any) => tool.enabled).length > 0 && (
                                  <CommandGroup heading="Default Tools">
                                    {data.agentTools.agentpress_tools.filter((tool: any) => tool.enabled).map((tool: any) => (
                                      <CommandItem
                                        key={tool.name}
                                        value={`${normalizeToolName(tool.name, 'agentpress')} ${tool.name}`}
                                        onSelect={() => {
                                          setEditData({ ...editData, tool: tool.name });
                                          setIsToolSelectOpen(false);
                                        }}
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
                                {data.agentTools.mcp_tools?.length > 0 && (
                                  <CommandGroup heading="External Tools">
                                    {data.agentTools.mcp_tools.map((tool: any) => (
                                      <CommandItem
                                        key={`${tool.server || 'default'}-${tool.name}`}
                                        value={`${normalizeToolName(tool.name, 'mcp')} ${tool.name} ${tool.server || ''}`}
                                        onSelect={() => {
                                          setEditData({ ...editData, tool: tool.server ? `${tool.server}:${tool.name}` : tool.name });
                                          setIsToolSelectOpen(false);
                                        }}
                                      >
                                        <div className="flex items-center gap-2">
                                          <span>{tool.icon || '🔧'}</span>
                                          <span>{normalizeToolName(tool.name, 'mcp')}</span>
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
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
};

export default memo(StepNode); 