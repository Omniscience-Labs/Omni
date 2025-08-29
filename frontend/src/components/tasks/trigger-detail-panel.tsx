"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Clock,
  X,
  Trash2,
  Power,
  PowerOff,
  ExternalLink,
  Loader2,
  Repeat,
  Zap,
  Edit2,
  Activity,
  Sparkles,
  Mail,
  MessageSquare,
  Calendar as CalendarIcon,
  FileText,
  Users,
  Globe,
  Info
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { TriggerWithAgent } from '@/hooks/react-query/triggers/use-all-triggers';
import { useDeleteTrigger, useToggleTrigger, useUpdateTrigger } from '@/hooks/react-query/triggers';
import { TriggerConfigDialog } from '@/components/agents/triggers/trigger-config-dialog';
import { useAgentWorkflows } from '@/hooks/react-query/agents/use-agent-workflows';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AgentIconAvatar } from '@/components/agents/config/agent-icon-avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TriggerDetailPanelProps {
  trigger: TriggerWithAgent;
  onClose: () => void;
}

const CRON_PRESETS = [
  { label: 'Every 15 minutes', value: '*/15 * * * *', emoji: '⚡' },
  { label: 'Every 30 minutes', value: '*/30 * * * *', emoji: '⏱️' },
  { label: 'Every hour', value: '0 * * * *', emoji: '🕐' },
  { label: 'Daily at 9 AM', value: '0 9 * * *', emoji: '☀️' },
  { label: 'Daily at midnight', value: '0 0 * * *', emoji: '🌙' },
  { label: 'Weekdays at 9 AM', value: '0 9 * * 1-5', emoji: '💼' },
  { label: 'Weekly on Monday', value: '0 9 * * 1', emoji: '📅' },
  { label: 'Monthly on 1st', value: '0 9 1 * *', emoji: '📆' },
];

const formatCronExpression = (cron?: string) => {
  if (!cron) return 'Not configured';
  
  const preset = CRON_PRESETS.find(p => p.value === cron);
  if (preset) return preset.label;
  
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;
  
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  
  if (minute === '0' && hour === String(hour) && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Daily at ${hour}:${minute.padStart(2, '0')}`;
  }
  
  return cron;
};

const getTriggerIcon = (triggerType: string) => {
  switch (triggerType.toLowerCase()) {
    case 'schedule':
    case 'scheduled':
      return Repeat;
    default:
      return Zap;
  }
};

const getEventIcon = (triggerSlug: string) => {
  if (!triggerSlug) return <Activity className="h-4 w-4" />;
  const slug = triggerSlug.toLowerCase();
  if (slug.includes('gmail') || slug.includes('email') || slug.includes('mail')) {
    return <Mail className="h-4 w-4" />;
  }
  if (slug.includes('slack') || slug.includes('message') || slug.includes('chat')) {
    return <MessageSquare className="h-4 w-4" />;
  }
  if (slug.includes('calendar') || slug.includes('event') || slug.includes('meeting')) {
    return <CalendarIcon className="h-4 w-4" />;
  }
  if (slug.includes('document') || slug.includes('file') || slug.includes('doc')) {
    return <FileText className="h-4 w-4" />;
  }
  if (slug.includes('user') || slug.includes('member') || slug.includes('contact')) {
    return <Users className="h-4 w-4" />;
  }
  if (slug.includes('web') || slug.includes('http') || slug.includes('url')) {
    return <Globe className="h-4 w-4" />;
  }
  return <Activity className="h-4 w-4" />;
};

const formatEventName = (triggerSlug: string) => {
  if (!triggerSlug) return 'Event';
  return triggerSlug
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const getEventTypeFromSlug = (triggerSlug: string) => {
  if (!triggerSlug) return 'Event';
  const slug = triggerSlug.toLowerCase();
  if (slug.includes('new')) return 'Creation';
  if (slug.includes('update')) return 'Update';
  if (slug.includes('delete')) return 'Deletion';
  if (slug.includes('message')) return 'Message';
  if (slug.includes('email')) return 'Email';
  return 'Event';
};

export function TriggerDetailPanel({ trigger, onClose }: TriggerDetailPanelProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  
  const deleteMutation = useDeleteTrigger();
  const toggleMutation = useToggleTrigger();
  const updateMutation = useUpdateTrigger();
  
  const { data: workflows = [] } = useAgentWorkflows(trigger.agent_id);
  const workflowName = workflows.find(w => w.id === trigger.config?.workflow_id)?.name;
  
  const Icon = getTriggerIcon(trigger.trigger_type);
  const isScheduled = trigger.trigger_type.toLowerCase() === 'schedule' || trigger.trigger_type.toLowerCase() === 'scheduled';
  const currentPreset = CRON_PRESETS.find(p => p.value === trigger.config?.cron_expression);
  
  const handleToggle = async () => {
    try {
      await toggleMutation.mutateAsync({
        triggerId: trigger.trigger_id,
        isActive: !trigger.is_active,
      });
      toast.success(`Task ${!trigger.is_active ? 'enabled' : 'disabled'}`);
    } catch (error) {
      toast.error('Failed to toggle task');
      console.error('Error toggling task:', error);
    }
  };
  
  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({
        triggerId: trigger.trigger_id,
        agentId: trigger.agent_id
      });
      toast.success('Task deleted successfully');
      onClose();
    } catch (error) {
      toast.error('Failed to delete task');
      console.error('Error deleting task:', error);
    }
  };
  
  const handleEditSave = async (config: any) => {
    try {
      await updateMutation.mutateAsync({
        triggerId: trigger.trigger_id,
        name: config.name,
        description: config.description,
        config: config.config,
        is_active: config.is_active,
      });
      toast.success('Task updated successfully');
      setShowEditDialog(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update task');
      console.error('Error updating task:', error);
    }
  };
  
  const isLoading = deleteMutation.isPending || toggleMutation.isPending || updateMutation.isPending;
  
  const provider = {
    provider_id: isScheduled ? 'schedule' : trigger.provider_id,
    name: trigger.name,
    description: trigger.description || '',
    trigger_type: trigger.trigger_type,
    webhook_enabled: !!trigger.webhook_url,
    config_schema: {}
  };
  
  const triggerConfig = {
    trigger_id: trigger.trigger_id,
    agent_id: trigger.agent_id,
    trigger_type: trigger.trigger_type,
    provider_id: trigger.provider_id,
    name: trigger.name,
    description: trigger.description,
    is_active: trigger.is_active,
    webhook_url: trigger.webhook_url,
    created_at: trigger.created_at,
    updated_at: trigger.updated_at,
    config: trigger.config
  };
  
  return (
    <TooltipProvider>
      <div className="h-full bg-background flex flex-col">
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <h2 className="text-xl font-semibold">{trigger.name}</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 -mr-2"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className={cn(
                "h-2 w-2 rounded-full",
                trigger.is_active ? "bg-green-500" : "bg-muted-foreground"
              )} />
              <span className="text-sm text-muted-foreground">
                {trigger.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            
            {isScheduled && trigger.config?.cron_expression && (
              <>
                <span className="text-muted-foreground">•</span>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formatCronExpression(trigger.config.cron_expression)}</span>
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowEditDialog(true)}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit task</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleToggle}
                  disabled={isLoading}
                >
                  {trigger.is_active ? (
                    <PowerOff className="h-3.5 w-3.5" />
                  ) : (
                    <Power className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {trigger.is_active ? 'Disable' : 'Enable'} task
              </TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isLoading}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete task</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent">
          <div className="px-6 pb-6 space-y-6">
            {isScheduled && trigger.config && (
              <div className="rounded-lg space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {trigger.config.execution_type === 'agent' ? (
                    <>
                      <span>Agent Prompt</span>
                    </>
                  ) : (
                    <>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <span>Run Workflow{workflowName ? `: ${workflowName}` : ''}</span>
                    </>
                  )}
                </div>
                {trigger.config.execution_type === 'agent' && trigger.config.agent_prompt && (
                  <div className="rounded-lg">
                    <p className="text-sm whitespace-pre-wrap font-mono">
                      {trigger.config.agent_prompt}
                    </p>
                  </div>
                )}
                {trigger.config.execution_type === 'workflow' && trigger.config.workflow_input && (
                  <div className="rounded-lg border p-3 bg-muted/30 mt-2">
                    <p className="text-xs text-muted-foreground mb-1">Workflow Input:</p>
                    <pre className="text-xs font-mono overflow-x-auto">
                      {JSON.stringify(trigger.config.workflow_input, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
            
            {(trigger.provider_id === 'composio' || trigger.config?.trigger_slug || trigger.config?.composio_trigger_id) && trigger.config && (
              <div className="space-y-4">
                {trigger.config.trigger_slug && (
                  <Card className="shadow-none">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                          {getEventIcon(trigger.config.trigger_slug)}
                        </div>
                        <div>
                          <div className="font-medium">{formatEventName(trigger.config.trigger_slug)}</div>
                          <div className="text-sm text-muted-foreground font-normal">
                            {trigger.name} • {getEventTypeFromSlug(trigger.config.trigger_slug)}
                          </div>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            Real-time
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Event-driven
                          </Badge>
                        </div>

                        <div className="text-sm text-muted-foreground">
                          This trigger will automatically activate whenever a <strong>{formatEventName(trigger.config.trigger_slug)}</strong> event occurs in your connected account.
                        </div>

                        {trigger.config.composio_trigger_id && (
                          <div className="pt-2 border-t">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Event ID</span>
                              <code className="text-xs bg-muted px-2 py-1 rounded">
                                {trigger.config.trigger_slug}
                              </code>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
                <div className="rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    {trigger.config.execution_type === 'agent' ? (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span>Agent Prompt</span>
                      </>
                    ) : (
                      <>
                        <Activity className="h-4 w-4" />
                        <span>Workflow Execution</span>
                      </>
                    )}
                  </div>
                  {trigger.config.execution_type === 'agent' && trigger.config.agent_prompt && (
                    <div className="rounded-lg border p-3 bg-muted/30">
                      <p className="text-sm whitespace-pre-wrap font-mono">
                        {trigger.config.agent_prompt}
                      </p>
                    </div>
                  )}
                  {trigger.config.execution_type === 'workflow' && trigger.config.workflow_id && (
                    <div className="rounded-lg border p-3 bg-muted/30">
                      <div className="space-y-1">
                        <p className="text-sm">
                          Workflow: <span className="font-medium">{workflowName || 'Unknown Workflow'}</span>
                        </p>
                      </div>
                      {trigger.config.workflow_input && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-xs text-muted-foreground mb-1">Input:</p>
                          <pre className="text-xs font-mono overflow-x-auto">
                            {JSON.stringify(trigger.config.workflow_input, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border p-4 bg-muted/30">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    How It Works
                  </h4>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <span>When the event occurs in your connected app, a webhook notification is sent instantly</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <span>Your agent receives the event data and executes the configured action</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="rounded-2xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AgentIconAvatar
                    profileImageUrl={trigger.profile_image_url}
                    iconName={trigger.icon_name}
                    iconColor={trigger.icon_color}
                    backgroundColor={trigger.icon_background}
                    agentName={trigger.agent_name}
                    size={36}
                  />
                  <div>
                    <p className="text-sm font-medium">
                      {trigger.agent_name || 'Unknown Agent'}
                    </p>
                    <p className="text-sm text-muted-foreground">Agent</p>
                  </div>
                </div>
                <Link 
                  href={`/agents/config/${trigger.agent_id}`}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              </div>
            </div>
          </div>
        </div>
        {showEditDialog && (
          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <TriggerConfigDialog
              provider={provider}
              existingConfig={triggerConfig}
              onSave={handleEditSave}
              onCancel={() => setShowEditDialog(false)}
              isLoading={updateMutation.isPending}
              agentId={trigger.agent_id}
            />
          </Dialog>
        )}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Task</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{trigger.name}"? This action cannot be undone and will stop all automated runs from this task.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive hover:bg-destructive/90 text-white"
              >
                Delete Task
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
} 
