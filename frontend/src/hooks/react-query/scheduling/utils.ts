import { 
    WorkflowSchedule, 
    ScheduleCreateRequest, 
    ScheduleUpdateRequest,
    ScheduleTemplate,
    ScheduleListResponse,
    CronValidationRequest,
    CronValidationResponse,
    ScheduleExecutionLog
  } from '@/components/workflows/scheduling/types';
  
  const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  const SCHEDULING_API_URL = `${API_URL}/v1/schedules`;
  
  export async function getWorkflowSchedules(workflowId: string): Promise<ScheduleListResponse> {
    const response = await fetch(`${SCHEDULING_API_URL}?workflow_id=${workflowId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch schedules');
    }
    
    return response.json();
  }
  
  export async function getSchedule(scheduleId: string): Promise<WorkflowSchedule> {
    const response = await fetch(`${SCHEDULING_API_URL}/${scheduleId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch schedule');
    }
    
    return response.json();
  }
  
  export async function createSchedule(request: ScheduleCreateRequest): Promise<WorkflowSchedule> {
    const response = await fetch(SCHEDULING_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    
    if (!response.ok) {
      throw new Error('Failed to create schedule');
    }
    
    return response.json();
  }
  
  export async function updateSchedule(
    scheduleId: string, 
    request: ScheduleUpdateRequest
  ): Promise<WorkflowSchedule> {
    const response = await fetch(`${SCHEDULING_API_URL}/${scheduleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    
    if (!response.ok) {
      throw new Error('Failed to update schedule');
    }
    
    return response.json();
  }
  
  export async function deleteSchedule(scheduleId: string): Promise<void> {
    const response = await fetch(`${SCHEDULING_API_URL}/${scheduleId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete schedule');
    }
  }
  
  export async function pauseSchedule(scheduleId: string): Promise<void> {
    const response = await fetch(`${SCHEDULING_API_URL}/${scheduleId}/pause`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error('Failed to pause schedule');
    }
  }
  
  export async function resumeSchedule(scheduleId: string): Promise<void> {
    const response = await fetch(`${SCHEDULING_API_URL}/${scheduleId}/resume`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error('Failed to resume schedule');
    }
  }
  
  export async function getScheduleTemplates(): Promise<ScheduleTemplate[]> {
    const response = await fetch(`${SCHEDULING_API_URL}/templates`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch schedule templates');
    }
    
    return response.json();
  }
  
  export async function validateCronExpression(expression: string): Promise<CronValidationResponse> {
    const request: CronValidationRequest = {
      cron_expression: expression
    };
    
    const response = await fetch(`${SCHEDULING_API_URL}/validate/cron`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to validate cron expression: ${errorText}`);
    }
    
    return response.json();
  }
  
  export async function getScheduleLogs(
    scheduleId: string, 
    limit: number = 50
  ): Promise<ScheduleExecutionLog[]> {
    const response = await fetch(`${SCHEDULING_API_URL}/${scheduleId}/logs?limit=${limit}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch schedule logs');
    }
    
    return response.json();
  } 