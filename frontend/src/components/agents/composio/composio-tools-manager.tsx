import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Save, AlertCircle, Zap, CheckCircle2, Settings2, Loader2 } from 'lucide-react';
import { useComposioProfiles } from '@/hooks/react-query/composio/use-composio-profiles';
import { useComposioToolkitIcon } from '@/hooks/react-query/composio/use-composio';
import { backendApi } from '@/lib/api-client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { composioApi } from '@/hooks/react-query/composio/utils';

interface ComposioToolsManagerProps {
  agentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId?: string;
  profileInfo?: {
    profile_id: string;
    profile_name: string;
    toolkit_name: string;
    toolkit_slug: string;
  };
  appLogo?: string;
  onToolsUpdate?: () => void;
}

interface Tool {
  name: string;
  description: string;
  parameters: any;
}

const ToolCard = ({ tool, isSelected, onToggle, searchTerm }: {
  tool: Tool;
  isSelected: boolean;
  onToggle: () => void;
  searchTerm: string;
}) => {
  const highlightText = (text: string, term: string) => {
    if (!term) return text;
    const regex = new RegExp(`(${term})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-900/50">{part}</mark> : part
    );
  };

  return (
    <Card className={cn(
      "group cursor-pointer transition-all p-0 shadow-none bg-card hover:bg-muted/50",
      isSelected && "bg-primary/10 ring-1 ring-primary/20"
    )}>
      <CardContent className="p-4" onClick={onToggle}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-medium text-sm truncate">
                {highlightText(tool.name, searchTerm)}
              </h3>
            </div>
            
            <p className="text-xs text-muted-foreground line-clamp-2">
              {highlightText(tool.description || 'No description available', searchTerm)}
            </p>
            
            {tool.parameters?.properties && (
              <div className="mt-2">
                <Badge variant="outline" className="text-xs">
                  {Object.keys(tool.parameters.properties).length} parameters
                </Badge>
              </div>
            )}
          </div>
          
          <div className="flex-shrink-0 ml-2">
            <Switch
              checked={isSelected}
              onCheckedChange={() => {}}
              onClick={(e) => e.stopPropagation()}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const ToolSkeleton = () => (
  <Card className="shadow-none p-0 bg-muted/30">
    <CardContent className="p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="h-6 w-11 rounded-full flex-shrink-0" />
      </div>
    </CardContent>
  </Card>
);

export const ComposioToolsManager: React.FC<ComposioToolsManagerProps> = ({
  agentId,
  open,
  onOpenChange,
  profileId,
  profileInfo,
  onToolsUpdate,
  appLogo,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data: profiles } = useComposioProfiles();

  const currentProfile = profileInfo || profiles?.find(p => p.profile_id === profileId);
  const { data: iconData } = useComposioToolkitIcon(currentProfile?.toolkit_slug || '', {
    enabled: !!currentProfile?.toolkit_slug
  });

  const filteredTools = useMemo(() => {
    if (!searchTerm) return availableTools;
    const term = searchTerm.toLowerCase();
    return availableTools.filter(tool =>
      tool.name.toLowerCase().includes(term) ||
      (tool.description && tool.description.toLowerCase().includes(term))
    );
  }, [availableTools, searchTerm]);

  useEffect(() => {
    if (open && currentProfile) {
      loadTools();
      loadCurrentAgentTools();
    }
  }, [open, currentProfile?.profile_id]);

  const loadTools = async () => {
    if (!currentProfile) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await composioApi.discoverTools(currentProfile.profile_id);
      if (response.success && response.tools) {
        setAvailableTools(response.tools);
      } else {
        setError('Failed to load available tools');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load tools');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCurrentAgentTools = async () => {
    try {
      const response = await backendApi.get(`/agents/${agentId}`);
      if (response.success && response.data) {
        const agent = response.data;
        const composioMcps = agent.custom_mcps?.filter((mcp: any) => 
          mcp.type === 'composio' && mcp.config?.profile_id === currentProfile?.profile_id
        ) || [];
        
        const enabledTools = composioMcps.flatMap((mcp: any) => mcp.enabledTools || []);
        setSelectedTools(enabledTools);
      }
    } catch (err) {
      console.error('Failed to load current agent tools:', err);
    }
  };

  const handleToolToggle = (toolName: string) => {
    setSelectedTools(prev => 
      prev.includes(toolName)
        ? prev.filter(t => t !== toolName)
        : [...prev, toolName]
    );
  };

  const handleSelectAll = () => {
    const allToolNames = filteredTools.map(tool => tool.name);
    setSelectedTools(prev => {
      const hasAll = allToolNames.every(name => prev.includes(name));
      if (hasAll) {
        return prev.filter(name => !allToolNames.includes(name));
      } else {
        const newSelected = [...prev];
        allToolNames.forEach(name => {
          if (!newSelected.includes(name)) {
            newSelected.push(name);
          }
        });
        return newSelected;
      }
    });
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const mcpConfigResponse = await composioApi.getMcpConfigForProfile(currentProfile.profile_id);
      const response = await backendApi.put(`/agents/${agentId}/custom-mcp-tools`, {
        custom_mcps: [{
          ...mcpConfigResponse.mcp_config,
          enabledTools: selectedTools
        }]
      });
      if (response.data.success) {
        toast.success(`Added ${selectedTools.length} ${currentProfile.toolkit_name} tools to your agent!`);
        onToolsUpdate?.();
        onOpenChange(false);
      }
    } catch (error: any) {
      console.error('Failed to save tools:', error);
      toast.error(error.response?.data?.detail || 'Failed to save tools');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCount = selectedTools.length;
  const filteredSelectedCount = filteredTools.filter(tool => selectedTools.includes(tool.name)).length;
  const allFilteredSelected = filteredTools.length > 0 && filteredSelectedCount === filteredTools.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            {iconData?.icon_url || appLogo ? (
              <img 
                src={iconData?.icon_url || appLogo} 
                alt={currentProfile?.toolkit_name} 
                className="w-10 h-10 rounded-lg border object-contain bg-muted p-1"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary font-semibold">
                {currentProfile?.toolkit_name?.charAt(0) || 'T'}
              </div>
            )}
            <div className="flex-1">
              <DialogTitle className="text-lg font-semibold">
                Configure {currentProfile?.toolkit_name} Tools
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Select tools to add to your agent
              </p>
            </div>
          </div>
        </DialogHeader>
        <div className="px-6 py-3 border-b bg-muted/20 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tools..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9 bg-background border-0 focus-visible:ring-1"
              />
            </div>
            
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground whitespace-nowrap">
                {filteredTools.length} {searchTerm && `of ${availableTools.length}`} tools
              </span>
              
              {selectedCount > 0 && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                  {selectedCount}
                </Badge>
              )}
              
              {filteredTools.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="h-8 text-xs"
                >
                  {allFilteredSelected ? 'Deselect' : 'Select'} All
                </Button>
              )}
            </div>
          </div>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6">
            {error && (
              <Alert className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <ToolSkeleton key={i} />
                ))}
              </div>
            ) : filteredTools.length > 0 ? (
              <div className="space-y-3">
                {filteredTools.map((tool) => (
                  <ToolCard
                    key={tool.name}
                    tool={tool}
                    isSelected={selectedTools.includes(tool.name)}
                    onToggle={() => handleToolToggle(tool.name)}
                    searchTerm={searchTerm}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <Search className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {searchTerm ? `No tools found matching "${searchTerm}"` : 'No tools available'}
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="p-6 pt-4 border-t bg-muted/20 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {selectedCount > 0 ? (
                `${selectedCount} tool${selectedCount === 1 ? '' : 's'} will be added to your agent`
              ) : (
                'No tools selected'
              )}
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || isLoading}
                className="min-w-[80px]"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Tools
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 