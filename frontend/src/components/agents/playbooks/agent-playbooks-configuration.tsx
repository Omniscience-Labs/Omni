'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Play, Pencil, Trash2, BookOpen } from 'lucide-react';
import { useAgentWorkflows, useDeleteAgentWorkflow } from '@/hooks/react-query/agents/use-agent-workflows';
import type { AgentWorkflow } from '@/hooks/react-query/agents/workflow-utils';
import { PlaybookCreateModal } from '@/components/playbooks/playbook-create-modal';
import { PlaybookExecuteDialog } from '@/components/playbooks/playbook-execute-dialog';
import { DeleteConfirmationDialog } from '@/components/thread/DeleteConfirmationDialog';

interface AgentPlaybooksConfigurationProps {
    agentId: string;
    agentName: string;
}

function isPlaybook(workflow: AgentWorkflow): boolean {
    try {
        const stepsAny = (workflow.steps as unknown as any[]) || [];
        const start = stepsAny.find(
            (s) => s?.name === 'Start' && s?.description === 'Click to add steps or use the Add Node button',
        );
        const child = start?.children?.[0] ?? stepsAny[0];
        return Boolean(child?.config?.playbook);
    } catch {
        return false;
    }
}

export function AgentPlaybooksConfiguration({ agentId, agentName }: AgentPlaybooksConfigurationProps) {
    const { data: workflows = [], isLoading } = useAgentWorkflows(agentId);
    const deleteWorkflowMutation = useDeleteAgentWorkflow();

    const playbooks = useMemo(() => workflows.filter(isPlaybook), [workflows]);

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editing, setEditing] = useState<AgentWorkflow | null>(null);
    const [executing, setExecuting] = useState<AgentWorkflow | null>(null);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [toDelete, setToDelete] = useState<AgentWorkflow | null>(null);

    const handleDelete = (w: AgentWorkflow) => {
        setToDelete(w);
        setIsDeleteOpen(true);
    };

    const confirmDelete = async () => {
        if (!toDelete) return;
        try {
            await deleteWorkflowMutation.mutateAsync({ agentId, workflowId: toDelete.id });
        } finally {
            setIsDeleteOpen(false);
            setToDelete(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                    <div>
                        <div className="font-medium">Playbooks</div>
                        <div className="text-xs text-muted-foreground">Lightweight, variable-driven instructions stored via workflows</div>
                    </div>
                </div>
                <Button onClick={() => { setEditing(null); setIsCreateOpen(true); }}>
                    <Plus className="h-4 w-4 mr-1" /> New Playbook
                </Button>
            </div>

            {isLoading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
            ) : playbooks.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground shadow-none">No playbooks yet.</Card>
            ) : (
                <div className="flex flex-col gap-2">
                    {playbooks.map((pb) => (
                        <Card key={pb.id} className="w-full p-4 shadow-none">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="font-medium truncate">{pb.name}</div>
                                    {pb.description ? (
                                        <div className="text-xs text-muted-foreground truncate">{pb.description}</div>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-1">

                                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => { setEditing(pb); setIsCreateOpen(true); }} aria-label="Edit playbook">
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => handleDelete(pb)} aria-label="Delete playbook">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                    <Button size="icon" className="h-8 w-8" onClick={() => setExecuting(pb)} aria-label="Run playbook">
                                        <Play className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <PlaybookCreateModal
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                agentId={agentId}
                initialPlaybook={editing}
                onCreated={() => { }}
            />

            {executing && (
                <PlaybookExecuteDialog
                    open={!!executing}
                    onOpenChange={(o) => { if (!o) setExecuting(null); }}
                    agentId={agentId}
                    playbook={executing}
                />
            )}

            <DeleteConfirmationDialog
                isOpen={isDeleteOpen}
                onClose={() => { if (!deleteWorkflowMutation.isPending) { setIsDeleteOpen(false); setToDelete(null); } }}
                onConfirm={confirmDelete}
                threadName={toDelete?.name ?? ''}
                isDeleting={deleteWorkflowMutation.isPending}
            />
        </div>
    );
}


