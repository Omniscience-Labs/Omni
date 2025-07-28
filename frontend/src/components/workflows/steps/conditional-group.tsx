'use client';

import React, { useState } from 'react';
import { Plus, AlertTriangle, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ConditionalStep } from '@/components/agents/workflows/conditional-workflow-builder';
import { StepCard } from './step-card';
import { cn } from '@/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

interface ConditionalGroupProps {
    conditionSteps: ConditionalStep[];
    groupKey: string;
    onUpdate: (updates: Partial<ConditionalStep>) => void;
    onAddElse: (afterStepId: string) => void;
    onAddElseIf: (afterStepId: string) => void;
    onRemove: (stepId: string) => void;
    onEdit: (step: ConditionalStep) => void;
    agentTools?: any;
    isLoadingTools?: boolean;
}

export function ConditionalGroup({
    conditionSteps,
    groupKey,
    onUpdate,
    onAddElse,
    onAddElseIf,
    onRemove,
    onEdit,
    agentTools,
    isLoadingTools
}: ConditionalGroupProps) {
    const [activeConditionTab, setActiveConditionTab] = useState<string>(conditionSteps[0]?.id || '');
    const hasElse = conditionSteps.some(step => step.conditions?.type === 'else');

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: `condition-group-${conditionSteps[0]?.id}` });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const getConditionLetter = (index: number) => {
        return String.fromCharCode(65 + index);
    };

    const activeStep = conditionSteps.find(s => s.id === activeConditionTab) || conditionSteps[0];

    return (
        <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-50")}>
            <div className="space-y-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 relative group">
                <div className="absolute top-6.5 left-4 z-10">
                    <div
                        {...attributes}
                        {...listeners}
                        className="cursor-grab active:cursor-grabbing"
                    >
                        <GripVertical className="h-4 w-4 text-zinc-400" />
                    </div>
                </div>

                {/* Condition Tabs */}
                <div className="flex items-center gap-2 flex-wrap pl-5">
                    {conditionSteps.map((step, index) => {
                        const letter = getConditionLetter(index);
                        const isActive = step.id === activeConditionTab;
                        const conditionType = step.conditions?.type === 'if' ? 'If' :
                            step.conditions?.type === 'elseif' ? 'Else If' :
                                step.conditions?.type === 'else' ? 'Else' : 'If';
                        return (
                            <button
                                key={step.id}
                                onClick={() => setActiveConditionTab(step.id)}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                                    isActive
                                        ? "bg-blue-500 text-white border-blue-500 shadow-sm"
                                        : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                )}
                            >
                                <span className="font-mono text-xs font-bold">{letter}</span>
                                <span>•</span>
                                <span>{conditionType}</span>
                                {step.hasIssues && (
                                    <AlertTriangle className="h-3 w-3 text-red-500" />
                                )}
                            </button>
                        );
                    })}

                    {/* Add Else If button */}
                    {!hasElse && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onAddElseIf(conditionSteps[conditionSteps.length - 1].id)}
                            className="h-9 px-3 border-dashed text-xs"
                        >
                            <Plus className="h-3 w-3 mr-1" />
                            Else If
                        </Button>
                    )}

                    {/* Add Else button */}
                    {!hasElse && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onAddElse(conditionSteps[conditionSteps.length - 1].id)}
                            className="h-9 px-3 border-dashed text-xs"
                        >
                            <Plus className="h-3 w-3 mr-1" />
                            Else
                        </Button>
                    )}
                </div>

                {/* Active condition content */}
                {activeStep && (
                    <div className="bg-white dark:bg-zinc-800 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-700">
                        {(activeStep.conditions?.type === 'if' || activeStep.conditions?.type === 'elseif') ? (
                            <div className="space-y-3">
                                <Label className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                    {activeStep.conditions?.type === 'if' ? 'If condition' : 'Else if condition'}
                                </Label>
                                <Input
                                    type="text"
                                    value={activeStep.conditions.expression || ''}
                                    onChange={(e) => onUpdate({
                                        id: activeStep.id,
                                        conditions: { ...activeStep.conditions, expression: e.target.value }
                                    })}
                                    placeholder="e.g., user asks about pricing"
                                    className="w-full"
                                />
                            </div>
                        ) : (
                            <div className="text-sm text-zinc-600 dark:text-zinc-400 font-medium">
                                Otherwise (fallback condition)
                            </div>
                        )}

                        {/* Steps within this condition */}
                        <div className="mt-4 space-y-3">
                            {activeStep.children && activeStep.children.length > 0 ? (
                                <SortableContext items={activeStep.children.map(child => child.id)} strategy={verticalListSortingStrategy}>
                                    <div className="space-y-2">
                                        {activeStep.children.map((child, index) => (
                                            <StepCard
                                                key={child.id}
                                                step={child}
                                                stepNumber={index + 1}
                                                isNested={true}
                                                onEdit={onEdit}
                                                onUpdate={onUpdate}
                                                agentTools={agentTools}
                                                isLoadingTools={isLoadingTools}
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                            ) : (
                                <div className="text-center py-8 text-zinc-400 dark:text-zinc-500 text-sm">
                                    No steps in this condition
                                </div>
                            )}

                            {/* Add step button */}
                            <div className="flex justify-center pt-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onEdit({
                                        id: 'new',
                                        name: 'New Step',
                                        description: '',
                                        type: 'instruction',
                                        config: {},
                                        order: activeStep.children?.length || 0
                                    } as ConditionalStep)}
                                    className="border-dashed text-xs"
                                >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add step
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
} 