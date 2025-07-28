'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConditionalStep } from '@/components/agents/workflows/conditional-workflow-builder';
import { WorkflowSteps } from './steps/workflow-steps';
import { WorkflowLayout } from './workflow-layout';
import { useWorkflowSteps } from './hooks/use-workflow-steps';

interface WorkflowBuilderProps {
    steps: ConditionalStep[];
    onStepsChange: (steps: ConditionalStep[]) => void;
    agentTools?: {
        agentpress_tools: Array<{ name: string; description: string; icon?: string; enabled: boolean }>;
        mcp_tools: Array<{ name: string; description: string; icon?: string; server?: string }>;
    };
    isLoadingTools?: boolean;
    agentId?: string;
    versionData?: {
        version_id: string;
        configured_mcps: any[];
        custom_mcps: any[];
        system_prompt: string;
        agentpress_tools: any;
    };
    onToolsUpdate?: () => void;
    workflowName?: string;
    workflowDescription?: string;
    onSave?: () => void;
    isSaving?: boolean;
    onNameChange?: (name: string) => void;
    onDescriptionChange?: (description: string) => void;
}

export function WorkflowBuilder({
    steps,
    onStepsChange,
    agentTools,
    isLoadingTools,
    agentId,
    versionData,
    onToolsUpdate,
    workflowName = 'Untitled Workflow',
    workflowDescription = '',
    onSave,
    isSaving = false,
    onNameChange,
    onDescriptionChange
}: WorkflowBuilderProps) {
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [panelMode, setPanelMode] = useState<'add' | 'edit'>('add');
    const [selectedStep, setSelectedStep] = useState<ConditionalStep | null>(null);
    const [insertIndex, setInsertIndex] = useState<number>(-1);
    const [searchQuery, setSearchQuery] = useState('');

    const {
        handleAddStep,
        handleEditStep,
        handleCreateStep,
        handleUpdateStep,
        handleDeleteStep,
        handleAddElseIf,
        handleAddElse,
        getAvailableStepTypes,
        STEP_CATEGORIES
    } = useWorkflowSteps({
        steps,
        onStepsChange,
        agentTools,
        setIsPanelOpen,
        setPanelMode,
        setSelectedStep,
        setInsertIndex,
        setSearchQuery
    });

    const handleToggleSidePanel = () => {
        setIsPanelOpen(!isPanelOpen);
    };

    return (
        <WorkflowLayout
            workflowName={workflowName}
            workflowDescription={workflowDescription}
            isSidePanelOpen={isPanelOpen}
            onToggleSidePanel={handleToggleSidePanel}
            onSave={onSave || (() => { })}
            isSaving={isSaving}
            selectedStep={selectedStep}
            panelMode={panelMode}
            availableStepTypes={getAvailableStepTypes()}
            categories={STEP_CATEGORIES}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onCreateStep={handleCreateStep}
            onUpdateStep={handleUpdateStep}
            onDeleteStep={handleDeleteStep}
            isLoadingTools={isLoadingTools}
        >
            <div className="h-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="mx-auto max-w-3xl md:px-8 min-w-0 py-8">
                    {steps.length === 0 ? (
                        // Empty state
                        <div className="flex-1 min-h-[60vh] flex items-center justify-center">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center mx-auto mb-4">
                                    <Plus className="h-8 w-8 text-zinc-400" />
                                </div>
                                <h3 className="text-lg font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
                                    Start building your workflow
                                </h3>
                                <p className="text-zinc-500 dark:text-zinc-400 mb-6 max-w-md mx-auto">
                                    Add steps to create a workflow that guides your agent through tasks.
                                </p>
                                <Button onClick={() => handleAddStep(-1)}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add first step
                                </Button>
                            </div>
                        </div>
                    ) : (
                        // Steps list
                        <div className="space-y-8 min-w-0">
                            <WorkflowSteps
                                steps={steps}
                                onAddStep={handleAddStep}
                                onEditStep={handleEditStep}
                                onUpdateStep={handleUpdateStep}
                                onDeleteStep={handleDeleteStep}
                                onAddElseIf={handleAddElseIf}
                                onAddElse={handleAddElse}
                                agentTools={agentTools}
                                isLoadingTools={isLoadingTools}
                            />
                        </div>
                    )}
                </div>
            </div>
        </WorkflowLayout>
    );
} 