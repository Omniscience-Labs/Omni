"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import InputNode from "./nodes/InputNode";
import { validateWorkflow } from "./WorkflowValidator";

const sampleInputNodeData = {
  label: "Input",
  prompt: "Generate daily sales report and email to stakeholders",
  trigger_type: "SCHEDULE" as const,
  schedule_config: {
    interval_type: "hours" as const,
    interval_value: 24,
    timezone: "UTC",
    enabled: true
  },
  variables: {
    recipients: "manager@company.com,sales@company.com",
    report_type: "daily_summary"
  }
};

const sampleNodes = [
  {
    id: "input-1",
    type: "inputNode",
    position: { x: 100, y: 100 },
    data: sampleInputNodeData
  },
  {
    id: "agent-1", 
    type: "agentNode",
    position: { x: 400, y: 100 },
    data: {
      label: "Report Generator",
      instructions: "Generate and send reports"
    }
  }
];

const sampleEdges = [
  {
    id: "e1",
    source: "input-1",
    target: "agent-1"
  }
];

export default function InputNodeDemo() {
  const [nodeData, setNodeData] = useState(sampleInputNodeData);
  
  const validation = validateWorkflow(sampleNodes, sampleEdges);

  const updateNodeData = (updates: any) => {
    setNodeData(prev => ({ ...prev, ...updates }));
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Input Node Demo
            <Badge variant="outline">Frontend Implementation</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Validation Status */}
          <div className="p-4 rounded-lg bg-muted/50">
            <h3 className="font-medium mb-2">Validation Status</h3>
            <div className="flex items-center gap-2">
              <Badge variant={validation.valid ? "default" : "destructive"}>
                {validation.valid ? "Valid" : "Invalid"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {validation.errors.length} issues found
              </span>
            </div>
            {validation.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {validation.errors.map((error, index) => (
                  <div key={index} className="text-sm text-red-600">
                    • {error.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Input Node Preview */}
          <div className="border rounded-lg p-4 bg-background">
            <h3 className="font-medium mb-4">Input Node Component</h3>
            <div className="flex justify-center">
                             <InputNode
                 id="demo-input"
                 data={nodeData}
                 selected={false}
                 type="inputNode"
                 isConnectable={true}
                 dragging={false}
                 zIndex={1}
                 selectable={true}
                 deletable={true}
                 draggable={true}
                 positionAbsoluteX={0}
                 positionAbsoluteY={0}
               />
            </div>
          </div>

          {/* Configuration Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Current Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Prompt:</span>
                  <p className="text-muted-foreground mt-1">{nodeData.prompt}</p>
                </div>
                <div>
                  <span className="font-medium">Trigger:</span>
                  <Badge variant="outline" className="ml-2">{nodeData.trigger_type}</Badge>
                </div>
                {nodeData.trigger_type === 'SCHEDULE' && nodeData.schedule_config && (
                  <div>
                    <span className="font-medium">Schedule:</span>
                    <p className="text-muted-foreground mt-1">
                      Every {nodeData.schedule_config.interval_value} {nodeData.schedule_config.interval_type}
                    </p>
                  </div>
                )}
                <div>
                  <span className="font-medium">Variables:</span>
                  <div className="mt-1 space-y-1">
                    {Object.entries(nodeData.variables || {}).map(([key, value]) => (
                      <div key={key} className="text-xs">
                        <span className="font-mono bg-muted px-1 rounded">{key}</span>: {value}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Features Implemented</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Prompt configuration</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Trigger type selection</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Schedule configuration</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Webhook configuration</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Variables editor</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Workflow validation</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Connection rules</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Visual indicators</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Test Actions */}
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => updateNodeData({ trigger_type: "MANUAL" })}
            >
              Set Manual Trigger
            </Button>
            <Button 
              variant="outline" 
              onClick={() => updateNodeData({ 
                trigger_type: "SCHEDULE",
                schedule_config: {
                  interval_type: "days",
                  interval_value: 1,
                  timezone: "UTC",
                  enabled: true
                }
              })}
            >
              Set Daily Schedule
            </Button>
            <Button 
              variant="outline" 
              onClick={() => updateNodeData({ 
                trigger_type: "WEBHOOK",
                webhook_config: {
                  method: "POST",
                  authentication: "api_key"
                }
              })}
            >
              Set Webhook Trigger
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 