import { useEffect, useRef } from 'react';
import {
  useReactFlow,
  useStore,
  Node,
  Edge,
  ReactFlowState,
} from '@xyflow/react';

// Simple vertical layout function with better handling of dynamic nodes
function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) {
    return [];
  }

  // Create adjacency lists for both directions
  const children: Map<string, string[]> = new Map();
  const parents: Map<string, string[]> = new Map();
  
  // Initialize
  nodes.forEach(node => {
    children.set(node.id, []);
    parents.set(node.id, []);
  });
  
  // Build graph
  edges.forEach(edge => {
    const childList = children.get(edge.source) || [];
    childList.push(edge.target);
    children.set(edge.source, childList);
    
    const parentList = parents.get(edge.target) || [];
    parentList.push(edge.source);
    parents.set(edge.target, parentList);
  });
  
  // Find root nodes (nodes with no parents)
  const roots = nodes.filter(node => (parents.get(node.id) || []).length === 0);
  
  // If no roots, use first node
  if (roots.length === 0 && nodes.length > 0) {
    roots.push(nodes[0]);
  }
  
  // Calculate levels using BFS
  const levels: Map<string, number> = new Map();
  const visited: Set<string> = new Set();
  const queue: Array<{id: string, level: number}> = [];
  
  // Start from all roots
  roots.forEach(root => {
    queue.push({id: root.id, level: 0});
    visited.add(root.id);
    levels.set(root.id, 0);
  });
  
  // BFS to assign levels
  while (queue.length > 0) {
    const {id, level} = queue.shift()!;
    
    const nodeChildren = children.get(id) || [];
    nodeChildren.forEach(childId => {
      if (!visited.has(childId)) {
        visited.add(childId);
        levels.set(childId, level + 1);
        queue.push({id: childId, level: level + 1});
      } else {
        // Update level if we found a longer path
        const currentLevel = levels.get(childId) || 0;
        if (level + 1 > currentLevel) {
          levels.set(childId, level + 1);
        }
      }
    });
  }
  
  // Group nodes by level
  const nodesByLevel: Map<number, Node[]> = new Map();
  let maxLevel = 0;
  
  nodes.forEach(node => {
    const level = levels.get(node.id) || 0;
    maxLevel = Math.max(maxLevel, level);
    const nodesAtLevel = nodesByLevel.get(level) || [];
    nodesAtLevel.push(node);
    nodesByLevel.set(level, nodesAtLevel);
  });
  
  // Position nodes
  const xSpacing = 200; // Reduced from 250 to 180 for tighter horizontal spacing
  const ySpacing = 120; // Reduced from 150 to 120 for tighter vertical spacing
  const layoutedNodes: Node[] = [];
  
  // Calculate positions level by level
  for (let level = 0; level <= maxLevel; level++) {
    const nodesAtLevel = nodesByLevel.get(level) || [];
    
    if (nodesAtLevel.length > 0) {
      // Sort nodes at this level by their parent's x position for better alignment
      if (level > 0) {
        nodesAtLevel.sort((a, b) => {
          const aParents = parents.get(a.id) || [];
          const bParents = parents.get(b.id) || [];
          
          if (aParents.length > 0 && bParents.length > 0) {
            const aParentX = layoutedNodes.find(n => n.id === aParents[0])?.position.x || 0;
            const bParentX = layoutedNodes.find(n => n.id === bParents[0])?.position.x || 0;
            return aParentX - bParentX;
          }
          
          return 0;
        });
      }
      
      // Calculate x positions
      const totalWidth = (nodesAtLevel.length - 1) * xSpacing;
      const startX = -totalWidth / 2;
      
      nodesAtLevel.forEach((node, index) => {
        layoutedNodes.push({
          ...node,
          position: {
            x: startX + index * xSpacing,
            y: level * ySpacing
          }
        });
      });
    }
  }
  
  return layoutedNodes;
}

// This is the store selector that is used for triggering the layout
const nodeCountSelector = (state: ReactFlowState) => state.nodeLookup.size;

function useLayout() {
  const initial = useRef(true);
  const nodeCount = useStore(nodeCountSelector);
  const { getNodes, setNodes, getEdges, fitView } = useReactFlow();
  const previousNodeCount = useRef(nodeCount);

  useEffect(() => {
    const nodes = getNodes();
    const edges = getEdges();
    
    // Only re-layout if nodes were added/removed or on initial load
    if (nodeCount !== previousNodeCount.current || initial.current) {
      // Run the layout
      const layoutedNodes = layoutNodes(nodes, edges);
      
      // Update node positions
      setNodes(layoutedNodes);
      
      // Fit view
      setTimeout(() => {
        fitView({ 
          duration: 200, 
          padding: 0.2,
          maxZoom: 1.2,
        });
      }, 50);
      
      if (initial.current) {
        initial.current = false;
      }
      
      previousNodeCount.current = nodeCount;
    }
  }, [nodeCount, getEdges, getNodes, setNodes, fitView]);
}

export default useLayout; 