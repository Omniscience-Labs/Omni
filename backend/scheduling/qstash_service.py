import os
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import httpx
from qstash import QStash
from .models import (
    WorkflowSchedule, ScheduleConfig, ScheduleStatus,
    ScheduleCreateRequest, ScheduleUpdateRequest,
    ScheduleExecutionLog
)

logger = logging.getLogger(__name__)


class QStashService:
    """Service for managing workflow schedules with Upstash QStash"""
    
    def __init__(self):
        self.qstash_token = os.getenv("QSTASH_TOKEN")
        if not self.qstash_token:
            raise ValueError("QSTASH_TOKEN environment variable is required")
        
        self.client = QStash(self.qstash_token)
        self.base_url = os.getenv("BACKEND_URL", "https://14ce-2401-4900-1c00-1334-6ca8-8fb8-19ca-2ccd.ngrok-free.app")
        self.webhook_endpoint = f"{self.base_url}/api/v1/schedules/trigger"

        logger.info(f"QStash service initialized with webhook endpoint: {self.webhook_endpoint}")
    
    async def create_schedule(self, request: ScheduleCreateRequest) -> WorkflowSchedule:
        """Create a new schedule in QStash"""
        try:
            cron_expression = request.config.get_cron_expression()
            schedule_timezone = request.config.get_timezone()
            
            destination_url = f"{self.webhook_endpoint}/{request.workflow_id}"

            schedule_response = await self._create_qstash_schedule(
                destination=destination_url,
                cron=cron_expression,
                body={
                    "workflow_id": request.workflow_id, 
                    "trigger_type": "SCHEDULE",
                    "schedule_name": request.name,
                    "schedule_description": request.description or ""
                }
            )
            
            schedule_id = schedule_response.get("scheduleId")
            if not schedule_id:
                raise ValueError("Failed to get schedule ID from QStash response")
            
            schedule = WorkflowSchedule(
                id=schedule_id,
                workflow_id=request.workflow_id,
                name=request.name,
                description=request.description,
                config=request.config,
                status=ScheduleStatus.ACTIVE if request.config.enabled else ScheduleStatus.PAUSED,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )
            
            schedule.next_execution = self._calculate_next_execution(cron_expression)
            
            logger.info(f"Created schedule {schedule_id} for workflow {request.workflow_id}")
            return schedule
            
        except Exception as e:
            logger.error(f"Failed to create schedule: {e}")
            raise
    
    async def update_schedule(self, schedule_id: str, request: ScheduleUpdateRequest) -> WorkflowSchedule:
        """Update an existing schedule"""
        try:
            current_schedule = await self.get_schedule(schedule_id)
            if not current_schedule:
                raise ValueError(f"Schedule {schedule_id} not found")
            
            updated_config = request.config if request.config else current_schedule.config
            updated_name = request.name if request.name else current_schedule.name
            updated_description = request.description if request.description is not None else current_schedule.description
            
            if request.config:
                cron_expression = updated_config.get_cron_expression()
                destination_url = f"{self.webhook_endpoint}/{current_schedule.workflow_id}"
                
                await self._delete_qstash_schedule(schedule_id)
                
                schedule_response = await self._create_qstash_schedule(
                    destination=destination_url,
                    cron=cron_expression,
                    body={
                        "workflow_id": current_schedule.workflow_id, 
                        "trigger_type": "SCHEDULE",
                        "schedule_name": updated_name,
                        "schedule_description": updated_description or ""
                    },
                    schedule_id=schedule_id
                )
                
                new_schedule_id = schedule_response.get("scheduleId", schedule_id)
            else:
                new_schedule_id = schedule_id
            
            if request.enabled is not None:
                if request.enabled:
                    await self._resume_qstash_schedule(new_schedule_id)
                else:
                    await self._pause_qstash_schedule(new_schedule_id)
            
            updated_schedule = WorkflowSchedule(
                id=new_schedule_id,
                workflow_id=current_schedule.workflow_id,
                name=updated_name,
                description=updated_description,
                config=updated_config,
                status=ScheduleStatus.ACTIVE if updated_config.enabled else ScheduleStatus.PAUSED,
                created_at=current_schedule.created_at,
                updated_at=datetime.now(timezone.utc),
                execution_count=current_schedule.execution_count,
                error_count=current_schedule.error_count,
                last_execution=current_schedule.last_execution,
                last_error=current_schedule.last_error
            )
            
            if updated_config.enabled:
                updated_schedule.next_execution = self._calculate_next_execution(
                    updated_config.get_cron_expression()
                )
            
            logger.info(f"Updated schedule {new_schedule_id}")
            return updated_schedule
            
        except Exception as e:
            logger.error(f"Failed to update schedule {schedule_id}: {e}")
            raise
    
    async def delete_schedule(self, schedule_id: str) -> bool:
        """Delete a schedule from QStash"""
        try:
            await self._delete_qstash_schedule(schedule_id)
            logger.info(f"Deleted schedule {schedule_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete schedule {schedule_id}: {e}")
            return False
    
    async def get_schedule(self, schedule_id: str) -> Optional[WorkflowSchedule]:
        """Get a schedule by ID from QStash"""
        try:
            schedules = await self.list_schedules()
            for schedule in schedules:
                if schedule.id == schedule_id:
                    return schedule
            return None
        except Exception as e:
            logger.error(f"Failed to get schedule {schedule_id}: {e}")
            return None
    
    async def list_schedules(self, workflow_id: Optional[str] = None) -> List[WorkflowSchedule]:
        """List all schedules, optionally filtered by workflow_id"""
        try:
            schedules_data = await self._list_qstash_schedules()
            schedules = []
            
            for schedule_data in schedules_data:
                schedule = self._parse_qstash_schedule(schedule_data)
                if schedule and (not workflow_id or schedule.workflow_id == workflow_id):
                    schedules.append(schedule)
            
            return schedules
        except Exception as e:
            logger.error(f"Failed to list schedules: {e}")
            return []
    
    async def pause_schedule(self, schedule_id: str) -> bool:
        """Pause a schedule"""
        try:
            await self._pause_qstash_schedule(schedule_id)
            logger.info(f"Paused schedule {schedule_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to pause schedule {schedule_id}: {e}")
            return False
    
    async def resume_schedule(self, schedule_id: str) -> bool:
        """Resume a paused schedule"""
        try:
            await self._resume_qstash_schedule(schedule_id)
            logger.info(f"Resumed schedule {schedule_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to resume schedule {schedule_id}: {e}")
            return False
    
    async def get_schedule_logs(self, schedule_id: str, limit: int = 50) -> List[ScheduleExecutionLog]:
        """Get execution logs for a schedule"""
        try:
            logger.info(f"Getting logs for schedule {schedule_id} (limit: {limit})")
            return []
        except Exception as e:
            logger.error(f"Failed to get logs for schedule {schedule_id}: {e}")
            return []
    
    async def _create_qstash_schedule(
        self, 
        destination: str, 
        cron: str, 
        body: Optional[Dict[str, Any]] = None,
        schedule_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a schedule using QStash API"""
        try:
            schedule_data = {
                "destination": destination,
                "cron": cron,
            }
            
            if schedule_id:
                schedule_data["schedule_id"] = schedule_id
            
            if body:
                import json
                schedule_data["body"] = json.dumps(body)
            
            response = self.client.schedule.create(**schedule_data)
            return {"scheduleId": response}
        except Exception as e:  
            logger.error(f"QStash schedule creation failed: {e}")
            raise
    
    async def _delete_qstash_schedule(self, schedule_id: str):
        """Delete a schedule from QStash"""
        try:
            self.client.schedule.delete(schedule_id)
        except Exception as e:
            logger.error(f"QStash schedule deletion failed: {e}")
            raise
    
    async def _pause_qstash_schedule(self, schedule_id: str):
        """Pause a schedule in QStash"""
        try:
            self.client.schedule.pause(schedule_id)
        except Exception as e:
            logger.error(f"QStash schedule pause failed: {e}")
            raise
    
    async def _resume_qstash_schedule(self, schedule_id: str):
        """Resume a schedule in QStash"""
        try:
            self.client.schedule.resume(schedule_id)
        except Exception as e:
            logger.error(f"QStash schedule resume failed: {e}")
            raise
    
    async def _list_qstash_schedules(self) -> List[Dict[str, Any]]:
        """List all schedules from QStash"""
        try:
            schedules = self.client.schedule.list()
            return schedules if isinstance(schedules, list) else []
        except Exception as e:
            logger.error(f"QStash schedule listing failed: {e}")
            return []
    
    def _parse_qstash_schedule(self, schedule_data: Dict[str, Any]) -> Optional[WorkflowSchedule]:
        """Parse QStash schedule data into WorkflowSchedule object"""
        try:
            workflow_id = self._extract_workflow_id(schedule_data)
            if not workflow_id:
                return None
            
            cron_expression = schedule_data.get("cron", "")
            config = self._parse_cron_to_config(cron_expression)
            
            schedule = WorkflowSchedule(
                id=schedule_data.get("scheduleId"),
                workflow_id=workflow_id,
                name=schedule_data.get("header_X-Schedule-Name", f"Schedule {schedule_data.get('scheduleId', 'Unknown')}"),
                description=schedule_data.get("header_X-Schedule-Description"),
                config=config,
                status=ScheduleStatus.ACTIVE if not schedule_data.get("paused", False) else ScheduleStatus.PAUSED,
                created_at=self._parse_timestamp(schedule_data.get("createdAt")),
                updated_at=self._parse_timestamp(schedule_data.get("updatedAt")),
                next_execution=self._calculate_next_execution(cron_expression)
            )
            
            return schedule
        except Exception as e:
            logger.error(f"Failed to parse QStash schedule data: {e}")
            return None
    
    def _extract_workflow_id(self, schedule_data: Dict[str, Any]) -> Optional[str]:
        """Extract workflow ID from schedule data"""
        try:
            destination = schedule_data.get("destination", "")
            if "/schedules/trigger/" in destination:
                return destination.split("/schedules/trigger/")[-1]
            return None
        except Exception:
            return None
    
    def _parse_cron_to_config(self, cron_expression: str) -> ScheduleConfig:
        """Parse cron expression back to ScheduleConfig (simplified)"""
        try:
            from .models import ScheduleType, CronScheduleConfig
            
            return ScheduleConfig(
                type=ScheduleType.CRON,
                cron=CronScheduleConfig(cron_expression=cron_expression)
            )
        except Exception:
            from .models import ScheduleType, CronScheduleConfig
            return ScheduleConfig(
                type=ScheduleType.CRON,
                cron=CronScheduleConfig(cron_expression="0 * * * *")
            )
    
    def _parse_timestamp(self, timestamp_str: Optional[str]) -> Optional[datetime]:
        """Parse timestamp string to datetime"""
        if not timestamp_str:
            return None
        try:
            if isinstance(timestamp_str, str):
                return datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
            return None
        except Exception:
            return None
    
    def _calculate_next_execution(self, cron_expression: str) -> Optional[datetime]:
        """Calculate next execution time from cron expression"""
        try:
            import croniter
            base_time = datetime.now(timezone.utc)
            cron = croniter.croniter(cron_expression, base_time)
            return cron.get_next(datetime)
        except Exception as e:
            logger.error(f"Failed to calculate next execution: {e}")
            return None 