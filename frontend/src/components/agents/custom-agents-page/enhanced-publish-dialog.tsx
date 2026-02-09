'use client';

import React, { useState } from 'react';
import { Globe, Loader2, Info, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { UsageExampleMessage } from '@/hooks/secure-mcp/use-secure-mcp';
import { cn } from '@/lib/utils';

// Define the sharing preferences structure based on our backend
interface SharingPreferences {
    include_system_prompt: boolean;
    include_model_settings: boolean;
    include_default_tools: boolean;
    include_integrations: boolean;
    include_triggers: boolean;
    include_playbooks: boolean;
}

interface PublishDialogData {
    templateId: string; // Note: In MyAgentsTab this maps to agent.agent_id
    templateName: string;
}

interface EnhancedPublishDialogProps {
    publishDialog: PublishDialogData | null;
    templatesActioningId: string | null;
    onClose: () => void;
    onPublish: (preferences: SharingPreferences, usageExamples: UsageExampleMessage[]) => void;
}

export const EnhancedPublishDialog = ({
    publishDialog,
    templatesActioningId,
    onClose,
    onPublish
}: EnhancedPublishDialogProps) => {
    const [preferences, setPreferences] = useState<SharingPreferences>({
        include_system_prompt: true,
        include_model_settings: true,
        include_default_tools: true,
        include_integrations: true,
        include_triggers: true,
        include_playbooks: false, // Default to false as playbooks might be complex/private
    });

    // We're keeping usage examples simple for now, defaulting to empty or we could add UI for it later
    // The user only showed the preferences UI, so we focus on that.
    const [examples, setExamples] = useState<UsageExampleMessage[]>([]);

    const handleToggle = (key: keyof SharingPreferences) => {
        setPreferences(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const handleSelectAll = () => {
        const allSelected = Object.values(preferences).every(Boolean);
        const newValue = !allSelected;
        setPreferences({
            include_system_prompt: newValue,
            include_model_settings: newValue,
            include_default_tools: newValue,
            include_integrations: newValue,
            include_triggers: newValue,
            include_playbooks: newValue,
        });
    };

    const handlePublish = () => {
        onPublish(preferences, examples);
    };

    const PreferenceItem = ({
        id,
        label,
        description,
        icon: Icon
    }: {
        id: keyof SharingPreferences,
        label: string,
        description: string,
        icon: any
    }) => (
        <div
            className={cn(
                "flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50",
                preferences[id] ? "border-primary/50 bg-primary/5" : "border-border"
            )}
            onClick={() => handleToggle(id)}
        >
            <Checkbox
                id={id}
                checked={preferences[id]}
                onCheckedChange={() => handleToggle(id)}
                className="mt-1"
            />
            <div className="flex-1 space-y-1">
                <label
                    htmlFor={id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {label}
                </label>
                <p className="text-xs text-muted-foreground">
                    {description}
                </p>
            </div>
        </div>
    );

    return (
        <Dialog open={!!publishDialog} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Publish Template to Marketplace</DialogTitle>
                    <DialogDescription>
                        Configure sharing preferences for "{publishDialog?.templateName}"
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">Include Components</h4>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto p-0 text-xs text-primary hover:bg-transparent"
                            onClick={handleSelectAll}
                        >
                            Select All
                        </Button>
                    </div>

                    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                        <PreferenceItem
                            id="include_system_prompt"
                            label="System Prompt"
                            description="Agent behavior, goals, and personality"
                            icon={Info}
                        />

                        <PreferenceItem
                            id="include_model_settings"
                            label="Model Settings"
                            description="Default AI model and configuration"
                            icon={Globe} // Using Globe as placeholder for Model icon
                        />

                        <PreferenceItem
                            id="include_default_tools"
                            label="Default Tools"
                            description="Built-in AgentPress tools and capabilities"
                            icon={Check} // Placeholder
                        />

                        <PreferenceItem
                            id="include_integrations"
                            label="Integrations"
                            description="External services and MCP connections"
                            icon={Check} // Placeholder
                        />

                        <PreferenceItem
                            id="include_triggers"
                            label="Triggers"
                            description="Event-based automation rules"
                            icon={Check} // Placeholder
                        />

                        <PreferenceItem
                            id="include_playbooks"
                            label="Playbooks"
                            description="Variable-driven execution templates"
                            icon={Check} // Placeholder
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={!!templatesActioningId}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handlePublish}
                        disabled={!!templatesActioningId}
                    >
                        {templatesActioningId ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Publishing...
                            </>
                        ) : (
                            <>
                                <Globe className="h-4 w-4 mr-2" />
                                Publish to Marketplace
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
