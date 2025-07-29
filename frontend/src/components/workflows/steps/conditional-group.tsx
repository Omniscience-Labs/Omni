'use client';

import React, { useState } from 'react';
import { Plus, AlertTriangle, GripVertical, Settings } from 'lucide-react';
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
    onUpdateStep: (updates: Partial<ConditionalStep>) => void;
    onAddElse: (afterStepId: string) => void;
    onAddElseIf: (afterStepId: string) => void;
    onRemove: (stepId: string) => void;
    onEdit: (step: ConditionalStep) => void;
    onAddStep: (index: number, parentStepId?: string) => void;
    agentTools?: any;
    isLoadingTools?: boolean;
}

const MAX_ELSE_IF_CONDITIONS = 5; // Limit the number of else-if conditions

export function ConditionalGroup({
    conditionSteps,
    groupKey,
    onUpdateStep,
    onAddElse,
    onAddElseIf,
    onRemove,
    onEdit,
    onAddStep,
    agentTools,
    isLoadingTools
}: ConditionalGroupProps) {
    const [activeConditionTab, setActiveConditionTab] = useState<string>(conditionSteps[0]?.id || '');

    // Ensure we always have an "else" step at the end
    const hasElse = conditionSteps.some(step => step.conditions?.type === 'else');
    const elseIfCount = conditionSteps.filter(step => step.conditions?.type === 'elseif').length;
    const canAddElseIf = !hasElse && elseIfCount < MAX_ELSE_IF_CONDITIONS;

    // Create a virtual else step if none exists to show the tab
    const displaySteps = React.useMemo(() => {
        if (!hasElse) {
            const virtualElse: ConditionalStep = {
                id: 'virtual-else',
                name: 'Else',
                description: '',
                type: 'condition',
                config: {},
                conditions: { type: 'else' },
                children: [],
                order: conditionSteps.length
            };
            return [...conditionSteps, virtualElse];
        }
        return conditionSteps;
    }, [conditionSteps, hasElse]);

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

    // Ensure we have a valid active tab when steps change
    React.useEffect(() => {
        if (!displaySteps.find(s => s.id === activeConditionTab)) {
            setActiveConditionTab(displaySteps[0]?.id || '');
        }
    }, [displaySteps, activeConditionTab]);

    const activeStep = displaySteps.find(s => s.id === activeConditionTab) || displaySteps[0];

    // Handle clicking add step button
    const handleAddStepClick = React.useCallback(() => {
        if (activeStep?.id === 'virtual-else') {
            // If clicking on virtual else, create a real else step first
            onAddElse(conditionSteps[conditionSteps.length - 1].id);
        } else {
            // Call onAddStep with index and parent step ID
            onAddStep(-1, activeStep?.id);
        }
    }, [activeStep, onAddElse, conditionSteps, onAddStep]);

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

                {/* Gear icon for editing - appears on hover */}
                <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(activeStep)}
                        className="h-8 w-8 p-0"
                    >
                        <Settings className="h-4 w-4" />
                    </Button>
                </div>

                {/* Condition Tabs */}
                <div className="flex items-center gap-2 flex-wrap pl-5 pr-12">
                    {displaySteps.map((step, index) => {
                        const letter = getConditionLetter(index);
                        const isActive = step.id === activeConditionTab;
                        const conditionType = step.conditions?.type === 'if' ? 'If' :
                            step.conditions?.type === 'elseif' ? 'Else If' :
                                step.conditions?.type === 'else' ? 'Else' : 'If';

                        return (
                            <Button
                                key={step.id}
                                onClick={() => setActiveConditionTab(step.id)}
                                className={cn(
                                    "h-9 px-3 border border-dashed text-xs",
                                    isActive
                                        ? "bg-blue-500 hover:bg-blue-600 "
                                        : "bg-white dark:bg-zinc-800 border-dashed border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                )}
                            >

                                <span className="font-mono text-xs font-bold">{letter}</span>
                                <span>•</span>
                                <span>{conditionType}</span>
                                {step.hasIssues && (
                                    <AlertTriangle className="h-3 w-3 text-red-500" />
                                )}
                            </Button>
                        );
                    })}

                    {/* Plus button to add Else If - always show next to Else if we can add more */}
                    {canAddElseIf && (
                        <Button
                            onClick={() => onAddElseIf(conditionSteps[conditionSteps.length - 1].id)}
                            className="h-6 w-6 p-0 border border-dashed rounded-md border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                        >
                            <Plus className="h-3 w-3 text-zinc-600 dark:text-zinc-400" />
                        </Button>
                    )}
                </div>

                {/* Active condition content */}
                {activeStep && (
                    <div className="bg-white dark:bg-zinc-800 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-700">
                        {/* Steps within this condition */}
                        <div className="space-y-3">
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
                                                onUpdateStep={onUpdateStep}
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

                            {/* Add step button - triggers special edit mode for adding child steps */}
                            <div className="flex justify-center pt-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleAddStepClick}
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