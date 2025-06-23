export const schedulingKeys = {
  all: ['scheduling'] as const,
  schedules: () => [...schedulingKeys.all, 'schedules'] as const,
  schedule: (id: string) => [...schedulingKeys.schedules(), id] as const,
  workflowSchedules: (workflowId: string) => [...schedulingKeys.schedules(), 'workflow', workflowId] as const,
  templates: () => [...schedulingKeys.all, 'templates'] as const,
  validation: (expression: string) => [...schedulingKeys.all, 'validation', expression] as const,
  logs: (scheduleId: string) => [...schedulingKeys.all, 'logs', scheduleId] as const,
}; 