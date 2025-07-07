'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  GitBranch,
  ChevronsUpDown,
  Check,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

export interface ConditionalStep {
  id: string;
  name: string;
  description: string;
  type: 'instruction' | 'condition' | 'parallel';
  config: Record<string, any>;
  conditions?: {
    type: 'if' | 'else';
    expression?: string; // Natural language condition like "if user asks about pricing"
  };
  children?: ConditionalStep[]; // For branches
  order: number;
}

interface ConditionalWorkflowBuilderProps {
  steps: ConditionalStep[];
  onStepsChange: (steps: ConditionalStep[]) => void;
  agentTools?: {
    agentpress_tools: Array<{ name: string; description: string; icon?: string; enabled: boolean }>;
    mcp_tools: Array<{ name: string; description: string; icon?: string; server?: string }>;
  };
  isLoadingTools?: boolean;
}

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

export function ConditionalWorkflowBuilder({ 
  steps, 
  onStepsChange, 
  agentTools,
  isLoadingTools 
}: ConditionalWorkflowBuilderProps) {
  const [toolSearchOpen, setToolSearchOpen] = useState<{[key: string]: boolean}>({});

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const addStep = useCallback((parentId?: string, afterStepId?: string) => {
    const newStep: ConditionalStep = {
      id: generateId(),
      name: 'New Step',
      description: '',
      type: 'instruction',
      config: {},
      order: 0
    };

    const updateSteps = (items: ConditionalStep[]): ConditionalStep[] => {
      if (!parentId) {
        // Add to root level
        if (afterStepId) {
          const index = items.findIndex(s => s.id === afterStepId);
          return [...items.slice(0, index + 1), newStep, ...items.slice(index + 1)];
        }
        return [...items, newStep];
      }

      // Add as child of parent
      return items.map(step => {
        if (step.id === parentId) {
          return {
            ...step,
            children: [...(step.children || []), newStep]
          };
        }
        if (step.children) {
          return {
            ...step,
            children: updateSteps(step.children)
          };
        }
        return step;
      });
    };

    onStepsChange(updateSteps(steps));
  }, [steps, onStepsChange]);

  const addCondition = useCallback((afterStepId: string) => {
    const ifStep: ConditionalStep = {
      id: generateId(),
      name: 'If condition',
      description: '',
      type: 'condition',
      config: {},
      conditions: { type: 'if', expression: '' },
      children: [],
      order: 0
    };

    const elseStep: ConditionalStep = {
      id: generateId(),
      name: 'Otherwise',
      description: '',
      type: 'condition',
      config: {},
      conditions: { type: 'else' },
      children: [],
      order: 1
    };

    const updateSteps = (items: ConditionalStep[]): ConditionalStep[] => {
      const index = items.findIndex(s => s.id === afterStepId);
      if (index !== -1) {
        return [
          ...items.slice(0, index + 1),
          ifStep,
          elseStep,
          ...items.slice(index + 1)
        ];
      }
      
      // Check in children
      return items.map(step => {
        if (step.children) {
          return {
            ...step,
            children: updateSteps(step.children)
          };
        }
        return step;
      });
    };

    onStepsChange(updateSteps(steps));
  }, [steps, onStepsChange]);

  const updateStep = useCallback((stepId: string, updates: Partial<ConditionalStep>) => {
    const updateSteps = (items: ConditionalStep[]): ConditionalStep[] => {
      return items.map(step => {
        if (step.id === stepId) {
          return { ...step, ...updates };
        }
        if (step.children) {
          return {
            ...step,
            children: updateSteps(step.children)
          };
        }
        return step;
      });
    };

    onStepsChange(updateSteps(steps));
  }, [steps, onStepsChange]);

  const removeStep = useCallback((stepId: string) => {
    const removeFromSteps = (items: ConditionalStep[]): ConditionalStep[] => {
      return items
        .filter(step => step.id !== stepId)
        .map(step => {
          if (step.children) {
            return {
              ...step,
              children: removeFromSteps(step.children)
            };
          }
          return step;
        });
    };

    onStepsChange(removeFromSteps(steps));
  }, [steps, onStepsChange]);

  const renderStep = (step: ConditionalStep, depth: number = 0, isLast: boolean = false) => {
    const isCondition = step.type === 'condition';
    const hasChildren = step.children && step.children.length > 0;

    return (
      <div key={step.id} className="relative">
        <div className={cn(
          "flex items-start gap-2",
          depth > 0 && "ml-10"
        )}>
          {depth > 0 && (
            <div className="absolute -left-10 top-4 flex items-center">
              <div className="w-8 h-px bg-border" />
              <div className="w-2 h-2 rounded-full bg-border" />
            </div>
          )}
          
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
            isCondition 
              ? "bg-violet-500/10 text-violet-500 dark:bg-violet-500/20" 
              : "bg-primary/10 text-primary dark:bg-primary/20"
          )}>
            {isCondition ? <GitBranch className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
          </div>

          <div className="flex-1 min-w-0">
            <Card className={cn(
              "transition-all p-0",
              isCondition 
                ? "border-violet-500/20 bg-violet-50/50 dark:bg-violet-950/20 dark:border-violet-500/30" 
                : "border-border hover:border-primary/20"
            )}>
              <div className="p-3 space-y-2">
                {isCondition && step.conditions?.type === 'if' ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-violet-600 dark:text-violet-400">When this is true:</Label>
                    <Input
                      value={step.conditions.expression || ''}
                      onChange={(e) => updateStep(step.id, { 
                        conditions: { ...step.conditions, expression: e.target.value } 
                      })}
                      placeholder="e.g., user asks about pricing"
                      className="h-8 text-sm bg-background/50 border-violet-200 dark:border-violet-800 placeholder:text-muted-foreground/60"
                    />
                  </div>
                ) : isCondition && step.conditions?.type === 'else' ? (
                  <div className="text-sm font-semibold text-violet-600 dark:text-violet-400">Otherwise</div>
                ) : (
                  <>
                    <Input
                      value={step.name}
                      onChange={(e) => updateStep(step.id, { name: e.target.value })}
                      placeholder="Step name"
                      className="border-0 bg-transparent shadow-none text-sm font-semibold p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground"
                    />
                    <Input
                      value={step.description}
                      onChange={(e) => updateStep(step.id, { description: e.target.value })}
                      placeholder="What does this step do?"
                      className="border-0 bg-transparent shadow-none text-xs text-muted-foreground p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/60"
                    />
                    
                    {!isCondition && (
                      <Popover 
                        open={toolSearchOpen[step.id] || false} 
                        onOpenChange={(open) => setToolSearchOpen(prev => ({ ...prev, [step.id]: open }))}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={toolSearchOpen[step.id] || false}
                            className="h-7 w-full justify-between text-xs bg-background/50 border-muted-foreground/20 hover:border-muted-foreground/40"
                          >
                            {step.config.tool_name ? (
                              <span className="flex items-center gap-1.5 text-xs">
                                {(() => {
                                  const agentpressTool = agentTools?.agentpress_tools.find(t => t.name === step.config.tool_name);
                                  if (agentpressTool) {
                                    return (
                                      <>
                                        <span>{agentpressTool.icon || '🔧'}</span>
                                        <span>{normalizeToolName(agentpressTool.name, 'agentpress')}</span>
                                      </>
                                    );
                                  }
                                  const mcpTool = agentTools?.mcp_tools.find(t => `${t.server}:${t.name}` === step.config.tool_name);
                                  if (mcpTool) {
                                    return (
                                      <>
                                        <span>{mcpTool.icon || '🔧'}</span>
                                        <span>{normalizeToolName(mcpTool.name, 'mcp')}</span>
                                      </>
                                    );
                                  }
                                  return step.config.tool_name;
                                })()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Select tool (optional)</span>
                            )}
                            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[280px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search tools..." className="h-8 text-xs" />
                            <CommandEmpty className="py-2 text-xs text-center">No tools found.</CommandEmpty>
                            <CommandList>
                              {isLoadingTools ? (
                                <CommandItem disabled className="text-xs">Loading tools...</CommandItem>
                              ) : agentTools ? (
                                <>
                                  {agentTools.agentpress_tools.filter(tool => tool.enabled).length > 0 && (
                                    <CommandGroup heading="AgentPress Tools">
                                      {agentTools.agentpress_tools.filter(tool => tool.enabled).map((tool) => (
                                        <CommandItem
                                          key={tool.name}
                                          value={`${normalizeToolName(tool.name, 'agentpress')} ${tool.name}`}
                                          onSelect={() => {
                                            updateStep(step.id, { config: { ...step.config, tool_name: tool.name } });
                                            setToolSearchOpen(prev => ({ ...prev, [step.id]: false }));
                                          }}
                                          className="text-xs"
                                        >
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm">{tool.icon || '🔧'}</span>
                                            <span>{normalizeToolName(tool.name, 'agentpress')}</span>
                                          </div>
                                          <Check
                                            className={cn(
                                              "ml-auto h-3 w-3",
                                              step.config.tool_name === tool.name ? "opacity-100" : "opacity-0"
                                            )}
                                          />
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  )}
                                  {agentTools.mcp_tools.length > 0 && (
                                    <CommandGroup heading="MCP Tools">
                                      {agentTools.mcp_tools.map((tool) => (
                                        <CommandItem
                                          key={`${tool.server || 'default'}-${tool.name}`}
                                          value={`${normalizeToolName(tool.name, 'mcp')} ${tool.name} ${tool.server || ''}`}
                                          onSelect={() => {
                                            updateStep(step.id, { config: { ...step.config, tool_name: tool.server ? `${tool.server}:${tool.name}` : tool.name } });
                                            setToolSearchOpen(prev => ({ ...prev, [step.id]: false }));
                                          }}
                                          className="text-xs"
                                        >
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm">{tool.icon || '🔧'}</span>
                                            <span>{normalizeToolName(tool.name, 'mcp')}</span>
                                          </div>
                                          <Check
                                            className={cn(
                                              "ml-auto h-3 w-3",
                                              step.config.tool_name === (tool.server ? `${tool.server}:${tool.name}` : tool.name) ? "opacity-100" : "opacity-0"
                                            )}
                                          />
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  )}
                                </>
                              ) : (
                                <CommandItem disabled className="text-xs">Failed to load tools</CommandItem>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    )}
                  </>
                )}

                <div className="flex items-center gap-1 pt-1">
                  {!isCondition && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => addStep(undefined, step.id)}
                        className="h-6 px-2 text-xs hover:bg-primary/10"
                      >
                        <Plus className="h-3 w-3" />
                        Step
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => addCondition(step.id)}
                        className="h-6 px-2 text-xs"
                      >
                        <GitBranch className="h-3 w-3" />
                        Condition
                      </Button>
                    </>
                  )}
                  {isCondition && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addStep(step.id)}
                      className="h-6 px-2 text-xs hover:bg-primary/10"
                    >
                      <Plus className="h-3 w-3" />
                      Add to branch
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeStep(step.id)}
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </Card>

            {hasChildren && (
              <div className="mt-2 relative">
                <div className="absolute left-4 -top-1 bottom-0 w-px bg-border" />
                <div className="space-y-2 pt-1">
                  {step.children!.map((child, index) => 
                    renderStep(child, depth + 1, index === step.children!.length - 1)
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {!isLast && depth === 0 && (
          <div className="absolute left-4 top-10 h-4 w-px bg-border" />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {steps.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <GitBranch className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-base font-semibold mb-2">Start building your workflow</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Add steps and conditions to create a smart workflow that adapts to different scenarios
          </p>
          <Button 
            variant="outline" 
            onClick={() => addStep()}
            className="border-dashed hover:border-solid"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add first step
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {steps.map((step, index) => renderStep(step, 0, index === steps.length - 1))}
          <div className="pl-12 pt-2">
            <Button 
              variant="outline" 
              onClick={() => addStep()}
              className="h-8 border-dashed text-xs hover:border-solid"
              size="sm"
            >
              <Plus className="h-3 w-3" />
              Add step
            </Button>
          </div>
        </div>
      )}
    </div>
  );
} 