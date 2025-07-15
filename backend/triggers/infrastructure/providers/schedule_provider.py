import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import pytz
from qstash.client import QStash
from utils.logger import logger
from ...domain.entities import TriggerProvider, TriggerEvent, TriggerResult, Trigger
from ...domain.value_objects import ProviderDefinition, TriggerType, ExecutionVariables
from utils.config import config, EnvMode


class ScheduleTriggerProvider(TriggerProvider):
    def __init__(self, provider_definition: ProviderDefinition):
        super().__init__(provider_definition)
        
        self._qstash_token = os.getenv("QSTASH_TOKEN")
        self._webhook_base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:3000")
        
        if not self._qstash_token:
            logger.warning("QSTASH_TOKEN not found. QStash provider will not work without it.")
            self._qstash = None
        else:
            self._qstash = QStash(token=self._qstash_token)
    
    async def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        if not self._qstash:
            raise ValueError("QSTASH_TOKEN environment variable is required for QStash scheduling")
        
        if 'cron_expression' not in config:
            raise ValueError("cron_expression is required for QStash schedule triggers")
        
        execution_type = config.get('execution_type', 'agent')
        if execution_type not in ['agent', 'workflow']:
            raise ValueError("execution_type must be either 'agent' or 'workflow'")
        
        if execution_type == 'agent':
            if 'agent_prompt' not in config:
                raise ValueError("agent_prompt is required for agent execution")
        elif execution_type == 'workflow':
            if 'workflow_id' not in config:
                raise ValueError("workflow_id is required for workflow execution")
        
        # Validate timezone if provided
        user_timezone = config.get('timezone', 'UTC')
        if user_timezone != 'UTC':
            try:
                pytz.timezone(user_timezone)
            except pytz.UnknownTimeZoneError:
                raise ValueError(f"Invalid timezone: {user_timezone}")
        
        try:
            import croniter
            croniter.croniter(config['cron_expression'])
        except ImportError:
            raise ValueError("croniter package is required for cron expressions. Please install it with: pip install croniter")
        except Exception as e:
            raise ValueError(f"Invalid cron expression: {str(e)}")
        
        return config
    
    def _convert_cron_to_utc(self, cron_expression: str, user_timezone: str) -> str:
        try:
            import croniter
            parts = cron_expression.split()
            if len(parts) != 5:
                logger.warning(f"Invalid cron expression format: {cron_expression}")
                return cron_expression
                
            minute, hour, day, month, weekday = parts
            
            if minute.startswith('*/') and hour == '*':
                return cron_expression
                
            if hour == '*' or minute == '*':
                return cron_expression
                
            try:
                user_tz = pytz.timezone(user_timezone)
                utc_tz = pytz.UTC
                from datetime import datetime as dt
                now = dt.now(user_tz)
                
                if hour.isdigit() and minute.isdigit():
                    user_time = user_tz.localize(dt(now.year, now.month, now.day, int(hour), int(minute)))
                    utc_time = user_time.astimezone(utc_tz)
                    utc_minute = str(utc_time.minute)
                    utc_hour = str(utc_time.hour)
                    
                    return f"{utc_minute} {utc_hour} {day} {month} {weekday}"
                    
                elif ',' in hour and minute.isdigit():
                    hours = hour.split(',')
                    utc_hours = []
                    for h in hours:
                        if h.isdigit():
                            user_time = user_tz.localize(dt(now.year, now.month, now.day, int(h), int(minute)))
                            utc_time = user_time.astimezone(utc_tz)
                            utc_hours.append(str(utc_time.hour))
                    
                    if utc_hours:
                        utc_minute = str(utc_time.minute)
                        return f"{utc_minute} {','.join(utc_hours)} {day} {month} {weekday}"
                        
                elif '-' in hour and minute.isdigit():
                    pass
                    
            except Exception as e:
                logger.warning(f"Failed to convert timezone for cron expression {cron_expression}: {e}")
                
            return cron_expression
            
        except ImportError:
            logger.warning("croniter not available for cron expression validation")
            return cron_expression
        except Exception as e:
            logger.error(f"Error converting cron expression to UTC: {e}")
            return cron_expression
    
    async def setup_trigger(self, trigger: Trigger) -> bool:
        if not self._qstash:
            logger.error("QStash client not available")
            return False
        
        try:
            webhook_url = f"{self._webhook_base_url}/api/triggers/{trigger.trigger_id}/webhook"
            cron_expression = trigger.config.config['cron_expression']
            execution_type = trigger.config.config.get('execution_type', 'agent')
            user_timezone = trigger.config.config.get('timezone', 'UTC')

            if user_timezone != 'UTC':
                cron_expression = self._convert_cron_to_utc(cron_expression, user_timezone)
                logger.info(f"Converted cron expression from {user_timezone} to UTC: {trigger.config.config['cron_expression']} -> {cron_expression}")
            
            payload = {
                "trigger_id": trigger.trigger_id,
                "agent_id": trigger.agent_id,
                "execution_type": execution_type,
                "agent_prompt": trigger.config.config.get('agent_prompt'),
                "workflow_id": trigger.config.config.get('workflow_id'),
                "workflow_input": trigger.config.config.get('workflow_input', {}),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            
            headers = {
                "Content-Type": "application/json",
                "X-Trigger-Source": "schedule"
            }
            
            if config.ENV_MODE == EnvMode.STAGING:
                vercel_bypass_key = os.getenv("VERCEL_PROTECTION_BYPASS_KEY", "")
                if vercel_bypass_key:
                    headers["X-Vercel-Protection-Bypass"] = vercel_bypass_key
            
            schedule_id = await asyncio.to_thread(
                self._qstash.schedule.create,
                destination=webhook_url,
                cron=cron_expression,
                body=json.dumps(payload),
                headers=headers,
                retries=3,
                delay="5s"
            )
            trigger.config.config['qstash_schedule_id'] = schedule_id
            logger.info(f"Created QStash schedule {schedule_id} for trigger {trigger.trigger_id} with cron: {cron_expression}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to setup QStash schedule for trigger {trigger.trigger_id}: {e}")
            return False
    
    async def teardown_trigger(self, trigger: Trigger) -> bool:
        if not self._qstash:
            logger.warning("QStash client not available, skipping teardown")
            return True
        
        try:
            schedule_id = trigger.config.config.get('qstash_schedule_id')
            if schedule_id:
                try:
                    await asyncio.to_thread(self._qstash.schedule.delete, schedule_id)
                    logger.info(f"Deleted QStash schedule {schedule_id} for trigger {trigger.trigger_id}")
                    return True
                except Exception as e:
                    logger.warning(f"Failed to delete QStash schedule {schedule_id} by ID: {e}")
            
            logger.info(f"Attempting to find and delete QStash schedule for trigger {trigger.trigger_id} by webhook URL")
            schedules = await asyncio.to_thread(self._qstash.schedule.list)
            
            webhook_url = f"{self._webhook_base_url}/api/triggers/{trigger.trigger_id}/webhook"
            
            for schedule in schedules:
                if schedule.get('destination') == webhook_url:
                    await asyncio.to_thread(self._qstash.schedule.delete, schedule['scheduleId'])
                    logger.info(f"Deleted QStash schedule {schedule['scheduleId']} for trigger {trigger.trigger_id}")
                    return True
            
            logger.warning(f"No QStash schedule found for trigger {trigger.trigger_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to teardown QStash schedule for trigger {trigger.trigger_id}: {e}")
            return False
    
    async def process_event(self, event: TriggerEvent) -> TriggerResult:
        try:
            raw_data = event.raw_data
            execution_type = raw_data.get('execution_type', 'agent')
            
            execution_variables = ExecutionVariables(variables={
                'scheduled_time': raw_data.get('timestamp'),
                'trigger_id': event.trigger_id,
                'agent_id': event.agent_id
            })
            
            if execution_type == 'workflow':
                workflow_id = raw_data.get('workflow_id')
                workflow_input = raw_data.get('workflow_input', {})
                
                if not workflow_id:
                    raise ValueError("workflow_id is required for workflow execution")
                
                return TriggerResult(
                    success=True,
                    should_execute_workflow=True,
                    workflow_id=workflow_id,
                    workflow_input=workflow_input,
                    execution_variables=execution_variables
                )
            else:
                agent_prompt = raw_data.get('agent_prompt')
                
                if not agent_prompt:
                    raise ValueError("agent_prompt is required for agent execution")
                
                return TriggerResult(
                    success=True,
                    should_execute_agent=True,
                    agent_prompt=agent_prompt,
                    execution_variables=execution_variables
                )
                
        except Exception as e:
            return TriggerResult(
                success=False,
                error_message=f"Error processing schedule event: {str(e)}"
            )
    
    async def health_check(self, trigger: Trigger) -> bool:
        if not self._qstash:
            logger.warning("QStash client not available for health check")
            return False
        
        try:
            schedule_id = trigger.config.config.get('qstash_schedule_id')
            if schedule_id:
                try:
                    schedule = await asyncio.to_thread(self._qstash.schedule.get, schedule_id)
                    is_healthy = schedule is not None
                    logger.info(f"Health check for trigger {trigger.trigger_id} using schedule ID {schedule_id}: {'healthy' if is_healthy else 'unhealthy'}")
                    return is_healthy
                except Exception as e:
                    logger.warning(f"Failed to check health for QStash schedule {schedule_id} by ID: {e}")
            
            logger.info(f"Attempting health check for trigger {trigger.trigger_id} by webhook URL")
            webhook_url = f"{self._webhook_base_url}/api/triggers/{trigger.trigger_id}/webhook"
            schedules = await asyncio.to_thread(self._qstash.schedule.list)
            
            for schedule in schedules:
                if schedule.get('destination') == webhook_url:
                    logger.info(f"Health check for trigger {trigger.trigger_id}: healthy (found schedule)")
                    return True
            
            logger.warning(f"Health check for trigger {trigger.trigger_id}: no schedule found")
            return False
            
        except Exception as e:
            logger.error(f"Health check failed for trigger {trigger.trigger_id}: {e}")
            return False
    
    async def pause_trigger(self, trigger: Trigger) -> bool:
        return await self.teardown_trigger(trigger)
    
    async def resume_trigger(self, trigger: Trigger) -> bool:
        return await self.setup_trigger(trigger)
    
    async def update_trigger(self, trigger: Trigger) -> bool:
        if not self._qstash:
            logger.warning("QStash client not available for trigger update")
            return True
        
        try:
            logger.info(f"Updating QStash schedule for trigger {trigger.trigger_id}")
            teardown_success = await self.teardown_trigger(trigger)
            if not teardown_success:
                logger.warning(f"Failed to teardown existing schedule for trigger {trigger.trigger_id}, proceeding with setup")
            
            if trigger.is_active:
                setup_success = await self.setup_trigger(trigger)
                if setup_success:
                    logger.info(f"Successfully updated QStash schedule for trigger {trigger.trigger_id}")
                else:
                    logger.error(f"Failed to setup updated schedule for trigger {trigger.trigger_id}")
                return setup_success
            else:
                logger.info(f"Trigger {trigger.trigger_id} is inactive, skipping schedule setup")
                return True
                
        except Exception as e:
            logger.error(f"Error updating QStash schedule for trigger {trigger.trigger_id}: {e}")
            return False
    
    def get_webhook_url(self, trigger_id: str, base_url: str) -> Optional[str]:
        return f"{base_url}/api/triggers/{trigger_id}/webhook"
    
    async def list_schedules(self) -> list:
        if not self._qstash:
            logger.warning("QStash client not available for listing schedules")
            return []
        
        try:
            schedules = await asyncio.to_thread(self._qstash.schedule.list)
            logger.info(f"Successfully retrieved {len(schedules)} schedules from QStash")
            return schedules
        except Exception as e:
            logger.error(f"Failed to list QStash schedules: {e}")
            return [] 