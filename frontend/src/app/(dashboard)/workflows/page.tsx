"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Play, Edit, Trash2, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getWorkflows, executeWorkflow, deleteWorkflow, getProjects, createWorkflow, type Workflow } from "@/lib/api";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executingWorkflows, setExecutingWorkflows] = useState<Set<string>>(new Set());
  const [projectId, setProjectId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get user's first project
        const projects = await getProjects();
        if (projects.length === 0) {
          setError("No projects found. Please create a project first.");
          return;
        }

        const firstProject = projects[0];
        setProjectId(firstProject.id);

        // Load workflows for the project
        const workflowsData = await getWorkflows(firstProject.id);
        setWorkflows(workflowsData);
      } catch (err) {
        console.error('Error loading workflows:', err);
        setError(err instanceof Error ? err.message : 'Failed to load workflows');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleRunWorkflow = async (workflowId: string) => {
    if (!projectId) {
      toast.error("No project selected");
      return;
    }

    try {
      setExecutingWorkflows(prev => new Set(prev).add(workflowId));
      
      const result = await executeWorkflow(workflowId);
      toast.success("Workflow execution started! Redirecting to chat...");
      console.log('Workflow execution started:', result);
      
      // Redirect to the thread page
      if (result.thread_id) {
        router.push(`/projects/${projectId}/thread/${result.thread_id}`);
      }
    } catch (err) {
      console.error('Error executing workflow:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to execute workflow');
    } finally {
      setExecutingWorkflows(prev => {
        const newSet = new Set(prev);
        newSet.delete(workflowId);
        return newSet;
      });
    }
  };

  const handleCreateWorkflow = async () => {
    if (!projectId) {
      toast.error("No project selected");
      return;
    }

    try {
      setCreating(true);
      const newWorkflow = await createWorkflow({
        name: "Untitled Workflow",
        description: "A new workflow",
        project_id: projectId,
        nodes: [],
        edges: [],
        variables: {}
      });

      toast.success("Workflow created successfully!");
      router.push(`/workflows/builder/${newWorkflow.id}`);
    } catch (err) {
      console.error('Error creating workflow:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create workflow');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) {
      return;
    }

    try {
      await deleteWorkflow(workflowId);
      setWorkflows(prev => prev.filter(w => w.id !== workflowId));
      toast.success('Workflow deleted successfully');
    } catch (err) {
      console.error('Error deleting workflow:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete workflow');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "draft":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "paused":
        return <XCircle className="h-4 w-4 text-gray-400" />;
      case "disabled":
        return <XCircle className="h-4 w-4 text-red-400" />;
      case "archived":
        return <XCircle className="h-4 w-4 text-gray-300" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-500">Active</Badge>;
      case "draft":
        return <Badge variant="outline">Draft</Badge>;
      case "paused":
        return <Badge variant="secondary">Paused</Badge>;
      case "disabled":
        return <Badge variant="destructive">Disabled</Badge>;
      case "archived":
        return <Badge variant="secondary" className="opacity-60">Archived</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">Workflows</h1>
            <p className="text-muted-foreground">
              Create and manage automated agent workflows
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading workflows...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">Workflows</h1>
            <p className="text-muted-foreground">
              Create and manage automated agent workflows
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Error Loading Workflows</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">Workflows</h1>
          <p className="text-muted-foreground">
            Create and manage automated agent workflows
          </p>
        </div>
        <Button onClick={handleCreateWorkflow} disabled={loading || creating}>
          {creating ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b border-current mr-2" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          {creating ? "Creating..." : "Create Workflow"}
        </Button>
      </div>

      {workflows.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="rounded-full bg-muted p-6 mx-auto mb-4 w-fit">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No workflows yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first workflow to get started with automation
            </p>
            <Button onClick={handleCreateWorkflow} disabled={creating}>
              {creating ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b border-current mr-2" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {creating ? "Creating..." : "Create Your First Workflow"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workflows.map((workflow) => (
            <Card key={workflow.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{workflow.definition.name || workflow.name}</CardTitle>
                    <CardDescription>{workflow.definition.description || workflow.description}</CardDescription>
                  </div>
                  {getStatusBadge(workflow.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-2 pt-2">
                    <Link href={`/workflows/builder/${workflow.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Edit className="mr-2 h-3 w-3" />
                        Edit
                      </Button>
                    </Link>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleRunWorkflow(workflow.id)}
                      disabled={executingWorkflows.has(workflow.id) || workflow.status !== 'active'}
                    >
                      {executingWorkflows.has(workflow.id) ? (
                        <div className="animate-spin rounded-full h-3 w-3 border-b border-current mr-2" />
                      ) : (
                        <Play className="mr-2 h-3 w-3" />
                      )}
                      Run
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleDeleteWorkflow(workflow.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
} 