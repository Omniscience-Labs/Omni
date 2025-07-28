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

  if (steps.length === 0) {
    return { nodes, edges };
  }
  
  const processSteps = (
    stepList: ConditionalStep[], 
    parentId: string | null = null,
    yOffset: number = 0,
    xOffset: number = 0
  ): { nodes: Node[]; edges: Edge[]; lastNodes: string[]; maxY: number } => {
    let previousNodeId = parentId;
    let currentY = yOffset;
    let lastNodes: string[] = [];
    const localNodes: Node[] = [];
    const localEdges: Edge[] = [];
    
    for (let i = 0; i < stepList.length; i++) {
      const step = stepList[i];
      if (step.type === 'condition') {
        const conditionGroup: ConditionalStep[] = [];
        let j = i;
        
        while (j < stepList.length && stepList[j].type === 'condition') {
          conditionGroup.push(stepList[j]);
          j++;
        }
        
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
        
        currentY = branchResult.maxY;
        lastNodes = branchResult.lastNodes;
        i = j - 1;
      } else {
        const nodeId = step.id || uuid();
        
        const node: Node = {
          id: nodeId,
          type: 'step',
          position: step.position || { x: xOffset, y: currentY },
          data: {
            name: step.name,
            description: step.description,
            hasIssues: step.hasIssues,
            tool: step.config?.tool_name,
          },
        };
        
        localNodes.push(node);
        nodes.push(node);
        if (previousNodeId) {
          const edgeId = `${previousNodeId}->${nodeId}`;
          if (!edges.find(e => e.id === edgeId)) {
            const edge = {
              id: edgeId,
              source: previousNodeId,
              target: nodeId,
              type: 'workflow',
            };
            localEdges.push(edge);
            edges.push(edge);
          }
        }
        
        if (step.children && step.children.length > 0) {
          const conditionChildren = step.children.filter(child => child.type === 'condition');
          const regularChildren = step.children.filter(child => child.type !== 'condition');
          if (conditionChildren.length > 0) {
            const branchResult = processConditionBranches(
              conditionChildren,
              nodeId,
              currentY + 120,
              xOffset
            );
            
            localNodes.push(...branchResult.nodes);
            localEdges.push(...branchResult.edges);
            nodes.push(...branchResult.nodes);
            edges.push(...branchResult.edges);
            
            currentY = branchResult.maxY;
            lastNodes = branchResult.lastNodes;
          } else if (regularChildren.length > 0) {
            const childResult = processSteps(
              regularChildren,
              nodeId,
              currentY + 150,
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
            currentY += 120;
          }
        } else {
          previousNodeId = nodeId;
          lastNodes = [nodeId];
          currentY += 120;
        }
      }
    }
    
    return { nodes: localNodes, edges: localEdges, lastNodes, maxY: currentY };
  };
  
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
    
    const branchCount = conditions.length;
    const xSpacing = 200;
    const startX = xOffset - ((branchCount - 1) * xSpacing / 2);
    
    conditions.forEach((condition, index) => {
      const conditionNodeId = condition.id || uuid();
      const branchXPos = startX + index * xSpacing;
      
      const conditionNode: Node = {
        id: conditionNodeId,
        type: 'condition',
        position: condition.position || { x: branchXPos, y: yOffset + 100 },
        data: {
          conditionType: condition.conditions?.type || 'if',
          expression: condition.conditions?.expression || '',
        },
      };
      
      branchNodes.push(conditionNode);
      
      if (parentId) {
        const edgeId = `${parentId}->${conditionNodeId}`;
        if (!edges.find(e => e.id === edgeId)) {
          const edge = {
            id: edgeId,
            source: parentId,
            target: conditionNodeId,
            type: 'workflow',
            label: condition.conditions?.type === 'if' ? 'if' :
                   condition.conditions?.type === 'elseif' ? 'else if' : 'else',
            labelStyle: { fill: '#666', fontSize: 12 },
            labelBgStyle: { fill: '#fff' },
          };
          branchEdges.push(edge);
          edges.push(edge);
        }
      }
      
      if (condition.children && condition.children.length > 0) {
        const childResult = processSteps(
          condition.children,
          conditionNodeId,
          yOffset + 180,
          branchXPos
        );
        
        branchNodes.push(...childResult.nodes);
        branchEdges.push(...childResult.edges);
        branchLastNodes.push(...childResult.lastNodes);
        maxY = Math.max(maxY, childResult.maxY);
      } else {
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
  
  const result = processSteps(steps, null, 0, 0);
  const uniqueEdges = edges.filter((edge, index, self) => 
    index === self.findIndex(e => e.id === edge.id)
  );
  return { nodes, edges: uniqueEdges };
}

export function convertReactFlowToWorkflow(nodes: Node[], edges: Edge[]): ConditionalStep[] {
  if (nodes.length === 0) {
    return [];
  }
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
  
  const rootNode = nodes.find(node => !parentMap.has(node.id));
  if (!rootNode) {
    return [];
  }
  
  const visited = new Set<string>();
  const convertNode = (node: Node): ConditionalStep => {
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
        position: node.position,
        children: []
      };
      
      const conditionChildren = children.filter(child => child.type === 'condition');
      const regularChildren = children.filter(child => child.type !== 'condition');
      
      conditionChildren.forEach(conditionChild => {
        if (!visited.has(conditionChild.id)) {
          const conditionStep = convertNode(conditionChild);
          step.children!.push(conditionStep);
        }
      });
      
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
        position: node.position,
        children: []
      };
      
      children.forEach(child => {
        if (!visited.has(child.id)) {
          const processSequentialChain = (startNode: Node): ConditionalStep[] => {
            const chainSteps: ConditionalStep[] = [];
            let currentNode = startNode;
            
            while (currentNode && !visited.has(currentNode.id)) {
              const chainStep = convertNode(currentNode);
              chainSteps.push(chainStep);
              
              const nodeChildren = childrenMap.get(currentNode.id) || [];
              const nextStepNode = nodeChildren.find(c => c.type !== 'condition' && !visited.has(c.id));
              
              if (nextStepNode) {
                currentNode = nextStepNode;
              } else {
                break;
              }
            }
            
            return chainSteps;
          };
          
          const chainSteps = processSequentialChain(child);
          step.children!.push(...chainSteps);
        }
      });
      
      return step;
    }
    
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
  
  const result: ConditionalStep[] = [];
  const processSequentialSteps = (startNode: Node) => {
    let currentNode = startNode;
    
    while (currentNode && !visited.has(currentNode.id)) {
      const step = convertNode(currentNode);
      result.push(step);
      
      const children = childrenMap.get(currentNode.id) || [];
      const nextStepNode = children.find(child => child.type !== 'condition' && !visited.has(child.id));
      
      if (nextStepNode) {
        currentNode = nextStepNode;
      } else {
        break;
      }
    }
  };
  processSequentialSteps(rootNode);
  nodes.forEach(node => {
    if (!visited.has(node.id)) {
      const step = convertNode(node);
      result.push(step);
    }
  });
  return result;
} 