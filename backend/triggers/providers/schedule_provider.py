import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from qstash.client import QStash
from utils.logger import logger
from ..core import TriggerProvider, TriggerType, TriggerEvent, TriggerResult, TriggerConfig, ProviderDefinition
from utils.config import config, EnvMode

class ScheduleTriggerProvider(TriggerProvider):
    """Schedule trigger provider using Upstash QStash."""
    
    def __init__(self, provider_definition: Optional[ProviderDefinition] = None):
        super().__init__(TriggerType.SCHEDULE, provider_definition)
        
        self.qstash_token = os.getenv("QSTASH_TOKEN")
        self.webhook_base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:3000")
        
        if not self.qstash_token:
            logger.warning("QSTASH_TOKEN not found. QStash provider will not work without it.")
            self.qstash = None
        else:
            self.qstash = QStash(token=self.qstash_token)
    
    async def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Validate schedule configuration."""
        if not self.qstash:
            raise ValueError("QSTASH_TOKEN environment variable is required for QStash scheduling")
        
        if 'cron_expression' not in config:
            raise ValueError("cron_expression is required for QStash schedule triggers")
        
        # Validate execution type
        execution_type = config.get('execution_type', 'agent')
        if execution_type not in ['agent', 'workflow']:
            raise ValueError("execution_type must be either 'agent' or 'workflow'")
        
        # Validate based on execution type
        if execution_type == 'agent':
            if 'agent_prompt' not in config:
                raise ValueError("agent_prompt is required for agent execution")
        elif execution_type == 'workflow':
            if 'workflow_id' not in config:
                raise ValueError("workflow_id is required for workflow execution")
        
        try:
            import croniter
            croniter.croniter(config['cron_expression'])
        except ImportError:
            raise ValueError("croniter package is required for cron expressions. Please install it with: pip install croniter")
        except Exception as e:
            raise ValueError(f"Invalid cron expression: {str(e)}")
        
        return config
    
    async def setup_trigger(self, trigger_config: TriggerConfig) -> bool:
        """Set up scheduled trigger using QStash."""
        if config.ENV_MODE == EnvMode.STAGING:
            vercel_bypass_key = os.getenv("VERCEL_PROTECTION_BYPASS_KEY", "")
        else:
            vercel_bypass_key = ""
        try:
            webhook_url = f"{self.webhook_base_url}/api/triggers/qstash/webhook"
            execution_type = trigger_config.config.get('execution_type', 'agent')
            
            webhook_payload = {
                "trigger_id": trigger_config.trigger_id,
                "agent_id": trigger_config.agent_id,
                "execution_type": execution_type,
                "schedule_name": trigger_config.name,
                "cron_expression": trigger_config.config['cron_expression'],
                "event_type": "scheduled",
                "provider": "qstash"
            }
            
            if execution_type == 'agent':
                webhook_payload["agent_prompt"] = trigger_config.config['agent_prompt']
            elif execution_type == 'workflow':
                webhook_payload["workflow_id"] = trigger_config.config['workflow_id']
                webhook_payload["workflow_input"] = trigger_config.config.get('workflow_input', {})
            schedule_id = await asyncio.to_thread(
                self.qstash.schedule.create,
                destination=webhook_url,
                cron=trigger_config.config['cron_expression'],
                body=json.dumps(webhook_payload),
                headers={
                    "Content-Type": "application/json",
                    "X-Schedule-Provider": "qstash",
                    "X-Trigger-ID": trigger_config.trigger_id,
                    "X-Agent-ID": trigger_config.agent_id,
                    "X-Vercel-Protection-Bypass": vercel_bypass_key
                },
                retries=3,
                delay="5s"
            )
            trigger_config.config['qstash_schedule_id'] = schedule_id
            logger.info(f"Successfully created QStash schedule {schedule_id} for trigger {trigger_config.trigger_id}")
            return True
                    
        except Exception as e:
            logger.error(f"Error setting up QStash scheduled trigger {trigger_config.trigger_id}: {e}")
            return False
    
    async def teardown_trigger(self, trigger_config: TriggerConfig) -> bool:
        """Remove scheduled trigger from QStash."""
        try:
            schedule_id = trigger_config.config.get('qstash_schedule_id')
            if not schedule_id:
                logger.warning(f"No QStash schedule ID found for trigger {trigger_config.trigger_id}")
                return True
            await asyncio.to_thread(
                self.qstash.schedule.delete,
                schedule_id=schedule_id
            )
            logger.info(f"Successfully deleted QStash schedule {schedule_id}")
            return True
                    
        except Exception as e:
            logger.error(f"Error removing QStash scheduled trigger {trigger_config.trigger_id}: {e}")
            return False
    
    async def process_event(self, event: TriggerEvent) -> TriggerResult:
        """Process scheduled trigger event from QStash."""
        try:
            raw_data = event.raw_data
            execution_type = raw_data.get('execution_type', 'agent')
            
            execution_variables = {
                'scheduled_at': event.timestamp.isoformat(),
                'trigger_id': event.trigger_id,
                'agent_id': event.agent_id,
                'schedule_name': raw_data.get('schedule_name', 'Scheduled Task'),
                'execution_source': 'qstash',
                'execution_type': execution_type,
                'cron_expression': raw_data.get('cron_expression'),
                'qstash_message_id': raw_data.get('messageId')
            }
            
            if execution_type == 'workflow':
                # Workflow execution
                workflow_id = raw_data.get('workflow_id')
                workflow_input = raw_data.get('workflow_input', {})
                
                return TriggerResult(
                    success=True,
                    should_execute_workflow=True,
                    workflow_id=workflow_id,
                    workflow_input=workflow_input,
                    execution_variables=execution_variables
                )
            else:
                # Agent execution (default)
                agent_prompt = raw_data.get('agent_prompt', 'Execute scheduled task')
                
                return TriggerResult(
                    success=True,
                    should_execute_agent=True,
                    agent_prompt=agent_prompt,
                    execution_variables=execution_variables
                )
            
        except Exception as e:
            return TriggerResult(
                success=False,
                error_message=f"Error processing QStash scheduled trigger event: {str(e)}"
            )
    
    async def health_check(self, trigger_config: TriggerConfig) -> bool:
        """Check if the QStash scheduled trigger is healthy."""
        try:
            schedule_id = trigger_config.config.get('qstash_schedule_id')
            if not schedule_id:
                return False
    
            schedule = await asyncio.to_thread(
                self.qstash.schedule.get,
                schedule_id=schedule_id
            )
            
            return getattr(schedule, 'is_active', False)
                    
        except Exception as e:
            logger.error(f"Health check failed for QStash scheduled trigger {trigger_config.trigger_id}: {e}")
            return False
    
    async def pause_trigger(self, trigger_config: TriggerConfig) -> bool:
        """Pause a QStash schedule."""
        try:
            schedule_id = trigger_config.config.get('qstash_schedule_id')
            if not schedule_id:
                return False

            await asyncio.to_thread(
                self.qstash.schedules.pause,
                schedule_id=schedule_id
            )
            
            logger.info(f"Successfully paused QStash schedule {schedule_id}")
            return True
                    
        except Exception as e:
            logger.error(f"Error pausing QStash schedule: {e}")
            return False
    
    async def resume_trigger(self, trigger_config: TriggerConfig) -> bool:
        """Resume a QStash schedule."""
        try:
            schedule_id = trigger_config.config.get('qstash_schedule_id')
            if not schedule_id:
                return False

            await asyncio.to_thread(
                self.qstash.schedules.resume,
                schedule_id=schedule_id
            )
            
            logger.info(f"Successfully resumed QStash schedule {schedule_id}")
            return True
                    
        except Exception as e:
            logger.error(f"Error resuming QStash schedule: {e}")
            return False
    
    async def update_trigger(self, trigger_config: TriggerConfig) -> bool:
        """Update a QStash schedule by recreating it."""
        try:
            schedule_id = trigger_config.config.get('qstash_schedule_id')
            webhook_url = f"{self.webhook_base_url}/api/triggers/qstash/webhook"
            execution_type = trigger_config.config.get('execution_type', 'agent')
            
            webhook_payload = {
                "trigger_id": trigger_config.trigger_id,
                "agent_id": trigger_config.agent_id,
                "execution_type": execution_type,
                "schedule_name": trigger_config.name,
                "cron_expression": trigger_config.config['cron_expression'],
                "event_type": "scheduled",
                "provider": "qstash"
            }
            
            if execution_type == 'agent':
                webhook_payload["agent_prompt"] = trigger_config.config['agent_prompt']
            elif execution_type == 'workflow':
                webhook_payload["workflow_id"] = trigger_config.config['workflow_id']
                webhook_payload["workflow_input"] = trigger_config.config.get('workflow_input', {})
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.qstash_base_url}/schedules",
                    headers={
                        "Authorization": f"Bearer {self.qstash_token}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "scheduleId": schedule_id,
                        "destination": webhook_url,
                        "cron": trigger_config.config['cron_expression'],
                        "body": webhook_payload,
                        "headers": {
                            "Content-Type": "application/json",
                            "X-Schedule-Provider": "qstash",
                            "X-Trigger-ID": trigger_config.trigger_id,
                            "X-Agent-ID": trigger_config.agent_id
                        },
                        "retries": 3,
                        "delay": "5s"
                    },
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    logger.info(f"Successfully updated QStash schedule {schedule_id}")
                    return True
                else:
                    logger.error(f"Failed to update QStash schedule: {response.status_code} - {response.text}")
                    return False
                    
        except Exception as e:
            logger.error(f"Error updating QStash schedule: {e}")
            return False
    
    def get_webhook_url(self, trigger_id: str, base_url: str) -> Optional[str]:
        """Return webhook URL for QStash schedules."""
        base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:3000")
        return f"{base_url}/api/triggers/qstash/webhook"
    
    async def list_schedules(self) -> list:
        """List all QStash schedules."""
        try:
            schedules_data = await asyncio.to_thread(
                self.qstash.schedules.list
            )
            
            schedules = []
            for schedule in schedules_data:
                schedules.append({
                    'id': getattr(schedule, 'schedule_id', None),
                    'destination': getattr(schedule, 'destination', None),
                    'cron': getattr(schedule, 'cron', None),
                    'is_active': getattr(schedule, 'is_active', False),
                    'created_at': getattr(schedule, 'created_at', None),
                    'next_delivery': getattr(schedule, 'next_delivery', None)
                })
            
            return schedules
                    
        except Exception as e:
            logger.error(f"Error listing QStash schedules: {e}")
            return [] 