'use client';

import React, { useState } from 'react';
import { PlusCircle, MessagesSquare, AlertCircle, Settings, Trash2, Star, StarOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { CreateAgentDialog } from './_components/create-agent-dialog';
import { UpdateAgentDialog } from './_components/update-agent-dialog';
import { getToolDisplayName } from './_data/tools';
import { useAgents, useUpdateAgent, useDeleteAgent, useOptimisticAgentUpdate } from '@/hooks/react-query/agents/use-agents';

export default function AgentsPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);

  const { 
    data: agents = [], 
    isLoading, 
    error,
    refetch: loadAgents 
  } = useAgents();
  
  const updateAgentMutation = useUpdateAgent();
  const deleteAgentMutation = useDeleteAgent();
  const { optimisticallyUpdateAgent, revertOptimisticUpdate } = useOptimisticAgentUpdate();

  const handleDeleteAgent = async (agentId: string) => {
    try {
      await deleteAgentMutation.mutateAsync(agentId);
    } catch (error) {
      console.error('Error deleting agent:', error);
    }
  };

  const handleToggleDefault = async (agentId: string, currentDefault: boolean) => {
    optimisticallyUpdateAgent(agentId, { is_default: !currentDefault });
    try {
      await updateAgentMutation.mutateAsync({
        agentId,
        is_default: !currentDefault
      });
    } catch (error) {
      revertOptimisticUpdate(agentId);
      console.error('Error updating agent:', error);
    }
  };

  const handleEditAgent = (agentId: string) => {
    setEditingAgentId(agentId);
    setEditDialogOpen(true);
  };

  if (error) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'An error occurred loading agents'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Your Agents
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Create and manage your AI agents with custom instructions and tools
            </p>
          </div>
          <Button 
            onClick={() => setCreateDialogOpen(true)}
            size="lg"
            className="self-start sm:self-center"
          >
            <PlusCircle className="h-5 w-5" />
            New Agent
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="h-64">
                <CardHeader className="pb-4">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full mt-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-4">
                    <Skeleton className="h-3 w-24" />
                    <div className="flex gap-1">
                      <Skeleton className="h-8 w-8" />
                      <Skeleton className="h-8 w-8" />
                      <Skeleton className="h-8 w-8" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="flex flex-col items-center text-center max-w-md space-y-6">
              <div className="rounded-full bg-muted p-6">
                <MessagesSquare className="h-12 w-12 text-muted-foreground" />
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl font-semibold text-foreground">
                  No agents yet
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Create your first agent to start automating tasks with custom instructions and tools. 
                  Configure MCP tools and AgentPress capabilities to enhance your agent&apos;s capabilities.
                </p>
              </div>
              <Button 
                size="lg" 
                onClick={() => setCreateDialogOpen(true)}
                className="mt-4"
              >
                <PlusCircle className="h-5 w-5" />
                Create your first agent
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <Card 
                key={agent.agent_id} 
                className="group transition-all duration-200 border-border/50 hover:border-border"
              >
                <CardHeader className="pb-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-xl font-semibold text-foreground leading-tight flex items-center gap-2 group-hover:text-primary transition-colors">
                        <span className="line-clamp-2">{agent.name}</span>
                        {agent.is_default && (
                          <Badge variant="secondary" className="text-xs font-medium shrink-0">
                            <Star className="h-3 w-3 mr-1 fill-current" />
                            Default
                          </Badge>
                        )}
                      </CardTitle>
                    </div>
                    <CardDescription className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                      {agent.description || 'No description provided'}
                    </CardDescription>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {agent.configured_mcps && agent.configured_mcps.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        MCP Tools
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {agent.configured_mcps.slice(0, 3).map((mcp, index) => (
                          <Badge 
                            key={index} 
                            variant="outline" 
                            className="text-xs px-2 py-1 bg-secondary/50 hover:bg-secondary transition-colors"
                          >
                            {mcp.name}
                          </Badge>
                        ))}
                        {agent.configured_mcps.length > 3 && (
                          <Badge 
                            variant="outline" 
                            className="text-xs px-2 py-1 bg-muted/50 text-muted-foreground"
                          >
                            +{agent.configured_mcps.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {agent.agentpress_tools && Object.keys(agent.agentpress_tools).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        AgentPress Tools
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(agent.agentpress_tools).slice(0, 3).map(([tool, toolData], index) => (
                          toolData && typeof toolData === 'object' && 'enabled' in toolData && toolData.enabled && (
                            <Badge 
                              key={index} 
                              variant="outline" 
                              className="text-xs px-2 py-1 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors"
                            >
                              {getToolDisplayName(tool)}
                            </Badge>
                          )
                        ))}
                        {Object.entries(agent.agentpress_tools).filter(([, toolData]) => 
                          toolData && typeof toolData === 'object' && 'enabled' in toolData && toolData.enabled
                        ).length > 3 && (
                          <Badge 
                            variant="outline" 
                            className="text-xs px-2 py-1 bg-muted/50 text-muted-foreground"
                          >
                            +{Object.entries(agent.agentpress_tools).filter(([, toolData]) => 
                              toolData && typeof toolData === 'object' && 'enabled' in toolData && toolData.enabled
                            ).length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-4 border-t border-border/50">
                    <span className="text-xs text-muted-foreground font-medium">
                      {new Date(agent.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-secondary"
                        onClick={() => handleToggleDefault(agent.agent_id, agent.is_default)}
                        disabled={updateAgentMutation.isPending}
                        title={agent.is_default ? "Remove as default" : "Set as default"}
                      >
                        {agent.is_default ? (
                          <StarOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Star className="h-4 w-4 text-muted-foreground hover:text-yellow-500 transition-colors" />
                        )}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-secondary"
                        onClick={() => handleEditAgent(agent.agent_id)}
                        title="Edit agent"
                      >
                        <Settings className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      {!agent.is_default && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                              disabled={deleteAgentMutation.isPending}
                              title="Delete agent"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="max-w-md">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-xl">Delete Agent</AlertDialogTitle>
                              <AlertDialogDescription className="text-muted-foreground">
                                Are you sure you want to delete &quot;{agent.name}&quot;? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteAgent(agent.agent_id)}
                                disabled={deleteAgentMutation.isPending}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                {deleteAgentMutation.isPending ? 'Deleting...' : 'Delete'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <CreateAgentDialog
          isOpen={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onAgentCreated={loadAgents}
        />

        <UpdateAgentDialog
          agentId={editingAgentId}
          isOpen={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setEditingAgentId(null);
          }}
          onAgentUpdated={loadAgents}
        />
      </div>
    </div>
  );
}