"use client";

import { memo, useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Play, Settings, Clock, Webhook, User, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import KeyValueEditor from "../KeyValueEditor";
import { useWorkflow } from "../WorkflowContext";

interface SlackWebhookConfig {
  webhook_url: string;
  signing_secret: string;
  channel?: string;
  username?: string;
}

interface WebhookConfig {
  type: 'slack' | 'generic';
  method?: 'POST' | 'GET' | 'PUT';
  authentication?: 'none' | 'api_key' | 'bearer';
  slack?: SlackWebhookConfig;
  generic?: {
    url: string;
    headers?: Record<string, string>;
    auth_token?: string;
  };
}

interface InputNodeData {
  label?: string;
  prompt?: string;
  trigger_type?: 'MANUAL' | 'WEBHOOK' | 'SCHEDULE';
  schedule_config?: {
    interval_type?: 'minutes' | 'hours' | 'days' | 'weeks';
    interval_value?: number;
    cron_expression?: string;
    timezone?: string;
    enabled?: boolean;
  };
  webhook_config?: WebhookConfig;
  variables?: Record<string, any>;
}

const InputNode = memo(({ data, selected, id }: NodeProps) => {
  const nodeData = data as InputNodeData;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const { updateNodeData } = useWorkflow();

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
        return 'bg-orange-500';
      case 'WEBHOOK':
        return 'bg-purple-500';
      case 'MANUAL':
      default:
        return 'bg-blue-500';
    }
  };

  const getTriggerDescription = () => {
    switch (nodeData.trigger_type) {
      case 'SCHEDULE':
        if (nodeData.schedule_config?.cron_expression) {
          return `Cron: ${nodeData.schedule_config.cron_expression}`;
        } else if (nodeData.schedule_config?.interval_type && nodeData.schedule_config?.interval_value) {
          return `Every ${nodeData.schedule_config.interval_value} ${nodeData.schedule_config.interval_type}`;
        }
        return 'Scheduled execution';
      case 'WEBHOOK':
        if (nodeData.webhook_config?.type === 'slack') {
          return 'Slack webhook';
        }
        return `${nodeData.webhook_config?.method || 'POST'} webhook`;
      case 'MANUAL':
      default:
        return 'Manual execution';
    }
  };

  return (
    <div className={`relative bg-card rounded-lg border-2 min-w-[280px] max-w-[400px] ${
      selected ? "border-primary shadow-lg" : "border-border"
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between p-3 ${getTriggerColor()} rounded-t-lg text-white`}>
        <div className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          <span className="font-medium">Input</span>
        </div>
        <div className="flex items-center gap-2">
          {getTriggerIcon()}
          <Badge variant="secondary" className="text-xs bg-white/20 text-white border-white/30">
            {nodeData.trigger_type || 'MANUAL'}
          </Badge>
        </div>
      </div>

      {/* Content */}
      <CardContent className="p-4 space-y-3">
        {/* Prompt Preview */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Prompt</Label>
          <p className="text-sm mt-1 line-clamp-2 text-foreground">
            {nodeData.prompt || "No prompt configured"}
          </p>
        </div>

        {/* Trigger Info */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Trigger</Label>
          <p className="text-sm mt-1 text-foreground">
            {getTriggerDescription()}
          </p>
        </div>

        {/* Variables Preview */}
        {nodeData.variables && Object.keys(nodeData.variables).length > 0 && (
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Variables</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.keys(nodeData.variables).slice(0, 3).map((key) => (
                <Badge key={key} variant="outline" className="text-xs">
                  {key}
                </Badge>
              ))}
              {Object.keys(nodeData.variables).length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{Object.keys(nodeData.variables).length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}

        <Separator />

        {/* Configuration Toggle */}
        <Collapsible open={isConfigOpen} onOpenChange={setIsConfigOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between p-2">
              <span className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Configure
              </span>
              {isConfigOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="space-y-4 mt-3">
            {/* Prompt Configuration */}
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

            {/* <div className="space-y-2">
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
            </div> */}

            {/* {nodeData.trigger_type === 'SCHEDULE' && (
              <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                <Label className="text-sm font-medium">Schedule Configuration</Label>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Interval Type</Label>
                    <Select
                      value={nodeData.schedule_config?.interval_type || 'hours'}
                      onValueChange={(value: 'minutes' | 'hours' | 'days' | 'weeks') =>
                        updateNodeData(id, {
                          schedule_config: {
                            ...nodeData.schedule_config,
                            interval_type: value
                          }
                        })
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minutes">Minutes</SelectItem>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                        <SelectItem value="weeks">Weeks</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs">Interval Value</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="1"
                      value={nodeData.schedule_config?.interval_value || ''}
                      onChange={(e) =>
                        updateNodeData(id, {
                          schedule_config: {
                            ...nodeData.schedule_config,
                            interval_value: parseInt(e.target.value) || 1
                          }
                        })
                      }
                      className="h-8"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Cron Expression (Advanced)</Label>
                  <Input
                    placeholder="0 9 * * 1-5 (weekdays at 9 AM)"
                    value={nodeData.schedule_config?.cron_expression || ''}
                    onChange={(e) =>
                      updateNodeData(id, {
                        schedule_config: {
                          ...nodeData.schedule_config,
                          cron_expression: e.target.value
                        }
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Timezone</Label>
                  <Select
                    value={nodeData.schedule_config?.timezone || 'UTC'}
                    onValueChange={(value) =>
                      updateNodeData(id, {
                        schedule_config: {
                          ...nodeData.schedule_config,
                          timezone: value
                        }
                      })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">Eastern Time</SelectItem>
                      <SelectItem value="America/Chicago">Central Time</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                      <SelectItem value="Europe/London">London</SelectItem>
                      <SelectItem value="Europe/Paris">Paris</SelectItem>
                      <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )} */}

            {/* {nodeData.trigger_type === 'WEBHOOK' && (
              <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                <Label className="text-sm font-medium">Webhook Configuration</Label>
                <div className="space-y-1">
                  <Label className="text-xs">Webhook Type</Label>
                  <Select
                    value={nodeData.webhook_config?.type || 'slack'}
                    onValueChange={(value: 'slack' | 'generic') =>
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
                      <SelectItem value="generic">Generic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {nodeData.webhook_config?.type === 'slack' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Slack Webhook URL *</Label>
                      <Input
                        placeholder="https://hooks.slack.com/services/..."
                        value={nodeData.webhook_config?.slack?.webhook_url || ''}
                        onChange={(e) =>
                          updateNodeData(id, {
                            webhook_config: {
                              ...nodeData.webhook_config,
                              slack: {
                                ...nodeData.webhook_config?.slack,
                                webhook_url: e.target.value
                              }
                            }
                          })
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <Label className="text-xs">Signing Secret *</Label>
                      <Input
                        type="password"
                        placeholder="Your Slack app signing secret"
                        value={nodeData.webhook_config?.slack?.signing_secret || ''}
                        onChange={(e) =>
                          updateNodeData(id, {
                            webhook_config: {
                              ...nodeData.webhook_config,
                              slack: {
                                ...nodeData.webhook_config?.slack,
                                signing_secret: e.target.value
                              }
                            }
                          })
                        }
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Channel (Optional)</Label>
                        <Input
                          placeholder="#general"
                          value={nodeData.webhook_config?.slack?.channel || ''}
                          onChange={(e) =>
                            updateNodeData(id, {
                              webhook_config: {
                                ...nodeData.webhook_config,
                                slack: {
                                  ...nodeData.webhook_config?.slack,
                                  channel: e.target.value
                                }
                              }
                            })
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <Label className="text-xs">Username (Optional)</Label>
                        <Input
                          placeholder="WorkflowBot"
                          value={nodeData.webhook_config?.slack?.username || ''}
                          onChange={(e) =>
                            updateNodeData(id, {
                              webhook_config: {
                                ...nodeData.webhook_config,
                                slack: {
                                  ...nodeData.webhook_config?.slack,
                                  username: e.target.value
                                }
                              }
                            })
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {nodeData.webhook_config?.type === 'generic' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Webhook URL *</Label>
                      <Input
                        placeholder="https://your-webhook-endpoint.com"
                        value={nodeData.webhook_config?.generic?.url || ''}
                        onChange={(e) =>
                          updateNodeData(id, {
                            webhook_config: {
                              ...nodeData.webhook_config,
                              generic: {
                                ...nodeData.webhook_config?.generic,
                                url: e.target.value
                              }
                            }
                          })
                        }
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">HTTP Method</Label>
                        <Select
                          value={nodeData.webhook_config?.method || 'POST'}
                          onValueChange={(value: 'POST' | 'GET' | 'PUT') =>
                            updateNodeData(id, {
                              webhook_config: {
                                ...nodeData.webhook_config,
                                method: value
                              }
                            })
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="POST">POST</SelectItem>
                            <SelectItem value="GET">GET</SelectItem>
                            <SelectItem value="PUT">PUT</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-1">
                        <Label className="text-xs">Authentication</Label>
                        <Select
                          value={nodeData.webhook_config?.authentication || 'none'}
                          onValueChange={(value: 'none' | 'api_key' | 'bearer') =>
                            updateNodeData(id, {
                              webhook_config: {
                                ...nodeData.webhook_config,
                                authentication: value
                              }
                            })
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="api_key">API Key</SelectItem>
                            <SelectItem value="bearer">Bearer Token</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {nodeData.webhook_config?.authentication !== 'none' && (
                      <div className="space-y-1">
                        <Label className="text-xs">Auth Token</Label>
                        <Input
                          type="password"
                          placeholder="Your authentication token"
                          value={nodeData.webhook_config?.generic?.auth_token || ''}
                          onChange={(e) =>
                            updateNodeData(id, {
                              webhook_config: {
                                ...nodeData.webhook_config,
                                generic: {
                                  ...nodeData.webhook_config?.generic,
                                  auth_token: e.target.value
                                }
                              }
                            })
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )} */}

            {/* <div className="space-y-2">
              <Label className="text-sm font-medium">Default Variables</Label>
              <KeyValueEditor
                values={nodeData.variables || {}}
                onChange={(variables) => updateNodeData(id, { variables })}
                placeholder={{
                  key: "Variable name",
                  value: "Default value"
                }}
              />
            </div> */}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>

      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 !bg-primary !border-primary-foreground"
        style={{ right: -6 }}
      />
    </div>
  );
});

InputNode.displayName = "InputNode";

export default InputNode; 