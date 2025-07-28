'use client';

import React from 'react';
import { GripVertical, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConditionalStep } from '@/components/agents/workflows/conditional-workflow-builder';
import { cn } from '@/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getStepIconAndColor } from '../workflow-definitions';

interface StepCardProps {
    step: ConditionalStep;
    stepNumber: number;
    isNested?: boolean;
    onEdit: (step: ConditionalStep) => void;
    onUpdate: (updates: Partial<ConditionalStep>) => void;
    agentTools?: any;
    isLoadingTools?: boolean;
}

export function StepCard({
    step,
    stepNumber,
    isNested = false,
    onEdit,
    onUpdate,
    agentTools,
    isLoadingTools
}: StepCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: step?.id || 'unknown' });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const getStepIcon = (step: ConditionalStep) => {
        const stepType = {
            category: step.config?.tool_type === 'agentpress' || step.config?.tool_type === 'mcp' ? 'tools' :
                step.type === 'condition' ? 'conditions' : 'actions',
            config: step.config,
            icon: step.type === 'condition' ? 'Settings' : 'FileText'
        };

        const { icon: IconComponent, color } = getStepIconAndColor(stepType);
        return (
            <div className={`relative p-2 rounded-lg bg-gradient-to-br ${color} border`}>
                <IconComponent className="w-5 h-5" />
            </div>
        );
    };

    if (!step) return null;

    return (
        <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-50")}>
            <div className="bg-card border rounded-2xl hover:shadow-sm transition-all group">
                <div className="flex items-center gap-3 p-4">
                    {/* Drag handle */}
                    <div
                        {...attributes}
                        {...listeners}
                        className="cursor-grab active:cursor-grabbing"
                    >
                        <GripVertical className="h-4 w-4 text-zinc-400" />
                    </div>

                    {/* Step icon */}
                    <div className="shrink-0">
                        {getStepIcon(step)}
                    </div>

                    {/* Step content */}
                    <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate text-zinc-900 dark:text-zinc-100">
                            {step.name}
                        </div>
                        {step.description && (
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                                {step.description}
                            </div>
                        )}
                        {step.config?.tool_name && (
                            <Badge variant="secondary" className="mt-1 text-xs">
                                {step.config.tool_name}
                            </Badge>
                        )}
                    </div>

                    {/* Actions */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(step)}
                        className="h-8 w-8 p-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <Settings className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
} 