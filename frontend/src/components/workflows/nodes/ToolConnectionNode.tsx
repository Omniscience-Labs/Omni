"use client";

import { memo, useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Database, 
  Search, 
  Settings, 
  FileText, 
  Globe, 
  Terminal, 
  Eye, 
  MessageSquare, 
  Cloud,
  Send,
  Zap,
  Wrench,
  ChevronDown,
  ChevronUp,
  Play,
  ArrowRight
} from "lucide-react";

interface ToolConnectionNodeData {
  label: string;
  nodeId?: string;
  toolType?: string;
  config?: any;
  inputConnections?: Array<{
    id: string;
    name: string;
    type: string;
    handleId?: string;
  }>;
  outputConnections?: Array<{
    id: string;
    name: string;
    type: string;
    handleId?: string;
  }>;
}

const ToolConnectionNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as ToolConnectionNodeData;
  const [isExpanded, setIsExpanded] = useState(false);
  
  const getToolConfig = () => {
    const toolId = nodeData.nodeId || nodeData.toolType;
    
    switch (toolId) {
      case "web_search_tool":
        return {
          icon: Globe,
          category: "Search",
          description: "Search the web for information",
          inputType: "query",
          outputType: "search_results"
        };
      case "sb_files_tool":
        return {
          icon: FileText,
          category: "Files",
          description: "Read, write, and manage files",
          inputType: "file_path",
          outputType: "file_content"
        };
      case "sb_shell_tool":
        return {
          icon: Terminal,
          category: "System",
          description: "Execute shell commands",
          inputType: "command",
          outputType: "command_output"
        };
      case "sb_vision_tool":
        return {
          icon: Eye,
          category: "Vision",
          description: "Analyze images and visual content",
          inputType: "image",
          outputType: "analysis"
        };
      case "sb_browser_tool":
        return {
          icon: Globe,
          category: "Browser",
          description: "Automate browser interactions",
          inputType: "url",
          outputType: "page_content"
        };
      case "computer_use_tool":
        return {
          icon: MessageSquare,
          category: "Desktop",
          description: "Control desktop applications",
          inputType: "action",
          outputType: "result"
        };
      case "message_tool":
        return {
          icon: MessageSquare,
          category: "Communication",
          description: "Send messages and notifications",
          inputType: "message",
          outputType: "status"
        };
      case "data_providers_tool":
        return {
          icon: Database,
          category: "Data",
          description: "Access external data sources",
          inputType: "query",
          outputType: "data"
        };
      case "sb_deploy_tool":
        return {
          icon: Cloud,
          category: "Deploy",
          description: "Deploy applications and services",
          inputType: "config",
          outputType: "deployment_status"
        };
      case "sb_expose_tool":
        return {
          icon: Send,
          category: "Network",
          description: "Expose local services",
          inputType: "service",
          outputType: "url"
        };
      case "update_agent_tool":
        return {
          icon: Settings,
          category: "Config",
          description: "Update agent configuration",
          inputType: "config",
          outputType: "status"
        };
      default:
        return {
          icon: Wrench,
          category: "Tool",
          description: "Generic tool",
          inputType: "input",
          outputType: "output"
        };
    }
  };

  const toolConfig = getToolConfig();
  const Icon = toolConfig.icon;
  const inputConnections = nodeData.inputConnections || [];
  const outputConnections = nodeData.outputConnections || [];

  // Check which handles have connections
  const hasInputConnection = inputConnections.length > 0;
  const hasOutputConnection = outputConnections.length > 0;
  const hasToolConnection = outputConnections.some(conn => conn.handleId === 'tool-connection');

  if (isExpanded) {
    return (
      <div className={`relative min-w-[280px] max-w-[350px] ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
        <Card className="border bg-card transition-all duration-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{nodeData.label}</h3>
                  <p className="text-xs text-muted-foreground">{toolConfig.description}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(false)}
                className="h-6 w-6 p-0"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs">
                {toolConfig.category}
              </Badge>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-xs text-muted-foreground">Ready</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Input Connections</label>
                <Badge variant="outline" className="text-xs">
                  {inputConnections.length}
                </Badge>
              </div>
              
              {inputConnections.length > 0 ? (
                <div className="space-y-1">
                  {inputConnections.map((connection) => (
                    <div key={connection.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded border text-xs">
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="flex-1">{connection.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {connection.type}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-muted/30 rounded p-2 border border-dashed text-xs text-muted-foreground">
                  No input connections
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Data Flow</label>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>{toolConfig.inputType}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span>{toolConfig.outputType}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Input Handle */}
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          className={`w-3 h-3 !border-border ${hasInputConnection ? '!bg-green-500' : '!bg-blue-500'}`}
          style={{ left: -6, top: "50%" }}
        />
        
        {/* Output Handle */}
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          className={`w-3 h-3 !border-border ${hasOutputConnection ? '!bg-green-500' : '!bg-green-500'}`}
          style={{ right: -6, top: "50%" }}
        />
        
        {/* Tool Connection Handle (for connecting to agents) */}
        <Handle
          type="source"
          position={Position.Bottom}
          id="tool-connection"
          className={`w-3 h-3 !border-border ${hasToolConnection ? '!bg-green-500' : '!bg-primary'}`}
          style={{ bottom: -6 }}
        />
      </div>
    );
  }

  return (
    <div className={`relative ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
      <div className="border bg-card rounded-lg flex items-center justify-center p-2 gap-2 min-w-[160px]">
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold leading-tight">
            {nodeData.label}
          </h3>
          <div className="flex items-center gap-1 mt-1">
            <Badge variant="outline" className="text-xs px-1 py-0">
              {toolConfig.category}
            </Badge>
            {(inputConnections.length > 0 || outputConnections.length > 0) && (
              <div className="flex items-center gap-1">
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {inputConnections.length + outputConnections.length}
                </span>
              </div>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(true)}
          className="h-6 w-6 p-0"
        >
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className={`w-3 h-3 !border-border ${hasInputConnection ? '!bg-green-500' : '!bg-blue-500'}`}
        style={{ left: -6, top: "50%" }}
      />
      
      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className={`w-3 h-3 !border-border ${hasOutputConnection ? '!bg-green-500' : '!bg-green-500'}`}
        style={{ right: -6, top: "50%" }}
      />
      
      {/* Tool Connection Handle (for connecting to agents) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="tool-connection"
        className={`w-3 h-3 !border-border ${hasToolConnection ? '!bg-green-500' : '!bg-primary'}`}
        style={{ bottom: -6 }}
      />
    </div>
  );
});

ToolConnectionNode.displayName = "ToolConnectionNode";

export default ToolConnectionNode; 