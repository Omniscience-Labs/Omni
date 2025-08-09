'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useExecuteWorkflow } from '@/hooks/react-query/agents/use-agent-workflows';
import type { AgentWorkflow } from '@/hooks/react-query/agents/workflow-utils';
import { toast } from 'sonner';

type VariableType = 'string' | 'number' | 'boolean' | 'select' | 'multiselect';

interface VariableSpec {
    key: string;
    label: string;
    type: VariableType;
    required?: boolean;
    options?: string[];
    default?: string | number | boolean | string[];
    helperText?: string;
}

export interface PlaybookExecuteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    agentId: string;
    playbook: AgentWorkflow;
    onStarted?: (threadId?: string, agentRunId?: string) => void;
}

export const PlaybookExecuteDialog: React.FC<PlaybookExecuteDialogProps> = ({
    open,
    onOpenChange,
    agentId,
    playbook,
    onStarted,
}) => {
    const executeMutation = useExecuteWorkflow();
    const [values, setValues] = useState<Record<string, any>>({});

    const { variableSpecs, templateText } = useMemo(() => {
        const stepsAny = (playbook.steps as unknown as any[]) || [];
        const start = stepsAny.find(
            (s) => s?.name === 'Start' && s?.description === 'Click to add steps or use the Add Node button',
        );
        const child = start?.children?.[0] ?? stepsAny[0];
        const vars = (child?.config?.playbook?.variables as VariableSpec[]) || [];
        const tpl = (child?.config?.playbook?.template as string) || '';
        return { variableSpecs: vars, templateText: tpl };
    }, [playbook]);

    useEffect(() => {
        if (open) {
            const defaults: Record<string, any> = {};
            variableSpecs.forEach((v) => {
                if (v.default !== undefined) defaults[v.key] = v.default;
            });
            setValues(defaults);
        }
    }, [open, variableSpecs]);

    const isValid = useMemo(() => {
        return variableSpecs.every((v) => !v.required || (values[v.key] !== undefined && values[v.key] !== ''));
    }, [variableSpecs, values]);

    const handleChange = useCallback((key: string, val: any) => {
        setValues((prev) => ({ ...prev, [key]: val }));
    }, []);

    const handleRun = useCallback(async () => {
        if (!isValid) {
            toast.error('Please fill all required fields');
            return;
        }
        try {
            const result = await executeMutation.mutateAsync({
                agentId,
                workflowId: playbook.id,
                execution: { input_data: values },
            });
            toast.success('Playbook started');
            onOpenChange(false);
            onStarted?.(result.thread_id, result.agent_run_id);
        } catch (e) {
            toast.error('Failed to start playbook');
        }
    }, [agentId, isValid, onOpenChange, onStarted, playbook.id, values, executeMutation]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Run {playbook.name} playbook</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    {(templateText || playbook.description) ? (
                        <div className="rounded-md border p-3 bg-muted/30 max-h-[200px] overflow-y-auto">
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">{templateText || playbook.description}</p>
                        </div>
                    ) : null}
                    <p className="text-sm text-muted-foreground">Provide values for the variables below:</p>

                    {variableSpecs.length === 0 ? (
                        <div className="text-sm text-muted-foreground">This playbook has no variables.</div>
                    ) : (
                        <div className="space-y-3">
                            {variableSpecs.map((v) => (
                                <div key={v.key} className="space-y-1">
                                    <Label htmlFor={`v-${v.key}`}>{v.label}</Label>
                                    <Input
                                        id={`v-${v.key}`}
                                        type={v.type === 'number' ? 'number' : 'text'}
                                        value={values[v.key] ?? ''}
                                        onChange={(e) => handleChange(v.key, v.type === 'number' ? Number(e.target.value) : e.target.value)}
                                        placeholder={v.helperText || ''}
                                    />
                                </div>
                            ))}
                        </div>
                    )}



                    <div className="flex items-center justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={handleRun} disabled={executeMutation.isPending || !isValid}>
                            Run
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};


