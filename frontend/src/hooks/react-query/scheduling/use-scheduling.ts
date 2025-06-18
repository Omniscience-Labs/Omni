'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getWorkflowSchedules,
  getSchedule,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  pauseSchedule,
  resumeSchedule,
  getScheduleTemplates,
  validateCronExpression,
  getScheduleLogs
} from './utils';
import { schedulingKeys } from './keys';
import { 
  ScheduleUpdateRequest 
} from '@/components/workflows/scheduling/types';

export function useWorkflowSchedules(workflowId: string) {
  return useQuery({
    queryKey: schedulingKeys.workflowSchedules(workflowId),
    queryFn: () => getWorkflowSchedules(workflowId),
    staleTime: 30 * 1000,
    enabled: !!workflowId,
  });
}

export function useSchedule(scheduleId: string) {
  return useQuery({
    queryKey: schedulingKeys.schedule(scheduleId),
    queryFn: () => getSchedule(scheduleId),
    enabled: !!scheduleId,
  });
}

export function useScheduleTemplates() {
  return useQuery({
    queryKey: schedulingKeys.templates(),
    queryFn: getScheduleTemplates,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCronValidation(expression: string) {
  return useQuery({
    queryKey: schedulingKeys.validation(expression),
    queryFn: () => validateCronExpression(expression),
    enabled: !!expression.trim(),
    staleTime: 60 * 1000,
    retry: false,
  });
}

export function useScheduleLogs(scheduleId: string, limit: number = 50) {
  return useQuery({
    queryKey: schedulingKeys.logs(scheduleId),
    queryFn: () => getScheduleLogs(scheduleId, limit),
    enabled: !!scheduleId,
    staleTime: 30 * 1000,
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSchedule,
    onSuccess: (newSchedule) => {
      queryClient.invalidateQueries({
        queryKey: schedulingKeys.workflowSchedules(newSchedule.workflow_id)
      });
      queryClient.setQueryData(
        schedulingKeys.schedule(newSchedule.id!),
        newSchedule
      );
      toast.success('Schedule created successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to create schedule');
    },
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ scheduleId, request }: { scheduleId: string; request: ScheduleUpdateRequest }) =>
      updateSchedule(scheduleId, request),
    onSuccess: (updatedSchedule) => {
      queryClient.setQueryData(
        schedulingKeys.schedule(updatedSchedule.id!),
        updatedSchedule
      );
      queryClient.invalidateQueries({
        queryKey: schedulingKeys.workflowSchedules(updatedSchedule.workflow_id)
      });
      toast.success('Schedule updated successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update schedule');
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSchedule,
    onSuccess: (_, scheduleId) => {
      queryClient.removeQueries({
        queryKey: schedulingKeys.schedule(scheduleId)
      });
      queryClient.invalidateQueries({
        queryKey: schedulingKeys.schedules()
      });
      toast.success('Schedule deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to delete schedule');
    },
  });
}

export function usePauseSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: pauseSchedule,
    onSuccess: (_, scheduleId) => {
      queryClient.invalidateQueries({
        queryKey: schedulingKeys.schedule(scheduleId)
      });
      queryClient.invalidateQueries({
        queryKey: schedulingKeys.schedules()
      });
      toast.success('Schedule paused successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to pause schedule');
    },
  });
}

export function useResumeSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: resumeSchedule,
    onSuccess: (_, scheduleId) => {
      queryClient.invalidateQueries({
        queryKey: schedulingKeys.schedule(scheduleId)
      });
      queryClient.invalidateQueries({
        queryKey: schedulingKeys.schedules()
      });
      toast.success('Schedule resumed successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to resume schedule');
    },
  });
} 