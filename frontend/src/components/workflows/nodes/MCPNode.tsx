"use client";

import { memo, useState, useEffect } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Settings, Server, Plus, Sparkles, User, Star, ChevronDown, ChevronUp } from "lucide-react";
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
  instructions?: string;
  customConfig?: {
    type: string;
    config: any;
  };
}

const MCPNode = memo(({ data, selected, id }: NodeProps) => {
  const nodeData = data as unknown as MCPNodeData;
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const { updateNodeData } = useWorkflow();
  
  const { data: credentialProfiles } = useCredentialProfilesForMcp(
    nodeData.mcpType === "smithery" ? nodeData.qualifiedName || null : null
  );

  const defaultProfile = useGetDefaultProfile(
    nodeData.mcpType === "smithery" ? nodeData.qualifiedName || null : null
  );
  
  const { data: serverDetails } = useMCPServerDetails(
    nodeData.qualifiedName || "", 
    nodeData.mcpType === "smithery" && !!nodeData.qualifiedName
  );

  useEffect(() => {
    if (nodeData.mcpType === "smithery" && nodeData.qualifiedName && credentialProfiles && !nodeData.isConfigured) {
      const hasProfiles = credentialProfiles.length > 0;
      
      if (hasProfiles && serverDetails?.tools && serverDetails.tools.length > 0) {
        const allToolNames = serverDetails.tools.map(tool => tool.name);
        updateNodeData(id, {
          isConfigured: true,
          enabledTools: allToolNames,
          config: {},
          tools: serverDetails.tools,
          selectedProfileId: defaultProfile?.profile_id || credentialProfiles[0]?.profile_id
        });
        console.log(`Auto-configured MCP node ${nodeData.qualifiedName} with tools:`, allToolNames);
      }
    }
  }, [nodeData.mcpType, nodeData.qualifiedName, nodeData.isConfigured, credentialProfiles, serverDetails, defaultProfile, updateNodeData, id]);

  const handleConfigure = () => {
    setShowConfigDialog(true);
  };

  const handleConfigurationSave = (configurations: any[]) => {
    console.log("MCP Configuration saved:", configurations);
    
    const mcpConfig = configurations.find(config => {
      if (nodeData.mcpType === "smithery") {
        return config.qualifiedName === nodeData.qualifiedName;
      } else {
        return config.name === nodeData.label || config.isCustom;
      }
    });

    if (mcpConfig) {
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
      return "bg-green-500";
    } else if (nodeData.mcpType === "custom" && !nodeData.isConfigured) {
      return "bg-orange-500";
    }
    return "bg-purple-500";
  };

  const getStatusBadge = () => {
    if (nodeData.isConfigured && nodeData.enabledTools.length > 0) {
      return (
        <Badge variant="outline" className="text-xs border-primary/20">
          {nodeData.enabledTools.length} tool{nodeData.enabledTools.length !== 1 ? 's' : ''}
        </Badge>
      );
    } else if (nodeData.mcpType === "custom") {
      return (
        <Badge variant="outline" className="text-xs border-primary/20">
          Configure
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-xs border-primary/20">
        MCP
      </Badge>
    );
  };

  const selectedProfile = credentialProfiles?.find(profile => profile.profile_id === nodeData.selectedProfileId);
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

  const displayTools = serverDetails?.tools || nodeData.tools || [];

  return (
    <>
      <div className={`relative bg-neutral-100 dark:bg-neutral-800 rounded-2xl border-2 min-w-[280px] max-w-[400px] ${
        selected ? "border-primary shadow-lg" : "border-border"
      }`}>
        <CardHeader className={`flex items-center justify-between p-4 rounded-t-lg`}>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Server className="h-5 w-5" />
            </div>
            <span className="font-medium">{nodeData.label}</span>
          </div>
          <div className="flex items-center gap-2">
            {nodeData.mcpType === "smithery" ? (
              <Sparkles className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {getStatusBadge()}
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-3">
          {nodeData.mcpType === "smithery" && selectedProfile && (
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Profile</Label>
              <div className="mt-1 flex items-center gap-1">
                <User className="h-3 w-3 text-muted-foreground" />
                <span className="text-sm text-foreground">{selectedProfile.profile_name}</span>
                {selectedProfile.is_default && (
                  <Star className="h-3 w-3 text-yellow-500" />
                )}
              </div>
            </div>
          )}

          {nodeData.isConfigured && nodeData.enabledTools.length > 0 && (
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Tools</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {nodeData.enabledTools.slice(0, 2).map((tool, index) => (
                  <Badge key={index} variant="outline" className="text-xs border-primary/20">
                    {tool}
                  </Badge>
                ))}
                {nodeData.enabledTools.length > 2 && (
                  <Badge variant="outline" className="text-xs border-primary/20">
                    +{nodeData.enabledTools.length - 2}
                  </Badge>
                )}
              </div>
            </div>
          )}
          {nodeData.instructions && !isConfigOpen && (
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Instructions</Label>
              <div className="border-primary/20 text-xs text-muted-foreground bg-primary/10 p-2 rounded-lg border mt-1">
                {nodeData.instructions.length > 50 
                  ? `${nodeData.instructions.substring(0, 50)}...` 
                  : nodeData.instructions}
              </div>
            </div>
          )}

          <Separator />
          <Collapsible open={isConfigOpen} onOpenChange={setIsConfigOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="node_secondary" size="node_secondary" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Configure
                </span>
                {isConfigOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="space-y-4 mt-3">
              <div className="space-y-2">
                <Label htmlFor={`instructions-${id}`} className="text-xs font-medium">
                  MCP Instructions
                </Label>
                <Textarea
                  id={`instructions-${id}`}
                  placeholder="Provide specific instructions for how this MCP server should be used in the workflow..."
                  value={nodeData.instructions || ''}
                  onChange={(e) => updateNodeData(id, { instructions: e.target.value })}
                  className="border-primary/20 min-h-[80px] text-sm"
                />
              </div>
              {nodeData.mcpType === "smithery" && credentialProfiles && credentialProfiles.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Credential Profile</Label>
                  <Select 
                    value={nodeData.selectedProfileId || ""} 
                    onValueChange={handleProfileChange}
                  >
                    <SelectTrigger className="h-8 border-primary/20">
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
              )}
              <div className="space-y-2">
                <Button
                  variant="node_outline"
                  size="sm"
                  onClick={handleConfigure}
                  className="w-full"
                >
                  <Settings className="h-4 w-4" />
                  Advanced Configuration
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
        <Handle
          type="target"
          position={Position.Left}
          className="w-6 h-6 !border-4 !border-primary !bg-purple-500 hover:!bg-purple-600 transition-colors"
          style={{ left: -6 }}
        />
        <Handle
          type="source"
          position={Position.Right}
          className="w-6 h-6 !border-4 !border-primary !bg-purple-500 hover:!bg-purple-600 transition-colors"
          style={{ right: -6 }}
        />
      </div>
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Configure {nodeData.label}</DialogTitle>
                <DialogDescription>
                  Set up credentials and select tools for {nodeData.label}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            {nodeData.mcpType === "smithery" ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  <div>
                    <h4 className="font-medium text-blue-900 dark:text-blue-100">Smithery MCP Server</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      This server is provided by Smithery. Select a credential profile to use for this workflow.
                    </p>
                  </div>
                </div>
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
              <div>
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