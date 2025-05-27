'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { PlusCircle, MessagesSquare, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjects, useAllThreads } from '@/hooks/react-query';
import type { Project } from '@/lib/api';

// Define the Agent type that combines project and thread data
interface Agent {
  id: string;
  name: string;
  description: string;
  created_at: string;
  threadId: string | null;
  is_public?: boolean;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  
  // Use React Query hooks
  const { data: projectsData = [], isLoading: projectsLoading, error: projectsError } = useProjects();
  const { data: allThreads = [], isLoading: threadsLoading } = useAllThreads();
  
  const isLoading = projectsLoading || threadsLoading;
  const error = projectsError ? (projectsError instanceof Error ? projectsError.message : 'An error occurred loading agents') : null;

  useEffect(() => {
    if (!projectsData.length || isLoading) {
      setAgents([]);
      return;
    }

    // Create agents data from projects and threads
    const agentsData: Agent[] = [];

    for (const project of projectsData) {
      // Find threads for this project
      const projectThreads = allThreads.filter(thread => thread.project_id === project.id);

      // Create an agent entry with the first thread (or null if none exists)
      agentsData.push({
        id: project.id,
        name: project.name,
        description: project.description,
        created_at: project.created_at,
        threadId: projectThreads.length > 0 ? projectThreads[0].thread_id : null,
        is_public: false, // Default to false for user's projects
      });
    }

    setAgents(agentsData);
  }, [projectsData, allThreads, isLoading]);

  if (error) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your Agents</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage your AI agents
          </p>
        </div>
        <Button asChild>
          <Link href="/agents/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Agent
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 border rounded-md">
              <div className="flex flex-col space-y-2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <div className="flex justify-between items-center pt-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-9 w-36" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center border rounded-md">
          <MessagesSquare className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No agents yet</h2>
          <p className="text-muted-foreground max-w-md mb-4">
            Create your first agent to start automating tasks and getting help
            from AI.
          </p>
          <Button asChild>
            <Link href="/agents/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              Create your first agent
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="p-4 border rounded-md hover:bg-muted/50 transition-colors"
            >
              <div className="flex flex-col">
                <h3 className="font-medium">{agent.name}</h3>
                <p className="text-sm text-muted-foreground truncate mb-3">
                  {agent.description || 'No description provided'}
                </p>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    {new Date(agent.created_at).toLocaleDateString()}
                  </span>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={
                        agent.threadId
                          ? `/agents/${agent.threadId}`
                          : `/dashboard`
                      }
                    >
                      Continue Conversation
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
