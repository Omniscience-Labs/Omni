"""
Trigger Manager

Handles all types of workflow triggers including webhooks, schedules, events, and polling.
"""

import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from croniter import croniter
import httpx
from fastapi import HTTPException

from .models import (
    TriggerType, TriggerConfig, WorkflowDefinition,
    WebhookRegistration, ScheduledJob, ExecutionContext
)
from services.redis import redis
from services.supabase import DBConnection
from utils.logger import logger


class TriggerManager:
    """Manages all workflow triggers"""
    
    def __init__(self, db: DBConnection):
        self.db = db
        self.webhook_registry: Dict[str, WebhookRegistration] = {}
        self.scheduled_jobs: Dict[str, ScheduledJob] = {}
        self.polling_tasks: Dict[str, asyncio.Task] = {}
        self.event_listeners: Dict[str, List[str]] = {}  # event_type -> workflow_ids
        
    async def initialize(self):
        """Initialize trigger manager and restore active triggers"""
        logger.info("Initializing trigger manager")
        
        # Load active webhooks
        await self._load_webhooks()
        
        # Load scheduled jobs
        await self._load_scheduled_jobs()
        
        # Start scheduler
        asyncio.create_task(self._scheduler_loop())
        
        # Start event listener
        asyncio.create_task(self._event_listener_loop())
        
    async def register_workflow_triggers(self, workflow: WorkflowDefinition):
        """Register all triggers for a workflow"""
        for trigger in workflow.triggers:
            if not trigger.enabled:
                continue
                
            if trigger.type == TriggerType.WEBHOOK:
                await self._register_webhook(workflow.id, trigger)
            elif trigger.type == TriggerType.SCHEDULE:
                await self._register_schedule(workflow.id, trigger)
            elif trigger.type == TriggerType.EVENT:
                await self._register_event_listener(workflow.id, trigger)
            elif trigger.type == TriggerType.POLLING:
                await self._register_polling(workflow.id, trigger)
                
    async def unregister_workflow_triggers(self, workflow_id: str):
        """Unregister all triggers for a workflow"""
        # Remove webhooks
        webhooks_to_remove = [
            webhook_id for webhook_id, webhook in self.webhook_registry.items()
            if webhook.workflow_id == workflow_id
        ]
        for webhook_id in webhooks_to_remove:
            await self._unregister_webhook(webhook_id)
            
        # Remove scheduled jobs
        jobs_to_remove = [
            job_id for job_id, job in self.scheduled_jobs.items()
            if job.workflow_id == workflow_id
        ]
        for job_id in jobs_to_remove:
            await self._unregister_schedule(job_id)
            
        # Cancel polling tasks
        tasks_to_cancel = [
            task_id for task_id in self.polling_tasks
            if task_id.startswith(f"{workflow_id}:")
        ]
        for task_id in tasks_to_cancel:
            await self._cancel_polling(task_id)
            
    async def handle_webhook(self, path: str, method: str, headers: Dict[str, str], 
                           body: Any) -> Dict[str, Any]:
        """Handle incoming webhook request"""
        # Find matching webhook
        webhook = None
        for w in self.webhook_registry.values():
            if w.path == path and w.method == method and w.is_active:
                webhook = w
                break
                
        if not webhook:
            raise HTTPException(status_code=404, detail="Webhook not found")
            
        # Validate webhook signature if configured
        if webhook.secret:
            signature = headers.get("x-webhook-signature", "")
            expected_signature = hmac.new(
                webhook.secret.encode(),
                json.dumps(body).encode() if isinstance(body, dict) else str(body).encode(),
                hashlib.sha256
            ).hexdigest()
            
            if not hmac.compare_digest(signature, expected_signature):
                raise HTTPException(status_code=401, detail="Invalid webhook signature")
                
        # Validate headers if configured
        if webhook.headers_validation:
            for header, expected_value in webhook.headers_validation.items():
                if headers.get(header) != expected_value:
                    raise HTTPException(status_code=400, detail=f"Invalid header: {header}")
                    
        # Create execution context
        context = ExecutionContext(
            workflow_id=webhook.workflow_id,
            workflow_version=1,  # TODO: Get actual version
            trigger_type=TriggerType.WEBHOOK,
            trigger_data={
                "webhook_id": webhook.id,
                "path": path,
                "method": method,
                "headers": dict(headers),
                "body": body
            }
        )
        
        # Queue workflow execution
        await self._queue_workflow_execution(webhook.workflow_id, context)
        
        # Update webhook stats
        webhook.last_triggered = datetime.now(timezone.utc)
        webhook.trigger_count += 1
        await self._update_webhook_stats(webhook)
        
        return {
            "status": "accepted",
            "execution_id": context.execution_id,
            "workflow_id": webhook.workflow_id
        }
        
    async def trigger_manual(self, workflow_id: str, user_id: str, 
                           input_data: Optional[Dict[str, Any]] = None) -> str:
        """Manually trigger a workflow"""
        context = ExecutionContext(
            workflow_id=workflow_id,
            workflow_version=1,  # TODO: Get actual version
            trigger_type=TriggerType.MANUAL,
            trigger_data={
                "user_id": user_id,
                "input": input_data or {}
            }
        )
        
        await self._queue_workflow_execution(workflow_id, context)
        return context.execution_id
        
    async def _register_webhook(self, workflow_id: str, trigger: TriggerConfig):
        """Register a webhook trigger"""
        # Generate unique webhook path if not provided
        if not trigger.webhook_path:
            trigger.webhook_path = f"/webhooks/{workflow_id}/{hashlib.sha256(workflow_id.encode()).hexdigest()[:16]}"
            
        # Generate webhook secret if not provided
        if not trigger.webhook_secret:
            trigger.webhook_secret = hashlib.sha256(f"{workflow_id}:{datetime.utcnow()}".encode()).hexdigest()
            
        webhook = WebhookRegistration(
            workflow_id=workflow_id,
            trigger_id=str(trigger.type),
            path=trigger.webhook_path,
            secret=trigger.webhook_secret,
            method=trigger.webhook_method or "POST"
        )
        
        # Store in database
        client = await self.db.client
        await client.table('webhook_registrations').insert({
            "id": webhook.id,
            "workflow_id": webhook.workflow_id,
            "trigger_id": webhook.trigger_id,
            "path": webhook.path,
            "secret": webhook.secret,
            "method": webhook.method,
            "is_active": webhook.is_active,
            "created_at": webhook.created_at.isoformat()
        }).execute()
        
        # Add to registry
        self.webhook_registry[webhook.id] = webhook
        
        logger.info(f"Registered webhook for workflow {workflow_id} at {webhook.path}")
        
    async def _register_schedule(self, workflow_id: str, trigger: TriggerConfig):
        """Register a scheduled trigger"""
        if not trigger.schedule:
            raise ValueError("Schedule trigger requires cron expression")
            
        # Validate cron expression
        try:
            cron = croniter(trigger.schedule)
        except Exception as e:
            raise ValueError(f"Invalid cron expression: {e}")
            
        job = ScheduledJob(
            workflow_id=workflow_id,
            trigger_id=str(trigger.type),
            cron_expression=trigger.schedule,
            timezone=trigger.timezone or "UTC",
            next_run=cron.get_next(datetime)
        )
        
        # Store in database
        client = await self.db.client
        await client.table('scheduled_jobs').insert({
            "id": job.id,
            "workflow_id": job.workflow_id,
            "trigger_id": job.trigger_id,
            "cron_expression": job.cron_expression,
            "timezone": job.timezone,
            "is_active": job.is_active,
            "next_run": job.next_run.isoformat() if job.next_run else None
        }).execute()
        
        # Add to registry
        self.scheduled_jobs[job.id] = job
        
        logger.info(f"Registered schedule for workflow {workflow_id}: {job.cron_expression}")
        
    async def _register_event_listener(self, workflow_id: str, trigger: TriggerConfig):
        """Register an event listener"""
        if not trigger.event_type:
            raise ValueError("Event trigger requires event type")
            
        # Add to event listeners
        if trigger.event_type not in self.event_listeners:
            self.event_listeners[trigger.event_type] = []
            
        if workflow_id not in self.event_listeners[trigger.event_type]:
            self.event_listeners[trigger.event_type].append(workflow_id)
            
        # Store in Redis for persistence
        await redis.sadd(f"event_listeners:{trigger.event_type}", workflow_id)
        
        logger.info(f"Registered event listener for workflow {workflow_id}: {trigger.event_type}")
        
    async def _register_polling(self, workflow_id: str, trigger: TriggerConfig):
        """Register a polling trigger"""
        if not trigger.polling_url or not trigger.polling_interval:
            raise ValueError("Polling trigger requires URL and interval")
            
        task_id = f"{workflow_id}:{trigger.polling_url}"
        
        # Cancel existing task if any
        if task_id in self.polling_tasks:
            self.polling_tasks[task_id].cancel()
            
        # Create polling task
        task = asyncio.create_task(
            self._polling_loop(workflow_id, trigger)
        )
        self.polling_tasks[task_id] = task
        
        logger.info(f"Started polling for workflow {workflow_id}: {trigger.polling_url}")
        
    async def _scheduler_loop(self):
        """Main scheduler loop for cron jobs"""
        while True:
            try:
                now = datetime.now(timezone.utc)
                
                # Check all scheduled jobs
                for job in list(self.scheduled_jobs.values()):
                    if not job.is_active or not job.next_run:
                        continue
                        
                    if job.next_run <= now:
                        # Execute job
                        asyncio.create_task(self._execute_scheduled_job(job))
                        
                        # Calculate next run
                        cron = croniter(job.cron_expression, now)
                        job.next_run = cron.get_next(datetime)
                        job.last_run = now
                        job.run_count += 1
                        
                        # Update in database
                        await self._update_scheduled_job(job)
                        
                await asyncio.sleep(60)  # Check every minute
                
            except Exception as e:
                logger.error(f"Error in scheduler loop: {e}")
                await asyncio.sleep(60)
                
    async def _event_listener_loop(self):
        """Listen for events from Redis pub/sub"""
        pubsub = await redis.create_pubsub()
        await pubsub.subscribe("workflow_events")
        
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    await self._handle_event(message["data"])
        except Exception as e:
            logger.error(f"Error in event listener loop: {e}")
        finally:
            await pubsub.close()
            
    async def _polling_loop(self, workflow_id: str, trigger: TriggerConfig):
        """Polling loop for a specific trigger"""
        last_response = None
        
        while True:
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        trigger.polling_url,
                        headers=trigger.polling_headers or {}
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        
                        # Check if data has changed
                        if data != last_response:
                            context = ExecutionContext(
                                workflow_id=workflow_id,
                                workflow_version=1,
                                trigger_type=TriggerType.POLLING,
                                trigger_data={
                                    "url": trigger.polling_url,
                                    "response": data,
                                    "status_code": response.status_code
                                }
                            )
                            
                            await self._queue_workflow_execution(workflow_id, context)
                            last_response = data
                            
                await asyncio.sleep(trigger.polling_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in polling loop for {workflow_id}: {e}")
                await asyncio.sleep(trigger.polling_interval)
                
    async def _execute_scheduled_job(self, job: ScheduledJob):
        """Execute a scheduled job"""
        try:
            context = ExecutionContext(
                workflow_id=job.workflow_id,
                workflow_version=1,
                trigger_type=TriggerType.SCHEDULE,
                trigger_data={
                    "job_id": job.id,
                    "cron_expression": job.cron_expression,
                    "scheduled_time": job.next_run.isoformat() if job.next_run else None
                }
            )
            
            await self._queue_workflow_execution(job.workflow_id, context)
            job.consecutive_failures = 0
            
        except Exception as e:
            logger.error(f"Error executing scheduled job {job.id}: {e}")
            job.consecutive_failures += 1
            
            # Disable job if too many failures
            if job.consecutive_failures >= job.max_consecutive_failures:
                job.is_active = False
                logger.error(f"Disabled scheduled job {job.id} due to repeated failures")
                
    async def _handle_event(self, event_data: bytes):
        """Handle an event from the event bus"""
        try:
            event = json.loads(event_data)
            event_type = event.get("type")
            
            if event_type in self.event_listeners:
                for workflow_id in self.event_listeners[event_type]:
                    context = ExecutionContext(
                        workflow_id=workflow_id,
                        workflow_version=1,
                        trigger_type=TriggerType.EVENT,
                        trigger_data=event
                    )
                    
                    await self._queue_workflow_execution(workflow_id, context)
                    
        except Exception as e:
            logger.error(f"Error handling event: {e}")
            
    async def _queue_workflow_execution(self, workflow_id: str, context: ExecutionContext):
        """Queue a workflow for execution"""
        # Store execution context in Redis
        await redis.set(
            f"workflow_execution:{context.execution_id}",
            context.json(),
            ex=86400  # 24 hours
        )
        
        # Queue for execution
        await redis.lpush("workflow_execution_queue", json.dumps({
            "workflow_id": workflow_id,
            "execution_id": context.execution_id,
            "priority": 1  # TODO: Implement priority
        }))
        
        logger.info(f"Queued workflow {workflow_id} for execution: {context.execution_id}")
        
    async def _load_webhooks(self):
        """Load active webhooks from database"""
        client = await self.db.client
        result = await client.table('webhook_registrations').select('*').eq('is_active', True).execute()
        
        for row in result.data:
            webhook = WebhookRegistration(**row)
            self.webhook_registry[webhook.id] = webhook
            
        logger.info(f"Loaded {len(self.webhook_registry)} active webhooks")
        
    async def _load_scheduled_jobs(self):
        """Load active scheduled jobs from database"""
        client = await self.db.client
        result = await client.table('scheduled_jobs').select('*').eq('is_active', True).execute()
        
        for row in result.data:
            job = ScheduledJob(**row)
            self.scheduled_jobs[job.id] = job
            
        logger.info(f"Loaded {len(self.scheduled_jobs)} active scheduled jobs")
        
    async def _update_webhook_stats(self, webhook: WebhookRegistration):
        """Update webhook statistics in database"""
        client = await self.db.client
        await client.table('webhook_registrations').update({
            "last_triggered": webhook.last_triggered.isoformat(),
            "trigger_count": webhook.trigger_count
        }).eq("id", webhook.id).execute()
        
    async def _update_scheduled_job(self, job: ScheduledJob):
        """Update scheduled job in database"""
        client = await self.db.client
        await client.table('scheduled_jobs').update({
            "last_run": job.last_run.isoformat() if job.last_run else None,
            "next_run": job.next_run.isoformat() if job.next_run else None,
            "run_count": job.run_count,
            "consecutive_failures": job.consecutive_failures,
            "is_active": job.is_active
        }).eq("id", job.id).execute()
        
    async def _unregister_webhook(self, webhook_id: str):
        """Unregister a webhook"""
        if webhook_id in self.webhook_registry:
            webhook = self.webhook_registry[webhook_id]
            webhook.is_active = False
            
            # Update in database
            client = await self.db.client
            await client.table('webhook_registrations').update({
                "is_active": False
            }).eq("id", webhook_id).execute()
            
            del self.webhook_registry[webhook_id]
            
    async def _unregister_schedule(self, job_id: str):
        """Unregister a scheduled job"""
        if job_id in self.scheduled_jobs:
            job = self.scheduled_jobs[job_id]
            job.is_active = False
            
            # Update in database
            client = await self.db.client
            await client.table('scheduled_jobs').update({
                "is_active": False
            }).eq("id", job_id).execute()
            
            del self.scheduled_jobs[job_id]
            
    async def _cancel_polling(self, task_id: str):
        """Cancel a polling task"""
        if task_id in self.polling_tasks:
            self.polling_tasks[task_id].cancel()
            del self.polling_tasks[task_id] 