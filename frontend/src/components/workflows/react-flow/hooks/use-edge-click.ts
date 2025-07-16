import { EdgeProps, useReactFlow } from '@xyflow/react';
import { uuid } from '../utils';

function useEdgeClick(id: EdgeProps['id']) {
  const { setEdges, setNodes, getNode, getEdge } = useReactFlow();

  const handleEdgeClick = () => {
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
        onDelete: () => {},
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

  return handleEdgeClick;
}

export default useEdgeClick; 