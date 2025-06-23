"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, FileText, Terminal, Image, MessageSquare } from "lucide-react";

interface ToolNodeData {
  label: string;
  toolId: string;
  config: any;
}

const ToolNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as ToolNodeData;
  const getIcon = () => {
    switch (nodeData.toolId) {
      case "web-search":
        return <Globe className="h-4 w-4" />;
      case "file-tool":
        return <FileText className="h-4 w-4" />;
      case "shell-tool":
        return <Terminal className="h-4 w-4" />;
      case "vision-tool":
        return <Image className="h-4 w-4" />;
      case "message-tool":
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <Globe className="h-4 w-4" />;
    }
  };

  return (
    <Card className={`min-w-[200px] ${selected ? "ring-2 ring-blue-500" : ""}`}>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 bg-blue-500/10 rounded">
            {getIcon()}
          </div>
          <Badge variant="outline" className="text-xs text-blue-600">Tool</Badge>
        </div>
        <h3 className="font-medium text-sm">{nodeData.label}</h3>
      </div>
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-blue-500"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-blue-500"
      />
    </Card>
  );
});

ToolNode.displayName = "ToolNode";

export default ToolNode; 