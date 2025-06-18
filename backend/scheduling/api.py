from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Request
from typing import List, Optional
import logging
from datetime import datetime, timezone
import uuid

from .models import (
    WorkflowSchedule, ScheduleCreateRequest, ScheduleUpdateRequest,
    ScheduleListResponse, ScheduleTemplate, SCHEDULE_TEMPLATES,
    ScheduleExecutionLog, CronValidationRequest, CronValidationResponse
)
from .qstash_service import QStashService
from workflows.executor import WorkflowExecutor
from services.supabase import DBConnection

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/schedules", tags=["schedules"])

db = DBConnection()
workflow_executor = WorkflowExecutor(db)

def get_qstash_service() -> QStashService:
    return QStashService()

def get_workflow_executor() -> WorkflowExecutor:
    return workflow_executor


@router.post("/", response_model=WorkflowSchedule)
async def create_schedule(
    request: ScheduleCreateRequest,
    qstash_service: QStashService = Depends(get_qstash_service)
):
    """Create a new workflow schedule"""
    try:
        schedule = await qstash_service.create_schedule(request)
        logger.info(f"Created schedule {schedule.id} for workflow {schedule.workflow_id}")
        return schedule
    except Exception as e:
        logger.error(f"Failed to create schedule: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=ScheduleListResponse)
async def list_schedules(
    workflow_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    qstash_service: QStashService = Depends(get_qstash_service)
):
    """List workflow schedules with optional filtering"""
    try:
        if page < 1:
            page = 1
        if page_size < 1 or page_size > 100:
            page_size = 20
        
        all_schedules = await qstash_service.list_schedules(workflow_id)
        
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        schedules = all_schedules[start_idx:end_idx]
        
        return ScheduleListResponse(
            schedules=schedules,
            total=len(all_schedules),
            page=page,
            page_size=page_size
        )
    except Exception as e:
        logger.error(f"Failed to list schedules: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/templates", response_model=List[ScheduleTemplate])
async def get_schedule_templates():
    """Get predefined schedule templates"""
    return SCHEDULE_TEMPLATES


@router.get("/{schedule_id}", response_model=WorkflowSchedule)
async def get_schedule(
    schedule_id: str,
    qstash_service: QStashService = Depends(get_qstash_service)
):
    """Get a specific schedule by ID"""
    try:
        schedule = await qstash_service.get_schedule(schedule_id)
        if not schedule:
            raise HTTPException(status_code=404, detail="Schedule not found")
        return schedule
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get schedule {schedule_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{schedule_id}", response_model=WorkflowSchedule)
async def update_schedule(
    schedule_id: str,
    request: ScheduleUpdateRequest,
    qstash_service: QStashService = Depends(get_qstash_service)
):
    """Update an existing schedule"""
    try:
        schedule = await qstash_service.update_schedule(schedule_id, request)
        logger.info(f"Updated schedule {schedule_id}")
        return schedule
    except Exception as e:
        logger.error(f"Failed to update schedule {schedule_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{schedule_id}")
async def delete_schedule(
    schedule_id: str,
    qstash_service: QStashService = Depends(get_qstash_service)
):
    """Delete a schedule"""
    try:
        success = await qstash_service.delete_schedule(schedule_id)
        if not success:
            raise HTTPException(status_code=404, detail="Schedule not found or could not be deleted")
        
        logger.info(f"Deleted schedule {schedule_id}")
        return {"message": "Schedule deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete schedule {schedule_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{schedule_id}/pause")
async def pause_schedule(
    schedule_id: str,
    qstash_service: QStashService = Depends(get_qstash_service)
):
    """Pause a schedule"""
    try:
        success = await qstash_service.pause_schedule(schedule_id)
        if not success:
            raise HTTPException(status_code=404, detail="Schedule not found or could not be paused")
        
        logger.info(f"Paused schedule {schedule_id}")
        return {"message": "Schedule paused successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to pause schedule {schedule_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{schedule_id}/resume")
async def resume_schedule(
    schedule_id: str,
    qstash_service: QStashService = Depends(get_qstash_service)
):
    """Resume a paused schedule"""
    try:
        success = await qstash_service.resume_schedule(schedule_id)
        if not success:
            raise HTTPException(status_code=404, detail="Schedule not found or could not be resumed")
        
        logger.info(f"Resumed schedule {schedule_id}")
        return {"message": "Schedule resumed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to resume schedule {schedule_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{schedule_id}/logs", response_model=List[ScheduleExecutionLog])
async def get_schedule_logs(
    schedule_id: str,
    limit: int = 50,
    qstash_service: QStashService = Depends(get_qstash_service)
):
    """Get execution logs for a schedule"""
    try:
        if limit < 1 or limit > 1000:
            limit = 50
        
        logs = await qstash_service.get_schedule_logs(schedule_id, limit)
        return logs
    except Exception as e:
        logger.error(f"Failed to get logs for schedule {schedule_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/trigger/{workflow_id}")
async def trigger_scheduled_workflow(
    workflow_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    workflow_executor: WorkflowExecutor = Depends(get_workflow_executor)
):
    """Webhook endpoint for QStash to trigger scheduled workflows"""
    try:
        logger.info(f"Received scheduled trigger for workflow {workflow_id}")

        headers = dict(request.headers)
        try:
            body = await request.json()
        except Exception:
            body = {}
        
        if not headers.get("x-workflow-schedule"):
            logger.warning(f"Received non-schedule trigger for workflow {workflow_id}")
        
        schedule_name = headers.get("x-schedule-name", "Unknown Schedule")
        schedule_description = headers.get("x-schedule-description", "")
        
        logger.info(f"Triggering workflow {workflow_id} from schedule '{schedule_name}'")
        trigger_data = {
            "trigger_type": "SCHEDULE",
            "schedule_name": schedule_name,
            "schedule_description": schedule_description,
            "triggered_at": datetime.utcnow().isoformat(),
            "qstash_headers": headers,
            "payload": body
        }
        
        background_tasks.add_task(
            execute_scheduled_workflow,
            workflow_executor,
            workflow_id,
            trigger_data
        )
        
        return {
            "message": "Workflow scheduled for execution",
            "workflow_id": workflow_id,
            "trigger_type": "SCHEDULE",
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Failed to trigger scheduled workflow {workflow_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trigger/{workflow_id}")
async def test_scheduled_workflow(workflow_id: str):
    """Test endpoint for scheduled workflow triggers (for debugging)"""
    return {
        "message": "Schedule trigger endpoint is working",
        "workflow_id": workflow_id,
        "timestamp": datetime.utcnow().isoformat()
    }


async def execute_scheduled_workflow(
    workflow_executor: WorkflowExecutor,
    workflow_id: str,
    trigger_data: dict
):
    """Execute a workflow triggered by a schedule using background worker"""
    try:
        logger.info(f"Scheduling background execution for workflow {workflow_id}")

        # First, we need to fetch the workflow definition from the database
        client = await db.client
        result = await client.table('workflows').select('*').eq('id', workflow_id).execute()
        
        if not result.data:
            logger.error(f"Workflow {workflow_id} not found in database")
            return
        
        # Convert database record to WorkflowDefinition
        from workflows.api import _map_db_to_workflow_definition
        workflow_data = result.data[0]
        workflow = _map_db_to_workflow_definition(workflow_data)
        
        logger.info(f"Loaded workflow: {workflow.name} (ID: {workflow.id})")
        
        # Extract variables from trigger data if any
        variables = trigger_data.get('payload', {})
        if not isinstance(variables, dict):
            variables = {}
        
        # Add trigger metadata to variables
        variables.update({
            'trigger_type': trigger_data.get('trigger_type', 'SCHEDULE'),
            'schedule_name': trigger_data.get('schedule_name', 'Unknown'),
            'triggered_at': trigger_data.get('triggered_at')
        })
        
        # Create workflow execution record
        execution_id = str(uuid.uuid4())
        execution_data = {
            "id": execution_id,
            "workflow_id": workflow_id,
            "workflow_version": getattr(workflow, 'version', 1),
            "workflow_name": workflow.name,
            "execution_context": variables,
            "project_id": workflow.project_id,
            "account_id": workflow.created_by,
            "triggered_by": "SCHEDULE",
            "status": "pending",
            "started_at": datetime.now(timezone.utc).isoformat()
        }
        
        await client.table('workflow_executions').insert(execution_data).execute()
        logger.info(f"Created workflow execution record: {execution_id}")
        
        # Generate thread_id for execution
        thread_id = str(uuid.uuid4())
        
        # Create thread first (required for agent_runs foreign key)
        from workflows.api import _create_workflow_thread_for_api
        await _create_workflow_thread_for_api(thread_id, workflow.project_id, workflow, variables)
        logger.info(f"Created workflow thread: {thread_id}")
        
        # Create agent run record for frontend streaming compatibility
        agent_run = await client.table('agent_runs').insert({
            "thread_id": thread_id,
            "status": "running", 
            "started_at": datetime.now(timezone.utc).isoformat()
        }).execute()
        agent_run_id = agent_run.data[0]['id']
        logger.info(f"Created agent run for scheduled workflow: {agent_run_id}")
        
        # Prepare workflow definition for background worker
        if hasattr(workflow, 'model_dump'):
            workflow_dict = workflow.model_dump(mode='json')
        else:
            workflow_dict = workflow.dict()
            # Handle datetime serialization
            if 'created_at' in workflow_dict and workflow_dict['created_at']:
                workflow_dict['created_at'] = workflow_dict['created_at'].isoformat()
            if 'updated_at' in workflow_dict and workflow_dict['updated_at']:
                workflow_dict['updated_at'] = workflow_dict['updated_at'].isoformat()
        
        # Send workflow to background worker
        from run_workflow_background import run_workflow_background
        run_workflow_background.send(
            execution_id=execution_id,
            workflow_id=workflow_id,
            workflow_name=workflow.name,
            workflow_definition=workflow_dict,
            variables=variables,
            triggered_by="SCHEDULE",
            project_id=workflow.project_id,
            thread_id=thread_id,
            agent_run_id=agent_run_id
        )
        
        logger.info(f"Scheduled workflow {workflow_id} sent to background worker (execution_id: {execution_id})")
        
    except Exception as e:
        logger.error(f"Failed to schedule workflow {workflow_id} for background execution: {e}")
        # Don't raise the exception to avoid 500 errors for QStash webhook
        # QStash will retry failed webhooks, but we don't want to retry missing workflows


@router.post("/validate/cron", response_model=CronValidationResponse)
async def validate_cron_expression(request: CronValidationRequest):
    """Validate a cron expression and return next execution times"""
    try:
        import croniter
        from datetime import datetime, timezone
        
        # Validate the cron expression
        base_time = datetime.now(timezone.utc)
        cron = croniter.croniter(request.cron_expression, base_time)
        
        # Get next 5 execution times
        next_executions = []
        for _ in range(5):
            next_time = cron.get_next(datetime)
            next_executions.append(next_time.isoformat())
        
        return CronValidationResponse(
            valid=True,
            cron_expression=request.cron_expression,
            next_executions=next_executions,
            description=describe_cron_expression(request.cron_expression)
        )
        
    except Exception as e:
        return CronValidationResponse(
            valid=False,
            cron_expression=request.cron_expression,
            error=str(e)
        )


def describe_cron_expression(cron_expression: str) -> str:
    """Generate a human-readable description of a cron expression"""
    try:
        parts = cron_expression.split()
        if len(parts) != 5:
            return "Custom cron expression"
        
        minute, hour, day, month, weekday = parts
        
        descriptions = []
        
        if minute == "*":
            descriptions.append("every minute")
        elif minute.startswith("*/"):
            interval = minute[2:]
            descriptions.append(f"every {interval} minutes")
        elif minute.isdigit():
            descriptions.append(f"at minute {minute}")
        
        if hour == "*":
            if "every minute" not in descriptions:
                descriptions.append("every hour")
        elif hour.startswith("*/"):
            interval = hour[2:]
            descriptions.append(f"every {interval} hours")
        elif hour.isdigit():
            descriptions.append(f"at {hour}:00")
        
        if day != "*":
            if day.startswith("*/"):
                interval = day[2:]
                descriptions.append(f"every {interval} days")
            elif day.isdigit():
                descriptions.append(f"on day {day} of the month")
        
        if weekday != "*":
            weekday_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
            if weekday.isdigit():
                day_name = weekday_names[int(weekday)]
                descriptions.append(f"on {day_name}")
            elif "-" in weekday:
                start, end = weekday.split("-")
                start_name = weekday_names[int(start)]
                end_name = weekday_names[int(end)]
                descriptions.append(f"from {start_name} to {end_name}")
        
        if descriptions:
            return "Runs " + ", ".join(descriptions)
        else:
            return "Custom schedule"
            
    except Exception:
        return "Custom cron expression"


@router.post("/cleanup/orphaned-schedules")
async def cleanup_orphaned_schedules(
    qstash_service: QStashService = Depends(get_qstash_service)
):
    """Clean up QStash schedules that point to deleted workflows"""
    try:
        logger.info("Starting cleanup of orphaned QStash schedules")
        
        # Get all QStash schedules
        all_schedules = await qstash_service.list_schedules()
        logger.info(f"Found {len(all_schedules)} total schedules in QStash")
        
        # Get all existing workflow IDs from database
        client = await db.client
        workflows_result = await client.table('workflows').select('id').execute()
        existing_workflow_ids = {w['id'] for w in workflows_result.data}
        logger.info(f"Found {len(existing_workflow_ids)} workflows in database")
        
        orphaned_schedules = []
        for schedule in all_schedules:
            if schedule.workflow_id not in existing_workflow_ids:
                orphaned_schedules.append(schedule)
        
        logger.info(f"Found {len(orphaned_schedules)} orphaned schedules")
        
        # Delete orphaned schedules
        deleted_count = 0
        for schedule in orphaned_schedules:
            try:
                success = await qstash_service.delete_schedule(schedule.id)
                if success:
                    deleted_count += 1
                    logger.info(f"Deleted orphaned schedule {schedule.id} for workflow {schedule.workflow_id}")
                else:
                    logger.warning(f"Failed to delete orphaned schedule {schedule.id}")
            except Exception as e:
                logger.error(f"Error deleting orphaned schedule {schedule.id}: {e}")
        
        return {
            "message": "Cleanup completed",
            "total_schedules": len(all_schedules),
            "orphaned_found": len(orphaned_schedules),
            "deleted": deleted_count
        }
        
    except Exception as e:
        logger.error(f"Failed to cleanup orphaned schedules: {e}")
        raise HTTPException(status_code=500, detail=str(e)) 