'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Zap, Settings, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PipedreamConnectButton } from './pipedream-connect-button';
import { useQuery } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';

interface PipedreamTool {
  name: string;
  description: string;
  inputSchema: any;
}

interface PipedreamApp {
  app_name: string;
  app_slug: string;
  tools: PipedreamTool[];
  tool_count: number;
}

interface PipedreamMCPConfigurationProps {
  onConfigurationChange: (config: any) => void;
  initialConfig?: any;
}

export const PipedreamMCPConfiguration: React.FC<PipedreamMCPConfigurationProps> = ({
  onConfigurationChange,
  initialConfig = { selectedTools: {} }
}) => {
  const [selectedTools, setSelectedTools] = useState<Record<string, string[]>>(
    initialConfig.selectedTools || {}
  );
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set());
  
  const previousSelectedToolsRef = React.useRef<Record<string, string[]>>({});
  const { data: toolsData, isLoading, error, refetch } = useQuery({
    queryKey: ['pipedream', 'available-tools'],
    queryFn: async () => {
      const response = await backendApi.get('/pipedream/mcp/available-tools');
      return response.data;
    },
    retry: 1,
  });

  const customMcps = useMemo(() => {
    const mcps: any[] = [];
    
    Object.entries(selectedTools).forEach(([appSlug, tools]) => {
      if (tools.length > 0) {
        const appData = toolsData?.apps?.find((app: any) => app.app_slug === appSlug);
        if (appData) {
          mcps.push({
            name: `${appData.app_name}`,
            qualifiedName: `pipedream_${appSlug}_${Date.now()}`,
            config: {
              url: 'https://remote.mcp.pipedream.net',
              headers: {
                'x-pd-app-slug': appSlug,
              }
            },
            enabledTools: tools,
            isCustom: true,
            customType: 'pipedream',
            type: 'sse'
          });
        }
      }
    });
    
    return mcps;
  }, [selectedTools, toolsData]);

  const updateConfiguration = useCallback(() => {
    onConfigurationChange(customMcps);
  }, [customMcps, onConfigurationChange]);

  useEffect(() => {
    const hasChanged = JSON.stringify(previousSelectedToolsRef.current) !== JSON.stringify(selectedTools);
    if (!hasChanged) {
      return;
    }
    previousSelectedToolsRef.current = { ...selectedTools };
    updateConfiguration();
  }, [selectedTools, updateConfiguration]);

  const handleToolToggle = useCallback((appSlug: string, toolName: string) => {
    setSelectedTools(prev => {
      const appTools = prev[appSlug] || [];
      const updated = appTools.includes(toolName)
        ? appTools.filter(t => t !== toolName)
        : [...appTools, toolName];
      
      return {
        ...prev,
        [appSlug]: updated
      };
    });
  }, []);

  const handleSelectAll = useCallback((app: PipedreamApp) => {
    const allToolNames = app.tools.map(t => t.name);
    setSelectedTools(prev => ({
      ...prev,
      [app.app_slug]: allToolNames
    }));
  }, []);

  const handleDeselectAll = useCallback((app: PipedreamApp) => {
    setSelectedTools(prev => ({
      ...prev,
      [app.app_slug]: []
    }));
  }, []);

  const handleRefresh = useCallback(async () => {
    const result = await refetch();
    if (result.isSuccess) {
      toast.success('Refreshed available tools');
    }
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Loading available tools...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <p className="text-destructive">Failed to load available tools</p>
        <Button onClick={handleRefresh} variant="outline" size="sm" className="mt-4">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  const apps = toolsData?.apps || [];
  const totalSelectedTools = Object.values(selectedTools).flat().length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl p-6 border bg-card">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Pipedream Integration</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Connect your apps through Pipedream to access their tools
              </p>
              {apps.length > 0 && (
                <div className="flex items-center mt-3 space-x-4">
                  <Badge variant="secondary">
                    {apps.length} app{apps.length !== 1 ? 's' : ''} connected
                  </Badge>
                  <Badge variant="outline">
                    {totalSelectedTools} tool{totalSelectedTools !== 1 ? 's' : ''} selected
                  </Badge>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <PipedreamConnectButton 
              onConnect={async () => {
                await refetch();
              }}
            />
          </div>
        </div>
      </div>

      {/* Connected Apps */}
      {apps.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h4 className="font-medium mb-2">No apps connected yet</h4>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Connect your apps through Pipedream to access their tools and extend your agent's capabilities
            </p>
            <PipedreamConnectButton onConnect={handleRefresh} />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {apps.map((app: PipedreamApp) => {
            const appSelectedTools = selectedTools[app.app_slug] || [];
            const isAllSelected = appSelectedTools.length === app.tools.length;
            const isPartiallySelected = appSelectedTools.length > 0 && !isAllSelected;

            return (
              <Card key={app.app_slug}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {app.app_name}
                        {appSelectedTools.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {appSelectedTools.length}/{app.tool_count} selected
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {app.tool_count} tool{app.tool_count !== 1 ? 's' : ''} available
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSelectAll(app)}
                        disabled={isAllSelected}
                      >
                        Select All
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeselectAll(app)}
                        disabled={appSelectedTools.length === 0}
                      >
                        Deselect All
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {app.tools.map((tool: PipedreamTool) => {
                      const isSelected = appSelectedTools.includes(tool.name);
                      return (
                        <div
                          key={tool.name}
                          className="flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <Checkbox
                            id={`${app.app_slug}-${tool.name}`}
                            checked={isSelected}
                            onCheckedChange={() => handleToolToggle(app.app_slug, tool.name)}
                            className="mt-0.5"
                          />
                          <label
                            htmlFor={`${app.app_slug}-${tool.name}`}
                            className="flex-1 cursor-pointer"
                          >
                            <div className="font-medium text-sm">{tool.name}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {tool.description}
                            </div>
                          </label>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-primary mt-0.5" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}; 