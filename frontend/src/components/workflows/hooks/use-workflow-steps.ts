import { useCallback, useMemo } from 'react';
import { ConditionalStep } from '@/components/agents/workflows/conditional-workflow-builder';
import { BASE_STEP_DEFINITIONS, CATEGORY_DEFINITIONS, generateAvailableStepTypes } from '../workflow-definitions';

interface StepType {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    config?: Record<string, any>;
}

interface UseWorkflowStepsProps {
    steps: ConditionalStep[];
    onStepsChange: (steps: ConditionalStep[]) => void;
    agentTools?: {
        agentpress_tools: Array<{ name: string; description: string; icon?: string; enabled: boolean }>;
        mcp_tools: Array<{ name: string; description: string; icon?: string; server?: string }>;
    };
    setIsPanelOpen: (open: boolean) => void;
    setPanelMode: (mode: 'add' | 'edit') => void;
    setSelectedStep: (step: ConditionalStep | null) => void;
    setInsertIndex: (index: number) => void;
    setSearchQuery: (query: string) => void;
}

const STEP_CATEGORIES = CATEGORY_DEFINITIONS;

const STEP_TYPES: StepType[] = BASE_STEP_DEFINITIONS.map(step => ({
    id: step.id,
    name: step.name,
    description: step.description,
    icon: step.icon.name,
    category: step.category,
    config: step.config
}));

const normalizeToolName = (toolName: string, toolType: 'agentpress' | 'mcp') => {
    if (toolType === 'agentpress') {
        const agentPressMapping: Record<string, string> = {
            'sb_shell_tool': 'Shell Tool',
            'sb_files_tool': 'Files Tool',
            'sb_browser_tool': 'Browser Tool',
            'sb_deploy_tool': 'Deploy Tool',
            'sb_expose_tool': 'Expose Tool',
            'web_search_tool': 'Web Search',
            'sb_vision_tool': 'Vision Tool',
            'data_providers_tool': 'Data Providers',
        };
        return agentPressMapping[toolName] || toolName;
    } else {
        return toolName
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }
};

export function useWorkflowSteps({
    steps,
    onStepsChange,
    agentTools,
    setIsPanelOpen,
    setPanelMode,
    setSelectedStep,
    setInsertIndex,
    setSearchQuery
}: UseWorkflowStepsProps) {
    const generateId = () => Math.random().toString(36).substr(2, 9);

    // Generate available step types including tools
    const getAvailableStepTypes = useCallback((): StepType[] => {
        return generateAvailableStepTypes(agentTools).map(step => ({
            id: step.id,
            name: step.name,
            description: step.description,
            icon: step.icon.name,
            category: step.category,
            config: step.config
        }));
    }, [agentTools]);

    const handleAddStep = useCallback((index: number) => {
        setInsertIndex(index);
        setPanelMode('add');
        setSelectedStep(null);
        setIsPanelOpen(true);
    }, [setInsertIndex, setPanelMode, setSelectedStep, setIsPanelOpen]);

    const handleEditStep = useCallback((step: ConditionalStep) => {
        setSelectedStep(step);
        setPanelMode('edit');
        setIsPanelOpen(true);
    }, [setSelectedStep, setPanelMode, setIsPanelOpen]);

    const handleCreateStep = useCallback((stepType: StepType) => {
        const newStep: ConditionalStep = {
            id: generateId(),
            name: stepType.name,
            description: stepType.description,
            type: stepType.category === 'conditions' ? 'condition' : 'instruction',
            config: stepType.config || {},
            order: 0,
            enabled: true,
            children: []
        };

        if (stepType.id === 'condition') {
            newStep.conditions = {
                type: 'if',
                expression: ''
            };
        }

        const newSteps = [...steps];
        newSteps.push(newStep);

        // Update order values
        newSteps.forEach((step, idx) => {
            step.order = idx;
        });

        onStepsChange(newSteps);
        
        // Instead of closing panel, switch to edit mode with the new step
        setSelectedStep(newStep);
        setPanelMode('edit');
        setSearchQuery('');
    }, [steps, onStepsChange, setSelectedStep, setPanelMode, setSearchQuery]);

    const handleUpdateStep = useCallback((updates: Partial<ConditionalStep>) => {
        const newSteps = steps.map(step =>
            step.id === updates.id ? { ...step, ...updates } : step
        );
        onStepsChange(newSteps);
    }, [steps, onStepsChange]);

    const handleDeleteStep = useCallback((stepId: string) => {
        const newSteps = steps.filter(step => step.id !== stepId);
        newSteps.forEach((step, idx) => {
            step.order = idx;
        });
        onStepsChange(newSteps);
        setIsPanelOpen(false);
    }, [steps, onStepsChange, setIsPanelOpen]);

    const handleAddElseIf = useCallback((afterStepId: string) => {
        const newElseIfStep: ConditionalStep = {
            id: generateId(),
            name: 'Else If Condition',
            description: 'Additional condition',
            type: 'condition',
            config: {},
            conditions: {
                type: 'elseif',
                expression: ''
            },
            order: 0,
            enabled: true,
            children: []
        };

        const afterStep = steps.find(step => step.id === afterStepId);
        if (!afterStep) return;

        const newSteps = [...steps];
        const afterIndex = newSteps.findIndex(step => step.id === afterStepId);
        newSteps.splice(afterIndex + 1, 0, newElseIfStep);

        // Update order values
        newSteps.forEach((step, idx) => {
            step.order = idx;
        });

        onStepsChange(newSteps);
    }, [steps, onStepsChange]);

    const handleAddElse = useCallback((afterStepId: string) => {
        const newElseStep: ConditionalStep = {
            id: generateId(),
            name: 'Else Condition',
            description: 'Fallback condition',
            type: 'condition',
            config: {},
            conditions: {
                type: 'else'
            },
            order: 0,
            enabled: true,
            children: []
        };

        const afterStep = steps.find(step => step.id === afterStepId);
        if (!afterStep) return;

        const newSteps = [...steps];
        const afterIndex = newSteps.findIndex(step => step.id === afterStepId);
        newSteps.splice(afterIndex + 1, 0, newElseStep);

        // Update order values
        newSteps.forEach((step, idx) => {
            step.order = idx;
        });

        onStepsChange(newSteps);
    }, [steps, onStepsChange]);

    return {
        handleAddStep,
        handleEditStep,
        handleCreateStep,
        handleUpdateStep,
        handleDeleteStep,
        handleAddElseIf,
        handleAddElse,
        getAvailableStepTypes,
        STEP_CATEGORIES
    };
} 