"use client";

import { memo, useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Play, Settings, Clock, Webhook, User, ChevronDown, ChevronUp } from "lucide-react";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useWorkflow } from "../WorkflowContext";
import { WebhookConfigDialog } from "../webhooks/WebhookConfigDialog";
import { WebhookConfig } from "../webhooks/types";
import { ScheduleConfigDialog } from "../scheduling/ScheduleConfigDialog";
import { ScheduleConfig } from "../scheduling/types";

interface InputNodeData {
  label?: string;
  prompt?: string;
  trigger_type?: 'MANUAL' | 'WEBHOOK' | 'SCHEDULE';
  schedule_config?: ScheduleConfig;
  webhook_config?: WebhookConfig;
  variables?: Record<string, any>;
}

const InputNode = memo(({ data, selected, id }: NodeProps) => {
  const nodeData = data as InputNodeData;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isWebhookDialogOpen, setIsWebhookDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const { updateNodeData, workflowId } = useWorkflow();

  const getTriggerIcon = () => {
    switch (nodeData.trigger_type) {
      case 'SCHEDULE':
        return <Clock className="h-4 w-4" />;
      case 'WEBHOOK':
        return <Webhook className="h-4 w-4" />;
      case 'MANUAL':
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getTriggerColor = () => {
    switch (nodeData.trigger_type) {
      case 'SCHEDULE':
        return 'bg-orange-500/30';
      case 'WEBHOOK':
        return 'bg-purple-500/30';
      case 'MANUAL':
      default:
        return 'bg-blue-500/30';
    }
  };

  const getIconColor = () => {
    switch (nodeData.trigger_type) {
      case 'SCHEDULE':
        return 'text-orange-500';
      case 'WEBHOOK':
        return 'text-purple-500';
      case 'MANUAL':
      default:
        return 'text-blue-500';
    }
  };

  const getBorderColor = () => {
    switch (nodeData.trigger_type) {
      case 'SCHEDULE':
        return 'border-orange-500';
      case 'WEBHOOK':
        return 'border-purple-500';
      case 'MANUAL':
      default:
        return 'border-blue-500';
    }
  };

  const getTriggerDescription = () => {
    switch (nodeData.trigger_type) {
      case 'SCHEDULE':
        if (nodeData.schedule_config?.type === 'simple' && nodeData.schedule_config.simple) {
          return `Every ${nodeData.schedule_config.simple.interval_value} ${nodeData.schedule_config.simple.interval_type}`;
        } else if (nodeData.schedule_config?.type === 'cron' && nodeData.schedule_config.cron) {
          return `Cron: ${nodeData.schedule_config.cron.cron_expression}`;
        } else if (nodeData.schedule_config?.type === 'advanced' && nodeData.schedule_config.advanced) {
          return `Advanced: ${nodeData.schedule_config.advanced.cron_expression}`;
        }
        return 'Scheduled execution';
      case 'WEBHOOK':
        if (nodeData.webhook_config?.type === 'slack') {
          return 'Slack webhook';
        } else if (nodeData.webhook_config?.type === 'telegram') {
          return 'Telegram webhook';
        }
        return `${nodeData.webhook_config?.method || 'POST'} webhook`;
      case 'MANUAL':
      default:
        return 'Manual execution';
    }
  };

  return (
    <div className={`relative bg-neutral-100 dark:bg-neutral-900 rounded-2xl border-2 min-w-[280px] max-w-[400px] ${
      selected ? "border-primary shadow-lg" : "border-border"
    }`}>
      <CardHeader className={`flex items-center justify-between p-4 rounded-t-lg`}>
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${getTriggerColor()} border ${getBorderColor()}`}>
            <Play className={`h-5 w-5 ${getIconColor()}`} />
          </div>
          <span className="font-medium">Input</span>
        </div>
        <div className="flex items-center gap-2">
          {getTriggerIcon()}
          <Badge variant="outline" className="text-xs border-primary/20">
            {nodeData.trigger_type || 'MANUAL'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Prompt</Label>
          <p className="text-sm mt-1 line-clamp-2 text-foreground">
            {nodeData.prompt || "No prompt configured"}
          </p>
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Trigger</Label>
          <p className="text-sm mt-1 text-foreground">
            {getTriggerDescription()}
          </p>
        </div>
        <Separator />
        <Collapsible open={isConfigOpen} onOpenChange={setIsConfigOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="node_secondary" size="node_secondary" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Configure
              </span>
              {isConfigOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 mt-3">
            <div className="space-y-2">
              <Label htmlFor={`prompt-${id}`} className="text-sm font-medium">
                Workflow Prompt *
              </Label>
              <Textarea
                id={`prompt-${id}`}
                placeholder="Describe what this workflow should accomplish..."
                value={nodeData.prompt || ''}
                onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
                className="min-h-[80px] text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Trigger Type *</Label>
              <Select
                value={nodeData.trigger_type || 'MANUAL'}
                onValueChange={(value: 'MANUAL' | 'WEBHOOK' | 'SCHEDULE') => 
                  updateNodeData(id, { trigger_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANUAL">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Manual
                    </div>
                  </SelectItem>
                  <SelectItem value="WEBHOOK">
                    <div className="flex items-center gap-2">
                      <Webhook className="h-4 w-4" />
                      Webhook
                    </div>
                  </SelectItem>
                  <SelectItem value="SCHEDULE">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Schedule
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {nodeData.trigger_type === 'WEBHOOK' && (
              <div className="space-y-3 rounded-lg">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Webhook Provider</Label>
                    <Select
                      value={nodeData.webhook_config?.type || 'slack'}
                      onValueChange={(value: 'slack' | 'telegram' | 'generic') =>
                        updateNodeData(id, {
                          webhook_config: {
                            ...nodeData.webhook_config,
                            type: value
                          }
                        })
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slack">Slack</SelectItem>
                        <SelectItem value="telegram">Telegram</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(nodeData.webhook_config?.type === 'slack' || !nodeData.webhook_config?.type) && (
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!nodeData.webhook_config) {
                            updateNodeData(id, {
                              webhook_config: {
                                type: 'slack',
                                method: 'POST',
                                authentication: 'none'
                              }
                            });
                          }
                          setIsWebhookDialogOpen(true);
                        }}
                        className="w-full"
                      >
                        <Settings className="h-4 w-4" />
                        Configure Slack Webhook
                      </Button>
                      
                      {nodeData.webhook_config?.slack?.webhook_url && nodeData.webhook_config?.slack?.signing_secret && (
                        <div className="text-xs text-muted-foreground">
                          ✓ Slack webhook configured
                        </div>
                      )}
                    </div>
                  )}

                  {nodeData.webhook_config?.type === 'telegram' && (
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!nodeData.webhook_config) {
                            updateNodeData(id, {
                              webhook_config: {
                                type: 'telegram',
                                method: 'POST',
                                authentication: 'none'
                              }
                            });
                          }
                          setIsWebhookDialogOpen(true);
                        }}
                        className="w-full"
                      >
                        <Settings className="h-4 w-4" />
                        Configure Telegram Webhook
                      </Button>
                      
                      {nodeData.webhook_config?.telegram?.webhook_url && nodeData.webhook_config?.telegram?.bot_token && (
                        <div className="text-xs text-muted-foreground">
                          ✓ Telegram webhook configured
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {nodeData.trigger_type === 'SCHEDULE' && (
              <div className="space-y-3 rounded-lg">
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!nodeData.schedule_config) {
                        updateNodeData(id, {
                          schedule_config: {
                            type: 'simple',
                            enabled: true,
                            simple: { interval_type: 'hours', interval_value: 1 }
                          }
                        });
                      }
                      setIsScheduleDialogOpen(true);
                    }}
                    className="w-full"
                  >
                    <Settings className="h-4 w-4" />
                    Configure Schedule
                  </Button>
                  {nodeData.schedule_config && (
                    <div className="text-xs text-muted-foreground">
                      ✓ Schedule configured: {getTriggerDescription()}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>

      <Handle
        type="source"
        position={Position.Right}
        className="w-6 h-6 !border-4 !border-primary !bg-green-500 hover:!bg-green-600 transition-colors"
        style={{ right: -6 }}
      />

      <WebhookConfigDialog
        open={isWebhookDialogOpen}
        onOpenChange={setIsWebhookDialogOpen}
        config={nodeData.webhook_config}
        workflowId={workflowId || id}
        onSave={(config) => {
          updateNodeData(id, { webhook_config: config });
        }}
      />

      <ScheduleConfigDialog
        open={isScheduleDialogOpen}
        onOpenChange={setIsScheduleDialogOpen}
        workflowId={workflowId || id}
        initialConfig={nodeData.schedule_config}
        onSave={async (config, name, description) => {
          updateNodeData(id, { schedule_config: config });
        }}
      />
    </div>
  );
});

InputNode.displayName = "InputNode";

export default InputNode; 