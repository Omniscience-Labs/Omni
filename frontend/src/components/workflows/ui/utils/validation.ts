import { Node, Edge } from '@xyflow/react';
import { ConditionalStep } from '@/components/agents/workflows/conditional-workflow-builder';

// Validation types
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Node validation
export function validateNode(node: Node): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check if node has required data
  if (!node.data) {
    errors.push('Node is missing data');
  }
  
  // Step node validation
  if (node.type === 'step') {
    if (!node.data.name || node.data.name === 'New Step' || node.data.name === 'Unnamed Step') {
      errors.push('Step must have a meaningful name');
    }
    
    if (!node.data.description) {
      warnings.push('Step should have a description');
    }
  }
  
  // Condition node validation
  if (node.type === 'condition') {
    const conditionType = node.data.conditionType;
    
    if (!conditionType) {
      errors.push('Condition must have a type');
    }
    
    if ((conditionType === 'if' || conditionType === 'elseif') && !node.data.expression) {
      errors.push('Condition must have an expression');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// Workflow validation
export function validateWorkflow(nodes: Node[], edges: Edge[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check if workflow is empty
  if (nodes.length === 0) {
    warnings.push('Workflow is empty');
    return { isValid: true, errors, warnings };
  }
  
  // Check for disconnected nodes
  const connectedNodeIds = new Set<string>();
  edges.forEach(edge => {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  });
  
  const disconnectedNodes = nodes.filter(node => 
    !connectedNodeIds.has(node.id) && nodes.length > 1
  );
  
  if (disconnectedNodes.length > 0) {
    warnings.push(`${disconnectedNodes.length} node(s) are not connected`);
  }
  
  // Check for circular dependencies
  if (hasCircularDependency(nodes, edges)) {
    errors.push('Workflow contains circular dependencies');
  }
  
  // Validate individual nodes
  nodes.forEach(node => {
    const nodeValidation = validateNode(node);
    errors.push(...nodeValidation.errors);
    warnings.push(...nodeValidation.warnings);
  });
  
  // Check condition groups
  const conditionGroups = findConditionGroups(nodes, edges);
  conditionGroups.forEach(group => {
    const validation = validateConditionGroup(group);
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// Helper function to detect circular dependencies
function hasCircularDependency(nodes: Node[], edges: Edge[]): boolean {
  const adjacencyList = new Map<string, string[]>();
  
  // Build adjacency list
  nodes.forEach(node => adjacencyList.set(node.id, []));
  edges.forEach(edge => {
    const neighbors = adjacencyList.get(edge.source) || [];
    neighbors.push(edge.target);
    adjacencyList.set(edge.source, neighbors);
  });
  
  // DFS to detect cycles
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  function hasCycle(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    
    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }
    
    recursionStack.delete(nodeId);
    return false;
  }
  
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (hasCycle(node.id)) return true;
    }
  }
  
  return false;
}

// Find condition groups (if/elseif/else chains)
interface ConditionGroup {
  nodes: Node[];
  parentId: string | null;
}

function findConditionGroups(nodes: Node[], edges: Edge[]): ConditionGroup[] {
  const groups: ConditionGroup[] = [];
  const processedNodes = new Set<string>();
  
  nodes.forEach(node => {
    if (node.type === 'condition' && !processedNodes.has(node.id)) {
      const group: ConditionGroup = {
        nodes: [],
        parentId: null
      };
      
      // Find parent node
      const parentEdge = edges.find(edge => edge.target === node.id);
      if (parentEdge) {
        group.parentId = parentEdge.source;
        
        // Find all conditions with same parent
        const siblingConditions = nodes.filter(n => {
          if (n.type !== 'condition') return false;
          const edge = edges.find(e => e.target === n.id);
          return edge && edge.source === parentEdge.source;
        });
        
        group.nodes = siblingConditions;
        siblingConditions.forEach(n => processedNodes.add(n.id));
      }
      
      if (group.nodes.length > 0) {
        groups.push(group);
      }
    }
  });
  
  return groups;
}

// Validate condition group
function validateConditionGroup(group: ConditionGroup): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check for valid condition types
  const types = group.nodes.map(n => n.data.conditionType);
  const ifCount = types.filter(t => t === 'if').length;
  const elseCount = types.filter(t => t === 'else').length;
  
  if (ifCount === 0) {
    errors.push('Condition group must start with an "if" condition');
  }
  
  if (ifCount > 1) {
    errors.push('Condition group can only have one "if" condition');
  }
  
  if (elseCount > 1) {
    errors.push('Condition group can only have one "else" condition');
  }
  
  // Check order: if -> elseif* -> else?
  let foundElse = false;
  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    
    if (i === 0 && type !== 'if') {
      errors.push('Condition group must start with "if"');
    }
    
    if (type === 'else') {
      foundElse = true;
    } else if (foundElse) {
      errors.push('"else" must be the last condition in a group');
    }
  }
  
  return { isValid: errors.length === 0, errors, warnings };
}

// Check if a node can be safely deleted
export function canDeleteNode(nodeId: string, nodes: Node[], edges: Edge[]): {
  canDelete: boolean;
  reason?: string;
} {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) {
    return { canDelete: false, reason: 'Node not found' };
  }
  
  // Don't delete if it's the only node
  if (nodes.length === 1) {
    return { canDelete: false, reason: 'Cannot delete the last node' };
  }
  
  // Check if deleting this node would create orphaned nodes
  const outgoingEdges = edges.filter(e => e.source === nodeId);
  const incomingEdges = edges.filter(e => e.target === nodeId);
  
  // If node has children that would become disconnected
  if (outgoingEdges.length > 0 && incomingEdges.length === 0) {
    const childNodes = outgoingEdges.map(e => e.target);
    const wouldOrphan = childNodes.some(childId => {
      const otherIncoming = edges.filter(e => 
        e.target === childId && e.source !== nodeId
      );
      return otherIncoming.length === 0;
    });
    
    if (wouldOrphan) {
      return { 
        canDelete: false, 
        reason: 'Deleting this node would create disconnected nodes' 
      };
    }
  }
  
  return { canDelete: true };
}

// Position validation
export function validateNodePosition(position: { x: number; y: number }): boolean {
  // Ensure positions are within reasonable bounds
  const MAX_POSITION = 10000;
  const MIN_POSITION = -10000;
  
  return (
    position.x >= MIN_POSITION &&
    position.x <= MAX_POSITION &&
    position.y >= MIN_POSITION &&
    position.y <= MAX_POSITION &&
    !isNaN(position.x) &&
    !isNaN(position.y)
  );
}

// Auto-fix common issues
export function autoFixWorkflow(nodes: Node[], edges: Edge[]): {
  nodes: Node[];
  edges: Edge[];
  fixes: string[];
} {
  const fixes: string[] = [];
  let updatedNodes = [...nodes];
  let updatedEdges = [...edges];
  
  // Fix invalid positions
  updatedNodes = updatedNodes.map(node => {
    if (!validateNodePosition(node.position)) {
      fixes.push(`Fixed invalid position for node "${node.data.name || node.id}"`);
      return {
        ...node,
        position: { x: 0, y: 0 }
      };
    }
    return node;
  });
  
  // Remove duplicate edges
  const edgeSet = new Set<string>();
  const uniqueEdges: Edge[] = [];
  
  updatedEdges.forEach(edge => {
    const edgeKey = `${edge.source}-${edge.target}`;
    if (!edgeSet.has(edgeKey)) {
      edgeSet.add(edgeKey);
      uniqueEdges.push(edge);
    } else {
      fixes.push('Removed duplicate edge');
    }
  });
  updatedEdges = uniqueEdges;
  
  return {
    nodes: updatedNodes,
    edges: updatedEdges,
    fixes
  };
} 