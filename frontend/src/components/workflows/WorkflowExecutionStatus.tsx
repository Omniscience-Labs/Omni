"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Play, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2,
  RefreshCw,
  X
} from "lucide-react";
import { getExecutionStatus, cancelExecution, type WorkflowExecution, type WorkflowExecutionLog } from "@/lib/api";
import { toast } from "sonner";

interface WorkflowExecutionStatusProps {
  executionId: string;
  onClose: () => void;
}

export default function WorkflowExecutionStatus({ executionId, onClose }: WorkflowExecutionStatusProps) {
  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [logs, setLogs] = useState<WorkflowExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const fetchStatus = async () => {
    try {
      const response = await getExecutionStatus(executionId);
      setExecution(response.execution);
      setLogs(response.logs);
    } catch (error) {
      console.error("Error fetching execution status:", error);
      toast.error("Failed to fetch execution status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    
    // Poll for updates if execution is running
    const interval = setInterval(() => {
      if (execution?.status === 'running' || execution?.status === 'pending') {
        fetchStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [executionId, execution?.status]);

  const handleCancel = async () => {
    if (!execution || cancelling) return;
    
    setCancelling(true);
    try {
      await cancelExecution(executionId);
      toast.success("Execution cancelled");
      await fetchStatus();
    } catch (error) {
      console.error("Error cancelling execution:", error);
      toast.error("Failed to cancel execution");
    } finally {
      setCancelling(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <X className="h-4 w-4 text-gray-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'completed':
        return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'failed':
        return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'cancelled':
        return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
      case 'pending':
        return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
      default:
        return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
    }
  };

  if (loading) {
    return (
      <Card className="w-full max-w-4xl">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading execution status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!execution) {
    return (
      <Card className="w-full max-w-4xl">
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            Execution not found
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Play className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{execution.workflow_name}</CardTitle>
              <p className="text-sm text-muted-foreground">Execution ID: {execution.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={fetchStatus}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Status Overview */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon(execution.status)}
            <Badge className={getStatusColor(execution.status)}>
              {execution.status.toUpperCase()}
            </Badge>
          </div>
          
          {execution.status === 'running' && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              {cancelling ? "Cancelling..." : "Cancel"}
            </Button>
          )}
        </div>

        {/* Timing Information */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Started:</span>
            <div className="font-medium">
              {execution.started_at ? new Date(execution.started_at).toLocaleString() : 'Not started'}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Completed:</span>
            <div className="font-medium">
              {execution.completed_at ? new Date(execution.completed_at).toLocaleString() : 'In progress'}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {execution.error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="text-sm font-medium text-red-800 dark:text-red-200">Error</div>
            <div className="text-sm text-red-700 dark:text-red-300 mt-1">{execution.error}</div>
          </div>
        )}

        <Separator />

        {/* Execution Logs */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Execution Logs</h3>
          <ScrollArea className="h-96 border rounded-lg">
            <div className="p-4 space-y-3">
              {logs.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No logs available yet
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="border rounded-lg p-3 bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(log.status)}
                        <span className="font-medium">{log.node_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {log.node_type}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(log.started_at).toLocaleTimeString()}
                      </div>
                    </div>
                    
                    {log.error && (
                      <div className="text-sm text-red-600 dark:text-red-400 mt-2">
                        Error: {log.error}
                      </div>
                    )}
                    
                    {log.output_data && (
                      <div className="mt-2">
                        <div className="text-xs text-muted-foreground mb-1">Output:</div>
                        <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto">
                          {JSON.stringify(log.output_data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
} 