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

import useLayout from './hooks/useLayout';
import nodeTypes from './NodeTypes';
import edgeTypes from './EdgeTypes';
import { ConditionalStep } from '@/components/agents/workflows/conditional-workflow-builder';
import { uuid } from './utils';
import { convertWorkflowToReactFlow, convertReactFlowToWorkflow } from './utils/conversion';
import { Button } from '@/components/ui/button';
import { Plus, GitBranch } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

const proOptions: ProOptions = { account: 'paid-pro', hideAttribution: true };

interface ReactFlowWorkflowBuilderProps {
  steps: ConditionalStep[];
  onStepsChange: (steps: ConditionalStep[]) => void;
  agentTools?: {
    agentpress_tools: Array<{ name: string; description: string; icon?: string; enabled: boolean }>;
    mcp_tools: Array<{ name: string; description: string; icon?: string; server?: string }>;
  };
  isLoadingTools?: boolean;
}

function ReactFlowWorkflowBuilderInner({ 
  steps, 
  onStepsChange, 
  agentTools,
  isLoadingTools 
}: ReactFlowWorkflowBuilderProps) {
  // This hook call ensures that the layout is re-calculated every time the graph changes
  useLayout();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  // Debug wrapper for node changes
  const onNodesChangeDebug = useCallback((changes: any) => {
    console.log('=== NODES CHANGED ===');
    console.log('Node changes:', changes);
    onNodesChange(changes);
  }, [onNodesChange]);
  
  // Debug wrapper for edge changes
  const onEdgesChangeDebug = useCallback((changes: any) => {
    console.log('=== EDGES CHANGED ===');
    console.log('Edge changes:', changes);
    onEdgesChange(changes);
  }, [onEdgesChange]);
  const [isInternalUpdate, setIsInternalUpdate] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const lastConvertedSteps = useRef<string>('');
  
  // Debug: Monitor nodes/edges state changes
  useEffect(() => {
    console.log('=== NODES STATE CHANGED ===');
    console.log('Current nodes count:', nodes.length);
    console.log('Current nodes:', nodes.map(n => ({ id: n.id, name: n.data.name })));
  }, [nodes]);
  
  useEffect(() => {
    console.log('=== EDGES STATE CHANGED ===');
    console.log('Current edges count:', edges.length);
    console.log('Current edges:', edges.map(e => ({ id: e.id, source: e.source, target: e.target })));
  }, [edges]);

  // Sync React Flow state back to parent
  useEffect(() => {
    console.log('=== SYNC USEEFFECT TRIGGERED ===');
    console.log('isInternalUpdate:', isInternalUpdate);
    console.log('nodes.length:', nodes.length);
    
    if (!isInternalUpdate && nodes.length > 0) {
      console.log('=== SYNC: Converting React Flow to workflow ===');
      const convertedSteps = convertReactFlowToWorkflow(nodes, edges);
      const convertedStepsStr = JSON.stringify(convertedSteps);
      
      console.log('Converted steps:', convertedSteps);
      console.log('Previous steps hash:', lastConvertedSteps.current);
      console.log('Current steps hash:', convertedStepsStr);
      
      if (convertedStepsStr !== lastConvertedSteps.current) {
        console.log('Steps changed, updating parent');
        console.log('Calling onStepsChange with:', convertedSteps);
        lastConvertedSteps.current = convertedStepsStr;
        onStepsChange(convertedSteps);
      } else {
        console.log('Steps unchanged, skipping update');
      }
    } else {
      console.log('Skipping sync - isInternalUpdate:', isInternalUpdate, 'nodes.length:', nodes.length);
    }
  }, [nodes, edges, isInternalUpdate, onStepsChange]);

  // Initialize from steps or with default
  useEffect(() => {
    console.log('=== INITIALIZATION ===');
    console.log('Steps from parent:', steps);
    console.log('Steps count:', steps.length);
    
    setIsInternalUpdate(true);
    
    if (steps.length > 0) {
      console.log('Converting existing steps to React Flow format');
      // Convert existing steps to React Flow format
      const { nodes: convertedNodes, edges: convertedEdges } = convertWorkflowToReactFlow(steps);
      
      console.log('Converted nodes:', convertedNodes);
      console.log('Converted edges:', convertedEdges);
      
      // Add agentTools and handlers to each node
      const nodesWithTools = convertedNodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          onDelete: handleNodeDelete,
          agentTools,
          isLoadingTools,
        }
      }));
      
      setNodes(nodesWithTools);
      setEdges(convertedEdges);
    } else if (nodes.length === 0) {
      console.log('No steps from parent, creating default node');
      // Initialize with default node
      const defaultNodes: Node[] = [
        {
          id: '1',
          data: { 
            name: 'Start',
            description: 'Click to add steps or use the Add Node button',
            onDelete: handleNodeDelete,
            agentTools,
            isLoadingTools,
          },
          position: { x: 0, y: 0 },
          type: 'step',
        },
      ];

      setNodes(defaultNodes);
    }
    
    // Reset flag after state updates
    setTimeout(() => {
      console.log('Resetting isInternalUpdate flag');
      setIsInternalUpdate(false);
    }, 100);
  }, []); // Only run on mount

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
    
    // Calculate position based on existing nodes
    const existingNodes = nodes;
    let position = { x: 0, y: 0 };
    let sourceNode = null;
    
    if (selectedNode) {
      // Add after selected node
      sourceNode = nodes.find(n => n.id === selectedNode);
      if (sourceNode) {
        position = { x: sourceNode.position.x, y: sourceNode.position.y + 150 };
      }
    } else if (existingNodes.length > 0) {
      // Find the bottommost node
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
      },
    };

    console.log('Adding new node:', newNode);
    console.log('Current nodes count:', nodes.length);
    console.log('Source node:', sourceNode);

    setNodes((nds) => {
      console.log('Setting nodes - before:', nds.length);
      const newNodes = [...nds, newNode];
      console.log('Setting nodes - after:', newNodes.length);
      return newNodes;
    });

    // Connect to source node if exists
    if (sourceNode) {
      const newEdge = {
        id: `${sourceNode.id}->${newNodeId}`,
        source: sourceNode.id,
        target: newNodeId,
        type: 'workflow',
      };
      
      console.log('Adding new edge:', newEdge);
      
      setEdges((eds) => {
        console.log('Setting edges - before:', eds.length);
        const newEdges = [...eds, newEdge];
        console.log('Setting edges - after:', newEdges.length);
        return newEdges;
      });
    }
  }, [nodes, selectedNode, handleNodeDelete, setNodes, setEdges, agentTools, isLoadingTools]);

  const addConditionBranch = useCallback((type: 'if' | 'if-else' | 'if-elseif-else') => {
    if (!selectedNode) {
      toast.error('Please select a node first to add conditions');
      return;
    }

    const sourceNode = nodes.find(n => n.id === selectedNode);
    if (!sourceNode) return;

    const conditions: Array<{ type: 'if' | 'elseif' | 'else'; id: string }> = [];
    
    // Create condition nodes based on type
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

    // Create condition nodes
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
        },
      };
      
      newNodes.push(conditionNode);
      
      // Connect source to condition
      newEdges.push({
        id: `${sourceNode.id}->${condition.id}`,
        source: sourceNode.id,
        target: condition.id,
        type: 'workflow',
        label: condition.type === 'if' ? 'if' :
               condition.type === 'elseif' ? 'else if' : 'else',
        labelStyle: { fill: '#666', fontSize: 12 },
        labelBgStyle: { fill: '#fff' },
      });
    });

    // Add all new nodes and edges
    setNodes((nds) => [...nds, ...newNodes]);
    setEdges((eds) => [...eds, ...newEdges]);
  }, [selectedNode, nodes, handleNodeDelete, setNodes, setEdges]);

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
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
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

export function ReactFlowWorkflowBuilder(props: ReactFlowWorkflowBuilderProps) {
  return (
    <ReactFlowProvider>
      <ReactFlowWorkflowBuilderInner {...props} />
    </ReactFlowProvider>
  );
} 