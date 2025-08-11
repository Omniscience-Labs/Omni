import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Search } from 'lucide-react';
import { AGENTPRESS_TOOL_DEFINITIONS, getToolDisplayName } from './tools';
import { toast } from 'sonner';

interface AgentToolsConfigurationProps {
  tools: Record<string, boolean | { enabled: boolean; description: string }>;
  onToolsChange: (tools: Record<string, boolean | { enabled: boolean; description: string }>) => void;
  disabled?: boolean;
  isSunaAgent?: boolean;
}

export const AgentToolsConfiguration = ({ tools, onToolsChange, disabled = false, isSunaAgent = false }: AgentToolsConfigurationProps) => {
  const [searchQuery, setSearchQuery] = useState<string>('');

  const isToolEnabled = (tool: boolean | { enabled: boolean; description: string } | undefined): boolean => {
    if (tool === undefined) return false;
    if (typeof tool === 'boolean') return tool;
    return tool.enabled;
  };

  const createToolValue = (enabled: boolean, existingTool: boolean | { enabled: boolean; description: string } | undefined) => {
    if (typeof existingTool === 'boolean' || existingTool === undefined) {
      return enabled;
    }
    return { ...existingTool, enabled };
  };

  const handleToolToggle = (toolName: string, enabled: boolean) => {
    if (disabled && isSunaAgent) {
      toast.error("Tools cannot be modified", {
        description: "Suna's default tools are managed centrally and cannot be changed.",
      });
      return;
    }
    
    const updatedTools = {
      ...tools,
      [toolName]: createToolValue(enabled, tools[toolName])
    };
    onToolsChange(updatedTools);
  };

  const getSelectedToolsCount = (): number => {
    return Object.values(tools).filter(tool => isToolEnabled(tool)).length;
  };

  const getFilteredTools = (): Array<[string, any]> => {
    let toolEntries = Object.entries(AGENTPRESS_TOOL_DEFINITIONS);
    
    if (searchQuery) {
      toolEntries = toolEntries.filter(([toolName, toolInfo]) => 
        getToolDisplayName(toolName).toLowerCase().includes(searchQuery.toLowerCase()) ||
        toolInfo.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    return toolEntries;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Default Tools</h3>
          <p className="text-xs text-muted-foreground">Configure default agentpress tools • {getSelectedToolsCount()} selected</p>
        </div>
      </div>
      <div>
        <div className="space-y-2">
          {getFilteredTools().map(([toolName, toolInfo]) => (
            <div 
              key={toolName} 
              className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center space-x-4 flex-1">
                <div className={`w-10 h-10 rounded-lg ${toolInfo.color} border flex items-center justify-center flex-shrink-0`}>
                  <span className="text-lg">{toolInfo.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <h4 className="text-sm font-medium truncate">
                      {getToolDisplayName(toolName)}
                    </h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {toolInfo.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center flex-shrink-0">
                <Switch
                  checked={isToolEnabled(tools[toolName])}
                  onCheckedChange={(checked) => handleToolToggle(toolName, checked)}
                  disabled={disabled}
                />
              </div>
            </div>
          ))}
        </div>

        {getFilteredTools().length === 0 && (
          <div className="text-center py-12 px-6 bg-muted/30 rounded-xl border-2 border-dashed border-border">
            <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4 border">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <h4 className="text-sm font-semibold text-foreground mb-2">
              No tools found
            </h4>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Try adjusting your search criteria
            </p>
          </div>
        )}
      </div>
    </div>
  );
}; 