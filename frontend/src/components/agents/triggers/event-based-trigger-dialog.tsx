"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, ArrowLeft, Info, Zap, ChevronRight } from 'lucide-react';
import { useComposioAppsWithTriggers, useComposioAppTriggers, useCreateComposioEventTrigger, ComposioTriggerType } from '@/hooks/react-query/composio/use-composio-triggers';
import { useComposioProfiles } from '@/hooks/react-query/composio/use-composio-profiles';
import { useComposioToolkitDetails } from '@/hooks/react-query/composio/use-composio';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAgentWorkflows } from '@/hooks/react-query/agents/use-agent-workflows';

interface EventBasedTriggerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    agentId: string;
}

type JSONSchema = {
    title?: string;
    type?: string;
    properties?: Record<string, any>;
    required?: string[];
};

const AppCardSkeleton = () => (
    <div className="border border-border/50 rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-3">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <div className="flex-1">
                <Skeleton className="w-3/4 h-4 mb-2" />
                <Skeleton className="w-full h-3" />
            </div>
        </div>
        <div className="flex justify-between items-center">
            <Skeleton className="w-24 h-6" />
            <Skeleton className="w-20 h-8" />
        </div>
    </div>
);

const TriggerCardSkeleton = () => (
    <div className="border border-border/50 rounded-2xl p-4">
        <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
                <Skeleton className="w-3/4 h-4 mb-2" />
                <Skeleton className="w-full h-3" />
            </div>
            <Skeleton className="w-16 h-5" />
        </div>
        <Skeleton className="w-20 h-5" />
    </div>
);

const DynamicConfigForm: React.FC<{
    schema?: JSONSchema;
    value: Record<string, any>;
    onChange: (v: Record<string, any>) => void;
}> = ({ schema, value, onChange }) => {
    if (!schema || !schema.properties || Object.keys(schema.properties).length === 0) {
        return (
            <div className="text-center py-6 text-muted-foreground">
                <div className="w-10 h-10 rounded-2xl bg-green-50 dark:bg-green-950/50 flex items-center justify-center mb-3 mx-auto border border-green-200 dark:border-green-800">
                    <Info className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-sm font-medium text-foreground">Ready to go!</p>
                <p className="text-xs">This trigger doesn't require any configuration</p>
            </div>
        );
    }

    const properties = schema.properties || {};
    const required = new Set(schema.required || []);

    return (
        <div className="space-y-4">
            {Object.entries(properties).map(([key, prop]: [string, any]) => {
                const label = prop.title || key;
                const type = prop.type || 'string';
                const isRequired = required.has(key);
                const examples: any[] = Array.isArray(prop.examples) ? prop.examples : [];
                const description: string = prop.description || '';
                const current = value[key] ?? prop.default ?? (type === 'number' || type === 'integer' ? '' : '');
                const handle = (val: any) => onChange({ ...value, [key]: val });

                return (
                    <div className="space-y-2" key={key}>
                        <Label className="text-sm font-medium">
                            {label} {isRequired && <span className="text-destructive">*</span>}
                        </Label>
                        {type === 'number' || type === 'integer' ? (
                            <Input
                                value={current}
                                inputMode="numeric"
                                onChange={(e) => handle(e.target.value === '' ? '' : Number(e.target.value))}
                                placeholder={examples[0] ?? ''}
                            />
                        ) : type === 'array' ? (
                            <Input
                                value={Array.isArray(current) ? current.join(',') : current}
                                onChange={(e) => handle(e.target.value.split(',').map((x) => x.trim()).filter(Boolean))}
                                placeholder={examples[0] ?? 'comma,separated,values'}
                            />
                        ) : type === 'boolean' ? (
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    checked={Boolean(current)}
                                    onChange={(e) => handle(e.target.checked)}
                                    className="rounded border-gray-300"
                                />
                                <span className="text-sm">{description || label}</span>
                            </div>
                        ) : (
                            <Input value={current} onChange={(e) => handle(e.target.value)} placeholder={examples[0] ?? ''} />
                        )}
                        {description && type !== 'boolean' && <p className="text-xs text-muted-foreground">{description}</p>}
                    </div>
                );
            })}
        </div>
    );
};

export const EventBasedTriggerDialog: React.FC<EventBasedTriggerDialogProps> = ({ open, onOpenChange, agentId }) => {
    const [step, setStep] = useState<'apps' | 'triggers' | 'config'>('apps');
    const [search, setSearch] = useState('');
    const [selectedApp, setSelectedApp] = useState<{ slug: string; name: string; logo?: string } | null>(null);
    const [selectedTrigger, setSelectedTrigger] = useState<ComposioTriggerType | null>(null);
    const [config, setConfig] = useState<Record<string, any>>({});
    const [name, setName] = useState('');
    const [prompt, setPrompt] = useState('');
    const [profileId, setProfileId] = useState('');
    const [executionType, setExecutionType] = useState<'agent' | 'workflow'>('agent');
    const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
    const [workflowInput, setWorkflowInput] = useState<Record<string, any>>({});

    const { data: appsData, isLoading: loadingApps } = useComposioAppsWithTriggers();
    const { data: triggersData, isLoading: loadingTriggers } = useComposioAppTriggers(selectedApp?.slug, !!selectedApp);
    const { data: profiles, isLoading: loadingProfiles } = useComposioProfiles(selectedApp?.slug ? { toolkit_slug: selectedApp.slug } : undefined);
    const { data: toolkitDetails } = useComposioToolkitDetails(selectedApp?.slug || '', { enabled: !!selectedApp });
    const { data: workflows = [], isLoading: isLoadingWorkflows } = useAgentWorkflows(agentId);

    const apps = useMemo(() => (appsData?.items || []).filter((a) => a.name.toLowerCase().includes(search.toLowerCase()) || a.slug.toLowerCase().includes(search.toLowerCase())), [appsData, search]);

    const createTrigger = useCreateComposioEventTrigger();

    useEffect(() => {
        if (!open) {
            setStep('apps');
            setSelectedApp(null);
            setSelectedTrigger(null);
            setConfig({});
            setName('');
            setPrompt('');
            setProfileId('');
            setExecutionType('agent');
            setSelectedWorkflowId('');
            setWorkflowInput({});
        }
    }, [open]);

    useEffect(() => {
        if (selectedTrigger) {
            setName(`${selectedApp?.name || selectedTrigger.toolkit.name} → Agent`);
        }
    }, [selectedTrigger, selectedApp]);

    // Reset selected profile when switching apps to avoid stale profileId from a different app
    useEffect(() => {
        setProfileId('');
    }, [selectedApp?.slug]);

    useEffect(() => {
        if (profiles && profiles.length > 0 && !profileId) {
            const connectedProfiles = profiles.filter(p => p.is_connected);
            if (connectedProfiles.length > 0) {
                // Auto-select the first connected profile
                setProfileId(connectedProfiles[0].profile_id);
            }
        }
    }, [profiles, profileId]);

    const selectedWorkflow = useMemo(() => {
        return (workflows || []).find((w: any) => w.id === selectedWorkflowId);
    }, [workflows, selectedWorkflowId]);

    const { variableSpecs, templateText } = useMemo(() => {
        if (!selectedWorkflow) return { variableSpecs: [] as any[], templateText: '' };
        const stepsAny = ((selectedWorkflow as any)?.steps as any[]) || [];
        const start = stepsAny.find((s: any) => s?.name === 'Start' && s?.description === 'Click to add steps or use the Add Node button');
        const child = start?.children?.[0] ?? stepsAny[0];
        const vars = (child?.config?.playbook?.variables as any[]) || [];
        const tpl = (child?.config?.playbook?.template as string) || '';
        return { variableSpecs: vars, templateText: tpl };
    }, [selectedWorkflow]);

    useEffect(() => {
        if (!selectedWorkflow || executionType !== 'workflow') return;
        if (!variableSpecs || variableSpecs.length === 0) return;
        const defaults: Record<string, any> = {};
        for (const v of variableSpecs) {
            if (v.default !== undefined && (workflowInput?.[v.key] === undefined)) {
                defaults[v.key] = v.default;
            }
        }
        if (Object.keys(defaults).length > 0) {
            setWorkflowInput(prev => ({ ...prev, ...defaults }));
        }
    }, [selectedWorkflow?.id, executionType]);

    const handleCreate = async () => {
        if (!agentId || !profileId || !selectedTrigger) return;
        try {
            const selectedProfile = profiles?.find(p => p.profile_id === profileId);
            const base: any = {
                agent_id: agentId,
                profile_id: profileId,
                slug: selectedTrigger.slug,
                trigger_config: config,
                name: name || `${selectedTrigger.toolkit.name} → ${executionType === 'agent' ? 'Agent' : 'Workflow'}`,
                connected_account_id: selectedProfile?.connected_account_id,
                toolkit_slug: selectedApp?.slug,
            };
            const payload = executionType === 'agent'
                ? { ...base, route: 'agent' as const, agent_prompt: (prompt || 'Read this') }
                : { ...base, route: 'workflow' as const, workflow_id: selectedWorkflowId, workflow_input: workflowInput };
            await createTrigger.mutateAsync(payload);
            toast.success('Event trigger created');
            onOpenChange(false);
        } catch (e: any) {
            toast.error(e?.message || 'Failed to create trigger');
        }
    };

    const getStepTitle = () => {
        switch (step) {
            case 'apps': return 'Select App';
            case 'triggers': return `${selectedApp?.name} Triggers`;
            case 'config': return `Configure ${selectedTrigger?.name}`;
            default: return 'Event-based Trigger';
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl h-[90vh] p-0" style={{ overflow: 'hidden' }}>
                <div className="h-full grid grid-rows-[1fr_auto]">
                    <DialogHeader className="h-fit border-b p-6">
                        <div className="flex items-center gap-3">
                            {step !== 'apps' && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        if (step === 'triggers') {
                                            setStep('apps');
                                            setSelectedApp(null);
                                        } else if (step === 'config') {
                                            setStep('triggers');
                                            setSelectedTrigger(null);
                                            setConfig({});
                                        }
                                    }}
                                    className="p-2"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                            )}
                            <Zap className="h-5 w-5" />
                            <DialogTitle className="text-xl">{getStepTitle()}</DialogTitle>
                        </div>
                    </DialogHeader>

                    <div className="flex-1" style={{ height: 'calc(90vh - 88px)', overflow: 'hidden' }}>
                        <div className="h-full flex flex-col">
                            {step === 'apps' && (
                                <div className="flex-1 flex flex-col">
                                    <div className="flex-shrink-0 p-6 border-b">
                                        <div className="flex items-start justify-between mb-4">
                                            <div>
                                                <h2 className="text-lg font-medium mb-1">Connect an App</h2>
                                                <p className="text-sm text-muted-foreground">Choose an app to create event-based triggers from</p>
                                            </div>
                                        </div>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Search apps..."
                                                value={search}
                                                onChange={(e) => setSearch(e.target.value)}
                                                className="pl-10"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex-1" style={{ overflow: 'auto', maxHeight: 'calc(90vh - 200px)' }}>
                                        <div className="p-6 pb-12">
                                            {loadingApps ? (
                                                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                                    {Array.from({ length: 8 }).map((_, i) => (
                                                        <AppCardSkeleton key={i} />
                                                    ))}
                                                </div>
                                            ) : apps.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                                    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                                                        <Search className="h-8 w-8 text-muted-foreground" />
                                                    </div>
                                                    <h3 className="text-lg font-medium mb-2">No apps found</h3>
                                                    <p className="text-muted-foreground">
                                                        {search ? `No apps match "${search}"` : 'No apps with triggers available'}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                                    {apps.map((app) => (
                                                        <div
                                                            key={app.slug}
                                                            onClick={() => {
                                                                setSelectedApp(app);
                                                                setStep('triggers');
                                                            }}
                                                            className={cn(
                                                                "group border bg-card rounded-2xl p-4 transition-all duration-200 hover:bg-muted cursor-pointer"
                                                            )}
                                                        >
                                                            <div className="flex items-start gap-3 mb-3">
                                                                {app.logo ? (
                                                                    <img
                                                                        src={app.logo}
                                                                        alt={app.name}
                                                                        className="w-10 h-10 rounded-lg object-cover p-2 bg-muted rounded-xl border"
                                                                    />
                                                                ) : (
                                                                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                                                        <span className="text-primary text-sm font-medium">{app.name.charAt(0)}</span>
                                                                    </div>
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <h3 className="font-medium text-sm leading-tight truncate mb-1">{app.name}</h3>
                                                                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                                                        {`Create event triggers from your ${app.name} account.`}
                                                                    </p>
                                                                </div>
                                                                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {step === 'triggers' && selectedApp && (
                                <div className="flex-1 flex flex-col">
                                    <div className="flex-shrink-0 p-6 border-b">
                                        <div className="flex items-center gap-3 mb-4">
                                            {selectedApp.logo && (
                                                <img src={selectedApp.logo} alt={selectedApp.name} className="h-8 w-8 rounded-lg" />
                                            )}
                                            <div>
                                                <h2 className="text-lg font-medium">{selectedApp.name} Triggers</h2>
                                                <p className="text-sm text-muted-foreground">Choose a trigger event to monitor</p>
                                            </div>
                                            <Badge variant="default" className="ml-auto">{toolkitDetails?.toolkit.auth_schemes?.[0] || 'OAuth'}</Badge>
                                        </div>
                                    </div>

                                    <div className="flex-1" style={{ overflow: 'auto', maxHeight: 'calc(90vh - 200px)' }}>
                                        <div className="p-6 pb-12">
                                            {loadingTriggers ? (
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {Array.from({ length: 6 }).map((_, i) => (
                                                        <TriggerCardSkeleton key={i} />
                                                    ))}
                                                </div>
                                            ) : (triggersData?.items || []).length === 0 ? (
                                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                                    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                                                        <Zap className="h-8 w-8 text-muted-foreground" />
                                                    </div>
                                                    <h3 className="text-lg font-medium mb-2">No triggers available</h3>
                                                    <p className="text-muted-foreground">
                                                        This app doesn't have any available triggers yet.
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {(triggersData?.items || []).map((trigger) => (
                                                        <div
                                                            key={trigger.slug}
                                                            onClick={() => {
                                                                setSelectedTrigger(trigger);
                                                                setConfig({});
                                                                setStep('config');
                                                            }}
                                                            className="group border bg-card rounded-2xl p-4 transition-all duration-200 hover:bg-muted cursor-pointer"
                                                        >
                                                            <div className="flex items-start justify-between mb-3">
                                                                <div className="flex-1 min-w-0">
                                                                    <h3 className="font-medium text-sm leading-tight mb-2">{trigger.name}</h3>
                                                                    {trigger.description && (
                                                                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-2">
                                                                            {trigger.description}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <Badge variant="default" className="text-xs capitalize ml-2">{trigger.type}</Badge>
                                                            </div>
                                                            <Badge variant="outline" className="text-xs">{trigger.slug}</Badge>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {step === 'config' && selectedTrigger && (
                                <div className="flex-1 grid grid-rows-[1fr_auto]" style={{ maxHeight: 'calc(90vh - 88px)' }}>
                                    <div className="overflow-auto">
                                        <div className="p-6 pb-4">
                                            <div className="max-w-3xl mx-auto space-y-8">
                                                {selectedTrigger.instructions && (
                                                    <div className="text-sm text-muted-foreground flex items-start gap-3 p-4 rounded-2xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50">
                                                        <Info className="h-4 w-4 mt-0.5 text-blue-500 flex-shrink-0" />
                                                        <span dangerouslySetInnerHTML={{ __html: selectedTrigger.instructions.replace(/\n/g, '<br/>') }} />
                                                    </div>
                                                )}

                                                {(!loadingProfiles && (profiles || []).filter(p => p.is_connected).length === 0) ? (
                                                    <div className="text-center py-12">
                                                        <div className="w-16 h-16 rounded-2xl bg-yellow-50 dark:bg-yellow-950/50 flex items-center justify-center mb-4 mx-auto border border-yellow-200 dark:border-yellow-800">
                                                            <Info className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
                                                        </div>
                                                        <h3 className="text-lg font-medium mb-2">No Connected Profile</h3>
                                                        <p className="text-muted-foreground mb-4">
                                                            You need to connect {selectedApp?.name} first before creating triggers.
                                                        </p>
                                                        <Button variant="outline" onClick={() => setStep('apps')}>
                                                            Back to Apps
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-6">
                                                        <div className="border rounded-2xl p-6 space-y-6">
                                                            <div>
                                                                <h3 className="text-lg font-medium mb-1">{selectedTrigger.name}</h3>
                                                                <p className="text-sm text-muted-foreground">Configure how this trigger works</p>
                                                            </div>

                                                            <DynamicConfigForm schema={selectedTrigger.config as any} value={config} onChange={setConfig} />
                                                        </div>

                                                        <div className="border rounded-2xl p-6 space-y-6">
                                                            <div>
                                                                <h3 className="text-lg font-medium mb-1">Execution Configuration</h3>
                                                                <p className="text-sm text-muted-foreground">Choose how to handle this event.</p>
                                                            </div>

                                                            <div className="space-y-4">
                                                                <div className="space-y-2">
                                                                    <Label className="text-sm font-medium">Trigger Name</Label>
                                                                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Gmail → Agent" />
                                                                </div>

                                                                <div>
                                                                    <Label className="text-sm font-medium mb-3 block">Execution Type</Label>
                                                                    <RadioGroup value={executionType} onValueChange={(v) => setExecutionType(v as 'agent' | 'workflow')}>
                                                                        <div className="flex items-center space-x-2">
                                                                            <RadioGroupItem value="agent" id="exec-agent" />
                                                                            <Label htmlFor="exec-agent">Execute Agent</Label>
                                                                        </div>
                                                                        <div className="flex items-center space-x-2">
                                                                            <RadioGroupItem value="workflow" id="exec-workflow" />
                                                                            <Label htmlFor="exec-workflow">Execute Workflow</Label>
                                                                        </div>
                                                                    </RadioGroup>
                                                                </div>

                                                                {executionType === 'agent' ? (
                                                                    <div className="space-y-2">
                                                                        <Label className="text-sm font-medium">Agent Prompt</Label>
                                                                        <Textarea
                                                                            rows={4}
                                                                            value={prompt}
                                                                            onChange={(e) => setPrompt(e.target.value)}
                                                                            placeholder="Read this"
                                                                        />
                                                                        <p className="text-xs text-muted-foreground">Use <code className="text-xs text-muted-foreground">payload</code> to include the trigger data</p>
                                                                    </div>
                                                                ) : (
                                                                    <div className="space-y-4">
                                                                        <div className="space-y-2">
                                                                            <Label className="text-sm font-medium">Workflow</Label>
                                                                            <Select value={selectedWorkflowId} onValueChange={(v) => { setSelectedWorkflowId(v); setWorkflowInput({}); }}>
                                                                                <SelectTrigger className="max-w-[28rem]">
                                                                                    <SelectValue placeholder={isLoadingWorkflows ? 'Loading workflows...' : 'Select a workflow'} />
                                                                                </SelectTrigger>
                                                                                <SelectContent className="max-w-[28rem]">
                                                                                    {isLoadingWorkflows ? (
                                                                                        <SelectItem value="__loading__" disabled>Loading workflows...</SelectItem>
                                                                                    ) : (workflows || []).length === 0 ? (
                                                                                        <SelectItem value="__no_workflows__" disabled>No workflows available</SelectItem>
                                                                                    ) : (
                                                                                        (workflows as any[]).filter(w => w.status === 'active').map((w: any) => (
                                                                                            <SelectItem key={w.id} value={w.id}>
                                                                                                <span className="block truncate max-w-[26rem]">{w.name}</span>
                                                                                            </SelectItem>
                                                                                        ))
                                                                                    )}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>

                                                                        {templateText ? (
                                                                            <div className="rounded-xl border p-3 bg-muted/30 max-h-[160px] overflow-y-auto">
                                                                                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{templateText}</p>
                                                                            </div>
                                                                        ) : null}

                                                                        {selectedWorkflowId && variableSpecs && (variableSpecs as any[]).length > 0 ? (
                                                                            <div className="space-y-3">
                                                                                {(variableSpecs as any[]).map((v: any) => (
                                                                                    <div key={v.key} className="space-y-1">
                                                                                        <Label htmlFor={`v-${v.key}`}>{v.label || v.key}</Label>
                                                                                        <Input
                                                                                            id={`v-${v.key}`}
                                                                                            type={v.type === 'number' ? 'number' : 'text'}
                                                                                            value={(workflowInput?.[v.key] ?? '') as any}
                                                                                            onChange={(e) => setWorkflowInput(prev => ({ ...prev, [v.key]: v.type === 'number' ? Number(e.target.value) : e.target.value }))}
                                                                                            placeholder={v.helperText || ''}
                                                                                        />
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        ) : (
                                                                            selectedWorkflowId ? (
                                                                                <div>
                                                                                    <Label className="text-sm font-medium">Instructions</Label>
                                                                                    <Textarea
                                                                                        rows={4}
                                                                                        value={(workflowInput?.prompt as string) || ''}
                                                                                        onChange={(e) => setWorkflowInput(prev => ({ ...prev, prompt: e.target.value }))}
                                                                                        placeholder="Write what you want the workflow to do..."
                                                                                    />
                                                                                </div>
                                                                            ) : null
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sticky Footer */}
                                    {(!loadingProfiles && (profiles || []).filter(p => p.is_connected).length > 0) && (
                                        <div className="border-t bg-background/95 backdrop-blur-sm py-3 px-4">
                                            <div className="max-w-3xl mx-auto flex justify-end">
                                                <Button
                                                    onClick={handleCreate}
                                                    disabled={createTrigger.isPending || !name.trim() || !profileId || (executionType === 'agent' ? !prompt.trim() : !selectedWorkflowId)}
                                                    className="px-4"
                                                    size="sm"
                                                >
                                                    {createTrigger.isPending ? (
                                                        <>
                                                            <Loader2 className="h-3 w-3 animate-spin mr-2" />
                                                            Creating...
                                                        </>
                                                    ) : (
                                                        'Create Trigger'
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};