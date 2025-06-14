"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, Zap, Plus, ArrowRight, ArrowDown } from "lucide-react";

interface AgentNodeData {
  label: string;
  nodeId?: string;
  agentType?: string;
  model?: string;
  instructions?: string;
  tools?: string[];
  connectedTools?: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  inputConnections?: Array<{
    id: string;
    name: string;
    type: string;
    handleId: string;
  }>;
  outputConnections?: Array<{
    id: string;
    name: string;
    type: string;
    handleId: string;
  }>;
  config?: any;
}

const AgentNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as AgentNodeData;
  
  const getAgentConfig = () => {
    switch (nodeData.nodeId || nodeData.agentType) {
      default:
        return {
          icon: Bot,
          name: "AI Agent",
          description: "Intelligent assistant"
        };
    }
  };

  const agentConfig = getAgentConfig();
  const Icon = agentConfig.icon;

  const connectedTools = nodeData.connectedTools || [];
  const inputConnections = nodeData.inputConnections || [];
  const outputConnections = nodeData.outputConnections || [];

  return (
    <div className={`relative min-w-[320px] max-w-[400px] ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
      <Card className="border bg-card transition-all duration-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-base">{nodeData.label || agentConfig.name}</h3>
                <p className="text-xs text-muted-foreground">{agentConfig.description}</p>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Input Connections</label>
              <Badge variant="outline" className="text-xs">
                {inputConnections.length}
              </Badge>
            </div>
            
            {inputConnections.length > 0 ? (
              <div className="space-y-2">
                {inputConnections.map((connection) => (
                  <div key={connection.id} className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <ArrowRight className="h-3 w-3 text-blue-600" />
                    <span className="text-sm font-medium flex-1">{connection.name}</span>
                    <Badge variant="outline" className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                      {connection.type}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-muted/30 rounded-lg p-3 border border-dashed">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ArrowRight className="h-3 w-3" />
                  Connect inputs from tools or agents
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Connected Tools</label>
              <Badge variant="outline" className="text-xs">
                {connectedTools.length} tools
              </Badge>
            </div>
            {connectedTools.length > 0 ? (
              <div className="space-y-2">
                {connectedTools.map((tool) => (
                  <div key={tool.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border">
                    <div className="p-1 rounded bg-primary/10">
                      <Zap className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-sm font-medium flex-1">{tool.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {tool.type.replace('_tool', '').replace('_', ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-muted/30 rounded-lg p-3 border border-dashed">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Plus className="h-3 w-3" />
                  Connect tools from the palette
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Output Connections</label>
              <Badge variant="outline" className="text-xs">
                {outputConnections.length}
              </Badge>
            </div>
            
            {outputConnections.length > 0 ? (
              <div className="space-y-2">
                {outputConnections.map((connection) => (
                  <div key={connection.id} className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                    <ArrowDown className="h-3 w-3 text-green-600" />
                    <span className="text-sm font-medium flex-1">{connection.name}</span>
                    <Badge variant="outline" className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                      {connection.type}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-muted/30 rounded-lg p-3 border border-dashed">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ArrowDown className="h-3 w-3" />
                  Connect outputs to tools or agents
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm font-medium">Status</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-xs text-muted-foreground">Ready</span>
            </div>
          </div>
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

AgentNode.displayName = "AgentNode";

export default AgentNode; 