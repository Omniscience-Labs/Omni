"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Clock, 
  Play, 
  Pause, 
  Trash2, 
  Edit, 
  Plus, 
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Calendar
} from 'lucide-react';
import { WorkflowSchedule, ScheduleConfig } from './types';
import { ScheduleConfigDialog } from './ScheduleConfigDialog';
import { 
  useWorkflowSchedules,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  usePauseSchedule,
  useResumeSchedule
} from '@/hooks/react-query';

interface ScheduleManagerProps {
  workflowId: string;
}

export function ScheduleManager({ workflowId }: ScheduleManagerProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<WorkflowSchedule | null>(null);

  // React Query hooks
  const { 
    data: schedulesResponse, 
    isLoading, 
    error, 
    refetch 
  } = useWorkflowSchedules(workflowId);

  const createScheduleMutation = useCreateSchedule();
  const updateScheduleMutation = useUpdateSchedule();
  const deleteScheduleMutation = useDeleteSchedule();
  const pauseScheduleMutation = usePauseSchedule();
  const resumeScheduleMutation = useResumeSchedule();

  const schedules = schedulesResponse?.schedules || [];

  const createSchedule = async (config: ScheduleConfig, name: string, description?: string) => {
    await createScheduleMutation.mutateAsync({
      workflow_id: workflowId,
      name,
      description,
      config
    });
  };

  const updateSchedule = async (scheduleId: string, config: ScheduleConfig, name: string, description?: string) => {
    await updateScheduleMutation.mutateAsync({
      scheduleId,
      request: { name, description, config }
    });
  };

  const deleteSchedule = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) {
      return;
    }

    await deleteScheduleMutation.mutateAsync(scheduleId);
  };

  const toggleSchedule = async (schedule: WorkflowSchedule) => {
    if (schedule.status === 'active') {
      await pauseScheduleMutation.mutateAsync(schedule.id!);
    } else {
      await resumeScheduleMutation.mutateAsync(schedule.id!);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatScheduleDescription = (schedule: WorkflowSchedule) => {
    const config = schedule.config;
    
    if (config.type === 'simple' && config.simple) {
      return `Every ${config.simple.interval_value} ${config.simple.interval_type}`;
    } else if (config.type === 'cron' && config.cron) {
      return `Cron: ${config.cron.cron_expression}`;
    } else if (config.type === 'advanced' && config.advanced) {
      return `Advanced: ${config.advanced.cron_expression}`;
    }
    
    return 'Custom schedule';
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading schedules...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : 'Failed to load schedules'}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Workflow Schedules
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => setIsCreateDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Schedule
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {schedules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <div className="text-sm">No schedules configured</div>
              <div className="text-xs mt-1">Create your first schedule to automate this workflow</div>
            </div>
          ) : (
            <div className="space-y-4">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusIcon(schedule.status)}
                      <h3 className="font-medium">{schedule.name}</h3>
                      <Badge className={getStatusColor(schedule.status)}>
                        {schedule.status}
                      </Badge>
                    </div>
                    
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>{formatScheduleDescription(schedule)}</div>
                      {schedule.description && (
                        <div>{schedule.description}</div>
                      )}
                      {schedule.next_execution && (
                        <div>
                          Next run: {new Date(schedule.next_execution).toLocaleString()}
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-xs">
                        <span>Executions: {schedule.execution_count}</span>
                        {schedule.error_count > 0 && (
                          <span className="text-red-600">Errors: {schedule.error_count}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleSchedule(schedule)}
                      disabled={pauseScheduleMutation.isPending || resumeScheduleMutation.isPending}
                    >
                      {schedule.status === 'active' ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingSchedule(schedule)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteSchedule(schedule.id!)}
                      className="text-red-600 hover:text-red-700"
                      disabled={deleteScheduleMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Schedule Dialog */}
      <ScheduleConfigDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        workflowId={workflowId}
        onSave={createSchedule}
      />

      {/* Edit Schedule Dialog */}
      {editingSchedule && (
        <ScheduleConfigDialog
          open={!!editingSchedule}
          onOpenChange={(open) => !open && setEditingSchedule(null)}
          workflowId={workflowId}
          initialConfig={editingSchedule.config}
          onSave={async (config, name, description) => {
            await updateSchedule(editingSchedule.id!, config, name, description);
            setEditingSchedule(null);
          }}
        />
      )}
    </div>
  );
} 