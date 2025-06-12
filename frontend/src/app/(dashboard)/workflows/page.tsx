"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Play, Edit, Trash2, Clock, CheckCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Mock data for workflows
const mockWorkflows = [
  {
    id: "1",
    name: "Resume Analysis Pipeline",
    description: "Analyzes resumes from ATS and extracts key information",
    status: "active",
    lastRun: "2024-01-15T10:30:00Z",
    nextRun: "2024-01-16T10:30:00Z",
    runs: 145,
    successRate: 0.92,
  },
  {
    id: "2",
    name: "Daily Report Generator",
    description: "Generates daily reports from multiple data sources",
    status: "inactive",
    lastRun: "2024-01-14T18:00:00Z",
    nextRun: null,
    runs: 89,
    successRate: 0.88,
  },
];

export default function WorkflowsPage() {
  const [workflows] = useState(mockWorkflows);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "inactive":
        return <XCircle className="h-4 w-4 text-gray-400" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-500">Active</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Workflows</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage automated agent workflows
          </p>
        </div>
        <Link href="/workflows/builder">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Workflow
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {workflows.map((workflow) => (
          <Card key={workflow.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{workflow.name}</CardTitle>
                  <CardDescription>{workflow.description}</CardDescription>
                </div>
                {getStatusBadge(workflow.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total Runs</p>
                    <p className="font-semibold">{workflow.runs}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Success Rate</p>
                    <p className="font-semibold">{(workflow.successRate * 100).toFixed(0)}%</p>
                  </div>
                </div>

                {workflow.lastRun && (
                  <div className="text-sm">
                    <p className="text-muted-foreground">Last Run</p>
                    <p className="font-medium">
                      {new Date(workflow.lastRun).toLocaleString()}
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Link href={`/workflows/builder/${workflow.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      <Edit className="mr-2 h-3 w-3" />
                      Edit
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Play className="mr-2 h-3 w-3" />
                    Run
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
} 