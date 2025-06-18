"use client";

import { memo, useState, useEffect } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GitBranch, MessageSquare, Database, Cloud, Settings, Server, Plus, Sparkles } from "lucide-react";
import { MCPConfigurationNew } from "@/app/(dashboard)/agents/_components/mcp/mcp-configuration-new";
import { useWorkflow } from "../WorkflowContext";
import { useUserCredentials } from "@/hooks/react-query/secure-mcp/use-secure-mcp";
import { useMCPServerDetails } from "@/hooks/react-query/mcp/use-mcp-servers";

interface MCPNodeData {
  label: string;
  nodeId: string;
  mcpType: "smithery" | "custom";
  qualifiedName?: string;
  config: any;
  enabledTools: string[];
  tools?: any[];
  iconUrl?: string;
  isConfigured?: boolean;
  customConfig?: {
    type: string;
    config: any;
  };
}

const MCPNode = memo(({ data, selected, id }: NodeProps) => {
  const nodeData = data as unknown as MCPNodeData;
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const { updateNodeData } = useWorkflow();
  
  // Fetch user's MCP credentials to check if this server is already configured
  const { data: mcpCredentials } = useUserCredentials();
  
  // Fetch MCP server details to get available tools
  const { data: serverDetails } = useMCPServerDetails(
    nodeData.qualifiedName || "", 
    nodeData.mcpType === "smithery" && !!nodeData.qualifiedName
  );

  // Auto-configure the node if credentials exist for this MCP server
  useEffect(() => {
    if (nodeData.mcpType === "smithery" && nodeData.qualifiedName && mcpCredentials && !nodeData.isConfigured) {
      // Check if user has credentials for this MCP server
      const hasCredentials = mcpCredentials.some(cred => cred.mcp_qualified_name === nodeData.qualifiedName);
      
      if (hasCredentials && serverDetails?.tools && serverDetails.tools.length > 0) {
        // Auto-configure with all available tools from server details
        const allToolNames = serverDetails.tools.map(tool => tool.name);
        
        updateNodeData(id, {
          isConfigured: true,
          enabledTools: allToolNames,
          config: {}, // Config will be fetched from credential manager by backend
          tools: serverDetails.tools // Store the tools data for display
        });
        
        console.log(`Auto-configured MCP node ${nodeData.qualifiedName} with tools:`, allToolNames);
      }
    }
  }, [nodeData.mcpType, nodeData.qualifiedName, nodeData.isConfigured, mcpCredentials, serverDetails, updateNodeData, id]);

  const getIcon = () => {
    if (nodeData.iconUrl) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img 
          src={nodeData.iconUrl} 
          alt={nodeData.label}
          className="h-4 w-4 rounded"
        />
      );
    }

    switch (nodeData.nodeId) {
      case "github":
        return <GitBranch className="h-4 w-4" />;
      case "slack":
        return <MessageSquare className="h-4 w-4" />;
      case "postgres":
        return <Database className="h-4 w-4" />;
      case "aws":
        return <Cloud className="h-4 w-4" />;
      case "custom_mcp":
        return <Plus className="h-4 w-4" />;
      default:
        return <Server className="h-4 w-4" />;
    }
  };

  const handleConfigure = () => {
    setShowConfigDialog(true);
  };

  const handleConfigurationSave = (configurations: any[]) => {
    console.log("MCP Configuration saved:", configurations);
    
    // Find the configuration for this MCP server
    const mcpConfig = configurations.find(config => {
      if (nodeData.mcpType === "smithery") {
        return config.qualifiedName === nodeData.qualifiedName;
      } else {
        return config.name === nodeData.label || config.isCustom;
      }
    });

    if (mcpConfig) {
      // Update the node data with the new configuration
      const updates: Partial<MCPNodeData> = {
        isConfigured: true,
        enabledTools: mcpConfig.enabledTools || [],
        config: mcpConfig.config || {}
      };

      if (nodeData.mcpType === "custom" && mcpConfig.isCustom) {
        updates.customConfig = {
          type: mcpConfig.customType || "sse",
          config: mcpConfig.config || {}
        };
      }

      updateNodeData(id, updates);
      console.log("Updated MCP node data:", updates);
    }
    
    setShowConfigDialog(false);
  };

  const getStatusColor = () => {
    if (nodeData.isConfigured && nodeData.enabledTools.length > 0) {
      return "border-green-500/50 bg-green-500/5";
    } else if (nodeData.mcpType === "custom" && !nodeData.isConfigured) {
      return "border-orange-500/50 bg-orange-500/5";
    }
    return "border-purple-500/50 bg-purple-500/5";
  };

  const getStatusBadge = () => {
    if (nodeData.isConfigured && nodeData.enabledTools.length > 0) {
      return (
        <Badge variant="outline" className="text-xs text-green-600 border-green-500/30">
          {nodeData.enabledTools.length} tool{nodeData.enabledTools.length !== 1 ? 's' : ''}
        </Badge>
      );
    } else if (nodeData.mcpType === "custom") {
      return (
        <Badge variant="outline" className="text-xs text-orange-600 border-orange-500/30">
          Configure
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-xs text-purple-600 border-purple-500/30">
        MCP
      </Badge>
    );
  };

  // Prepare the current MCP configuration for the dialog
  const currentMCPConfig = nodeData.mcpType === "smithery" ? {
    name: nodeData.label,
    qualifiedName: nodeData.qualifiedName || "",
    config: nodeData.config,
    enabledTools: nodeData.enabledTools,
    isCustom: false
  } : {
    name: nodeData.label,
    qualifiedName: `custom_${nodeData.customConfig?.type || "sse"}_${nodeData.label.toLowerCase().replace(/\s+/g, '_')}`,
    config: nodeData.customConfig?.config || nodeData.config,
    enabledTools: nodeData.enabledTools,
    isCustom: true,
    customType: (nodeData.customConfig?.type === "http" ? "http" : "sse") as "sse" | "http"
  };

  // Get tools to display - prefer serverDetails.tools, then nodeData.tools
  const displayTools = serverDetails?.tools || nodeData.tools || [];

  return (
    <>
      <Card className={`min-w-[220px] transition-all duration-200 ${getStatusColor()} ${selected ? "ring-2 ring-purple-500" : ""}`}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-purple-500/10 rounded border border-purple-500/20">
                {getIcon()}
              </div>
              {getStatusBadge()}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleConfigure}
              className="h-6 w-6 p-0 hover:bg-purple-500/10"
            >
              <Settings className="h-3 w-3" />
            </Button>
          </div>
          
          <div>
            <h3 className="font-medium text-sm mb-1">{nodeData.label}</h3>
            {nodeData.mcpType === "smithery" && (
              <p className="text-xs text-muted-foreground">
                Smithery • {nodeData.qualifiedName}
              </p>
            )}
            {nodeData.mcpType === "custom" && (
              <p className="text-xs text-muted-foreground">
                Custom MCP Server
              </p>
            )}
            {nodeData.isConfigured && nodeData.enabledTools.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {nodeData.enabledTools.slice(0, 2).map((tool, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {tool}
                  </Badge>
                ))}
                {nodeData.enabledTools.length > 2 && (
                  <Badge variant="secondary" className="text-xs">
                    +{nodeData.enabledTools.length - 2}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
        
        <Handle
          type="target"
          position={Position.Top}
          className="w-3 h-3 !bg-purple-500"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          className="w-3 h-3 !bg-purple-500"
        />
      </Card>

      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                {getIcon()}
              </div>
              <div>
                <DialogTitle>Configure MCP Server</DialogTitle>
                <DialogDescription>
                  Set up credentials and select tools for {nodeData.label}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            {nodeData.mcpType === "smithery" ? (
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <Sparkles className="h-5 w-5 text-blue-600" />
                    <div>
                      <h4 className="font-medium text-blue-900 dark:text-blue-100">Smithery MCP Server</h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        This server is provided by Smithery. Configure your credentials to enable the tools.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Server Name</label>
                      <p className="text-sm text-muted-foreground">{nodeData.label}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Qualified Name</label>
                      <p className="text-sm text-muted-foreground">{nodeData.qualifiedName}</p>
                    </div>
                  </div>

                  {displayTools.length > 0 && (
                    <div>
                      <label className="text-sm font-medium mb-2 block">Available Tools</label>
                      <div className="grid grid-cols-2 gap-2">
                        {displayTools.map((tool, index) => (
                          <div key={index} className="p-3 border rounded-lg">
                            <div className="font-medium text-sm">{tool.name}</div>
                            <div className="text-xs text-muted-foreground">{tool.description}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-4">
                    <p className="text-sm text-muted-foreground">
                      This MCP server will use the credentials configured in your agent settings. Make sure your agent has the required MCP credentials configured.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6">
                <MCPConfigurationNew 
                  configuredMCPs={nodeData.isConfigured ? [currentMCPConfig] : []}
                  onConfigurationChange={handleConfigurationSave}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

MCPNode.displayName = "MCPNode";

export default MCPNode; 