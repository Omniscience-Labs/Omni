'use client';

import React, { useState, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus, GitBranch, ArrowRight } from "lucide-react";
import { 
  WorkflowBuilder, 
  generateStepId, 
  CONDITION_OPERATIONS 
} from "@/hooks/react-query/agents/workflow-builder";
import { 
  ConditionalWorkflow, 
  WorkflowStep, 
  Condition, 
  StepType 
} from "@/hooks/react-query/agents/conditional-workflow-types";

interface ConditionalWorkflowBuilderProps {
  agentId: string;
  initialWorkflow?: ConditionalWorkflow;
  onSave?: (workflow: ConditionalWorkflow) => void;
  onCancel?: () => void;
}

export function ConditionalWorkflowBuilder({ 
  agentId, 
  initialWorkflow, 
  onSave, 
  onCancel 
}: ConditionalWorkflowBuilderProps) {
  const [workflowBuilder, setWorkflowBuilder] = useState(() => {
    if (initialWorkflow) {
      const builder = new WorkflowBuilder(agentId, initialWorkflow.name);
      builder.workflow.id = initialWorkflow.id;
      builder.workflow.description = initialWorkflow.description;
      builder.workflow.trigger_phrase = initialWorkflow.trigger_phrase;
      builder.workflow.is_default = initialWorkflow.is_default;
      builder.workflow.status = initialWorkflow.status;
      builder.workflow.root_step_id = initialWorkflow.root_step_id;
      builder.workflow.variables = initialWorkflow.variables;
      
      // Load existing steps
      for (const step of initialWorkflow.steps) {
        builder.steps.set(step.id, step);
      }
      
      return builder;
    }
    return new WorkflowBuilder(agentId, 'New Workflow');
  });

  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const workflow = workflowBuilder.build();
  const steps = workflow.steps.sort((a, b) => a.order - b.order);

  // Add a new step
  const addStep = useCallback((type: StepType) => {
    const stepId = generateStepId();
    const stepName = `Step ${steps.length + 1}`;
    
    if (type === 'instruction') {
      workflowBuilder.addInstructionStep(stepId, stepName, '', {
        order: steps.length + 1
      });
    } else if (type === 'if') {
      workflowBuilder.addIfStep(stepId, stepName, {
        variable: 'user_input',
        operation: 'contains',
        value: '',
        description: ''
      }, {
        order: steps.length + 1
      });
    }
    
    setWorkflowBuilder(workflowBuilder.clone());
    setEditingStep(stepId);
  }, [workflowBuilder, steps.length]);

  // Update step
  const updateStep = useCallback((stepId: string, updates: Partial<WorkflowStep>) => {
    workflowBuilder.updateStep(stepId, updates);
    setWorkflowBuilder(workflowBuilder.clone());
  }, [workflowBuilder]);

  // Delete step
  const deleteStep = useCallback((stepId: string) => {
    workflowBuilder.removeStep(stepId);
    setWorkflowBuilder(workflowBuilder.clone());
    if (editingStep === stepId) {
      setEditingStep(null);
    }
  }, [workflowBuilder, editingStep]);

  // Connect steps
  const connectSteps = useCallback((fromId: string, toId: string) => {
    workflowBuilder.connectSteps(fromId, toId);
    setWorkflowBuilder(workflowBuilder.clone());
  }, [workflowBuilder]);

  // Connect if branch
  const connectIfBranch = useCallback((ifStepId: string, trueStepId?: string, falseStepId?: string) => {
    workflowBuilder.connectIfBranch(ifStepId, trueStepId, falseStepId);
    setWorkflowBuilder(workflowBuilder.clone());
  }, [workflowBuilder]);

  // Save workflow
  const handleSave = useCallback(() => {
    const builtWorkflow = workflowBuilder.build();
    onSave?.(builtWorkflow);
  }, [workflowBuilder, onSave]);

  // Render step editor
  const renderStepEditor = (step: WorkflowStep) => {
    if (editingStep !== step.id) return null;

    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Edit Step: {step.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="step-name">Step Name</Label>
            <Input
              id="step-name"
              value={step.name}
              onChange={(e) => updateStep(step.id, { name: e.target.value })}
              placeholder="Enter step name"
            />
          </div>

          <div>
            <Label htmlFor="step-description">Description (optional)</Label>
            <Input
              id="step-description"
              value={step.description || ''}
              onChange={(e) => updateStep(step.id, { description: e.target.value })}
              placeholder="Enter step description"
            />
          </div>

          {step.type === 'instruction' && (
            <div>
              <Label htmlFor="step-instruction">Instruction</Label>
              <Textarea
                id="step-instruction"
                value={step.instruction || ''}
                onChange={(e) => updateStep(step.id, { instruction: e.target.value })}
                placeholder="Enter what the agent should do in this step"
                rows={3}
              />
            </div>
          )}

          {step.type === 'if' && step.condition && (
            <>
              <div>
                <Label htmlFor="condition-variable">Check Variable</Label>
                <Select
                  value={step.condition.variable}
                  onValueChange={(value) => updateStep(step.id, { 
                    condition: { ...step.condition!, variable: value }
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select variable to check" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user_input">User Input</SelectItem>
                    <SelectItem value="previous_output">Previous Step Output</SelectItem>
                    {steps.filter(s => s.order < step.order).map(s => (
                      <SelectItem key={s.id} value={`step_${s.id}`}>
                        Output from: {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="condition-operation">Operation</Label>
                <Select
                  value={step.condition.operation}
                  onValueChange={(value) => updateStep(step.id, { 
                    condition: { ...step.condition!, operation: value as any }
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select operation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="not_equals">Not Equals</SelectItem>
                    <SelectItem value="is_empty">Is Empty</SelectItem>
                    <SelectItem value="is_not_empty">Is Not Empty</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!['is_empty', 'is_not_empty'].includes(step.condition.operation) && (
                <div>
                  <Label htmlFor="condition-value">Value</Label>
                  <Input
                    id="condition-value"
                    value={step.condition.value || ''}
                    onChange={(e) => updateStep(step.id, { 
                      condition: { ...step.condition!, value: e.target.value }
                    })}
                    placeholder="Enter value to check against"
                  />
                </div>
              )}

              <div>
                <Label>Branch Connections</Label>
                <div className="space-y-2 mt-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">If TRUE →</Badge>
                    <Select
                      value={step.if_true_step_id || ''}
                      onValueChange={(value) => connectIfBranch(step.id, value || undefined, step.if_false_step_id)}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select step" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {steps.filter(s => s.id !== step.id).map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">If FALSE →</Badge>
                    <Select
                      value={step.if_false_step_id || ''}
                      onValueChange={(value) => connectIfBranch(step.id, step.if_true_step_id, value || undefined)}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select step" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {steps.filter(s => s.id !== step.id).map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </>
          )}

          {step.type === 'instruction' && (
            <div>
              <Label>Next Step</Label>
              <Select
                value={step.next_step_id || ''}
                onValueChange={(value) => updateStep(step.id, { next_step_id: value || undefined })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select next step" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None (End)</SelectItem>
                  {steps.filter(s => s.id !== step.id).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => setEditingStep(null)}
              variant="outline"
            >
              Done
            </Button>
            <Button
              onClick={() => deleteStep(step.id)}
              variant="destructive"
              size="sm"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Workflow Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Workflow Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="workflow-name">Workflow Name</Label>
            <Input
              id="workflow-name"
              value={workflow.name}
              onChange={(e) => {
                workflowBuilder.workflow.name = e.target.value;
                setWorkflowBuilder(workflowBuilder.clone());
              }}
              placeholder="Enter workflow name"
            />
          </div>

          <div>
            <Label htmlFor="workflow-description">Description (optional)</Label>
            <Textarea
              id="workflow-description"
              value={workflow.description || ''}
              onChange={(e) => {
                workflowBuilder.workflow.description = e.target.value;
                setWorkflowBuilder(workflowBuilder.clone());
              }}
              placeholder="Describe what this workflow does"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Steps List */}
      <Card>
        <CardHeader>
          <CardTitle>Workflow Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div key={step.id}>
                <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{index + 1}</Badge>
                    <div>
                      <div className="font-medium">{step.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {step.type === 'if' ? (
                          <div className="flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            Condition: {step.condition?.variable} {step.condition?.operation} {step.condition?.value}
                          </div>
                        ) : (
                          step.instruction || step.description || 'No instruction set'
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {step.type === 'if' && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {step.if_true_step_id && (
                          <div className="flex items-center gap-1">
                            <Badge variant="secondary" className="text-xs">TRUE</Badge>
                            <ArrowRight className="h-3 w-3" />
                            <span>{steps.find(s => s.id === step.if_true_step_id)?.name}</span>
                          </div>
                        )}
                        {step.if_false_step_id && (
                          <div className="flex items-center gap-1 ml-2">
                            <Badge variant="secondary" className="text-xs">FALSE</Badge>
                            <ArrowRight className="h-3 w-3" />
                            <span>{steps.find(s => s.id === step.if_false_step_id)?.name}</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {step.type === 'instruction' && step.next_step_id && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ArrowRight className="h-3 w-3" />
                        <span>{steps.find(s => s.id === step.next_step_id)?.name}</span>
                      </div>
                    )}

                    <Button
                      onClick={() => setEditingStep(step.id)}
                      variant="outline"
                      size="sm"
                    >
                      Edit
                    </Button>
                  </div>
                </div>

                {renderStepEditor(step)}
              </div>
            ))}

            {steps.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No steps added yet. Add your first step below.
              </div>
            )}
          </div>

          {/* Add Step Buttons */}
          <div className="flex gap-2 mt-4 pt-4 border-t">
            <Button
              onClick={() => addStep('instruction')}
              variant="outline"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Instruction
            </Button>
            <Button
              onClick={() => addStep('if')}
              variant="outline"
              size="sm"
            >
              <GitBranch className="h-4 w-4 mr-2" />
              Add Condition
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={handleSave} className="flex-1">
          Save Workflow
        </Button>
        {onCancel && (
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
} 