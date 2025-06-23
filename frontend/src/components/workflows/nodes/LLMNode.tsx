"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Bot, FileText, Code, ChevronDown } from "lucide-react";

interface LLMNodeData {
  label: string;
  nodeId: string;
  config: any;
}

const LLMNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as LLMNodeData;
  
  const getIcon = () => {
    switch (nodeData.nodeId) {
      case "openai-chat":
        return <Bot className="h-4 w-4 text-white" />;
      case "anthropic-chat":
        return <Bot className="h-4 w-4 text-white" />;
      case "prompt-template":
        return <FileText className="h-4 w-4 text-white" />;
      case "system-message":
        return <Code className="h-4 w-4 text-white" />;
      default:
        return <Bot className="h-4 w-4 text-white" />;
    }
  };

  const getHeaderColor = () => {
    switch (nodeData.nodeId) {
      case "openai-chat":
        return "bg-green-500";
      case "anthropic-chat":
        return "bg-orange-500";
      case "prompt-template":
        return "bg-pink-500";
      case "system-message":
        return "bg-purple-500";
      default:
        return "bg-green-500";
    }
  };

  const getModelName = () => {
    switch (nodeData.nodeId) {
      case "openai-chat":
        return "gpt-4o-mini";
      case "anthropic-chat":
        return "claude-3-sonnet";
      case "prompt-template":
        return "Template";
      case "system-message":
        return "System";
      default:
        return "Model";
    }
  };

  return (
    <div className={`relative bg-gray-800 rounded-lg border border-gray-600 min-w-[200px] ${selected ? "ring-2 ring-green-400" : ""}`}>
      {/* Icon section */}
      <div className={`flex items-center justify-center p-3 ${getHeaderColor()} rounded-t-lg`}>
        {getIcon()}
      </div>
      
      {/* Content section */}
      <div className="p-4">
        <h3 className="text-sm font-medium text-white mb-3">{nodeData.label}</h3>
        
        {/* Model selection */}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Model Name</label>
            <div className="flex items-center justify-between bg-gray-700 rounded px-3 py-2 text-sm text-white">
              <span>{getModelName()}</span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </div>
          </div>
          
          {(nodeData.nodeId === "openai-chat" || nodeData.nodeId === "anthropic-chat") && (
            <>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Temperature</label>
                <div className="bg-gray-700 rounded px-3 py-2 text-sm text-white">
                  0.10
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Precise</span>
                <span className="text-xs text-gray-400">Creative</span>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 !bg-gray-400 !border-gray-300"
        style={{ left: -6 }}
      />
      
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

LLMNode.displayName = "LLMNode";

export default LLMNode; 