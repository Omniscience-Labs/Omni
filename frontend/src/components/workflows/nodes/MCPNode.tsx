"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitBranch, MessageSquare, Database, Cloud } from "lucide-react";

interface MCPNodeData {
  label: string;
  mcpId: string;
  config: any;
}

const MCPNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as MCPNodeData;
  const getIcon = () => {
    switch (nodeData.mcpId) {
      case "github":
        return <GitBranch className="h-4 w-4" />;
      case "slack":
        return <MessageSquare className="h-4 w-4" />;
      case "postgres":
        return <Database className="h-4 w-4" />;
      case "aws":
        return <Cloud className="h-4 w-4" />;
      default:
        return <Cloud className="h-4 w-4" />;
    }
  };

  return (
    <Card className={`min-w-[200px] ${selected ? "ring-2 ring-purple-500" : ""}`}>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 bg-purple-500/10 rounded">
            {getIcon()}
          </div>
          <Badge variant="outline" className="text-xs text-purple-600">MCP</Badge>
        </div>
        <h3 className="font-medium text-sm">{nodeData.label}</h3>
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
  );
});

MCPNode.displayName = "MCPNode";

export default MCPNode; 