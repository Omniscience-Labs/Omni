import React, { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AGENTPRESS_TOOL_DEFINITIONS, getToolDisplayName } from './tools';
import { toast } from 'sonner';
import { WorkspaceCredentialsDialog } from '@/components/admin/workspace-credentials-dialog';
import { useCurrentAccount } from '@/hooks/use-current-account';
import { useUserCredentials } from '@/hooks/react-query/secure-mcp/use-secure-mcp';
import { apiClient } from '@/lib/api-client';

interface AgentToolsConfigurationProps {
  tools: Record<string, boolean | { enabled: boolean; description: string }>;
  onToolsChange: (tools: Record<string, boolean | { enabled: boolean; description: string }>) => void;
  disabled?: boolean;
  isSunaAgent?: boolean;
  isLoading?: boolean;
}

export const AgentToolsConfiguration = ({ tools, onToolsChange, disabled = false, isSunaAgent = false, isLoading = false }: AgentToolsConfigurationProps) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [credentialsDialogOpen, setCredentialsDialogOpen] = useState(false);
  const [expandedToolSettings, setExpandedToolSettings] = useState<string | null>(null);
  const [hasUploadedBrowserProfiles, setHasUploadedBrowserProfiles] = useState<boolean>(false);
  const currentAccount = useCurrentAccount();
  const { data: credentials } = useUserCredentials();
  
  // Check for uploaded browser profiles in SDK folder
  useEffect(() => {
    const checkUploadedProfiles = async () => {
      if (!currentAccount?.account_id) return;
      
      try {
        const response = await apiClient.get(`/admin/sdk-folder-upload/${currentAccount.account_id}/status`);
        if (response.data?.contexts) {
          const hasArcadia = response.data.contexts.has_arcadia_profile || false;
          setHasUploadedBrowserProfiles(hasArcadia);
        }
      } catch (error) {
        // Silently fail - profiles might not be uploaded yet
        setHasUploadedBrowserProfiles(false);
      }
    };
    
    checkUploadedProfiles();
    // Refresh every 30 seconds
    const interval = setInterval(checkUploadedProfiles, 30000);
    return () => clearInterval(interval);
  }, [currentAccount?.account_id]);
  
  // Workspace-scoped tools that need credentials configuration
  const workspaceScopedTools = ['inbound_order_tool'];
  // Allow Cold Chain automation for enterprise workspaces in all environments
  // In staging/local, workspace slugs might be different (e.g., 'varnica', 'varnica.dev')
  const allowedWorkspaces = ['cold-chain-enterprise', 'operator', 'varnica', 'varnica.dev'];
  // Also allow in local/staging environments for testing
  const isWorkspaceScoped = currentAccount?.slug && (
    allowedWorkspaces.includes(currentAccount.slug) ||
    (process.env.NEXT_PUBLIC_ENV_MODE === 'LOCAL' || process.env.NEXT_PUBLIC_ENV_MODE === 'STAGING')
  );
  
  // Debug: Log workspace info (remove in production)
  if (process.env.NODE_ENV === 'development') {
    console.log('[AgentToolsConfig] Workspace check:', {
      workspaceSlug: currentAccount?.slug,
      isWorkspaceScoped,
      allowedWorkspaces,
      accountId: currentAccount?.account_id,
      credentialsCount: credentials?.length || 0
    });
  }
  
  // Find credentials for current user (per-user credentials)
  // Note: credentials are stored with account_id = user_id
  const novaActCredential = credentials?.find((c: any) => 
    c.mcp_qualified_name === 'nova_act.inbound_orders' && 
    c.account_id === currentAccount?.account_id
  );
  const hasApiKey = novaActCredential?.config_keys?.includes('nova_act_api_key') || false;
  const hasErpSession = novaActCredential?.config_keys?.includes('erp_session') || false;
  // Browser profile is available if either erp_session exists OR uploaded profiles exist
  const hasBrowserProfile = hasErpSession || hasUploadedBrowserProfiles;

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
    <div className="flex flex-col h-full space-y-4">
      <div className="relative flex-shrink-0">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Search tools..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>
      <ScrollArea className="flex-1 pr-1">
        <div className="space-y-3">
          {getFilteredTools().map(([toolName, toolInfo]) => {
            const toolEnabled = isToolEnabled(tools[toolName]);
            const isWorkspaceTool = workspaceScopedTools.includes(toolName);
            // Settings should show if: workspace is scoped, tool is workspace-scoped, and tool is enabled
            const showSettings = isWorkspaceScoped && isWorkspaceTool && toolEnabled;
            const isExpanded = expandedToolSettings === toolName;
            
            // Show a hint if tool is disabled but should have settings
            const shouldShowSettingsHint = isWorkspaceScoped && isWorkspaceTool && !toolEnabled;
            
            // Debug logging for settings visibility
            if (process.env.NODE_ENV === 'development' && isWorkspaceTool) {
              console.log(`[AgentToolsConfig] Tool: ${toolName}`, {
                toolEnabled,
                isWorkspaceScoped,
                isWorkspaceTool,
                showSettings,
                workspaceSlug: currentAccount?.slug
              });
            }
            
            return (
              <div key={toolName}>
                <div 
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
                    <Switch
                      checked={toolEnabled}
                      onCheckedChange={(checked) => handleToolToggle(toolName, checked)}
                      disabled={disabled || isLoading}
                    />
                  </div>
                </div>
                
                {/* Hint to enable tool for settings */}
                {shouldShowSettingsHint && (
                  <div className="mt-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded border-l-2 border-l-blue-500">
                    💡 Enable this tool to configure credentials and browser profile settings
                  </div>
                )}
                
                {/* Settings section that appears below when tool is enabled */}
                {showSettings ? (
                  <Card className="mt-2 border-l-4 border-l-blue-500 animate-in slide-in-from-top-2 duration-200">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Settings className="h-4 w-4 text-blue-600" />
                          <span className="text-sm font-medium">Credentials Configuration</span>
                          {hasApiKey && (
                            <Badge variant="outline" className="text-xs">
                              API Key Set
                            </Badge>
                          )}
                          {hasErpSession && (
                            <Badge variant="outline" className="text-xs">
                              Browser Profile Ready
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedToolSettings(isExpanded ? null : toolName)}
                          className="h-7"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3 w-3 mr-1" />
                              Hide
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3 mr-1" />
                              Configure
                            </>
                          )}
                        </Button>
                      </div>
                      
                      {isExpanded && (
                        <div className="space-y-3 pt-3 border-t">
                          {!hasApiKey && (
                            <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 p-2 rounded">
                              ⚠️ Nova ACT API key required. Click "Open Settings" to configure.
                            </div>
                          )}
                          {hasApiKey && !hasBrowserProfile && (
                            <div className="text-sm text-blue-600 bg-blue-50 dark:bg-blue-950/20 p-2 rounded">
                              ℹ️ Browser profile not configured. Either:
                              <ul className="list-disc list-inside mt-1 space-y-0.5">
                                <li>Upload browser profiles in the SDK folder (arcadia_profile/Default/), OR</li>
                                <li>Use the "setup" action in an agent conversation after saving credentials.</li>
                              </ul>
                            </div>
                          )}
                          {hasApiKey && hasBrowserProfile && !hasErpSession && hasUploadedBrowserProfiles && (
                            <div className="text-sm text-green-600 bg-green-50 dark:bg-green-950/20 p-2 rounded">
                              ✅ Using uploaded browser profiles. No setup action needed.
                            </div>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCredentialsDialogOpen(true)}
                            className="w-full"
                          >
                            <Settings className="h-4 w-4 mr-2" />
                            Open Settings
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            );
          })}
          
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
      </ScrollArea>
      
      {/* Credentials Dialog */}
      {isWorkspaceScoped && currentAccount?.account_id && (
        <WorkspaceCredentialsDialog
          open={credentialsDialogOpen}
          onOpenChange={setCredentialsDialogOpen}
          accountId={currentAccount.account_id}
        />
      )}
    </div>
  );
}; 