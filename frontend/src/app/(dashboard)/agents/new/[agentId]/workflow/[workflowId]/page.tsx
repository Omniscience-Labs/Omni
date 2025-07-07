'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Trash2, 
  Workflow,
  Save,
  Edit2,
  Check,
  ChevronsUpDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { toast } from 'sonner';
import { useCreateAgentWorkflow, useUpdateAgentWorkflow, useAgentWorkflows } from '@/hooks/react-query/agents/use-agent-workflows';
import { CreateWorkflowRequest, UpdateWorkflowRequest } from '@/hooks/react-query/agents/workflow-utils';
import { useAgentTools } from '@/hooks/react-query/agents/use-agent-tools';

interface BuilderStep {
  id: string;
  name: string;
  description: string;
  type: string; 
  config: Record<string, any>;
  conditions?: Record<string, any>;
  order: number;
}

const WORKFLOW_TEMPLATES = [
  {
    id: 'customer-support',
    name: 'Customer Support',
    description: 'Handle customer inquiries with structured responses',
    steps: [
      { name: 'Gather Issue', description: 'Collect customer issue details' },
      { name: 'Categorize Issue', description: 'Determine issue category' },
      { name: 'Search Knowledge Base', description: 'Search for relevant solutions' },
      { name: 'Provide Solution', description: 'Send solution to customer' },
      { name: 'Generate Report', description: 'Create support ticket summary' }
    ]
  },
  {
    id: 'data-analysis',
    name: 'Data Analysis',
    description: 'Process and analyze data with structured workflow',
    steps: [
      { name: 'Data Upload', description: 'Upload data for analysis' },
      { name: 'Data Validation', description: 'Validate data format and quality' },
      { name: 'Analysis', description: 'Perform statistical analysis' },
      { name: 'Present Findings', description: 'Show analysis results' },
      { name: 'Export Report', description: 'Generate downloadable report' }
    ]
  },
  {
    id: 'content-creation',
    name: 'Content Creation',
    description: 'Structured content creation and review process',
    steps: [
      { name: 'Content Brief', description: 'Gather content requirements' },
      { name: 'Create Draft', description: 'Generate initial content draft' },
      { name: 'Review Check', description: 'Check if review is needed' },
      { name: 'Grammar Check', description: 'Run grammar and style check' },
      { name: 'Final Content', description: 'Deliver final content' }
    ]
  }
];

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
  const [steps, setSteps] = useState<BuilderStep[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [isEditPopoverOpen, setIsEditPopoverOpen] = useState(false);
  const [toolSearchOpen, setToolSearchOpen] = useState<{[key: string]: boolean}>({});
  const [isLoading, setIsLoading] = useState(isEditing);

  useEffect(() => {
    if (isEditing && workflows.length > 0) {
      const workflow = workflows.find(w => w.id === workflowId);
      if (workflow) {
        setWorkflowName(workflow.name);
        setWorkflowDescription(workflow.description || '');
        setTriggerPhrase(workflow.trigger_phrase || '');
        setIsDefault(workflow.is_default);
        const builderSteps: BuilderStep[] = workflow.steps.map(step => ({
          id: step.id,
          name: step.name,
          description: step.description || '',
          type: step.type,
          config: step.config,
          conditions: step.conditions,
          order: step.order
        }));
        setSteps(builderSteps);
        setIsLoading(false);
      } else if (!isLoadingWorkflows) {
        toast.error('Workflow not found');
        router.push(`/agents/${agentId}`);
      }
    } else if (!isEditing) {
      setIsLoading(false);
    }
  }, [isEditing, workflows, workflowId, isLoadingWorkflows, router, agentId]);

  const normalizeToolName = (toolName: string, toolType: 'agentpress' | 'mcp') => {
    if (toolType === 'agentpress') {
      const agentPressMapping: Record<string, string> = {
        'sb_shell_tool': 'Shell Tool',
        'sb_files_tool': 'Files Tool',
        'sb_browser_tool': 'Browser Tool',
        'sb_deploy_tool': 'Deploy Tool',
        'sb_expose_tool': 'Expose Tool',
        'web_search_tool': 'Web Search',
        'sb_vision_tool': 'Vision Tool',
        'data_providers_tool': 'Data Providers',
      };
      return agentPressMapping[toolName] || toolName;
    } else {
      return toolName
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
  };

  const addStep = useCallback(() => {
    const newStep: BuilderStep = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Step ${steps.length + 1}`,
      description: '',
      type: 'instruction',
      config: {},
      order: steps.length + 1
    };
    setSteps(prev => [...prev, newStep]);
  }, [steps.length]);

  const updateStep = useCallback((stepId: string, updates: Partial<BuilderStep>) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, ...updates } : step
    ));
  }, []);

  const removeStep = useCallback((stepId: string) => {
    setSteps(prev => prev.filter(step => step.id !== stepId)
      .map((step, index) => ({ ...step, order: index + 1 })));
  }, []);

  const loadTemplate = useCallback((templateId: string) => {
    const template = WORKFLOW_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    setWorkflowName(template.name);
    setWorkflowDescription(template.description);
    setSelectedTemplate(templateId);

    const templateSteps: BuilderStep[] = template.steps.map((step, index) => ({
      id: Math.random().toString(36).substr(2, 9),
      name: step.name,
      description: step.description,
      type: 'instruction',
      config: {},
      order: index + 1
    }));

    setSteps(templateSteps);
  }, []);

  const handleSave = useCallback(async () => {
    if (!workflowName.trim()) {
      toast.error('Please enter a workflow name');
      return;
    }

    // Allow empty workflows when editing, but require at least one step when creating new
    if (!isEditing && steps.length === 0) {
      toast.error('Please add at least one step');
      return;
    }

    try {
      if (isEditing) {
        const updateRequest: UpdateWorkflowRequest = {
          name: workflowName,
          description: workflowDescription,
          trigger_phrase: triggerPhrase || undefined,
          is_default: isDefault,
          steps: steps.map(step => ({
            name: step.name,
            description: step.description,
            type: step.type,
            config: step.config,
            conditions: step.conditions,
            order: step.order
          }))
        };
        
        await updateWorkflowMutation.mutateAsync({ agentId, workflowId, workflow: updateRequest });
        toast.success('Workflow updated successfully');
      } else {
        const createRequest: CreateWorkflowRequest = {
          name: workflowName,
          description: workflowDescription,
          trigger_phrase: triggerPhrase || undefined,
          is_default: isDefault,
          steps: steps.map(step => ({
            name: step.name,
            description: step.description,
            type: step.type,
            config: step.config,
            conditions: step.conditions,
            order: step.order
          }))
        };
        
        await createWorkflowMutation.mutateAsync({ agentId, workflow: createRequest });
        toast.success('Workflow created successfully');
      }
      
      router.push(`/agents/new/${agentId}`);
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
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">
              {workflowName || 'Untitled Workflow'}
            </h1>
            <Popover open={isEditPopoverOpen} onOpenChange={setIsEditPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Edit2 className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="start">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Workflow Name</Label>
                    <Input
                      value={workflowName}
                      onChange={(e) => setWorkflowName(e.target.value)}
                      placeholder="Enter workflow name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={workflowDescription}
                      onChange={(e) => setWorkflowDescription(e.target.value)}
                      placeholder="Describe what this workflow does"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Trigger Phrase (Optional)</Label>
                    <Input
                      value={triggerPhrase}
                      onChange={(e) => setTriggerPhrase(e.target.value)}
                      placeholder="e.g., 'start support workflow'"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is-default"
                      checked={isDefault}
                      onCheckedChange={setIsDefault}
                    />
                    <Label htmlFor="is-default">Make this the default workflow</Label>
                  </div>
                  <div className="space-y-2">
                    <Label>{isEditing ? 'Load Template' : 'Start from Template'}</Label>
                    <Select value={selectedTemplate} onValueChange={loadTemplate}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a template" />
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
                  <Button 
                    onClick={() => setIsEditPopoverOpen(false)}
                    className="w-full"
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
        >
          <Save className="h-4 w-4" />
          {(createWorkflowMutation.isPending || updateWorkflowMutation.isPending) 
            ? 'Saving...' 
            : 'Save'
          }
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
            <div className="space-y-6">
            {steps.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Workflow className="h-6 w-6 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-700 mb-2">Start building</h3>
                  <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
                    Add your first step or choose a template from the settings above
                  </p>
                  <Button 
                    variant="outline" 
                    onClick={addStep}
                    className="border-dashed"
                  >
                    Add Step
                  </Button>
                </div>
            ) : (
              <div className="space-y-3">
                {steps.map((step, index) => (
                  <div key={step.id} className="relative">
                    <div className="group bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-all duration-200">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs font-medium text-blue-600">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <Input
                            value={step.name}
                            onChange={(e) => updateStep(step.id, { name: e.target.value })}
                            placeholder="Step name"
                            className="border-0 shadow-none text-base font-medium p-0 h-auto focus-visible:ring-0 mb-1"
                          />
                          <Input
                            value={step.description}
                            onChange={(e) => updateStep(step.id, { description: e.target.value })}
                            placeholder="What does this step do?"
                            className="-mt-1 border-0 shadow-none text-sm text-gray-600 p-0 resize-none focus-visible:ring-0"
                          />
                          <div className="mt-2">
                            <Popover 
                              open={toolSearchOpen[step.id] || false} 
                              onOpenChange={(open) => setToolSearchOpen(prev => ({ ...prev, [step.id]: open }))}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  aria-expanded={toolSearchOpen[step.id] || false}
                                  className="h-8 w-full justify-between text-sm border-gray-200"
                                >
                                  {step.config.tool_name ? (
                                    <div className="flex items-center gap-2">
                                      {(() => {
                                        const agentpressTool = agentTools?.agentpress_tools.find(t => t.name === step.config.tool_name);
                                        if (agentpressTool) {
                                          return (
                                            <>
                                              <span className="text-xs">{agentpressTool.icon}</span>
                                              <span>{normalizeToolName(agentpressTool.name, 'agentpress')}</span>
                                            </>
                                          );
                                        }
                                        const mcpTool = agentTools?.mcp_tools.find(t => `${t.server}:${t.name}` === step.config.tool_name);
                                        if (mcpTool) {
                                          return (
                                            <>
                                              <span className="text-xs">{mcpTool.icon}</span>
                                              <span>{normalizeToolName(mcpTool.name, 'mcp')}</span>
                                            </>
                                          );
                                        }
                                        return <span>{step.config.tool_name}</span>;
                                      })()}
                                    </div>
                                  ) : (
                                    "Select tool (optional)..."
                                  )}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[300px] p-0" align="start">
                                <Command>
                                  <CommandInput placeholder="Search tools..." className="h-9" />
                                  <CommandEmpty>No tools found.</CommandEmpty>
                                  <CommandList>
                                    {isLoadingTools ? (
                                      <CommandItem disabled>Loading tools...</CommandItem>
                                    ) : agentTools ? (
                                      <>
                                        {agentTools.agentpress_tools.filter(tool => tool.enabled).length > 0 && (
                                          <CommandGroup heading="AgentPress Tools">
                                            {agentTools.agentpress_tools.filter(tool => tool.enabled).map((tool) => (
                                              <CommandItem
                                                key={tool.name}
                                                value={`${normalizeToolName(tool.name, 'agentpress')} ${tool.name}`}
                                                onSelect={() => {
                                                  updateStep(step.id, { config: { ...step.config, tool_name: tool.name } });
                                                  setToolSearchOpen(prev => ({ ...prev, [step.id]: false }));
                                                }}
                                              >
                                                <div className="flex items-center gap-2 flex-1">
                                                  <span className="text-sm">{tool.icon}</span>
                                                  <div className="flex flex-col">
                                                    <span className="font-medium">{normalizeToolName(tool.name, 'agentpress')}</span>
                                                    <span className="text-xs text-gray-500">{tool.description}</span>
                                                  </div>
                                                </div>
                                                <Check
                                                  className={`ml-auto h-4 w-4 ${
                                                    step.config.tool_name === tool.name ? "opacity-100" : "opacity-0"
                                                  }`}
                                                />
                                              </CommandItem>
                                            ))}
                                          </CommandGroup>
                                        )}
                                        {agentTools.mcp_tools.length > 0 && (
                                          <CommandGroup heading="MCP Tools">
                                            {agentTools.mcp_tools.map((tool) => (
                                              <CommandItem
                                                key={`${tool.server}-${tool.name}`}
                                                value={`${normalizeToolName(tool.name, 'mcp')} ${tool.name} ${tool.server}`}
                                                onSelect={() => {
                                                  updateStep(step.id, { config: { ...step.config, tool_name: `${tool.server}:${tool.name}` } });
                                                  setToolSearchOpen(prev => ({ ...prev, [step.id]: false }));
                                                }}
                                              >
                                                <div className="flex items-center gap-2 flex-1">
                                                  <span className="text-sm">{tool.icon}</span>
                                                  <div className="flex flex-col">
                                                    <span className="font-medium">{normalizeToolName(tool.name, 'mcp')}</span>
                                                    <span className="text-xs text-gray-500">{tool.description}</span>
                                                  </div>
                                                </div>
                                                <Check
                                                  className={`ml-auto h-4 w-4 ${
                                                    step.config.tool_name === `${tool.server}:${tool.name}` ? "opacity-100" : "opacity-0"
                                                  }`}
                                                />
                                              </CommandItem>
                                            ))}
                                          </CommandGroup>
                                        )}
                                      </>
                                    ) : (
                                      <CommandItem disabled>Failed to load tools</CommandItem>
                                    )}
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeStep(step.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 h-8 w-8 p-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {index < steps.length - 1 && (
                      <div className="flex justify-start ml-3 py-2">
                        <div className="w-px h-4 bg-gray-300"></div>
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex justify-start ml-3 pt-4">
                  <Button 
                    variant="outline" 
                    onClick={addStep}
                    className="h-8 border-dashed border-gray-300 text-sm"
                    size="sm"
                  >
                    Add Step
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 