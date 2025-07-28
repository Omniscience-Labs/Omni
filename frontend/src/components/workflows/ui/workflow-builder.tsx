'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Edge,
  Node,
  ProOptions,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Controls,
  Panel,
  BackgroundVariant,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import './index.css';

import useLayout from './hooks/use-layout';
import nodeTypes from './node-types';
import edgeTypes from './edge-types';
import { ConditionalStep } from '@/components/agents/workflows/conditional-workflow-builder';
import { uuid } from './utils';
import { convertWorkflowToReactFlow, convertReactFlowToWorkflow } from './utils/conversion';
import { validateWorkflow, canDeleteNode, autoFixWorkflow } from './utils/validation';
import { Button } from '@/components/ui/button';
import { Plus, GitBranch, AlertCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

const proOptions: ProOptions = { account: 'paid-pro', hideAttribution: true };

interface WorkflowBuilderProps {
  steps: ConditionalStep[];
  onStepsChange: (steps: ConditionalStep[]) => void;
  agentTools?: {
    agentpress_tools: Array<{ name: string; description: string; icon?: string; enabled: boolean }>;
    mcp_tools: Array<{ name: string; description: string; icon?: string; server?: string }>;
  };
  isLoadingTools?: boolean;
  agentId?: string;
  versionData?: {
    version_id: string;
    configured_mcps: any[];
    custom_mcps: any[];
    system_prompt: string;
    agentpress_tools: any;
  };
  onToolsUpdate?: () => void;
}

function WorkflowBuilderInner({ 
  steps, 
  onStepsChange, 
  agentTools,
  isLoadingTools,
  agentId,
  versionData,
  onToolsUpdate
}: WorkflowBuilderProps) {
  useLayout();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showToolsManager, setShowToolsManager] = useState(false);
  
  const onNodesChangeDebug = useCallback((changes: any) => {
    onNodesChange(changes);
  }, [onNodesChange]);
  
  const onEdgesChangeDebug = useCallback((changes: any) => {
    onEdgesChange(changes);
  }, [onEdgesChange]);

  const [isInternalUpdate, setIsInternalUpdate] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const lastConvertedSteps = useRef<string>('');
  
  useEffect(() => {
    if (!isInternalUpdate && nodes.length > 0) {
      const convertedSteps = convertReactFlowToWorkflow(nodes, edges);
      const convertedStepsStr = JSON.stringify(convertedSteps);
      if (convertedStepsStr !== lastConvertedSteps.current) {
        lastConvertedSteps.current = convertedStepsStr;
        onStepsChange(convertedSteps);
      }
    }
  }, [nodes, edges, isInternalUpdate, onStepsChange]);

  useEffect(() => {
    setIsInternalUpdate(true);
    if (steps.length > 0) {
      const { nodes: convertedNodes, edges: convertedEdges } = convertWorkflowToReactFlow(steps);
      const nodesWithTools = convertedNodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          onDelete: handleNodeDelete,
          agentTools,
          isLoadingTools,
          agentId,
          versionData,
          onToolsUpdate,
        }
      }));
      
      setNodes(nodesWithTools);
      setEdges(convertedEdges);
    } else if (nodes.length === 0) {
      const defaultNodes: Node[] = [
        {
          id: '1',
          data: { 
            name: 'Start',
            description: 'Click to add steps or use the Add Node button',
            onDelete: handleNodeDelete,
            agentTools,
            isLoadingTools,
            agentId,
            versionData,
            onToolsUpdate,
          },
          position: { x: 0, y: 0 },
          type: 'step',
        },
      ];

      setNodes(defaultNodes);
    }
    
    setTimeout(() => {
      setIsInternalUpdate(false);
    }, 100);
  }, [agentTools, isLoadingTools, versionData, onToolsUpdate]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleNodeDelete = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
  }, [setNodes, setEdges]);

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node.id);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const addNewStep = useCallback(() => {
    console.log('=== ADDING NEW STEP ===');
    
    const newNodeId = uuid();
    
    const existingNodes = nodes;
    let position = { x: 0, y: 0 };
    let sourceNode = null;
    
    if (selectedNode) {
      sourceNode = nodes.find(n => n.id === selectedNode);
      if (sourceNode) {
        position = { x: sourceNode.position.x, y: sourceNode.position.y + 150 };
      }
    } else if (existingNodes.length > 0) {
      const bottomNode = existingNodes.reduce((prev, current) => 
        prev.position.y > current.position.y ? prev : current
      );
      sourceNode = bottomNode;
      position = { x: bottomNode.position.x, y: bottomNode.position.y + 150 };
    }
    
    const newNode: Node = {
      id: newNodeId,
      type: 'step',
      position,
      data: {
        name: 'New Step',
        description: '',
        hasIssues: true,
        onDelete: handleNodeDelete,
        agentTools,
        isLoadingTools,
        agentId,
        versionData,
        onToolsUpdate,
      },
    };

    setNodes((nds) => {
      const newNodes = [...nds, newNode];
      return newNodes;
    });

    if (sourceNode) {
      const newEdge = {
        id: `${sourceNode.id}->${newNodeId}`,
        source: sourceNode.id,
        target: newNodeId,
        type: 'workflow',
      };
      
      setEdges((eds) => {
        const existingEdge = eds.find(e => e.id === newEdge.id);
        if (existingEdge) {
          return eds;
        }
        const newEdges = [...eds, newEdge];
        return newEdges;
      });
    }
  }, [nodes, selectedNode, handleNodeDelete, setNodes, setEdges, agentTools, isLoadingTools, versionData, onToolsUpdate]);

  const addConditionBranch = useCallback((type: 'if' | 'if-else' | 'if-elseif-else') => {
    if (!selectedNode) {
      toast.error('Please select a node first to add conditions');
      return;
    }

    const sourceNode = nodes.find(n => n.id === selectedNode);
    if (!sourceNode) return;

    const conditions: Array<{ type: 'if' | 'elseif' | 'else'; id: string }> = [];
    
    if (type === 'if') {
      conditions.push({ type: 'if', id: uuid() });
    } else if (type === 'if-else') {
      conditions.push({ type: 'if', id: uuid() });
      conditions.push({ type: 'else', id: uuid() });
    } else {
      conditions.push({ type: 'if', id: uuid() });
      conditions.push({ type: 'elseif', id: uuid() });
      conditions.push({ type: 'else', id: uuid() });
    }

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    const xSpacing = 300;
    const startX = sourceNode.position.x - ((conditions.length - 1) * xSpacing / 2);

    conditions.forEach((condition, index) => {
      const conditionNode: Node = {
        id: condition.id,
        type: 'condition',
        position: {
          x: startX + index * xSpacing,
          y: sourceNode.position.y + 150,
        },
        data: {
          conditionType: condition.type,
          expression: condition.type !== 'else' ? '' : undefined,
          onDelete: handleNodeDelete,
          agentTools,
          isLoadingTools,
          agentId,
          versionData,
          onToolsUpdate,
        },
      };
      
      newNodes.push(conditionNode);
      
      const conditionEdge = {
        id: `${sourceNode.id}->${condition.id}`,
        source: sourceNode.id,
        target: condition.id,
        type: 'workflow',
        label: condition.type === 'if' ? 'if' :
               condition.type === 'elseif' ? 'else if' : 'else',
        labelStyle: { fill: '#666', fontSize: 12 },
        labelBgStyle: { fill: '#fff' },
      };
      
      if (!newEdges.find(e => e.id === conditionEdge.id)) {
        newEdges.push(conditionEdge);
      }
    });

    setNodes((nds) => [...nds, ...newNodes]);
    setEdges((eds) => {
      const combinedEdges = [...eds, ...newEdges];
      const uniqueEdges = combinedEdges.filter((edge, index, self) => 
        index === self.findIndex(e => e.id === edge.id)
      );
      return uniqueEdges;
    });
  }, [selectedNode, nodes, handleNodeDelete, setNodes, setEdges, agentTools, isLoadingTools, versionData, onToolsUpdate]);

  return (
    <div className="h-full w-full border rounded-none border-none bg-muted/10 react-flow-container">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChangeDebug}
        onEdgesChange={onEdgesChangeDebug}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        proOptions={proOptions}
        fitView
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={1.5}
        nodesDraggable={true}
        nodesConnectable={true}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        snapToGrid={true}
        snapGrid={[15, 15]}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls />
        <Panel position="top-left" className="react-flow__panel">
          <div className="workflow-panel-actions">
            <Button 
              variant="outline" 
              size="sm"
              onClick={addNewStep}
            >
              <Plus className="h-4 w-4" />
              Add Step
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <GitBranch className="h-4 w-4" />
                  Add Condition
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => addConditionBranch('if')}>
                  <span className="text-xs font-mono mr-2">if</span>
                  Single condition
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addConditionBranch('if-else')}>
                  <span className="text-xs font-mono mr-2">if-else</span>
                  Two branches
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addConditionBranch('if-elseif-else')}>
                  <span className="text-xs font-mono mr-2">if-elif-else</span>
                  Three branches
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

          </div>
          
          {selectedNode && (
            <div className="workflow-panel-selection">
              Node selected: {nodes.find(n => n.id === selectedNode)?.data.name || selectedNode}
            </div>
          )}
        </Panel>
      </ReactFlow>


    </div>
  );
}

export function WorkflowBuilder(props: WorkflowBuilderProps) {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner {...props} />
    </ReactFlowProvider>
  );
} 