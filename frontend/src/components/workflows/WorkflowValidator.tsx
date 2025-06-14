"use client";

import { Node, Edge } from "@xyflow/react";

export interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  nodeId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export function validateWorkflow(nodes: Node[], edges: Edge[]): ValidationResult {
  const errors: ValidationError[] = [];

  // Check for required input node
  const hasInputNode = nodes.some(node => node.type === 'inputNode');
  if (!hasInputNode) {
    errors.push({
      type: 'error',
      message: 'Every workflow must have an input node'
    });
  }

  // Validate input node configuration
  const inputNodes = nodes.filter(node => node.type === 'inputNode');
  inputNodes.forEach(node => {
    const data = node.data as any;
    
    if (!data.prompt || (typeof data.prompt === 'string' && data.prompt.trim() === '')) {
      errors.push({
        type: 'error',
        message: 'Input node must have a prompt configured',
        nodeId: node.id
      });
    }

    if (data.trigger_type === 'SCHEDULE') {
      const scheduleConfig = data.schedule_config as any;
      if (!scheduleConfig?.cron_expression && 
          !(scheduleConfig?.interval_type && scheduleConfig?.interval_value)) {
        errors.push({
          type: 'error',
          message: 'Schedule trigger must have either cron expression or interval configuration',
          nodeId: node.id
        });
      }
    } else if (data.trigger_type === 'WEBHOOK') {
      const webhookConfig = data.webhook_config;
      if (!webhookConfig) {
        errors.push({
          type: 'error',
          message: 'Webhook trigger must have webhook configuration',
          nodeId: node.id
        });
      }
    }
  });

  // Check for multiple input nodes (warning)
  if (inputNodes.length > 1) {
    errors.push({
      type: 'warning',
      message: 'Multiple input nodes detected. Only one input node is recommended per workflow.'
    });
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
    disconnectedNodes.forEach(node => {
      errors.push({
        type: 'warning',
        message: `Node "${node.data.label || node.id}" is not connected to the workflow`,
        nodeId: node.id
      });
    });
  }

  // Check for self-referencing edges
  edges.forEach(edge => {
    if (edge.source === edge.target) {
      errors.push({
        type: 'error',
        message: 'Self-referencing connections are not allowed',
        nodeId: edge.source
      });
    }
  });

  // Check that input nodes cannot receive connections
  edges.forEach(edge => {
    const targetNode = nodes.find(n => n.id === edge.target);
    if (targetNode?.type === 'inputNode') {
      errors.push({
        type: 'error',
        message: 'Input nodes cannot receive connections from other nodes',
        nodeId: edge.target
      });
    }
  });

  // Check for at least one agent node
  const hasAgentNode = nodes.some(node => node.type === 'agentNode');
  if (!hasAgentNode && nodes.length > 1) {
    errors.push({
      type: 'warning',
      message: 'Workflow should have at least one agent node'
    });
  }

  return {
    valid: errors.filter(e => e.type === 'error').length === 0,
    errors
  };
}

export function canConnect(source: Node, target: Node): boolean {
  // Input nodes cannot receive connections
  if (target.type === 'inputNode') {
    return false;
  }

  // Input nodes can connect to any other node
  if (source.type === 'inputNode') {
    return true;
  }

  // Other connection rules can be added here
  return true;
} 