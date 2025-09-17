import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Settings } from 'lucide-react';
import { AGENTPRESS_TOOL_DEFINITIONS, getToolDisplayName } from './tools';
import { toast } from 'sonner';
import { CustomAutomationConfigDialog } from './custom-automation/custom-automation-config-dialog';

interface AgentToolsConfigurationProps {
  tools: Record<string, boolean | { enabled: boolean; description: string }>;
  onToolsChange: (tools: Record<string, boolean | { enabled: boolean; description: string }>) => void;
  disabled?: boolean;
  isSunaAgent?: boolean;
  isLoading?: boolean;
}

export const AgentToolsConfiguration = ({ tools, onToolsChange, disabled = false, isSunaAgent = false, isLoading = false }: AgentToolsConfigurationProps) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showCustomAutomationConfig, setShowCustomAutomationConfig] = useState(false);

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
        description: "Omni's default tools are managed centrally and cannot be changed.",
      });
      return;
    }
    
    if (isLoading) {
      return;
    }

    // For custom automation tool, show configuration dialog when enabling
    if (toolName === 'custom_automation_tool' && enabled && !isToolEnabled(tools[toolName])) {
      setShowCustomAutomationConfig(true);
      return;
    }
    
    const updatedTools = {
      ...tools,
      [toolName]: createToolValue(enabled, tools[toolName])
    };
    onToolsChange(updatedTools);
  };

  const handleCustomAutomationSave = async (config: any) => {
    // Enable the tool after successful configuration
    const updatedTools = {
      ...tools,
      'custom_automation_tool': createToolValue(true, tools['custom_automation_tool'])
    };
    onToolsChange(updatedTools);
    toast.success('Custom automation configured successfully');
  };

  const handleConfigureCustomAutomation = () => {
    setShowCustomAutomationConfig(true);
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
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Search tools..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tools List with Scrolling */}
      <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
          {getFilteredTools().map(([toolName, toolInfo]) => (
            <div 
              key={toolName} 
              className="group border bg-card rounded-2xl p-4 transition-all duration-200 hover:bg-muted/50"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl ${toolInfo.color} border flex items-center justify-center flex-shrink-0`}>
                  <span className="text-lg">{toolInfo.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm leading-tight truncate mb-1">
                    {getToolDisplayName(toolName)}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {toolInfo.description}
                  </p>
                </div>
              </div>
              
              <div className="flex justify-end items-center gap-2">
                {toolName === 'custom_automation_tool' && isToolEnabled(tools[toolName]) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleConfigureCustomAutomation}
                    className="h-8 px-3 text-xs"
                    disabled={disabled || isLoading}
                  >
                    <Settings className="h-3 w-3 mr-1" />
                    Configure
                  </Button>
                )}
                <Switch
                  checked={isToolEnabled(tools[toolName])}
                  onCheckedChange={(checked) => handleToolToggle(toolName, checked)}
                  disabled={disabled || isLoading}
                />
              </div>
            </div>
          ))}
          
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

      <CustomAutomationConfigDialog
        open={showCustomAutomationConfig}
        onOpenChange={setShowCustomAutomationConfig}
        onSave={handleCustomAutomationSave}
      />
    </div>
  );
}; 