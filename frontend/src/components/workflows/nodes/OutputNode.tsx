"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { MessageSquare, Mail, Download, Send } from "lucide-react";

interface OutputNodeData {
  label: string;
  nodeId: string;
  config: any;
}

const OutputNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as OutputNodeData;
  
  const getIcon = () => {
    switch (nodeData.nodeId) {
      case "chat-output":
        return <MessageSquare className="h-4 w-4 text-white" />;
      case "email-sender":
        return <Mail className="h-4 w-4 text-white" />;
      case "slack-message":
        return <MessageSquare className="h-4 w-4 text-white" />;
      case "file-saver":
        return <Download className="h-4 w-4 text-white" />;
      case "webhook-sender":
        return <Send className="h-4 w-4 text-white" />;
      default:
        return <MessageSquare className="h-4 w-4 text-white" />;
    }
  };

  return (
    <div className={`relative bg-gray-800 rounded-lg border border-gray-600 min-w-[160px] ${selected ? "ring-2 ring-blue-400" : ""}`}>
      {/* Icon section */}
      <div className="flex items-center justify-center p-3 bg-blue-500 rounded-t-lg">
        {getIcon()}
      </div>
      
      {/* Content section */}
      <div className="p-3 text-center">
        <h3 className="text-sm font-medium text-white">{nodeData.label}</h3>
        <p className="text-xs text-gray-400 mt-1">
          {nodeData.nodeId === "chat-output" && "Display a chat message in the Playground."}
          {nodeData.nodeId === "email-sender" && "Send email notifications"}
          {nodeData.nodeId === "slack-message" && "Post message to Slack"}
          {nodeData.nodeId === "file-saver" && "Save data to file"}
          {nodeData.nodeId === "webhook-sender" && "Send HTTP request"}
        </p>
      </div>
      
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 !bg-gray-400 !border-gray-300"
        style={{ left: -6 }}
      />
    </div>
  );
});

OutputNode.displayName = "OutputNode";

export default OutputNode; 