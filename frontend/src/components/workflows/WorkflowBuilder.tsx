"use client";

import { useCallback, useState } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  ConnectionLineType,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Plus, 
  Settings, 
  Play, 
  Save, 
  Share, 
  Zap,
  Workflow,
  Eye,
  EyeOff
} from "lucide-react";
import NodePalette from "./NodePalette";
import WorkflowSettings from "./WorkflowSettings";
import AgentNode from "./nodes/AgentNode";
import ToolConnectionNode from "./nodes/ToolConnectionNode";

const nodeTypes = {
  agentNode: AgentNode,
  toolConnectionNode: ToolConnectionNode,
};

const initialNodes: Node[] = [
  {
    id: 'agent-1',
    type: 'agentNode',
    position: { x: 400, y: 200 },
    data: { 
      label: 'Test Agent', 
      nodeId: 'agent',
      connectedTools: [
        {
          id: 'tool-1',
          name: 'Web Search',
          type: 'web_search_tool'
        }
      ],
      inputConnections: [
        {
          id: 'tool-1',
          name: 'Web Search',
          type: 'tool',
          handleId: 'tools'
        }
      ]
    }
  },
  {
    id: 'tool-1',
    type: 'toolConnectionNode',
    position: { x: 100, y: 200 },
    data: { 
      label: 'Web Search', 
      nodeId: 'web_search_tool',
      outputConnections: [
        {
          id: 'agent-1',
          name: 'Test Agent',
          type: 'agent',
          handleId: 'tool-connection'
        }
      ]
    }
  }
];

const initialEdges: Edge[] = [
  {
    id: 'e-tool-1-agent-1',
    source: 'tool-1',
    sourceHandle: 'tool-connection',
    target: 'agent-1',
    targetHandle: 'tools',
    type: 'smoothstep',
    animated: true,
    style: { strokeWidth: 2, stroke: '#6366f1' },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 20,
      height: 20,
      color: '#6366f1',
    },
  }
];

// Default edge style
const defaultEdgeOptions = {
  animated: true,
  style: { 
    strokeWidth: 2, 
    stroke: '#6366f1',
  },
  type: 'smoothstep',
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 20,
    height: 20,
    color: '#6366f1',
  },
};

export default function WorkflowBuilder() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [showSettings, setShowSettings] = useState(false);
  const [showNodePalette, setShowNodePalette] = useState(true);

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        ...params,
        id: `e-${params.source}-${params.target}-${Date.now()}`,
        type: "smoothstep",
        animated: true,
        style: { 
          strokeWidth: 2, 
          stroke: '#6366f1',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: '#6366f1',
        },
      } as Edge;
      setEdges((eds) => addEdge(newEdge, eds));
      
      // Update both source and target nodes with connection information
      setNodes((nds) => 
        nds.map((node) => {
          // Update target node (receiving the connection)
          if (node.id === params.target) {
            const sourceNode = nds.find(n => n.id === params.source);
            if (sourceNode) {
              const inputConnections = (node.data.inputConnections as any[]) || [];
              const connectedTools = (node.data.connectedTools as any[]) || [];
              
              const newInputConnection = {
                id: sourceNode.id,
                name: sourceNode.data.label,
                type: sourceNode.type === 'toolConnectionNode' ? 'tool' : sourceNode.type || 'unknown',
                handleId: params.targetHandle || 'input'
              };
              
              // Check if connection already exists
              const isInputAlreadyConnected = inputConnections.some((conn: any) => 
                conn.id === newInputConnection.id && conn.handleId === newInputConnection.handleId
              );
              
              let updatedData = { ...node.data };
              
              if (!isInputAlreadyConnected) {
                updatedData.inputConnections = [...inputConnections, newInputConnection];
              }
              
              // If it's a tool connection to an agent, also update connectedTools
              if (params.targetHandle === "tools" && params.sourceHandle === "tool-connection") {
                const newTool = {
                  id: sourceNode.id,
                  name: sourceNode.data.label,
                  type: sourceNode.data.nodeId || "unknown"
                };
                
                const isToolAlreadyConnected = connectedTools.some((tool: any) => tool.id === newTool.id);
                if (!isToolAlreadyConnected) {
                  updatedData.connectedTools = [...connectedTools, newTool];
                }
              }
              
              return {
                ...node,
                data: updatedData
              };
            }
          }
          
          // Update source node (sending the connection)
          if (node.id === params.source) {
            const targetNode = nds.find(n => n.id === params.target);
            if (targetNode) {
              const outputConnections = (node.data.outputConnections as any[]) || [];
              
              const newOutputConnection = {
                id: targetNode.id,
                name: targetNode.data.label,
                type: targetNode.type === 'agentNode' ? 'agent' : targetNode.type || 'unknown',
                handleId: params.sourceHandle || 'output'
              };
              
              // Check if connection already exists
              const isOutputAlreadyConnected = outputConnections.some((conn: any) => 
                conn.id === newOutputConnection.id && conn.handleId === newOutputConnection.handleId
              );
              
              if (!isOutputAlreadyConnected) {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    outputConnections: [...outputConnections, newOutputConnection]
                  }
                };
              }
            }
          }
          
          return node;
        })
      );
    },
    [setEdges, setNodes]
  );

  // Handle edge removal to update connected tools
  const handleEdgesChange = useCallback(
    (changes: any[]) => {
      const removedEdges = changes.filter((change: any) => change.type === 'remove');
      
      if (removedEdges.length > 0) {
        // Get the current edges before removal
        const currentEdges = edges;
        
        setNodes((nds) => 
          nds.map((node) => {
            let updatedData = { ...node.data };
            let hasChanges = false;
            
            // Handle agent nodes
            if (node.type === 'agentNode') {
              const connectedTools = (node.data.connectedTools as any[]) || [];
              const inputConnections = (node.data.inputConnections as any[]) || [];
              
              // Update connected tools
              const updatedTools = connectedTools.filter((tool: any) => {
                const isBeingRemoved = removedEdges.some((removedEdge: any) => {
                  if (!removedEdge.id) return false;
                  const edgeToRemove = currentEdges.find(e => e.id === removedEdge.id);
                  return edgeToRemove && 
                         edgeToRemove.source === tool.id && 
                         edgeToRemove.target === node.id &&
                         edgeToRemove.targetHandle === 'tools' &&
                         edgeToRemove.sourceHandle === 'tool-connection';
                });
                return !isBeingRemoved;
              });
              
              // Update input connections
              const updatedInputConnections = inputConnections.filter((conn: any) => {
                const isBeingRemoved = removedEdges.some((removedEdge: any) => {
                  if (!removedEdge.id) return false;
                  const edgeToRemove = currentEdges.find(e => e.id === removedEdge.id);
                  return edgeToRemove && 
                         edgeToRemove.source === conn.id && 
                         edgeToRemove.target === node.id &&
                         edgeToRemove.targetHandle === conn.handleId;
                });
                return !isBeingRemoved;
              });
              
              if (updatedTools.length !== connectedTools.length) {
                updatedData.connectedTools = updatedTools;
                hasChanges = true;
              }
              
              if (updatedInputConnections.length !== inputConnections.length) {
                updatedData.inputConnections = updatedInputConnections;
                hasChanges = true;
              }
            }
            
            // Handle tool nodes and other nodes with output connections
            if (node.type === 'toolConnectionNode' || node.data.outputConnections) {
              const outputConnections = (node.data.outputConnections as any[]) || [];
              
              const updatedOutputConnections = outputConnections.filter((conn: any) => {
                const isBeingRemoved = removedEdges.some((removedEdge: any) => {
                  if (!removedEdge.id) return false;
                  const edgeToRemove = currentEdges.find(e => e.id === removedEdge.id);
                  return edgeToRemove && 
                         edgeToRemove.source === node.id && 
                         edgeToRemove.target === conn.id &&
                         edgeToRemove.sourceHandle === conn.handleId;
                });
                return !isBeingRemoved;
              });
              
              if (updatedOutputConnections.length !== outputConnections.length) {
                updatedData.outputConnections = updatedOutputConnections;
                hasChanges = true;
              }
            }
            
            return hasChanges ? { ...node, data: updatedData } : node;
          })
        );
      }
      
      onEdgesChange(changes);
    },
    [edges, setNodes, onEdgesChange]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");
      const nodeDataString = event.dataTransfer.getData("nodeData");

      if (typeof type === "undefined" || !type || !nodeDataString) {
        return;
      }

      const nodeData = JSON.parse(nodeDataString);
      const position = {
        x: event.clientX - 250,
        y: event.clientY - 100,
      };

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type: nodeData.nodeId === "agent" ? "agentNode" : "toolConnectionNode",
        position,
        data: {
          ...nodeData,
          id: `${type}-${Date.now()}`,
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes]
  );

  return (
    <>
      <style jsx global>{`
        .react-flow__edge-path {
          stroke: #6366f1 !important;
          stroke-width: 2 !important;
        }
        
        .react-flow__edge.animated .react-flow__edge-path {
          stroke-dasharray: 5;
          animation: dashdraw 0.5s linear infinite;
        }
        
        @keyframes dashdraw {
          to {
            stroke-dashoffset: -10;
          }
        }
        
        .react-flow__connection-path {
          stroke: #6366f1 !important;
          stroke-width: 2 !important;
        }
        
        .react-flow__edge-text {
          fill: #6366f1 !important;
        }
        
        .react-flow__edge.selected .react-flow__edge-path {
          stroke: #818cf8 !important;
          stroke-width: 3 !important;
        }
      `}</style>
      
      <div className="flex h-full bg-background">
        {showNodePalette && (
          <div className="w-80 border-r border-border bg-card/50 backdrop-blur-sm">
            <NodePalette />
          </div>
        )}

        <div className="flex-1 flex flex-col">
          <Card className="mb-0 rounded-none border-b shadow-none">
            <CardHeader className="py-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20">
                    <Workflow className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-semibold">Agent Workflow Builder</CardTitle>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNodePalette(!showNodePalette)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {showNodePalette ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                    {showNodePalette ? "Hide" : "Show"} Palette
                  </Button>
                  
                  <Separator orientation="vertical" className="h-6" />
                  
                  <Button
                    variant="ghost"
                    onClick={() => setShowSettings(true)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </Button>
                  
                  <Button variant="outline">
                    <Save className="h-4 w-4" />
                    Save
                  </Button>
                  
                  <Button variant="outline">
                    <Share className="h-4 w-4" />
                    Share
                  </Button>
                  
                  <Button>
                    <Play className="h-4 w-4" />
                    Run Workflow
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <div className="flex-1 border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={onDragOver}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              connectionLineType={ConnectionLineType.SmoothStep}
              connectionLineStyle={{ 
                strokeWidth: 2, 
                stroke: '#6366f1',
              }}
              fitView
              className="bg-transparent"
            >
              <Controls 
                className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg shadow-lg"
                showZoom={true}
                showFitView={true}
                showInteractive={true}
              />
              <MiniMap 
                className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg shadow-lg"
                nodeColor={(node) => {
                  if (node.type === 'agentNode') return '#6366f1';
                  return '#9ca3af';
                }}
              />
              <Background 
                variant={BackgroundVariant.Dots} 
                gap={20} 
                size={1}
                className="opacity-30 dark:opacity-20"
              />
            </ReactFlow>
          </div>

          <Card className="rounded-none border-border/50 bg-card/80 backdrop-blur-sm">
            <CardContent className="py-0">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-muted-foreground">Ready</span>
                  </div>
                  <Separator orientation="vertical" className="h-4" />
                  <span className="text-muted-foreground">
                    {nodes.length} nodes, {edges.length} connections
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                    <Zap className="h-3 w-3 mr-1" />
                    AgentPress
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <WorkflowSettings 
          open={showSettings} 
          onOpenChange={setShowSettings} 
          nodes={nodes}
          edges={edges}
        />
      </div>
    </>
  );
} 