"use client";

import { Node, Edge } from "@xyflow/react";
import { ScheduleConfig } from "./scheduling/types";

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

  const hasInputNode = nodes.some(node => node.type === 'inputNode');
  if (!hasInputNode) {
    errors.push({
      type: 'error',
      message: 'Every workflow must have an input node'
    });
  }

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
      const scheduleConfig = data.schedule_config as ScheduleConfig;
      
      if (!scheduleConfig) {
        errors.push({
          type: 'error',
          message: 'Schedule trigger must have schedule configuration',
          nodeId: node.id
        });
      } else {
        if (scheduleConfig.type === 'simple') {
          if (!scheduleConfig.simple?.interval_type || !scheduleConfig.simple?.interval_value) {
            errors.push({
              type: 'error',
              message: 'Simple schedule must have interval type and value configured',
              nodeId: node.id
            });
          }
        } else if (scheduleConfig.type === 'cron') {
          if (!scheduleConfig.cron?.cron_expression) {
            errors.push({
              type: 'error',
              message: 'Cron schedule must have cron expression configured',
              nodeId: node.id
            });
          }
        } else if (scheduleConfig.type === 'advanced') {
          if (!scheduleConfig.advanced?.cron_expression) {
            errors.push({
              type: 'error',
              message: 'Advanced schedule must have cron expression configured',
              nodeId: node.id
            });
          }
        } else {
          errors.push({
            type: 'error',
            message: 'Schedule trigger must have a valid schedule type',
            nodeId: node.id
          });
        }
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
  if (inputNodes.length > 1) {
    errors.push({
      type: 'warning',
      message: 'Multiple input nodes detected. Only one input node is recommended per workflow.'
    });
  }

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

  edges.forEach(edge => {
    if (edge.source === edge.target) {
      errors.push({
        type: 'error',
        message: 'Self-referencing connections are not allowed',
        nodeId: edge.source
      });
    }
  });

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
  if (target.type === 'inputNode') {
    return false;
  }
  if (source.type === 'inputNode') {
    return true;
  }
  return true;
}
