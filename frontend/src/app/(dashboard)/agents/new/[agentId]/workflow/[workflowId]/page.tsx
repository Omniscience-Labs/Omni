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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { useCreateAgentWorkflow, useUpdateAgentWorkflow, useAgentWorkflows } from '@/hooks/react-query/agents/use-agent-workflows';
import { CreateWorkflowRequest, UpdateWorkflowRequest } from '@/hooks/react-query/agents/workflow-utils';
import { useAgentTools } from '@/hooks/react-query/agents/use-agent-tools';
import { ConditionalWorkflowBuilder, ConditionalStep } from '@/components/agents/workflows/conditional-workflow-builder';

const WORKFLOW_TEMPLATES = [
  {
    id: 'customer-support',
    name: 'Customer Support',
    description: 'Handle customer inquiries with structured responses',
    steps: [
      { 
        name: 'Gather Issue', 
        description: 'Collect customer issue details',
        type: 'instruction' as const,
        children: []
      },
      { 
        name: 'If technical issue', 
        description: '',
        type: 'condition' as const,
        conditions: { type: 'if' as const, expression: 'customer has a technical issue' },
        children: [
          { name: 'Search Knowledge Base', description: 'Search for technical solutions', type: 'instruction' as const },
          { name: 'Escalate to Tech Support', description: 'Create tech support ticket', type: 'instruction' as const }
        ]
      },
      { 
        name: 'Otherwise', 
        description: '',
        type: 'condition' as const,
        conditions: { type: 'else' as const },
        children: [
          { name: 'Provide General Help', description: 'Send general assistance info', type: 'instruction' as const }
        ]
      },
      { 
        name: 'Generate Report', 
        description: 'Create support ticket summary',
        type: 'instruction' as const,
        children: []
      }
    ]
  },
  {
    id: 'data-analysis',
    name: 'Data Analysis',
    description: 'Process and analyze data with conditional logic',
    steps: [
      { 
        name: 'Data Upload', 
        description: 'Upload data for analysis',
        type: 'instruction' as const
      },
      { 
        name: 'Data Validation', 
        description: 'Validate data format and quality',
        type: 'instruction' as const
      },
      { 
        name: 'If data is valid', 
        description: '',
        type: 'condition' as const,
        conditions: { type: 'if' as const, expression: 'data passes validation checks' },
        children: [
          { name: 'Perform Analysis', description: 'Run statistical analysis', type: 'instruction' as const },
          { name: 'Generate Visualizations', description: 'Create charts and graphs', type: 'instruction' as const }
        ]
      },
      { 
        name: 'Otherwise', 
        description: '',
        type: 'condition' as const,
        conditions: { type: 'else' as const },
        children: [
          { name: 'Show Error Report', description: 'Display validation errors', type: 'instruction' as const },
          { name: 'Request New Data', description: 'Ask user to fix and reupload', type: 'instruction' as const }
        ]
      }
    ]
  }
];

const convertToNestedJSON = (steps: ConditionalStep[]): any[] => {
  const result: any[] = [];
  let globalOrder = 1;
  
  const flattenSteps = (stepList: ConditionalStep[], parentConditions?: any) => {
    stepList.forEach((step) => {
      const jsonStep: any = {
        name: step.name,
        description: step.description,
        type: step.type,
        config: step.config,
        order: globalOrder++
      };
      
      // For conditional steps, add the conditions
      if (step.type === 'condition' && step.conditions) {
        jsonStep.conditions = step.conditions;
      } else if (parentConditions) {
        // For steps inside a condition branch, inherit the parent's conditions
        jsonStep.conditions = parentConditions;
      }
      
      result.push(jsonStep);
      
      // Recursively process children
      if (step.children && step.children.length > 0) {
        // Pass the current step's conditions to children if it's a conditional step
        const conditionsToPass = step.type === 'condition' ? step.conditions : parentConditions;
        flattenSteps(step.children, conditionsToPass);
      }
    });
  };
  
  flattenSteps(steps);
  return result;
};

const reconstructFromNestedJSON = (flatSteps: any[]): ConditionalStep[] => {
  if (!flatSteps || flatSteps.length === 0) return [];
  
  const result: ConditionalStep[] = [];
  const conditionStack: { step: ConditionalStep, conditions: any }[] = [];
  
  flatSteps.forEach((flatStep) => {
    const step: ConditionalStep = {
      id: flatStep.id || Math.random().toString(36).substr(2, 9),
      name: flatStep.name,
      description: flatStep.description || '',
      type: flatStep.type || 'instruction',
      config: flatStep.config || {},
      conditions: flatStep.conditions,
      order: flatStep.order || flatStep.step_order,
      children: []
    };
    
    // Handle conditional steps
    if (step.type === 'condition') {
      // This is a condition node
      result.push(step);
      
      // If it's an 'if' condition, add it to the stack
      if (step.conditions?.type === 'if') {
        conditionStack.push({ step, conditions: step.conditions });
      } else if (step.conditions?.type === 'else') {
        // For 'else', find the matching 'if' and use it
        const matchingIf = conditionStack[conditionStack.length - 1];
        if (matchingIf) {
          conditionStack.push({ step, conditions: step.conditions });
        }
      }
    } else if (flatStep.conditions) {
      // This step belongs to a condition branch
      // Find the parent condition step
      const parentCondition = conditionStack.find(
        cs => JSON.stringify(cs.conditions) === JSON.stringify(flatStep.conditions)
      );
      
      if (parentCondition) {
        parentCondition.step.children!.push(step);
      } else {
        // If we can't find the parent, add to root (shouldn't happen)
        result.push(step);
      }
    } else {
      // Regular step at root level
      result.push(step);
      // Clear condition stack when we hit a root level step
      conditionStack.length = 0;
    }
  });
  
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

const generateWorkflowPrompt = (workflowName: string, workflowDescription: string, steps: ConditionalStep[]): string => {
  const llmFormat = convertToLLMFormat(steps);
  const prompt = {
    workflow: workflowName,
    description: workflowDescription || undefined,
    steps: llmFormat
  };
  if (!prompt.description) delete prompt.description;
  return JSON.stringify(prompt, null, 2);
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
  const [selectedTemplate, setSelectedTemplate] = useState('');
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
        const treeSteps = reconstructFromNestedJSON(workflow.steps);
        setSteps(treeSteps);
        setIsLoading(false);
      } else if (!isLoadingWorkflows) {
        toast.error('Workflow not found');
        router.push(`/agents/${agentId}`);
      }
    } else if (!isEditing) {
      setIsLoading(false);
    }
  }, [isEditing, workflows, workflowId, isLoadingWorkflows, router, agentId]);

  const loadTemplate = useCallback((templateId: string) => {
    const template = WORKFLOW_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    setWorkflowName(template.name);
    setWorkflowDescription(template.description);
    setSelectedTemplate(templateId);

    const templateSteps: ConditionalStep[] = template.steps.map((step, index) => ({
      id: Math.random().toString(36).substr(2, 9),
      name: step.name,
      description: step.description,
      type: step.type,
      config: {},
      conditions: step.conditions,
      children: step.children?.map((child: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        name: child.name,
        description: child.description,
        type: child.type,
        config: {},
        order: 0
      })),
      order: index + 1
    }));

    setSteps(templateSteps);
  }, []);

  const handleSave = useCallback(async () => {
    if (!workflowName.trim()) {
      toast.error('Please enter a workflow name');
      return;
    }

    // Convert to nested JSON structure for API
    const nestedSteps = convertToNestedJSON(steps);

    // Log the LLM-friendly format for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('LLM-friendly workflow format:');
      console.log(generateWorkflowPrompt(workflowName, workflowDescription, steps));
    }

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
      
      router.push(`/agents/${agentId}`);
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
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Trigger Phrase</Label>
                    <Input
                      value={triggerPhrase}
                      onChange={(e) => setTriggerPhrase(e.target.value)}
                      placeholder="e.g., 'start support workflow'"
                      className="h-8"
                    />
                    <p className="text-xs text-muted-foreground">
                      Users can start this workflow by typing this phrase
                    </p>
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
                    <div className="space-y-0.5">
                      <Label htmlFor="is-default" className="text-xs font-medium cursor-pointer">Default workflow</Label>
                      <p className="text-xs text-muted-foreground">Run automatically for new conversations</p>
                    </div>
                    <Switch
                      id="is-default"
                      checked={isDefault}
                      onCheckedChange={setIsDefault}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{isEditing ? 'Load Template' : 'Start from Template'}</Label>
                    <Select value={selectedTemplate} onValueChange={loadTemplate}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Choose a template" />
                      </SelectTrigger>
                      <SelectContent>
                        {WORKFLOW_TEMPLATES.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            <div className="flex flex-col items-start">
                              <span className="text-sm font-medium">{template.name}</span>
                              <span className="text-xs text-muted-foreground">{template.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {process.env.NODE_ENV === 'development' && steps.length > 0 && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">LLM-Friendly Format</Label>
                        <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-40 font-mono">
                          {generateWorkflowPrompt(workflowName, workflowDescription, steps)}
                        </pre>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Full JSON Structure</Label>
                        <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-40 font-mono">
                          {JSON.stringify(convertToNestedJSON(steps), null, 2)}
                        </pre>
                      </div>
                    </>
                  )}
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
          <Save className="h-3.5 w-3.5 mr-1.5" />
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