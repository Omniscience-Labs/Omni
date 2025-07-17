import { useEffect, useRef } from 'react';
import {
  useReactFlow,
  useStore,
  Node,
  Edge,
  ReactFlowState,
} from '@xyflow/react';

function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) {
    return [];
  }

  const children: Map<string, string[]> = new Map();
  const parents: Map<string, string[]> = new Map();
  
  nodes.forEach(node => {
    children.set(node.id, []);
    parents.set(node.id, []);
  });
  
  edges.forEach(edge => {
    const childList = children.get(edge.source) || [];
    childList.push(edge.target);
    children.set(edge.source, childList);
    
    const parentList = parents.get(edge.target) || [];
    parentList.push(edge.source);
    parents.set(edge.target, parentList);
  });
  
  const roots = nodes.filter(node => (parents.get(node.id) || []).length === 0);
  
  if (roots.length === 0 && nodes.length > 0) {
    roots.push(nodes[0]);
  }
  
  const levels: Map<string, number> = new Map();
  const visited: Set<string> = new Set();
  const queue: Array<{id: string, level: number}> = [];
  
  roots.forEach(root => {
    queue.push({id: root.id, level: 0});
    visited.add(root.id);
    levels.set(root.id, 0);
  });
  
  while (queue.length > 0) {
    const {id, level} = queue.shift()!;
    
    const nodeChildren = children.get(id) || [];
    nodeChildren.forEach(childId => {
      if (!visited.has(childId)) {
        visited.add(childId);
        levels.set(childId, level + 1);
        queue.push({id: childId, level: level + 1});
      } else {
        const currentLevel = levels.get(childId) || 0;
        if (level + 1 > currentLevel) {
          levels.set(childId, level + 1);
        }
      }
    });
  }
  
  const nodesByLevel: Map<number, Node[]> = new Map();
  let maxLevel = 0;
  
  nodes.forEach(node => {
    const level = levels.get(node.id) || 0;
    maxLevel = Math.max(maxLevel, level);
    const nodesAtLevel = nodesByLevel.get(level) || [];
    nodesAtLevel.push(node);
    nodesByLevel.set(level, nodesAtLevel);
  });
  
  const xSpacing = 200;
  const ySpacing = 120;
  const layoutedNodes: Node[] = [];
  
  for (let level = 0; level <= maxLevel; level++) {
    const nodesAtLevel = nodesByLevel.get(level) || [];
    if (nodesAtLevel.length > 0) {
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

const nodeCountSelector = (state: ReactFlowState) => state.nodeLookup.size;

function useLayout() {
  const initial = useRef(true);
  const nodeCount = useStore(nodeCountSelector);
  const { getNodes, setNodes, getEdges, fitView } = useReactFlow();
  const previousNodeCount = useRef(nodeCount);

  useEffect(() => {
    const nodes = getNodes();
    const edges = getEdges();
    
    if (nodeCount !== previousNodeCount.current || initial.current) {
      const layoutedNodes = layoutNodes(nodes, edges);
      
      setNodes(layoutedNodes);
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