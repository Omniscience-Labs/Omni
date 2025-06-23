export type ScheduleType = 'simple' | 'cron' | 'advanced';

export interface SimpleScheduleConfig {
  interval_type: 'minutes' | 'hours' | 'days' | 'weeks';
  interval_value: number;
}

export interface CronScheduleConfig {
  cron_expression: string;
}

export interface AdvancedScheduleConfig {
  cron_expression: string;
  timezone: string;
  start_date?: string;
  end_date?: string;
  max_executions?: number;
}

export interface ScheduleConfig {
  type: ScheduleType;
  enabled: boolean;
  simple?: SimpleScheduleConfig;
  cron?: CronScheduleConfig;
  advanced?: AdvancedScheduleConfig;
}

export type ScheduleStatus = 'active' | 'paused' | 'expired' | 'error';

export interface WorkflowSchedule {
  id?: string;
  workflow_id: string;
  name: string;
  description?: string;
  config: ScheduleConfig;
  status: ScheduleStatus;
  created_at?: string;
  updated_at?: string;
  last_execution?: string;
  next_execution?: string;
  execution_count: number;
  error_count: number;
  last_error?: string;
}

export interface ScheduleCreateRequest {
  workflow_id: string;
  name: string;
  description?: string;
  config: ScheduleConfig;
}

export interface ScheduleUpdateRequest {
  name?: string;
  description?: string;
  config?: ScheduleConfig;
  enabled?: boolean;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  config: ScheduleConfig;
  category: string;
}

export interface ScheduleExecutionLog {
  schedule_id: string;
  workflow_id: string;
  execution_id?: string;
  timestamp: string;
  status: 'success' | 'failure' | 'timeout';
  duration_ms?: number;
  error_message?: string;
  trigger_data?: Record<string, any>;
}

export interface CronValidationRequest {
  cron_expression: string;
}

export interface CronValidationResponse {
  valid: boolean;
  cron_expression: string;
  next_executions?: string[];
  description?: string;
  error?: string;
}

export interface ScheduleListResponse {
  schedules: WorkflowSchedule[];
  total: number;
  page: number;
  page_size: number;
} 