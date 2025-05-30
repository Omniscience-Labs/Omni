import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
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
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle>Configure {server.displayName || server.name}</DialogTitle>
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

            {serverDetails?.tools && serverDetails.tools.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Available Tools</h3>
                  <span className="text-xs text-muted-foreground">
                    {selectedTools.size} of {serverDetails.tools.length} selected
                  </span>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
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