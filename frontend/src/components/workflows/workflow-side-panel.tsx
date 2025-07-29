'use client';

import React from 'react';
import { X, Plus, Trash2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { motion, AnimatePresence } from 'framer-motion';
import { ConditionalStep } from '@/components/agents/workflows/conditional-workflow-builder';
import { getStepIconAndColor } from './workflow-definitions';

interface StepType {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    config?: Record<string, any>;
}

interface WorkflowSidePanelProps {
    isOpen: boolean;
    onClose: () => void;
    mode: 'add' | 'edit';
    selectedStep?: ConditionalStep | null;
    availableStepTypes: StepType[];
    categories: Array<{
        id: string;
        name: string;
        description: string;
    }>;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onCreateStep: (stepType: StepType) => void;
    onUpdateStep: (updates: Partial<ConditionalStep>) => void;
    onDeleteStep: (stepId: string) => void;
    isLoadingTools?: boolean;
}

const FLOATING_LAYOUT_ID = 'workflow-panel-float';
const CONTENT_LAYOUT_ID = 'workflow-panel-content';

export function WorkflowSidePanel({
    isOpen,
    onClose,
    mode,
    selectedStep,
    availableStepTypes,
    categories,
    searchQuery,
    onSearchChange,
    onCreateStep,
    onUpdateStep,
    onDeleteStep,
    isLoadingTools = false
}: WorkflowSidePanelProps) {
    const isMobile = useIsMobile();

    const handleClose = React.useCallback(() => {
        onClose();
    }, [onClose]);

    // Filter step types based on search
    const filteredStepTypes = availableStepTypes.filter(type =>
        type.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        type.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    React.useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                handleClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, handleClose]);

    const renderAddStepContent = () => (
        <div className="p-6 space-y-6">
            {/* Search */}
            <div>
                <Input
                    placeholder="Search steps..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full"
                    autoFocus
                />
            </div>

            {/* Categories */}
            {categories.map(category => {
                const categorySteps = filteredStepTypes.filter(step => step.category === category.id);
                if (categorySteps.length === 0) return null;

                return (
                    <div key={category.id} className="space-y-3">
                        <div>
                            <h3 className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{category.name}</h3>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{category.description}</p>
                        </div>
                        <div className="space-y-2">
                            {categorySteps.map(stepType => {
                                const { icon: IconComponent, color } = getStepIconAndColor(stepType);

                                return (
                                    <button
                                        key={stepType.id}
                                        onClick={() => onCreateStep(stepType)}
                                        className="w-full p-3 text-left border border-border rounded-2xl hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`relative p-2 rounded-lg bg-gradient-to-br ${color} border`}>
                                                <IconComponent className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{stepType.name}</div>
                                                <div className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5">
                                                    {stepType.description}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {filteredStepTypes.length === 0 && (
                <div className="text-center py-8">
                    <div className="text-zinc-400 dark:text-zinc-500 mb-2">No steps found</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">Try adjusting your search</div>
                </div>
            )}
        </div>
    );

    const renderEditStepContent = () => {
        if (!selectedStep) return null;

        return (
            <div className="p-6 space-y-6">
                {/* Basic info */}
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="step-name" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Name</Label>
                        <Input
                            id="step-name"
                            value={selectedStep.name}
                            onChange={(e) => onUpdateStep({ id: selectedStep.id, name: e.target.value })}
                            placeholder="Step name"
                            className="mt-1"
                        />
                    </div>

                    <div>
                        <Label htmlFor="step-description" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Description</Label>
                        <Textarea
                            id="step-description"
                            value={selectedStep.description}
                            onChange={(e) => onUpdateStep({ id: selectedStep.id, description: e.target.value })}
                            placeholder="What should this step do?"
                            rows={3}
                            className="mt-1 resize-none"
                        />
                    </div>
                </div>

                {/* Tool configuration */}
                {selectedStep.config?.tool_name && (
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800">
                        <div className="font-medium text-sm mb-2 text-zinc-900 dark:text-zinc-100">Tool Configuration</div>
                        <div className="text-sm text-zinc-600 dark:text-zinc-400">
                            Using: <Badge variant="default" className="ml-1">{selectedStep.config.tool_name}</Badge>
                        </div>
                    </div>
                )}

                {/* Condition configuration */}
                {selectedStep.type === 'condition' && (
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="condition-expression" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Condition</Label>
                            <Input
                                id="condition-expression"
                                value={selectedStep.conditions?.expression || ''}
                                onChange={(e) => onUpdateStep({
                                    id: selectedStep.id,
                                    conditions: {
                                        ...selectedStep.conditions,
                                        type: 'if' as const,
                                        expression: e.target.value
                                    }
                                })}
                                placeholder="Enter condition logic"
                                className="mt-1"
                            />
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => onDeleteStep(selectedStep.id)}
                        className="w-full"
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Step
                    </Button>
                </div>
            </div>
        );
    };

    const renderContent = () => (
        <div className="flex flex-col h-full">
            <motion.div
                layoutId={CONTENT_LAYOUT_ID}
                className="p-3 border-b border-zinc-200 dark:border-zinc-800"
            >
                <div className="flex items-center justify-between">
                    <motion.div layoutId="workflow-header" className="ml-2 flex items-center gap-2">
                        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
                            {mode === 'add' ? 'Add Step' : 'Configure Step'}
                        </h2>
                    </motion.div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleClose}
                        className="h-8 w-8"
                        title="Close panel"
                    >
                        <Minimize2 className="h-4 w-4" />
                    </Button>
                </div>
            </motion.div>

            <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                    {mode === 'add' ? renderAddStepContent() : renderEditStepContent()}
                </ScrollArea>
            </div>
        </div>
    );

    if (!isOpen) return null;

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key="workflow-sidepanel"
                layoutId={FLOATING_LAYOUT_ID}
                initial={{ opacity: 0, x: 100 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 100 }}
                transition={{
                    opacity: { duration: 0.15 },
                    x: { type: "spring", stiffness: 400, damping: 35 },
                    layout: {
                        type: "spring",
                        stiffness: 400,
                        damping: 35
                    }
                }}
                className={cn(
                    'fixed top-2 right-2 bottom-4 border border-zinc-200 dark:border-zinc-800 rounded-3xl flex flex-col z-30 bg-card',
                    isMobile
                        ? 'left-2'
                        : 'w-[40vw] sm:w-[450px] md:w-[500px] lg:w-[550px] xl:w-[645px]',
                )}
                style={{
                    overflow: 'hidden',
                }}
            >
                {renderContent()}
            </motion.div>
        </AnimatePresence>
    );
} 