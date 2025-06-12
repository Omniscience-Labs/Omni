"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { MessageSquare, Type, Upload, Webhook, Clock } from "lucide-react";

interface InputNodeData {
  label: string;
  nodeId: string;
  config: any;
}

const InputNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as InputNodeData;
  
  const getIcon = () => {
    switch (nodeData.nodeId) {
      case "chat-input":
        return <MessageSquare className="h-4 w-4 text-white" />;
      case "text-input":
        return <Type className="h-4 w-4 text-white" />;
      case "file-input":
        return <Upload className="h-4 w-4 text-white" />;
      case "webhook-input":
        return <Webhook className="h-4 w-4 text-white" />;
      case "schedule-input":
        return <Clock className="h-4 w-4 text-white" />;
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
          {nodeData.nodeId === "chat-input" && "Get chat inputs from the Playground."}
          {nodeData.nodeId === "text-input" && "Static text input"}
          {nodeData.nodeId === "file-input" && "Upload and read files"}
          {nodeData.nodeId === "webhook-input" && "Receive webhook data"}
          {nodeData.nodeId === "schedule-input" && "Scheduled trigger"}
        </p>
      </div>
      
      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 !bg-gray-400 !border-gray-300"
        style={{ right: -6 }}
      />
    </div>
  );
});

InputNode.displayName = "InputNode";

export default InputNode; 