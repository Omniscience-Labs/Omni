import { EdgeProps, useReactFlow } from '@xyflow/react';
import { uuid } from '../utils';

// This hook implements the logic for clicking the button on a workflow edge
// On edge click: create a node in between the two nodes that are connected by the edge
function useEdgeClick(id: EdgeProps['id']) {
  const { setEdges, setNodes, getNode, getEdge } = useReactFlow();

  const handleEdgeClick = () => {
    // First retrieve the edge object to get the source and target id
    const edge = getEdge(id);

    if (!edge) {
      return;
    }

    // Retrieve the target node to get its position
    const targetNode = getNode(edge.target);

    if (!targetNode) {
      return;
    }

    // Create a unique id for newly added elements
    const insertNodeId = uuid();

    // Get source node to access agentTools
    const sourceNode = getNode(edge.source);

    // This is the node object that will be added in between source and target node
    const insertNode = {
      id: insertNodeId,
      // Place the node at the current position of the target (prevents jumping)
      position: { x: targetNode.position.x, y: targetNode.position.y },
      data: { 
        name: 'New Step',
        description: '',
        hasIssues: true,
        onDelete: () => {},
        // Pass through agentTools from source node
        agentTools: sourceNode?.data.agentTools,
        isLoadingTools: sourceNode?.data.isLoadingTools,
      },
      type: 'step',
    };

    // New connection from source to new node
    const sourceEdge = {
      id: `${edge.source}->${insertNodeId}`,
      source: edge.source,
      target: insertNodeId,
      type: 'workflow',
    };

    // New connection from new node to target
    const targetEdge = {
      id: `${insertNodeId}->${edge.target}`,
      source: insertNodeId,
      target: edge.target,
      type: 'workflow',
    };

    // Remove the edge that was clicked as we have a new connection with a node inbetween
    setEdges((edges) =>
      edges.filter((e) => e.id !== id).concat([sourceEdge, targetEdge])
    );

    // Insert the node between the source and target node in the react flow state
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