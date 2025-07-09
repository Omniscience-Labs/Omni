'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Play, Pause, AlertCircle, Workflow, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { 
  useAgentWorkflows, 
  useCreateAgentWorkflow,
  useUpdateAgentWorkflow, 
  useDeleteAgentWorkflow, 
  useExecuteWorkflow, 
} from '@/hooks/react-query/agents/use-agent-workflows';
import { 
  AgentWorkflow
} from '@/hooks/react-query/agents/workflow-utils';

interface AgentWorkflowsConfigurationProps {
  agentId: string;
  agentName: string;
}

export function AgentWorkflowsConfiguration({ agentId, agentName }: AgentWorkflowsConfigurationProps) {
  const router = useRouter();

  const { data: workflows = [], isLoading } = useAgentWorkflows(agentId);
  const createWorkflowMutation = useCreateAgentWorkflow();
  const updateWorkflowMutation = useUpdateAgentWorkflow();
  const deleteWorkflowMutation = useDeleteAgentWorkflow();
  const executeWorkflowMutation = useExecuteWorkflow();

  const [isExecuteDialogOpen, setIsExecuteDialogOpen] = useState(false);
  const [workflowToExecute, setWorkflowToExecute] = useState<AgentWorkflow | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [workflowToDelete, setWorkflowToDelete] = useState<AgentWorkflow | null>(null);
  const [activeTab, setActiveTab] = useState('workflows');

  const [executionInput, setExecutionInput] = useState<string>('');

  const handleCreateWorkflow = useCallback(async () => {
    try {
      const defaultWorkflow = {
        name: 'Untitled Workflow',
        description: 'A new workflow',
        steps: []
      };
      const newWorkflow = await createWorkflowMutation.mutateAsync({ 
        agentId, 
        workflow: defaultWorkflow 
      });
      router.push(`/agents/new/${agentId}/workflow/${newWorkflow.id}`);
    } catch (error) {
      toast.error('Failed to create workflow');
    }
  }, [agentId, router, createWorkflowMutation]);

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

  const handleWorkflowClick = useCallback((workflowId: string) => {
    router.push(`/agents/new/${agentId}/workflow/${workflowId}`);
  }, [agentId, router]);

  const handleDeleteWorkflow = useCallback((workflow: AgentWorkflow) => {
    setWorkflowToDelete(workflow);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!workflowToDelete) return;
    
    try {
      await deleteWorkflowMutation.mutateAsync({ agentId, workflowId: workflowToDelete.id });
      toast.success('Workflow deleted successfully');
      setIsDeleteDialogOpen(false);
      setWorkflowToDelete(null);
    } catch (error) {
      toast.error('Failed to delete workflow');
    }
  }, [agentId, workflowToDelete, deleteWorkflowMutation]);

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
        <Button 
          size='sm' 
          variant='outline' 
          className="flex items-center gap-2" 
          onClick={handleCreateWorkflow}
          disabled={createWorkflowMutation.isPending}
        >
          <Plus className="h-4 w-4" />
          {createWorkflowMutation.isPending ? 'Creating...' : 'Create Workflow'}
        </Button>
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

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete workflow {workflowToDelete?.name}? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleConfirmDelete}
                className="bg-red-600 hover:bg-red-700"
                disabled={deleteWorkflowMutation.isPending}
              >
                {deleteWorkflowMutation.isPending ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
            <div className="text-center py-12 px-6 bg-muted/30 rounded-xl border-2 border-dashed border-border">
              <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4 border">
                <Workflow className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold mb-2">No Agent Workflows</h3>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                Create workflows to automate tasks and streamline your agent's operations.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {workflows.map((workflow) => (
                <Card 
                  key={workflow.id} 
                  className="p-4 cursor-pointer hover:opacity-80 transition-colors"
                  onClick={() => handleWorkflowClick(workflow.id)}
                >
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
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExecuteWorkflow(workflow);
                        }}
                        disabled={workflow.status !== 'active' || executeWorkflowMutation.isPending}
                      >
                        <Play className="h-4 w-4" />
                        Execute
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateWorkflowStatus(
                            workflow.id,
                            workflow.status === 'active' ? 'paused' : 'active'
                          );
                        }}
                        disabled={updateWorkflowMutation.isPending}
                      >
                        {workflow.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteWorkflow(workflow);
                        }}
                        disabled={deleteWorkflowMutation.isPending}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
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