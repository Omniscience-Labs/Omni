'use client';

import React, { useState, useCallback } from 'react';
import { Plus, Play, Pause, Archive, Edit2, Copy, Trash2, ChevronRight, Clock, CheckCircle, XCircle, AlertCircle, Zap, MessageSquare, Settings, GitBranch, Timer, Upload, Download, Workflow, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { 
  useAgentWorkflows, 
  useCreateAgentWorkflow, 
  useUpdateAgentWorkflow, 
  useDeleteAgentWorkflow, 
  useExecuteWorkflow, 
  useWorkflowExecutions 
} from '@/hooks/react-query/agents/use-agent-workflows';
import { 
  AgentWorkflow, 
  WorkflowExecution, 
  CreateWorkflowRequest, 
  WorkflowStep 
} from '@/hooks/react-query/agents/workflow-utils';

interface AgentWorkflowsConfigurationProps {
  agentId: string;
  agentName: string;
}

// Local types for the workflow builder (without database fields)
interface BuilderStep {
  id: string;
  name: string;
  description: string;
  type: 'message' | 'tool_call' | 'condition' | 'loop' | 'wait' | 'input' | 'output';
  config: Record<string, any>;
  conditions?: Record<string, any>;
  order: number;
}

const STEP_TYPES = {
  message: {
    icon: MessageSquare,
    label: 'Send Message',
    color: 'bg-blue-500',
    description: 'Send a message to the user'
  },
  tool_call: {
    icon: Settings,
    label: 'Tool Call',
    color: 'bg-green-500',
    description: 'Execute a tool or function'
  },
  condition: {
    icon: GitBranch,
    label: 'Condition',
    color: 'bg-purple-500',
    description: 'Branch based on conditions'
  },
  input: {
    icon: Upload,
    label: 'Input',
    color: 'bg-indigo-500',
    description: 'Request input from user'
  },
  output: {
    icon: Download,
    label: 'Output',
    color: 'bg-teal-500',
    description: 'Return final output'
  }
};

const WORKFLOW_TEMPLATES = [
  {
    id: 'customer-support',
    name: 'Customer Support',
    description: 'Handle customer inquiries with structured responses',
    steps: [
      { type: 'input', name: 'Gather Issue', description: 'Collect customer issue details' },
      { type: 'condition', name: 'Categorize Issue', description: 'Determine issue category' },
      { type: 'tool_call', name: 'Search Knowledge Base', description: 'Search for relevant solutions' },
      { type: 'message', name: 'Provide Solution', description: 'Send solution to customer' },
      { type: 'output', name: 'Generate Report', description: 'Create support ticket summary' }
    ]
  },
  {
    id: 'data-analysis',
    name: 'Data Analysis',
    description: 'Process and analyze data with structured workflow',
    steps: [
      { type: 'input', name: 'Data Upload', description: 'Upload data for analysis' },
      { type: 'tool_call', name: 'Data Validation', description: 'Validate data format and quality' },
      { type: 'tool_call', name: 'Analysis', description: 'Perform statistical analysis' },
      { type: 'message', name: 'Present Findings', description: 'Show analysis results' },
      { type: 'output', name: 'Export Report', description: 'Generate downloadable report' }
    ]
  },
  {
    id: 'content-creation',
    name: 'Content Creation',
    description: 'Structured content creation and review process',
    steps: [
      { type: 'input', name: 'Content Brief', description: 'Gather content requirements' },
      { type: 'message', name: 'Create Draft', description: 'Generate initial content draft' },
      { type: 'condition', name: 'Review Check', description: 'Check if review is needed' },
      { type: 'tool_call', name: 'Grammar Check', description: 'Run grammar and style check' },
      { type: 'output', name: 'Final Content', description: 'Deliver final content' }
    ]
  }
];

export function AgentWorkflowsConfiguration({ agentId, agentName }: AgentWorkflowsConfigurationProps) {
  // API hooks
  const { data: workflows = [], isLoading } = useAgentWorkflows(agentId);
  const createWorkflowMutation = useCreateAgentWorkflow();
  const updateWorkflowMutation = useUpdateAgentWorkflow();
  const deleteWorkflowMutation = useDeleteAgentWorkflow();
  const executeWorkflowMutation = useExecuteWorkflow();

  // UI state
  const [selectedWorkflow, setSelectedWorkflow] = useState<AgentWorkflow | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isExecuteDialogOpen, setIsExecuteDialogOpen] = useState(false);
  const [workflowToExecute, setWorkflowToExecute] = useState<AgentWorkflow | null>(null);
  const [activeTab, setActiveTab] = useState('workflows');

  // Create workflow form state
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    trigger_phrase: '',
    is_default: false,
    template: ''
  });

  const [stepBuilder, setStepBuilder] = useState<BuilderStep[]>([]);
  const [executionInput, setExecutionInput] = useState<string>('');

  const handleCreateWorkflow = useCallback(async () => {
    if (!createForm.name.trim()) {
      toast.error('Please enter a workflow name');
      return;
    }

    const workflowRequest: CreateWorkflowRequest = {
      name: createForm.name,
      description: createForm.description,
      trigger_phrase: createForm.trigger_phrase || undefined,
      is_default: createForm.is_default,
      steps: stepBuilder.map(step => ({
        name: step.name,
        description: step.description,
        type: step.type,
        config: step.config,
        conditions: step.conditions,
        order: step.order
      }))
    };

    await createWorkflowMutation.mutateAsync({ agentId, workflow: workflowRequest });
    setIsCreateDialogOpen(false);
    setCreateForm({ name: '', description: '', trigger_phrase: '', is_default: false, template: '' });
    setStepBuilder([]);
  }, [createForm, stepBuilder, agentId, createWorkflowMutation]);

  const handleUpdateWorkflowStatus = useCallback(async (workflowId: string, status: AgentWorkflow['status']) => {
    await updateWorkflowMutation.mutateAsync({ 
      agentId, 
      workflowId, 
      workflow: { status } 
    });
  }, [agentId, updateWorkflowMutation]);

  const handleExecuteWorkflow = useCallback((workflow: AgentWorkflow) => {
    setWorkflowToExecute(workflow);
    setIsExecuteDialogOpen(true);
  }, []);

  const handleConfirmExecution = useCallback(async () => {
    if (!workflowToExecute) return;
    
    try {
      const result = await executeWorkflowMutation.mutateAsync({ 
        agentId, 
        workflowId: workflowToExecute.id, 
        execution: {
          input_data: executionInput.trim() ? { prompt: executionInput } : undefined
        } 
      });
      
      setIsExecuteDialogOpen(false);
      setWorkflowToExecute(null);
      setExecutionInput('');
      
      toast.success(
        `${result.message}. Thread ID: ${result.thread_id}`,
        {
          action: result.thread_id ? {
            label: "View Execution",
            onClick: () => {
              window.open(`/thread/${result.thread_id}`, '_blank');
            }
          } : undefined,
          duration: 10000
        }
      );
    } catch (error) {
      toast.error('Failed to execute workflow');
    }
  }, [agentId, workflowToExecute, executionInput, executeWorkflowMutation]);

  const addStep = useCallback((type: BuilderStep['type']) => {
    const newStep: BuilderStep = {
      id: Math.random().toString(36).substr(2, 9),
      name: `${STEP_TYPES[type].label} ${stepBuilder.length + 1}`,
      description: '',
      type,
      config: {},
      order: stepBuilder.length + 1
    };
    setStepBuilder(prev => [...prev, newStep]);
  }, [stepBuilder.length]);

  const updateStep = useCallback((stepId: string, updates: Partial<BuilderStep>) => {
    setStepBuilder(prev => prev.map(step => 
      step.id === stepId ? { ...step, ...updates } : step
    ));
  }, []);

  const removeStep = useCallback((stepId: string) => {
    setStepBuilder(prev => prev.filter(step => step.id !== stepId));
  }, []);

  const moveStep = useCallback((fromIndex: number, toIndex: number) => {
    setStepBuilder(prev => {
      const newSteps = [...prev];
      const [removed] = newSteps.splice(fromIndex, 1);
      newSteps.splice(toIndex, 0, removed);
      return newSteps.map((step, index) => ({ ...step, order: index + 1 }));
    });
  }, []);

  const loadTemplate = useCallback((templateId: string) => {
    const template = WORKFLOW_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    setCreateForm(prev => ({
      ...prev,
      name: template.name,
      description: template.description,
      template: templateId
    }));

    const templateSteps: BuilderStep[] = template.steps.map((step, index) => ({
      id: Math.random().toString(36).substr(2, 9),
      name: step.name,
      description: step.description,
      type: step.type as BuilderStep['type'],
      config: {},
      order: index + 1
    }));

    setStepBuilder(templateSteps);
  }, []);

  const getStatusBadge = (status: AgentWorkflow['status']) => {
    const colors = {
      draft: 'text-gray-700 bg-gray-100',
      active: 'text-green-700 bg-green-100',
      paused: 'text-yellow-700 bg-yellow-100',
      archived: 'text-red-700 bg-red-100'
    };
    
    return (
      <Badge className={colors[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size='sm' variant='outline' className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Workflow
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Workflow</DialogTitle>
              <DialogDescription>
                Design a step-by-step workflow for your agent to execute
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="workflow-name">Workflow Name</Label>
                  <Input
                    id="workflow-name"
                    value={createForm.name}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter workflow name..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trigger-phrase">Trigger Phrase (Optional)</Label>
                  <Input
                    id="trigger-phrase"
                    value={createForm.trigger_phrase}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, trigger_phrase: e.target.value }))}
                    placeholder="e.g., 'start support workflow'"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="workflow-description">Description</Label>
                <Textarea
                  id="workflow-description"
                  value={createForm.description}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this workflow does..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template">Start from Template</Label>
                <Select value={createForm.template} onValueChange={(value) => loadTemplate(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template or start from scratch" />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKFLOW_TEMPLATES.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{template.name}</span>
                          <span className="text-sm text-muted-foreground">{template.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold">Workflow Steps</h4>
                  <div className="flex gap-2">
                    {Object.entries(STEP_TYPES).map(([type, config]) => {
                      const Icon = config.icon;
                      return (
                        <Button
                          key={type}
                          variant="outline"
                          size="sm"
                          onClick={() => addStep(type as BuilderStep['type'])}
                          className="flex items-center gap-1"
                        >
                          <Icon className="h-3 w-3" />
                          {config.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <ScrollArea className="h-64 border rounded-md p-4">
                  {stepBuilder.length === 0 ? (
                    <div className="text-center py-8">
                      <Workflow className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No steps added yet</p>
                      <p className="text-sm text-muted-foreground">Click on step types above to add them</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {stepBuilder.map((step, index) => {
                        const StepIcon = STEP_TYPES[step.type].icon;
                        return (
                          <Card key={step.id} className="p-3">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-md ${STEP_TYPES[step.type].color} text-white`}>
                                <StepIcon className="h-4 w-4" />
                              </div>
                              <div className="flex-1">
                                <Input
                                  value={step.name}
                                  onChange={(e) => updateStep(step.id, { name: e.target.value })}
                                  className="font-medium"
                                  placeholder="Step name..."
                                />
                                <Input
                                  value={step.description}
                                  onChange={(e) => updateStep(step.id, { description: e.target.value })}
                                  className="mt-1 text-sm"
                                  placeholder="Step description..."
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">#{index + 1}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeStep(step.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>

              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateWorkflow} disabled={createWorkflowMutation.isPending}>
                  {createWorkflowMutation.isPending ? 'Creating...' : 'Create Workflow'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={isExecuteDialogOpen} onOpenChange={setIsExecuteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Execute Workflow</DialogTitle>
              <DialogDescription>
                Provide input data for "{workflowToExecute?.name}" workflow
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>What would you like the workflow to work on?</Label>
                <Textarea
                  value={executionInput}
                  onChange={(e) => setExecutionInput(e.target.value)}
                  placeholder="Enter your request..."
                  rows={4}
                  className="resize-none"
                  required={true}
                />
              </div>

              <div className="flex items-center justify-between pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setIsExecuteDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleConfirmExecution}
                  disabled={executeWorkflowMutation.isPending}
                >
                  {executeWorkflowMutation.isPending ? 'Executing...' : 'Execute Workflow'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsContent value="workflows" className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 animate-spin" />
                <span>Loading workflows...</span>
              </div>
            </div>
          ) : workflows.length === 0 ? (
            <Alert>
              <Workflow className="h-4 w-4" />
              <AlertDescription>
                No workflows created yet. Create your first workflow to get started with automated task execution.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-4">
              {workflows.map((workflow) => (
                <Card key={workflow.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold">{workflow.name}</h4>
                        {getStatusBadge(workflow.status)}
                        {workflow.is_default && <Badge variant="outline">Default</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{workflow.description}</p>
                      {workflow.trigger_phrase && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Trigger: "{workflow.trigger_phrase}"
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-xs text-muted-foreground">
                          {workflow.steps.length} steps
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Created {new Date(workflow.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleExecuteWorkflow(workflow)}
                        disabled={workflow.status !== 'active' || executeWorkflowMutation.isPending}
                      >
                        <Play className="h-4 w-4" />
                        Execute
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUpdateWorkflowStatus(
                          workflow.id,
                          workflow.status === 'active' ? 'paused' : 'active'
                        )}
                        disabled={updateWorkflowMutation.isPending}
                      >
                        {workflow.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
} 