'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Save,
  Edit2,
  Settings,
  GitBranch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { useCreateAgentWorkflow, useUpdateAgentWorkflow, useAgentWorkflows } from '@/hooks/react-query/agents/use-agent-workflows';
import { CreateWorkflowRequest, UpdateWorkflowRequest } from '@/hooks/react-query/agents/workflow-utils';
import { useAgentTools } from '@/hooks/react-query/agents/use-agent-tools';
import { ConditionalWorkflowBuilder, ConditionalStep } from '@/components/agents/workflows/conditional-workflow-builder';

const convertToNestedJSON = (steps: ConditionalStep[]): any[] => {
  let globalOrder = 1;
  const convertStepsWithNesting = (stepList: ConditionalStep[]): any[] => {
    return stepList.map((step) => {
      const jsonStep: any = {
        id: step.id,
        name: step.name,
        description: step.description,
        type: step.type,
        config: step.config,
        order: globalOrder++
      };
      if (step.type === 'condition' && step.conditions) {
        jsonStep.conditions = step.conditions;
      }
      if (step.children && step.children.length > 0) {
        jsonStep.children = convertStepsWithNesting(step.children);
      }
      
      return jsonStep;
    });
  };
  
  return convertStepsWithNesting(steps);
};

const reconstructFromNestedJSON = (nestedSteps: any[]): ConditionalStep[] => {
  if (!nestedSteps || nestedSteps.length === 0) return [];
  
  const convertStepsFromNested = (stepList: any[]): ConditionalStep[] => {
    return stepList.map((step) => {
      const conditionalStep: ConditionalStep = {
        id: step.id || Math.random().toString(36).substr(2, 9),
        name: step.name,
        description: step.description || '',
        type: step.type || 'instruction',
        config: step.config || {},
        order: step.order || step.step_order || 0,
        enabled: step.enabled !== false,
        hasIssues: step.hasIssues || false
      };
      
      if (step.type === 'condition' && step.conditions) {
        conditionalStep.conditions = step.conditions;
      }
      if (step.children && Array.isArray(step.children) && step.children.length > 0) {
        conditionalStep.children = convertStepsFromNested(step.children);
      } else {
        conditionalStep.children = [];
      }
      return conditionalStep;
    });
  };
  
  return convertStepsFromNested(nestedSteps);
};

const reconstructFromFlatJSON = (flatSteps: any[]): ConditionalStep[] => {
  if (!flatSteps || flatSteps.length === 0) return [];
  const result: ConditionalStep[] = [];
  const conditionSteps = new Map<string, ConditionalStep>();
  for (const flatStep of flatSteps) {
    if (flatStep.type === 'condition') {
      const conditionStep: ConditionalStep = {
        id: flatStep.id || Math.random().toString(36).substr(2, 9),
        name: flatStep.name,
        description: flatStep.description || '',
        type: 'condition',
        config: flatStep.config || {},
        conditions: flatStep.conditions,
        order: flatStep.order || flatStep.step_order,
        children: []
      };
      conditionSteps.set(conditionStep.id, conditionStep);
    }
  }
  for (const flatStep of flatSteps) {
    if (flatStep.type !== 'condition' && flatStep.conditions) {
      for (const [conditionId, conditionStep] of conditionSteps) {
        if (JSON.stringify(conditionStep.conditions) === JSON.stringify(flatStep.conditions)) {
          const childStep: ConditionalStep = {
            id: flatStep.id || Math.random().toString(36).substr(2, 9),
            name: flatStep.name,
            description: flatStep.description || '',
            type: flatStep.type || 'instruction',
            config: flatStep.config || {},
            order: flatStep.order || flatStep.step_order,
            children: []
          };
          conditionStep.children!.push(childStep);
          break;
        }
      }
    }
  }
  
  const sortedSteps = [...flatSteps].sort((a, b) => (a.order || a.step_order || 0) - (b.order || b.step_order || 0));
  let i = 0;
  
  while (i < sortedSteps.length) {
    const flatStep = sortedSteps[i];
    if (flatStep.type === 'condition') {
      const conditionGroup: ConditionalStep[] = [];
      while (i < sortedSteps.length && sortedSteps[i].type === 'condition') {
        const conditionStep = conditionSteps.get(sortedSteps[i].id);
        if (conditionStep) {
          conditionGroup.push(conditionStep);
        }
        i++;
      }
      conditionGroup.sort((a, b) => {
        const typeOrder = { 'if': 0, 'elseif': 1, 'else': 2 };
        return (typeOrder[a.conditions?.type as keyof typeof typeOrder] || 0) - 
               (typeOrder[b.conditions?.type as keyof typeof typeOrder] || 0);
      });
      
      result.push(...conditionGroup);
    } else if (!flatStep.conditions) {
      const step: ConditionalStep = {
        id: flatStep.id || Math.random().toString(36).substr(2, 9),
        name: flatStep.name,
        description: flatStep.description || '',
        type: flatStep.type || 'instruction',
        config: flatStep.config || {},
        order: flatStep.order || flatStep.step_order,
        children: []
      };
      result.push(step);
      i++;
    } else {
      i++;
    }
  }
  
  return result;
};

const convertToLLMFormat = (steps: ConditionalStep[]): any[] => {
  return steps.map(step => {
    const llmStep: any = {
      step: step.name,
      description: step.description || undefined,
    };
    if (step.config?.tool_name) {
      llmStep.tool = step.config.tool_name;
    }
    if (step.type === 'condition' && step.conditions) {
      if (step.conditions.type === 'if' && step.conditions.expression) {
        llmStep.condition = step.conditions.expression;
      } else if (step.conditions.type === 'else') {
        llmStep.condition = 'else';
      }
    }
    if (step.children && step.children.length > 0) {
      llmStep.then = convertToLLMFormat(step.children);
    }
    Object.keys(llmStep).forEach(key => 
      llmStep[key] === undefined && delete llmStep[key]
    );
    return llmStep;
  });
};

export default function WorkflowPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;
  const workflowId = params.workflowId as string;
  
  const { data: workflows = [], isLoading: isLoadingWorkflows } = useAgentWorkflows(agentId);
  const createWorkflowMutation = useCreateAgentWorkflow();
  const updateWorkflowMutation = useUpdateAgentWorkflow();
  const { data: agentTools, isLoading: isLoadingTools } = useAgentTools(agentId);
  
  const isEditing = !!workflowId;

  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [triggerPhrase, setTriggerPhrase] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [steps, setSteps] = useState<ConditionalStep[]>([]);
  const [isSettingsPopoverOpen, setIsSettingsPopoverOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditing);

  useEffect(() => {
    if (isEditing && workflows.length > 0) {
      const workflow = workflows.find(w => w.id === workflowId);
      if (workflow) {
        setWorkflowName(workflow.name);
        setWorkflowDescription(workflow.description || '');
        setTriggerPhrase(workflow.trigger_phrase || '');
        setIsDefault(workflow.is_default);
        let treeSteps: ConditionalStep[];
        try {
          // Check if workflow has proper nested structure
          if (workflow.steps.some((step: any) => step.children && Array.isArray(step.children))) {
            treeSteps = reconstructFromNestedJSON(workflow.steps);
          } else {
            treeSteps = reconstructFromFlatJSON(workflow.steps);
          }
        } catch (error) {
          console.warn('Error reconstructing workflow steps, using fallback:', error);
          treeSteps = reconstructFromFlatJSON(workflow.steps);
        }
        setSteps(treeSteps);
        setIsLoading(false);
      } else if (!isLoadingWorkflows) {
        toast.error('Workflow not found');
      }
    } else if (!isEditing) {
      setIsLoading(false);
    }
  }, [isEditing, workflows, workflowId, isLoadingWorkflows, router, agentId]);

  const handleSave = useCallback(async () => {
    if (!workflowName.trim()) {
      toast.error('Please enter a workflow name');
      return;
    }
    const nestedSteps = convertToNestedJSON(steps);
    try {
      if (isEditing) {
        const updateRequest: UpdateWorkflowRequest = {
          name: workflowName,
          description: workflowDescription,
          trigger_phrase: triggerPhrase || undefined,
          is_default: isDefault,
          steps: nestedSteps
        };
        await updateWorkflowMutation.mutateAsync({ agentId, workflowId, workflow: updateRequest });
        toast.success('Workflow updated successfully');
      } else {
        const createRequest: CreateWorkflowRequest = {
          name: workflowName,
          description: workflowDescription,
          trigger_phrase: triggerPhrase || undefined,
          is_default: isDefault,
          steps: nestedSteps
        };
        await createWorkflowMutation.mutateAsync({ agentId, workflow: createRequest });
        toast.success('Workflow created successfully');
      }
    } catch (error) {
      toast.error(`Failed to ${isEditing ? 'update' : 'create'} workflow`);
    }
  }, [workflowName, workflowDescription, triggerPhrase, isDefault, steps, agentId, workflowId, isEditing, createWorkflowMutation, updateWorkflowMutation, router]);

  if (isLoading || isLoadingWorkflows) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading workflow...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="border-b bg-card px-2 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <GitBranch className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">
                {workflowName || 'Untitled Workflow'}
              </h1>
            </div>
            <Popover open={isSettingsPopoverOpen} onOpenChange={setIsSettingsPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 ml-2">
                  <Settings className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-96" align="start">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium text-sm mb-3">Workflow Settings</h3>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Name</Label>
                    <Input
                      value={workflowName}
                      onChange={(e) => setWorkflowName(e.target.value)}
                      placeholder="Enter workflow name"
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Description</Label>
                    <Textarea
                      value={workflowDescription}
                      onChange={(e) => setWorkflowDescription(e.target.value)}
                      placeholder="Describe what this workflow does"
                      rows={3}
                      className="resize-none text-sm"
                    />
                  </div>
                  <Button 
                    onClick={() => setIsSettingsPopoverOpen(false)}
                    className="w-full h-8"
                    size="sm"
                  >
                    Done
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={createWorkflowMutation.isPending || updateWorkflowMutation.isPending} 
          size="sm"
          className="h-8"
        >
          <Save className="h-3.5 w-3.5" />
          {(createWorkflowMutation.isPending || updateWorkflowMutation.isPending) 
            ? 'Saving...' 
            : 'Save Workflow'
          }
        </Button>
      </div>
      
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <div className="p-6">
            <ConditionalWorkflowBuilder 
              steps={steps}
              onStepsChange={setSteps}
              agentTools={agentTools}
              isLoadingTools={isLoadingTools}
            />
          </div>
        </div>
      </div>
    </div>
  );
} 