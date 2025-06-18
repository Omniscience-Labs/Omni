import asyncio
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from croniter import croniter
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .models import WorkflowDefinition, WorkflowTrigger, ScheduleConfig
from .executor import WorkflowExecutor
from services.supabase import DBConnection
from utils.logger import logger

class WorkflowScheduler:
    """Manages scheduled workflow executions."""
    
    def __init__(self, db: DBConnection, workflow_executor: WorkflowExecutor):
        self.db = db
        self.workflow_executor = workflow_executor
        self.scheduler = AsyncIOScheduler()
        self.scheduled_jobs = {}
        
    async def start(self):
        """Start the scheduler and load existing scheduled workflows."""
        self.scheduler.start()
        await self._load_scheduled_workflows()
        logger.info("Workflow scheduler started")
    
    async def stop(self):
        """Stop the scheduler."""
        self.scheduler.shutdown()
        logger.info("Workflow scheduler stopped")
    
    async def _load_scheduled_workflows(self):
        """Load all active scheduled workflows from the database."""
        try:
            client = await self.db.client
            result = await client.table('workflows').select('*').eq('status', 'active').execute()
            
            for workflow_data in result.data:
                definition = workflow_data.get('definition', {})
                triggers = definition.get('triggers', [])
                
                for trigger in triggers:
                    if trigger.get('type') == 'SCHEDULE':
                        workflow = self._map_db_to_workflow_definition(workflow_data)
                        await self._schedule_workflow(workflow, trigger)
                        
        except Exception as e:
            logger.error(f"Error loading scheduled workflows: {e}")
    
    async def schedule_workflow(self, workflow: WorkflowDefinition):
        """Schedule a workflow based on its triggers."""
        for trigger in workflow.triggers:
            if trigger.type == 'SCHEDULE':
                await self._schedule_workflow(workflow, trigger.model_dump())
    
    async def unschedule_workflow(self, workflow_id: str):
        """Remove a workflow from the schedule."""
        if workflow_id in self.scheduled_jobs:
            job_id = self.scheduled_jobs[workflow_id]
            try:
                self.scheduler.remove_job(job_id)
                del self.scheduled_jobs[workflow_id]
                logger.info(f"Unscheduled workflow {workflow_id}")
            except Exception as e:
                logger.error(f"Error unscheduling workflow {workflow_id}: {e}")
    
    async def _schedule_workflow(self, workflow: WorkflowDefinition, trigger_config: Dict[str, Any]):
        """Schedule a single workflow with the given trigger configuration."""
        try:
            config = trigger_config.get('config', {})
            
            if not config.get('enabled', True):
                logger.info(f"Skipping disabled schedule for workflow {workflow.id}")
                return
            
            if workflow.id in self.scheduled_jobs:
                await self.unschedule_workflow(workflow.id)

            trigger = None
            
            if config.get('cron_expression'):
                cron_expr = config['cron_expression']
                timezone_str = config.get('timezone', 'UTC')
                if croniter.is_valid(cron_expr):
                    trigger = CronTrigger.from_crontab(cron_expr, timezone=timezone_str)
                else:
                    logger.error(f"Invalid cron expression for workflow {workflow.id}: {cron_expr}")
                    return
                    
            elif config.get('interval_type') and config.get('interval_value'):
                interval_type = config['interval_type']
                interval_value = config['interval_value']
                
                kwargs = {interval_type: interval_value}
                trigger = IntervalTrigger(**kwargs)
            
            else:
                logger.error(f"No valid schedule configuration for workflow {workflow.id}")
                return
            
            job_id = f"workflow_{workflow.id}_{uuid.uuid4().hex[:8]}"
            
            job = self.scheduler.add_job(
                func=self._execute_scheduled_workflow,
                trigger=trigger,
                args=[workflow.id, workflow.project_id],
                id=job_id,
                name=f"Scheduled execution of {workflow.name}",
                max_instances=1,
                coalesce=True,
                misfire_grace_time=300
            )
            
            self.scheduled_jobs[workflow.id] = job_id
            
            try:
                next_run = job.next_run_time
            except AttributeError:
                try:
                    next_run = self.scheduler.get_job(job_id).next_run_time
                except:
                    next_run = "Unknown"
            
            logger.info(f"Scheduled workflow {workflow.name} (ID: {workflow.id}). Next run: {next_run}")
            
        except Exception as e:
            logger.error(f"Error scheduling workflow {workflow.id}: {e}")
    
    async def _execute_scheduled_workflow(self, workflow_id: str, project_id: str):
        """Execute a scheduled workflow."""
        try:
            logger.info(f"Executing scheduled workflow {workflow_id}")
            client = await self.db.client
            result = await client.table('workflows').select('*').eq('id', workflow_id).execute()
            
            if not result.data:
                logger.error(f"Scheduled workflow {workflow_id} not found")
                return
            
            workflow_data = result.data[0]
            if workflow_data.get('status') != 'active':
                logger.info(f"Skipping execution of inactive workflow {workflow_id}")
                await self.unschedule_workflow(workflow_id)
                return
            
            workflow = self._map_db_to_workflow_definition(workflow_data)
            execution_id = str(uuid.uuid4())
            execution_data = {
                "id": execution_id,
                "workflow_id": workflow_id,
                "workflow_version": workflow_data.get('version', 1),
                "workflow_name": workflow.name,
                "execution_context": {},
                "project_id": project_id,
                "account_id": workflow_data.get('account_id'),
                "triggered_by": "SCHEDULE",
                "status": "pending",
                "started_at": datetime.now(timezone.utc).isoformat()
            }
            
            await client.table('workflow_executions').insert(execution_data).execute()
            thread_id = str(uuid.uuid4())
            async for update in self.workflow_executor.execute_workflow(
                workflow=workflow,
                variables=None,
                thread_id=thread_id,
                project_id=project_id
            ):
                logger.debug(f"Scheduled workflow {workflow_id} update: {update.get('type', 'unknown')}")
            
            logger.info(f"Completed scheduled execution of workflow {workflow_id}")
            
        except Exception as e:
            logger.error(f"Error executing scheduled workflow {workflow_id}: {e}")
            try:
                client = await self.db.client
                await client.table('workflow_executions').update({
                    "status": "failed",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "error": str(e)
                }).eq('id', execution_id).execute()
            except:
                pass
    
    def _map_db_to_workflow_definition(self, data: dict) -> WorkflowDefinition:
        """Helper function to map database record to WorkflowDefinition."""
        definition = data.get('definition', {})
        return WorkflowDefinition(
            id=data['id'],
            name=data['name'],
            description=data.get('description'),
            steps=definition.get('steps', []),
            entry_point=definition.get('entry_point', ''),
            triggers=definition.get('triggers', []),
            state=data.get('status', 'draft').upper(),
            created_at=datetime.fromisoformat(data['created_at']) if data.get('created_at') else None,
            updated_at=datetime.fromisoformat(data['updated_at']) if data.get('updated_at') else None,
            created_by=data.get('created_by'),
            project_id=data['project_id'],
            agent_id=definition.get('agent_id'),
            is_template=False,
            max_execution_time=definition.get('max_execution_time', 3600),
            max_retries=definition.get('max_retries', 3)
        )
    
    async def get_scheduled_workflows(self) -> List[Dict[str, Any]]:
        """Get information about currently scheduled workflows."""
        scheduled_info = []
        
        for workflow_id, job_id in self.scheduled_jobs.items():
            try:
                job = self.scheduler.get_job(job_id)
                if job:
                    # Try to get next run time safely
                    try:
                        next_run_time = job.next_run_time.isoformat() if job.next_run_time else None
                    except AttributeError:
                        next_run_time = None
                    
                    scheduled_info.append({
                        "workflow_id": workflow_id,
                        "job_id": job_id,
                        "name": job.name,
                        "next_run_time": next_run_time,
                        "trigger": str(job.trigger)
                    })
            except Exception as e:
                logger.error(f"Error getting job info for {job_id}: {e}")
        
        return scheduled_info 