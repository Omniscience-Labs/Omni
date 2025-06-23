"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Workflow, ExternalLink, Settings, Play } from "lucide-react";
import { useWorkflow } from "@/hooks/react-query/workflows/use-workflow";
import Link from "next/link";

interface WorkflowInfoProps {
  workflowId: string;
  className?: string;
}

export function WorkflowInfo({ workflowId, className }: WorkflowInfoProps) {
  const { data: workflow, isLoading, error } = useWorkflow(workflowId);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20">
              <Workflow className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <div className="h-4 bg-muted rounded animate-pulse mb-1" />
              <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !workflow) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/20">
              <Workflow className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                Workflow not found
              </p>
              <p className="text-xs text-muted-foreground">
                The associated workflow may have been deleted
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

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

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20">
              <Workflow className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium truncate">
                  {workflow.definition.name || workflow.name}
                </p>
                {getStatusBadge(workflow.status)}
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                {workflow.definition.description || workflow.description || "No description"}
              </p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{workflow.definition.nodes?.length || 0} nodes</span>
                <span>{workflow.definition.edges?.length || 0} connections</span>
                <span className="text-blue-600 dark:text-blue-400 font-medium">Using workflow prompt</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link href={`/workflows/builder/${workflow.id}`}>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Settings className="h-3 w-3" />
              </Button>
            </Link>
            <Link href={`/workflows`}>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <ExternalLink className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 