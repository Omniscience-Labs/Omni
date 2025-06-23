"use client";

import { useState } from "react";
import { Node, Edge } from "@xyflow/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Settings, Webhook, Clock, Zap, Bot, Wrench } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScheduleManager } from "./scheduling/ScheduleManager";

interface WorkflowSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes?: Node[];
  edges?: Edge[];
  workflowName: string;
  workflowDescription: string;
  workflowId?: string;
  onWorkflowNameChange: (name: string) => void;
  onWorkflowDescriptionChange: (description: string) => void;
}

export default function WorkflowSettings({ 
  open, 
  onOpenChange, 
  nodes = [], 
  edges = [],
  workflowName,
  workflowDescription,
  workflowId,
  onWorkflowNameChange,
  onWorkflowDescriptionChange
}: WorkflowSettingsProps) {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20">
              <Settings className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <DialogTitle>Workflow Settings</DialogTitle>
              <DialogDescription>
                Configure your agent workflow settings and node properties
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="scheduling">
              <Clock className="h-4 w-4 mr-1" />
              Scheduling
            </TabsTrigger>
            <TabsTrigger value="nodes">Nodes ({nodes.length})</TabsTrigger>
            <TabsTrigger value="execution">Execution</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            <TabsContent value="general" className="space-y-4 p-1">
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Workflow Information
                  </CardTitle>
                  <CardDescription>Configure basic workflow settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="workflow-name">Name</Label>
                    <Input
                      id="workflow-name"
                      value={workflowName}
                      onChange={(e) => onWorkflowNameChange(e.target.value)}
                      placeholder="Enter workflow name"
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="workflow-description">Description</Label>
                    <Textarea
                      id="workflow-description"
                      value={workflowDescription}
                      onChange={(e) => onWorkflowDescriptionChange(e.target.value)}
                      placeholder="Describe what this workflow does"
                      rows={3}
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                        <Bot className="h-3 w-3 mr-1" />
                        Agent Workflow
                      </Badge>
                      <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                        Research
                      </Badge>
                      <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                        Analysis
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Webhook className="h-4 w-4" />
                    Triggers
                  </CardTitle>
                  <CardDescription>Configure how this workflow is triggered</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Trigger Type</Label>
                    <Select defaultValue="manual">
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual Trigger</SelectItem>
                        <SelectItem value="webhook">
                          <div className="flex items-center gap-2">
                            <Webhook className="h-4 w-4" />
                            Webhook
                          </div>
                        </SelectItem>
                        {/* <SelectItem value="schedule">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Schedule
                          </div>
                        </SelectItem> */}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="scheduling" className="space-y-4 p-1">
              {workflowId ? (
                <ScheduleManager workflowId={workflowId} />
              ) : (
                <Card className="border-border/50">
                  <CardContent className="p-8 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-4 rounded-full bg-muted/50">
                        <Clock className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Workflow not saved</h3>
                        <p className="text-sm text-muted-foreground">
                          Save your workflow first to configure scheduling
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="nodes" className="space-y-4 p-1">
              {nodes.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="p-8 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-4 rounded-full bg-muted/50">
                        <Bot className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">No nodes added yet</h3>
                        <p className="text-sm text-muted-foreground">
                          Drag agents and tools from the palette to get started
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                nodes.map((node) => (
                  <Card 
                    key={node.id} 
                    className="cursor-pointer hover:shadow-md transition-all border-border/50 hover:border-border"
                  >
                    <CardHeader
                      onClick={() => setSelectedNode(node.id === selectedNode?.id ? null : node)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20">
                            {node.type === 'agentNode' ? (
                              <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <Wrench className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            )}
                          </div>
                          <div>
                            <CardTitle className="text-base">{(node.data as any).label}</CardTitle>
                            <CardDescription>
                              {node.type === 'agentNode' ? 'AI Agent' : 'Tool Connection'}
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {node.id}
                        </Badge>
                      </div>
                    </CardHeader>
                    {selectedNode?.id === node.id && (
                      <CardContent className="space-y-4 border-t border-border/50 pt-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Position X</Label>
                            <Input
                              value={node.position.x}
                              readOnly
                              className="bg-muted/50 text-xs"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Position Y</Label>
                            <Input
                              value={node.position.y}
                              readOnly
                              className="bg-muted/50 text-xs"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Configuration</Label>
                          <Textarea
                            placeholder="Node configuration (JSON)"
                            rows={4}
                            className="font-mono text-xs bg-background"
                            defaultValue={JSON.stringify(node.data, null, 2)}
                          />
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="execution" className="space-y-4 p-1">
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Execution Settings
                  </CardTitle>
                  <CardDescription>Configure how the workflow executes</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="timeout">Timeout (seconds)</Label>
                      <Input
                        id="timeout"
                        type="number"
                        defaultValue="300"
                        placeholder="Maximum execution time"
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="retry-count">Retry Count</Label>
                      <Input
                        id="retry-count"
                        type="number"
                        defaultValue="3"
                        placeholder="Number of retries on failure"
                        className="bg-background"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parallel">Parallel Execution</Label>
                    <Select defaultValue="sequential">
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sequential">Sequential</SelectItem>
                        <SelectItem value="parallel">Parallel (where possible)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-base">Workflow Statistics</CardTitle>
                  <CardDescription>Current workflow composition</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{nodes.length}</div>
                      <div className="text-sm text-muted-foreground">Total Nodes</div>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">{edges.length}</div>
                      <div className="text-sm text-muted-foreground">Connections</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Workflow Configuration</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure your workflow settings and execution parameters.
                  </p>
                </div>
                
                <Separator />
                
                <div>
                  <h4 className="text-md font-semibold mb-3">Connection Types</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      <div>
                        <p className="text-sm font-medium">Data Flow</p>
                        <p className="text-xs text-muted-foreground">Direct output from agents to other agents or tools</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-800">
                      <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                      <div>
                        <p className="text-sm font-medium">Processed Data</p>
                        <p className="text-xs text-muted-foreground">Analyzed or transformed data from agents</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <div>
                        <p className="text-sm font-medium">Actions</p>
                        <p className="text-xs text-muted-foreground">Commands or actions to be executed by tools</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <div>
                        <p className="text-sm font-medium">Tool Connections</p>
                        <p className="text-xs text-muted-foreground">Tools available to agents for execution</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h4 className="text-md font-semibold mb-3">Workflow Execution</h4>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>• Agents can receive input from multiple sources</p>
                    <p>• Tools can be chained together for complex operations</p>
                    <p>• Data flows through the workflow based on connections</p>
                    <p>• Each connection type carries different data formats</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
} 