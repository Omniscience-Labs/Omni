"use client";

import { memo, useState, useEffect } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { GitBranch, MessageSquare, Database, Cloud, Settings, Server, Plus, Sparkles, User, Star } from "lucide-react";
import { MCPConfigurationNew } from "@/app/(dashboard)/agents/_components/mcp/mcp-configuration-new";
import { useWorkflow } from "../WorkflowContext";
import { useCredentialProfilesForMcp, useGetDefaultProfile } from "@/hooks/react-query/mcp/use-credential-profiles";
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
  selectedProfileId?: string;
  customConfig?: {
    type: string;
    config: any;
  };
}

const MCPNode = memo(({ data, selected, id }: NodeProps) => {
  const nodeData = data as unknown as MCPNodeData;
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const { updateNodeData } = useWorkflow();
  
  // Fetch credential profiles for this MCP server
  const { data: credentialProfiles } = useCredentialProfilesForMcp(
    nodeData.mcpType === "smithery" ? nodeData.qualifiedName || null : null
  );
  
  // Get the default profile for auto-configuration
  const defaultProfile = useGetDefaultProfile(
    nodeData.mcpType === "smithery" ? nodeData.qualifiedName || null : null
  );
  
  // Fetch MCP server details to get available tools
  const { data: serverDetails } = useMCPServerDetails(
    nodeData.qualifiedName || "", 
    nodeData.mcpType === "smithery" && !!nodeData.qualifiedName
  );

  // Auto-configure the node if profiles exist for this MCP server
  useEffect(() => {
    if (nodeData.mcpType === "smithery" && nodeData.qualifiedName && credentialProfiles && !nodeData.isConfigured) {
      // Check if user has credential profiles for this MCP server
      const hasProfiles = credentialProfiles.length > 0;
      
      if (hasProfiles && serverDetails?.tools && serverDetails.tools.length > 0) {
        // Auto-configure with all available tools from server details
        const allToolNames = serverDetails.tools.map(tool => tool.name);
        
        updateNodeData(id, {
          isConfigured: true,
          enabledTools: allToolNames,
          config: {}, // Config will be fetched from credential manager by backend
          tools: serverDetails.tools, // Store the tools data for display
          selectedProfileId: defaultProfile?.profile_id || credentialProfiles[0]?.profile_id // Auto-select default or first profile
        });
        
        console.log(`Auto-configured MCP node ${nodeData.qualifiedName} with tools:`, allToolNames);
      }
    }
  }, [nodeData.mcpType, nodeData.qualifiedName, nodeData.isConfigured, credentialProfiles, serverDetails, defaultProfile, updateNodeData, id]);

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

  const handleProfileChange = (profileId: string) => {
    updateNodeData(id, {
      selectedProfileId: profileId
    });
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

  // Get the selected profile for display
  const selectedProfile = credentialProfiles?.find(profile => profile.profile_id === nodeData.selectedProfileId);

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
            
            {/* Display selected profile */}
            {nodeData.mcpType === "smithery" && selectedProfile && (
              <div className="mt-2 flex items-center gap-1">
                <User className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{selectedProfile.profile_name}</span>
                {selectedProfile.is_default && (
                  <Star className="h-3 w-3 text-yellow-500" />
                )}
              </div>
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
              <div className="p-6 space-y-6">
                <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  <div>
                    <h4 className="font-medium text-blue-900 dark:text-blue-100">Smithery MCP Server</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      This server is provided by Smithery. Select a credential profile to use for this workflow.
                    </p>
                  </div>
                </div>

                {/* Credential Profile Selection */}
                {credentialProfiles && credentialProfiles.length > 0 ? (
                  <div className="space-y-3">
                    <Label htmlFor="profile-select">Credential Profile</Label>
                    <Select 
                      value={nodeData.selectedProfileId || ""} 
                      onValueChange={handleProfileChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a credential profile" />
                      </SelectTrigger>
                      <SelectContent>
                        {credentialProfiles.map((profile) => (
                          <SelectItem key={profile.profile_id} value={profile.profile_id}>
                            <div className="flex items-center gap-2">
                              <span>{profile.profile_name}</span>
                              {profile.is_default && (
                                <Star className="h-3 w-3 text-yellow-500" />
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      This profile's credentials will be used when the workflow executes MCP tools.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-800">
                    <h4 className="font-medium text-orange-900 dark:text-orange-100 mb-2">No Credential Profiles Found</h4>
                    <p className="text-sm text-orange-700 dark:text-orange-300">
                      You need to create a credential profile for this MCP server in the Settings → Credentials page before using it in workflows.
                    </p>
                  </div>
                )}

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