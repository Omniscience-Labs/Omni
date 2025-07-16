import { Node, Edge } from '@xyflow/react';
import { ConditionalStep } from '@/components/agents/workflows/conditional-workflow-builder';
import { uuid } from '../utils';

interface ConversionResult {
  nodes: Node[];
  edges: Edge[];
}

export function convertWorkflowToReactFlow(steps: ConditionalStep[]): ConversionResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  
  console.log('=== convertWorkflowToReactFlow ===');
  console.log('Input steps:', steps);
  console.log('Steps count:', steps.length);
  
  if (steps.length === 0) {
    return { nodes, edges };
  }
  
  // Helper function to process steps recursively
  const processSteps = (
    stepList: ConditionalStep[], 
    parentId: string | null = null,
    yOffset: number = 0,
    xOffset: number = 0
  ): { nodes: Node[]; edges: Edge[]; lastNodes: string[]; maxY: number } => {
    console.log(`Processing ${stepList.length} steps at Y:${yOffset}, parent: ${parentId}`);
    stepList.forEach((step, index) => {
      console.log(`  Step ${index}: ${step.name} (${step.type}) - ${step.children?.length || 0} children`);
    });
    
    let previousNodeId = parentId;
    let currentY = yOffset;
    let lastNodes: string[] = [];
    const localNodes: Node[] = [];
    const localEdges: Edge[] = [];
    
    for (let i = 0; i < stepList.length; i++) {
      const step = stepList[i];
      
      // Check if this is the start of a condition group
      if (step.type === 'condition') {
        // Collect all consecutive conditions (if/elseif/else group)
        const conditionGroup: ConditionalStep[] = [];
        let j = i;
        
        while (j < stepList.length && stepList[j].type === 'condition') {
          conditionGroup.push(stepList[j]);
          j++;
        }
        
        // Process the condition group as branches
        const branchResult = processConditionBranches(
          conditionGroup,
          previousNodeId,
          currentY,
          xOffset
        );
        
        localNodes.push(...branchResult.nodes);
        localEdges.push(...branchResult.edges);
        nodes.push(...branchResult.nodes);
        edges.push(...branchResult.edges);
        
        // Update tracking
        currentY = branchResult.maxY;
        lastNodes = branchResult.lastNodes;
        
        // Skip the conditions we just processed
        i = j - 1;
      } else {
        // Regular step node
        const nodeId = step.id || uuid();
        
        const node: Node = {
          id: nodeId,
          type: 'step',
          position: { x: xOffset, y: currentY },
          data: {
            name: step.name,
            description: step.description,
            hasIssues: step.hasIssues,
            tool: step.config?.tool_name,
          },
        };
        
        localNodes.push(node);
        nodes.push(node);
        
        // Connect to previous node
        if (previousNodeId) {
          const edge = {
            id: `${previousNodeId}->${nodeId}`,
            source: previousNodeId,
            target: nodeId,
            type: 'workflow',
          };
          localEdges.push(edge);
          edges.push(edge);
        }
        
        // Check if this step has nested condition children
        if (step.children && step.children.length > 0) {
          const conditionChildren = step.children.filter(child => child.type === 'condition');
          const regularChildren = step.children.filter(child => child.type !== 'condition');
          
          if (conditionChildren.length > 0) {
            console.log(`Step ${step.name} has ${conditionChildren.length} condition children`);
            
            // Process nested conditions as branches - tighter spacing
            const branchResult = processConditionBranches(
              conditionChildren,
              nodeId,
              currentY + 120, // Reduced from 150 to 120 for tighter spacing
              xOffset
            );
            
            localNodes.push(...branchResult.nodes);
            localEdges.push(...branchResult.edges);
            nodes.push(...branchResult.nodes);
            edges.push(...branchResult.edges);
            
            // Update tracking
            currentY = branchResult.maxY;
            lastNodes = branchResult.lastNodes;
          } else if (regularChildren.length > 0) {
            // Process regular children recursively
            const childResult = processSteps(
              regularChildren,
              nodeId,
              currentY + 150, // Reduced from 150 to 120 for consistency
              xOffset
            );
            
            localNodes.push(...childResult.nodes);
            localEdges.push(...childResult.edges);
            nodes.push(...childResult.nodes);
            edges.push(...childResult.edges);
            
            currentY = childResult.maxY;
            lastNodes = childResult.lastNodes;
          } else {
            previousNodeId = nodeId;
            lastNodes = [nodeId];
            currentY += 120; // Reduced from 150 to 120 for consistency
          }
        } else {
          previousNodeId = nodeId;
          lastNodes = [nodeId];
          currentY += 120; // Reduced from 150 to 120 for consistency
        }
      }
    }
    
    return { nodes: localNodes, edges: localEdges, lastNodes, maxY: currentY };
  };
  
  // Helper function to process condition branches
  const processConditionBranches = (
    conditions: ConditionalStep[],
    parentId: string | null,
    yOffset: number,
    xOffset: number
  ): { nodes: Node[]; edges: Edge[]; lastNodes: string[]; maxY: number } => {
    const branchNodes: Node[] = [];
    const branchEdges: Edge[] = [];
    const branchLastNodes: string[] = [];
    let maxY = yOffset;
    
    // Calculate x positions for branches - natural spacing
    const branchCount = conditions.length;
    const xSpacing = 200; // Clean spacing for React Flow
    const startX = xOffset - ((branchCount - 1) * xSpacing / 2);
    
    // Process each condition as a branch
    conditions.forEach((condition, index) => {
      const conditionNodeId = condition.id || uuid();
      const branchXPos = startX + index * xSpacing;
      
      // Create condition label node with natural positioning
      const conditionNode: Node = {
        id: conditionNodeId,
        type: 'condition',
        position: { x: branchXPos, y: yOffset + 100 },
        data: {
          conditionType: condition.conditions?.type || 'if',
          expression: condition.conditions?.expression || '',
        },
      };
      

      
      branchNodes.push(conditionNode);
      
      // Connect parent to condition
      if (parentId) {
        branchEdges.push({
          id: `${parentId}->${conditionNodeId}`,
          source: parentId,
          target: conditionNodeId,
          type: 'workflow',
          label: condition.conditions?.type === 'if' ? 'if' :
                 condition.conditions?.type === 'elseif' ? 'else if' : 'else',
          labelStyle: { fill: '#666', fontSize: 12 },
          labelBgStyle: { fill: '#fff' },
        });
      }
      
      // Process children of this condition
      if (condition.children && condition.children.length > 0) {
        const childResult = processSteps(
          condition.children,
          conditionNodeId,
          yOffset + 180, // Natural spacing for React Flow
          branchXPos
        );
        
        branchNodes.push(...childResult.nodes);
        branchEdges.push(...childResult.edges);
        
        // Track the last nodes in this branch
        branchLastNodes.push(...childResult.lastNodes);
        maxY = Math.max(maxY, childResult.maxY);
      } else {
        // Empty branch - condition is the end
        branchLastNodes.push(conditionNodeId);
        maxY = Math.max(maxY, yOffset + 180);
      }
    });
    
    return {
      nodes: branchNodes,
      edges: branchEdges,
      lastNodes: branchLastNodes,
      maxY,
    };
  };
  
  // Process all top-level steps
  const result = processSteps(steps, null, 0, 0);
  
  console.log('=== Final React Flow result ===');
  console.log('Nodes:', nodes.length);
  console.log('Edges:', edges.length);
  console.log('Node names:', nodes.map(n => `${n.id}:${n.data.name}(${n.type})`));
  
  return { nodes, edges };
}

// Simple, clean conversion approach
export function convertReactFlowToWorkflow(nodes: Node[], edges: Edge[]): ConditionalStep[] {
  console.log('=== CLEAN convertReactFlowToWorkflow ===');
  console.log('Input nodes:', nodes.map(n => `${n.id}:${n.data?.name || 'unnamed'}(${n.type})`));
  console.log('Input edges:', edges.map(e => `${e.source}->${e.target}(${e.label || 'no-label'})`));
  
  if (nodes.length === 0) {
    return [];
  }
  
  // Build adjacency map
  const childrenMap = new Map<string, Node[]>();
  const parentMap = new Map<string, string>();
  const edgeLabels = new Map<string, string>();
  
  nodes.forEach(node => {
    childrenMap.set(node.id, []);
  });
  
  edges.forEach(edge => {
    const children = childrenMap.get(edge.source) || [];
    const targetNode = nodes.find(n => n.id === edge.target);
    if (targetNode) {
      children.push(targetNode);
      parentMap.set(edge.target, edge.source);
      if (edge.label) {
        edgeLabels.set(edge.target, String(edge.label));
      }
    }
  });
  
  // Find root
  const rootNode = nodes.find(node => !parentMap.has(node.id));
  if (!rootNode) {
    console.log('No root node found');
    return [];
  }
  
  console.log('Root node:', rootNode.id, rootNode.data?.name);
  
  // Track visited nodes to prevent duplicates
  const visited = new Set<string>();
  
  // Convert node to step
  const convertNode = (node: Node): ConditionalStep => {
    // Mark as visited
    visited.add(node.id);
    
    const nodeData = node.data as any;
    const children = childrenMap.get(node.id) || [];
    
    if (node.type === 'step') {
      const step: ConditionalStep = {
        id: node.id,
        name: nodeData.name || 'Unnamed Step',
        description: nodeData.description || '',
        type: 'instruction',
        config: nodeData.tool ? { tool_name: nodeData.tool } : {},
        order: 0,
        enabled: true,
        hasIssues: nodeData.hasIssues || false,
        children: []
      };
      
      // Separate condition children from regular children
      const conditionChildren = children.filter(child => child.type === 'condition');
      const regularChildren = children.filter(child => child.type !== 'condition');
      
      console.log(`Step ${step.name}: ${conditionChildren.length} conditions, ${regularChildren.length} regular children`);
      
      // Process condition children as nested conditions
      conditionChildren.forEach(conditionChild => {
        if (!visited.has(conditionChild.id)) {
          const conditionStep = convertNode(conditionChild);
          step.children!.push(conditionStep);
        }
      });
      
      // Return step with regular children to be processed as siblings
      return step;
    } else if (node.type === 'condition') {
      const edgeLabel = edgeLabels.get(node.id) || 'Condition';
      
      const step: ConditionalStep = {
        id: node.id,
        name: edgeLabel,
        description: '',
        type: 'condition',
        config: {},
        conditions: {
          type: nodeData.conditionType || 'if',
          expression: nodeData.expression || '',
        },
        order: 0,
        enabled: true,
        hasIssues: false,
        children: []
      };
      
      // Process all children of this condition
      children.forEach(child => {
        if (!visited.has(child.id)) {
          const childStep = convertNode(child);
          step.children!.push(childStep);
          
          // Process any regular children as siblings
          const childRegularChildren = (childrenMap.get(child.id) || []).filter(c => c.type !== 'condition');
          childRegularChildren.forEach(grandchild => {
            if (!visited.has(grandchild.id)) {
              const grandchildStep = convertNode(grandchild);
              step.children!.push(grandchildStep);
            }
          });
        }
      });
      
      return step;
    }
    
    // Fallback
    return {
      id: node.id,
      name: 'Unknown',
      description: '',
      type: 'instruction',
      config: {},
      order: 0,
      enabled: true,
      hasIssues: true,
      children: []
    };
  };
  
  // Process from root
  const result: ConditionalStep[] = [];
  const rootStep = convertNode(rootNode);
  result.push(rootStep);
  
  // Process any unvisited regular children of root as siblings
  const rootRegularChildren = (childrenMap.get(rootNode.id) || []).filter(child => 
    child.type !== 'condition' && !visited.has(child.id)
  );
  
  rootRegularChildren.forEach(child => {
    const childStep = convertNode(child);
    result.push(childStep);
  });
  
  console.log('=== Final clean workflow result ===');
  console.log('Steps:', result.length);
  console.log('Visited nodes:', visited.size, 'of', nodes.length);
  console.log('Step details:', result.map(s => ({
    name: s.name,
    type: s.type,
    childrenCount: s.children?.length || 0,
    conditions: s.conditions?.type || 'none'
  })));
  
  return result;
} 