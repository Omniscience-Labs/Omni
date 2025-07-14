import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional
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
        
        try:
            import croniter
            croniter.croniter(config['cron_expression'])
        except ImportError:
            raise ValueError("croniter package is required for cron expressions. Please install it with: pip install croniter")
        except Exception as e:
            raise ValueError(f"Invalid cron expression: {str(e)}")
        
        return config
    
    async def setup_trigger(self, trigger: Trigger) -> bool:
        if not self._qstash:
            logger.error("QStash client not available")
            return False
        
        try:
            webhook_url = f"{self._webhook_base_url}/api/triggers/{trigger.trigger_id}/webhook"
            
            cron_expression = trigger.config.config['cron_expression']
            
            payload = {
                "trigger_id": trigger.trigger_id,
                "agent_id": trigger.agent_id,
                "execution_type": trigger.config.config.get('execution_type', 'agent'),
                "agent_prompt": trigger.config.config.get('agent_prompt'),
                "workflow_id": trigger.config.config.get('workflow_id'),
                "workflow_input": trigger.config.config.get('workflow_input', {}),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            
            schedule_id = await asyncio.to_thread(
                self._qstash.schedules.create,
                destination=webhook_url,
                cron=cron_expression,
                body=json.dumps(payload),
                headers={
                    "Content-Type": "application/json",
                    "X-Trigger-Source": "schedule"
                }
            )
            
            logger.info(f"Created QStash schedule {schedule_id} for trigger {trigger.trigger_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to setup QStash schedule for trigger {trigger.trigger_id}: {e}")
            return False
    
    async def teardown_trigger(self, trigger: Trigger) -> bool:
        if not self._qstash:
            return True
        
        try:
            schedules = await asyncio.to_thread(self._qstash.schedules.list)
            
            webhook_url = f"{self._webhook_base_url}/api/triggers/{trigger.trigger_id}/webhook"
            
            for schedule in schedules:
                if schedule.get('destination') == webhook_url:
                    await asyncio.to_thread(self._qstash.schedules.delete, schedule['scheduleId'])
                    logger.info(f"Deleted QStash schedule {schedule['scheduleId']} for trigger {trigger.trigger_id}")
                    break
            
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
            return False
        
        try:
            webhook_url = f"{self._webhook_base_url}/api/triggers/{trigger.trigger_id}/webhook"
            schedules = await asyncio.to_thread(self._qstash.schedules.list)
            
            for schedule in schedules:
                if schedule.get('destination') == webhook_url:
                    return True
            
            return False
            
        except Exception as e:
            logger.error(f"Health check failed for trigger {trigger.trigger_id}: {e}")
            return False
    
    async def pause_trigger(self, trigger: Trigger) -> bool:
        return await self.teardown_trigger(trigger)
    
    async def resume_trigger(self, trigger: Trigger) -> bool:
        return await self.setup_trigger(trigger)
    
    async def update_trigger(self, trigger: Trigger) -> bool:
        await self.teardown_trigger(trigger)
        if trigger.is_active:
            return await self.setup_trigger(trigger)
        return True
    
    def get_webhook_url(self, trigger_id: str, base_url: str) -> Optional[str]:
        return f"{base_url}/api/triggers/{trigger_id}/webhook"
    
    async def list_schedules(self) -> list:
        if not self._qstash:
            return []
        
        try:
            return await asyncio.to_thread(self._qstash.schedules.list)
        except Exception as e:
            logger.error(f"Failed to list QStash schedules: {e}")
            return [] 