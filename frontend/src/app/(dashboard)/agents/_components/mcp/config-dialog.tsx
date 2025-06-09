import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Save, Sparkles } from 'lucide-react';
import { useMCPServerDetails } from '@/hooks/react-query/mcp/use-mcp-servers';
import { cn } from '@/lib/utils';
import { MCPConfiguration } from './types';

interface ConfigDialogProps {
  server: any;
  existingConfig?: MCPConfiguration;
  onSave: (config: MCPConfiguration) => void;
  onCancel: () => void;
}

export const ConfigDialog: React.FC<ConfigDialogProps> = ({ 
  server, 
  existingConfig, 
  onSave, 
  onCancel 
}) => {
  const [config, setConfig] = useState<Record<string, any>>(existingConfig?.config || {});
  const [selectedTools, setSelectedTools] = useState<Set<string>>(
    new Set(existingConfig?.enabledTools || [])
  );

  const { data: serverDetails, isLoading } = useMCPServerDetails(server.qualifiedName);

  const handleSave = () => {
    onSave({
      name: server.displayName || server.name || server.qualifiedName,
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
    <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
      <DialogHeader className="flex-shrink-0">
        <div className="flex items-center gap-3 mb-2">
          {server.iconUrl ? (
            <div className="relative">
              <img 
                src={server.iconUrl} 
                alt={server.displayName || server.name} 
                className="w-8 h-8 rounded-lg shadow-sm" 
              />
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-lg pointer-events-none" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shadow-sm border border-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
          )}
          <div>
            <DialogTitle className="text-lg">Configure {server.displayName || server.name}</DialogTitle>
          </div>
        </div>
        <DialogDescription>
          Set up the connection and select which tools to enable for this MCP server.
        </DialogDescription>
      </DialogHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-6 px-1">
          <div className="flex flex-col min-h-0">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <div className="w-1 h-4 bg-primary rounded-full" />
              Connection Settings
            </h3>
            {serverDetails?.connections?.[0]?.configSchema?.properties ? (
              <ScrollArea className="border bg-muted/30 rounded-lg p-4 flex-1 min-h-0">
                <div>
                  {Object.entries(serverDetails.connections[0].configSchema.properties).map(([key, schema]: [string, any]) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={key} className="text-sm font-medium">
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
                        className="bg-background"
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <p className="text-sm">No configuration required</p>
              </div>
            )}
          </div>

          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <div className="w-1 h-4 bg-primary rounded-full" />
                Available Tools
              </h3>
              {serverDetails?.tools && serverDetails.tools.length > 0 && (
                <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">
                  {selectedTools.size} of {serverDetails.tools.length} selected
                </span>
              )}
            </div>
            {serverDetails?.tools && serverDetails.tools.length > 0 ? (
              <ScrollArea className="-mt-1 border bg-muted/30 rounded-lg p-4 flex-1 min-h-0">
                <div>
                  <div className="space-y-2">
                    {serverDetails.tools.map((tool: any) => (
                      <div
                        key={tool.name}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200",
                          selectedTools.has(tool.name)
                            ? "bg-primary/10 border-primary/30 shadow-sm"
                            : "hover:bg-muted/30 border-border/50 hover:border-border"
                        )}
                        onClick={() => handleToolToggle(tool.name)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTools.has(tool.name)}
                          onChange={() => {}}
                          className="mt-1 accent-primary"
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
              </ScrollArea>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <p className="text-sm">No tools available</p>
              </div>
            )}
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          onClick={handleSave}
          disabled={isLoading}
          className="bg-primary hover:bg-primary/90"
        >
          <Save className="h-4 w-4" />
          Save Configuration
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};