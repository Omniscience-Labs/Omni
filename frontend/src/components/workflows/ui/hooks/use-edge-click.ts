import { EdgeProps, useReactFlow } from '@xyflow/react';
import { uuid } from '../utils';

function useEdgeClick(id: EdgeProps['id']) {
  const { setEdges, setNodes, getNode, getEdge } = useReactFlow();
  
  const handleNodeDelete = (nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
  };

  const addStepOnEdge = () => {
    const edge = getEdge(id);
    if (!edge) {
      return;
    }

    const targetNode = getNode(edge.target);
    if (!targetNode) {
      return;
    }

    const insertNodeId = uuid();
    const sourceNode = getNode(edge.source);

    const insertNode = {
      id: insertNodeId,
      position: { x: targetNode.position.x, y: targetNode.position.y },
      data: { 
        name: 'New Step',
        description: '',
        hasIssues: true,
        onDelete: handleNodeDelete,
        agentTools: sourceNode?.data.agentTools,
        isLoadingTools: sourceNode?.data.isLoadingTools,
      },
      type: 'step',
    };

    const sourceEdge = {
      id: `${edge.source}->${insertNodeId}`,
      source: edge.source,
      target: insertNodeId,
      type: 'workflow',
    };

    const targetEdge = {
      id: `${insertNodeId}->${edge.target}`,
      source: insertNodeId,
      target: edge.target,
      type: 'workflow',
    };

    setEdges((edges) =>
      edges.filter((e) => e.id !== id).concat([sourceEdge, targetEdge])
    );

    setNodes((nodes) => {
      const targetNodeIndex = nodes.findIndex(
        (node) => node.id === edge.target
      );

      return [
        ...nodes.slice(0, targetNodeIndex),
        insertNode,
        ...nodes.slice(targetNodeIndex, nodes.length),
      ];
    });
  };

  const addConditionOnEdge = (type: 'if' | 'if-else' | 'if-elseif-else', connectBranches: string[] = []) => {
    const edge = getEdge(id);
    if (!edge) {
      return;
    }

    const targetNode = getNode(edge.target);
    const sourceNode = getNode(edge.source);
    if (!targetNode || !sourceNode) {
      return;
    }

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

    const newNodes: any[] = [];
    const newEdges: any[] = [];
    const xSpacing = 300;
    const conditionY = sourceNode.position.y + 120; // Position conditions between source and target
    const startX = sourceNode.position.x - ((conditions.length - 1) * xSpacing / 2);
    
    // Move the target node down to make room for conditions
    const updatedTargetY = conditionY + 120;

    conditions.forEach((condition, index) => {
      const conditionNode = {
        id: condition.id,
        type: 'condition',
        position: {
          x: startX + index * xSpacing,
          y: conditionY,
        },
        data: {
          conditionType: condition.type,
          expression: condition.type !== 'else' ? '' : undefined,
          onDelete: handleNodeDelete,
        },
      };
      
      newNodes.push(conditionNode);
      
      const conditionEdge = {
        id: `${edge.source}->${condition.id}`,
        source: edge.source,
        target: condition.id,
        type: 'workflow',
        label: condition.type === 'if' ? 'if' :
               condition.type === 'elseif' ? 'else if' : 'else',
        labelStyle: { fill: '#666', fontSize: 12 },
        labelBgStyle: { fill: '#fff' },
      };
      
      newEdges.push(conditionEdge);

      // Connect only the selected branches to the target
      if (connectBranches.includes(condition.type)) {
        const conditionToTargetEdge = {
          id: `${condition.id}->${edge.target}`,
          source: condition.id,
          target: edge.target,
          type: 'workflow',
        };
        
        newEdges.push(conditionToTargetEdge);
      }
      // Other branches remain unconnected for manual connection
    });

    // Remove the original edge and add the new nodes and edges
    setEdges((edges) =>
      edges.filter((e) => e.id !== id).concat(newEdges)
    );

    // Update the target node position to make room for conditions
    setNodes((nodes) => [
      ...nodes.map(node => 
        node.id === edge.target 
          ? { ...node, position: { ...node.position, y: updatedTargetY } }
          : node
      ),
      ...newNodes
    ]);
  };

  return { addStepOnEdge, addConditionOnEdge };
}

export default useEdgeClick; 