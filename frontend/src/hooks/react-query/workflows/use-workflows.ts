import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workflowKeys } from './keys';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  type: 'TOOL' | 'MCP_TOOL' | 'CONDITION' | 'LOOP' | 'PARALLEL' | 'WAIT' | 'WEBHOOK' | 'TRANSFORM';
  config: Record<string, any>;
  next_steps: string[];
  error_handler?: string;
}

export interface WorkflowTrigger {
  type: 'MANUAL' | 'SCHEDULE' | 'WEBHOOK' | 'EVENT';
  config: Record<string, any>;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  entry_point: string;
  triggers: WorkflowTrigger[];
  state: 'DRAFT' | 'ACTIVE' | 'PAUSED';
  created_at: string;
  updated_at: string;
  created_by: string;
  project_id: string;
  agent_id?: string;
  is_template: boolean;
  max_execution_time: number;
  max_retries: number;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  started_at: string;
  completed_at?: string;
  trigger_type: string;
  trigger_data?: Record<string, any>;
  variables?: Record<string, any>;
  error?: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    type: string;
    config: Record<string, any>;
    inputs?: string[];
    outputs?: string[];
    description?: string;
    icon?: string;
    category?: string;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
  animated?: boolean;
  label?: string;
}

export interface WorkflowFlow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata: {
    name: string;
    description?: string;
    max_execution_time: number;
    max_retries: number;
    agent_id?: string;
    is_template: boolean;
  };
}

const getAuthHeaders = async () => {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('No access token available');
  }
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
};

const api = {
  workflows: {
    list: async (): Promise<WorkflowDefinition[]> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/workflows`, { headers });
      if (!response.ok) throw new Error('Failed to fetch workflows');
      return response.json();
    },

    get: async (id: string): Promise<WorkflowDefinition> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/workflows/${id}`, { headers });
      if (!response.ok) throw new Error('Failed to fetch workflow');
      return response.json();
    },

    create: async (workflow: Partial<WorkflowDefinition>): Promise<WorkflowDefinition> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/workflows`, {
        method: 'POST',
        headers,
        body: JSON.stringify(workflow),
      });
      if (!response.ok) throw new Error('Failed to create workflow');
      return response.json();
    },

    update: async ({ id, ...updates }: { id: string } & Partial<WorkflowDefinition>): Promise<WorkflowDefinition> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/workflows/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update workflow');
      return response.json();
    },

    delete: async (id: string): Promise<void> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/workflows/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) throw new Error('Failed to delete workflow');
    },

    execute: async ({ id, variables }: { id: string; variables?: Record<string, any> }): Promise<WorkflowExecution> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/workflows/${id}/execute`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ variables }),
      });
      if (!response.ok) throw new Error('Failed to execute workflow');
      return response.json();
    },

    getFlow: async (id: string): Promise<WorkflowFlow> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/workflows/${id}/flow`, { headers });
      if (!response.ok) throw new Error('Failed to fetch workflow flow');
      return response.json();
    },

    updateFlow: async ({ id, nodes, edges, metadata }: { 
      id: string; 
      nodes: WorkflowNode[]; 
      edges: WorkflowEdge[]; 
      metadata: Partial<WorkflowFlow['metadata']> 
    }): Promise<WorkflowDefinition> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/workflows/${id}/flow`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ nodes, edges, metadata }),
      });
      if (!response.ok) throw new Error('Failed to update workflow flow');
      return response.json();
    },

    convertFlow: async ({ nodes, edges, metadata }: {
      nodes: WorkflowNode[];
      edges: WorkflowEdge[];
      metadata: Partial<WorkflowDefinition>;
    }): Promise<WorkflowDefinition> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/workflows/builder/convert`, {
        method: 'POST',
        headers: {
          ...headers,
          'x-project-id': metadata.project_id || '',
        },
        body: JSON.stringify({ nodes, edges, metadata }),
      });
      if (!response.ok) throw new Error('Failed to convert flow to workflow');
      return response.json();
    },

    validateFlow: async ({ nodes, edges }: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }): Promise<{ valid: boolean; errors: string[] }> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/workflows/builder/validate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ nodes, edges }),
      });
      if (!response.ok) throw new Error('Failed to validate workflow');
      return response.json();
    },

    getBuilderNodes: async (): Promise<any[]> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/workflows/builder/nodes`, { headers });
      if (!response.ok) throw new Error('Failed to fetch builder nodes');
      return response.json();
    },

    getTemplates: async (): Promise<any[]> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/workflows/templates`, { headers });
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },

    createFromTemplate: async ({ templateId, variables, projectId }: { 
      templateId: string; 
      variables?: Record<string, any>;
      projectId: string;
    }): Promise<WorkflowDefinition> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/workflows/templates/${templateId}/create`, {
        method: 'POST',
        headers: {
          ...headers,
          'x-project-id': projectId,
        },
        body: JSON.stringify({ variables }),
      });
      if (!response.ok) throw new Error('Failed to create workflow from template');
      return response.json();
    },
  },
};

export const useWorkflows = () => {
  return useQuery({
    queryKey: workflowKeys.lists(),
    queryFn: api.workflows.list,
  });
};

export const useWorkflow = (id: string) => {
  return useQuery({
    queryKey: workflowKeys.detail(id),
    queryFn: () => api.workflows.get(id),
    enabled: !!id,
  });
};

export const useWorkflowFlow = (id: string) => {
  return useQuery({
    queryKey: workflowKeys.flow(id),
    queryFn: () => api.workflows.getFlow(id),
    enabled: !!id,
  });
};

export const useBuilderNodes = () => {
  return useQuery({
    queryKey: workflowKeys.builderNodes(),
    queryFn: api.workflows.getBuilderNodes,
  });
};

export const useWorkflowTemplates = () => {
  return useQuery({
    queryKey: workflowKeys.templates(),
    queryFn: api.workflows.getTemplates,
  });
};

export const useCreateWorkflow = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: api.workflows.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
      toast.success('Workflow created successfully');
    },
    onError: () => {
      toast.error('Failed to create workflow');
    },
  });
};

export const useUpdateWorkflow = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: api.workflows.update,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
      toast.success('Workflow updated successfully');
    },
    onError: () => {
      toast.error('Failed to update workflow');
    },
  });
};

export const useDeleteWorkflow = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: api.workflows.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
      toast.success('Workflow deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete workflow');
    },
  });
};

export const useExecuteWorkflow = () => {
  return useMutation({
    mutationFn: api.workflows.execute,
    onSuccess: () => {
      toast.success('Workflow execution started');
    },
    onError: () => {
      toast.error('Failed to execute workflow');
    },
  });
};

export const useConvertFlow = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: api.workflows.convertFlow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
      toast.success('Workflow created from flow');
    },
    onError: () => {
      toast.error('Failed to convert flow to workflow');
    },
  });
};

export const useUpdateWorkflowFlow = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: api.workflows.updateFlow,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: workflowKeys.flow(data.id) });
      toast.success('Workflow updated successfully');
    },
    onError: () => {
      toast.error('Failed to update workflow');
    },
  });
};

export const useValidateFlow = () => {
  return useMutation({
    mutationFn: api.workflows.validateFlow,
  });
};

export const useCreateFromTemplate = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: api.workflows.createFromTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
      toast.success('Workflow created from template');
    },
    onError: () => {
      toast.error('Failed to create workflow from template');
    },
  });
}; 