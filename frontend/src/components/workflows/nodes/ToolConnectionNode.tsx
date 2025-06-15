"use client";

import { memo, useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Database, 
  FileText, 
  Globe, 
  Terminal, 
  Eye, 
  MessageSquare, 
  Cloud,
  Send,
  Settings,
  Wrench,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useWorkflow } from "../WorkflowContext";

interface ToolConnectionNodeData {
  label: string;
  nodeId?: string;
  toolType?: string;
  config?: any;
  instructions?: string;
}

const ToolConnectionNode = memo(({ data, selected, id }: NodeProps) => {
  const nodeData = data as unknown as ToolConnectionNodeData;
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const { updateNodeData } = useWorkflow();
  
  const getToolConfig = () => {
    const toolId = nodeData.nodeId || nodeData.toolType;
    
    switch (toolId) {
      case "web_search_tool":
        return {
          icon: Globe,
          category: "Search",
          description: "Search the web for information"
        };
      case "sb_files_tool":
        return {
          icon: FileText,
          category: "Files",
          description: "Read, write, and manage files"
        };
      case "sb_shell_tool":
        return {
          icon: Terminal,
          category: "System",
          description: "Execute shell commands"
        };
      case "sb_vision_tool":
        return {
          icon: Eye,
          category: "Vision",
          description: "Analyze images and visual content"
        };
      case "sb_browser_tool":
        return {
          icon: Globe,
          category: "Browser",
          description: "Automate browser interactions"
        };
      case "computer_use_tool":
        return {
          icon: MessageSquare,
          category: "Desktop",
          description: "Control desktop applications"
        };
      case "message_tool":
        return {
          icon: MessageSquare,
          category: "Communication",
          description: "Send messages and notifications"
        };
      case "data_providers_tool":
        return {
          icon: Database,
          category: "Data",
          description: "Access external data sources"
        };
      case "sb_deploy_tool":
        return {
          icon: Cloud,
          category: "Deploy",
          description: "Deploy applications and services"
        };
      case "sb_expose_tool":
        return {
          icon: Send,
          category: "Network",
          description: "Expose local services"
        };
      case "update_agent_tool":
        return {
          icon: Settings,
          category: "Config",
          description: "Update agent configuration"
        };
      default:
        return {
          icon: Wrench,
          category: "Tool",
          description: "Generic tool"
        };
    }
  };

  const toolConfig = getToolConfig();
  const Icon = toolConfig.icon;

  return (
    <div className={`relative min-w-[240px] max-w-[280px] ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
      <Card className="border bg-card transition-all duration-200">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">{nodeData.label}</h3>
              <p className="text-xs text-muted-foreground">{toolConfig.description}</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-0 space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs">
              {toolConfig.category}
            </Badge>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-xs text-muted-foreground">Ready</span>
            </div>
          </div>

          {/* Show instructions preview if available */}
          {nodeData.instructions && !isConfigOpen && (
            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded border">
              <strong>Instructions:</strong> {nodeData.instructions.length > 50 
                ? `${nodeData.instructions.substring(0, 50)}...` 
                : nodeData.instructions}
            </div>
          )}

          <Separator />

          {/* Configuration Toggle */}
          <Collapsible open={isConfigOpen} onOpenChange={setIsConfigOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between p-2">
                <span className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Configure
                </span>
                {isConfigOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="space-y-4 mt-3">
              {/* Instructions Configuration */}
              <div className="space-y-2">
                <Label htmlFor={`instructions-${id}`} className="text-sm font-medium">
                  Tool Instructions
                </Label>
                <Textarea
                  id={`instructions-${id}`}
                  placeholder="Provide specific instructions for how this tool should be used in the workflow..."
                  value={nodeData.instructions || ''}
                  onChange={(e) => updateNodeData?.(id!, { instructions: e.target.value })}
                  className="min-h-[80px] text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  These instructions will be included in the workflow prompt to guide how the agent uses this tool.
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Input Handle - Left side */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="w-3 h-3 !border-2 !border-white !bg-blue-500 hover:!bg-blue-600 transition-colors"
        style={{ left: -6 }}
      />

      {/* Output Handle - Right side */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="w-3 h-3 !border-2 !border-white !bg-green-500 hover:!bg-green-600 transition-colors"
        style={{ right: -6 }}
      />
    </div>
  );
});

ToolConnectionNode.displayName = "ToolConnectionNode";

export default ToolConnectionNode; 