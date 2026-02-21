'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import {
  Database,
  ExternalLink,
  Loader2,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  useAllLlamaCloudKnowledgeBases,
  useAgentUnifiedAssignments,
  useToggleAgentLlamaCloudKBAssignment,
} from '@/hooks/react-query/llamacloud-knowledge-base';

interface LlamaCloudKnowledgeBaseManagerProps {
  agentId: string;
  agentName: string;
}

export const LlamaCloudKnowledgeBaseManager = ({
  agentId,
  agentName,
}: LlamaCloudKnowledgeBaseManagerProps) => {
  const { data: accountKBsResponse, isLoading: loadingKBs } = useAllLlamaCloudKnowledgeBases();
  const { data: assignments, isLoading: loadingAssignments } = useAgentUnifiedAssignments(agentId);
  const toggleMutation = useToggleAgentLlamaCloudKBAssignment();

  const allKBs = accountKBsResponse?.knowledge_bases ?? [];

  const assignedKbIds = useMemo(
    () => new Set(Object.keys(assignments?.llamacloud_assignments ?? {})),
    [assignments]
  );

  const isLoading = loadingKBs || loadingAssignments;

  const handleToggle = (kbId: string, currentlyAssigned: boolean) => {
    if (!assignments) return;
    toggleMutation.mutate({
      agentId,
      kbId,
      assign: !currentlyAssigned,
      currentAssignments: assignments,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
              <Skeleton className="h-10 w-10 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-5 w-9 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Database className="size-5" />
          Cloud Knowledge Bases
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Toggle to connect LlamaCloud knowledge bases to {agentName}
        </p>
      </div>

      {allKBs.length === 0 ? (
        /* Empty state — redirect to /knowledge */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Database className="size-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No Cloud Knowledge Bases Yet</p>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Add a LlamaCloud knowledge base from the Knowledge Base page, then come back to connect it to this agent.
            </p>
            <Button asChild variant="default" className="gap-2">
              <Link href="/knowledge">
                <ExternalLink className="size-4" />
                Go to Knowledge Base
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* KB list with toggle switches */
        <div className="space-y-3">
          {allKBs.map((kb) => {
            const isAssigned = assignedKbIds.has(kb.kb_id);
            const isPending =
              toggleMutation.isPending &&
              (toggleMutation.variables as { kbId: string } | undefined)?.kbId === kb.kb_id;

            return (
              <div
                key={kb.kb_id}
                className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center justify-center h-10 w-10 rounded-md bg-muted shrink-0">
                  <Database className="size-5 text-muted-foreground" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium truncate">{kb.name}</span>
                    <Badge variant={kb.is_active ? 'highlight' : 'secondary'} className="shrink-0">
                      {kb.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Search className="size-3 shrink-0" />
                    <code className="truncate">{kb.index_name}</code>
                  </div>
                  {kb.description && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{kb.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={isAssigned}
                    onCheckedChange={() => handleToggle(kb.kb_id, isAssigned)}
                    disabled={isPending || !kb.is_active}
                    aria-label={`${isAssigned ? 'Disconnect' : 'Connect'} ${kb.name}`}
                  />
                </div>
              </div>
            );
          })}

          <p className="text-xs text-muted-foreground text-center pt-2">
            {assignedKbIds.size} of {allKBs.length} knowledge base{allKBs.length !== 1 ? 's' : ''} connected to {agentName}.{' '}
            <Link href="/knowledge" className="underline underline-offset-2 hover:text-foreground">
              Manage knowledge bases
            </Link>
          </p>
        </div>
      )}
    </div>
  );
};
