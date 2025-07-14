from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid

from .interfaces import TriggerRepository, TriggerEventLogRepository, RepositoryError, NotFoundError
from ..domain.entities import Trigger, TriggerEvent, TriggerResult
from ..domain.value_objects import TriggerIdentity, TriggerConfig, TriggerMetadata, TriggerType, ExecutionVariables
from services.supabase import DBConnection


class SupabaseTriggerRepository(TriggerRepository):
    
    def __init__(self, db_connection: DBConnection):
        self._db = db_connection
    
    async def save(self, trigger: Trigger) -> None:
        try:
            client = await self._db.client
            
            config_with_provider = {**trigger.config.config, "provider_id": trigger.provider_id}
            
            await client.table('agent_triggers').insert({
                'trigger_id': trigger.trigger_id,
                'agent_id': trigger.agent_id,
                'trigger_type': trigger.trigger_type.value,
                'name': trigger.config.name,
                'description': trigger.config.description,
                'is_active': trigger.config.is_active,
                'config': config_with_provider,
                'created_at': trigger.metadata.created_at.isoformat(),
                'updated_at': trigger.metadata.updated_at.isoformat()
            }).execute()
        except Exception as e:
            raise RepositoryError(f"Failed to save trigger: {str(e)}")
    
    async def find_by_id(self, trigger_id: str) -> Optional[Trigger]:
        try:
            client = await self._db.client
            result = await client.table('agent_triggers').select('*').eq('trigger_id', trigger_id).execute()
            
            if not result.data:
                return None
            
            return self._map_to_trigger(result.data[0])
        except Exception as e:
            raise RepositoryError(f"Failed to find trigger by ID: {str(e)}")
    
    async def find_by_agent_id(self, agent_id: str) -> List[Trigger]:
        try:
            client = await self._db.client
            result = await client.table('agent_triggers').select('*').eq('agent_id', agent_id).execute()
            
            return [self._map_to_trigger(data) for data in result.data]
        except Exception as e:
            raise RepositoryError(f"Failed to find triggers by agent ID: {str(e)}")
    
    async def find_active_triggers(self) -> List[Trigger]:
        try:
            client = await self._db.client
            result = await client.table('agent_triggers').select('*').eq('is_active', True).execute()
            
            return [self._map_to_trigger(data) for data in result.data]
        except Exception as e:
            raise RepositoryError(f"Failed to find active triggers: {str(e)}")
    
    async def find_by_provider_id(self, provider_id: str) -> List[Trigger]:
        try:
            client = await self._db.client
            result = await client.table('agent_triggers').select('*').execute()
            
            triggers = []
            for data in result.data:
                if data.get('config', {}).get('provider_id') == provider_id:
                    triggers.append(self._map_to_trigger(data))
            
            return triggers
        except Exception as e:
            raise RepositoryError(f"Failed to find triggers by provider ID: {str(e)}")
    
    async def update(self, trigger: Trigger) -> None:
        try:
            client = await self._db.client
            
            config_with_provider = {**trigger.config.config, "provider_id": trigger.provider_id}
            
            result = await client.table('agent_triggers').update({
                'trigger_type': trigger.trigger_type.value,
                'name': trigger.config.name,
                'description': trigger.config.description,
                'is_active': trigger.config.is_active,
                'config': config_with_provider,
                'updated_at': trigger.metadata.updated_at.isoformat()
            }).eq('trigger_id', trigger.trigger_id).execute()
            
            if not result.data:
                raise NotFoundError(f"Trigger not found: {trigger.trigger_id}")
        except NotFoundError:
            raise
        except Exception as e:
            raise RepositoryError(f"Failed to update trigger: {str(e)}")
    
    async def delete(self, trigger_id: str) -> bool:
        try:
            client = await self._db.client
            result = await client.table('agent_triggers').delete().eq('trigger_id', trigger_id).execute()
            
            return len(result.data) > 0
        except Exception as e:
            raise RepositoryError(f"Failed to delete trigger: {str(e)}")
    
    async def exists(self, trigger_id: str) -> bool:
        try:
            client = await self._db.client
            result = await client.table('agent_triggers').select('trigger_id').eq('trigger_id', trigger_id).execute()
            
            return len(result.data) > 0
        except Exception as e:
            raise RepositoryError(f"Failed to check trigger existence: {str(e)}")
    
    async def count_by_agent_id(self, agent_id: str) -> int:
        try:
            client = await self._db.client
            result = await client.table('agent_triggers').select('trigger_id', count='exact').eq('agent_id', agent_id).execute()
            
            return result.count or 0
        except Exception as e:
            raise RepositoryError(f"Failed to count triggers: {str(e)}")
    
    def _map_to_trigger(self, data: Dict[str, Any]) -> Trigger:
        identity = TriggerIdentity(
            trigger_id=data['trigger_id'],
            agent_id=data['agent_id']
        )
        
        config_data = data.get('config', {})
        provider_id = config_data.get('provider_id', data['trigger_type'])
        
        clean_config = {k: v for k, v in config_data.items() if k != 'provider_id'}
        
        config = TriggerConfig(
            name=data['name'],
            description=data.get('description'),
            config=clean_config,
            is_active=data.get('is_active', True)
        )
        
        metadata = TriggerMetadata(
            created_at=datetime.fromisoformat(data['created_at'].replace('Z', '+00:00')),
            updated_at=datetime.fromisoformat(data['updated_at'].replace('Z', '+00:00'))
        )
        
        trigger_type = TriggerType(data['trigger_type'])
        
        return Trigger(
            identity=identity,
            provider_id=provider_id,
            trigger_type=trigger_type,
            config=config,
            metadata=metadata
        )


class SupabaseTriggerEventLogRepository(TriggerEventLogRepository):
    
    def __init__(self, db_connection: DBConnection):
        self._db = db_connection
    
    async def log_event(
        self,
        event: TriggerEvent,
        result: TriggerResult,
        execution_time_ms: Optional[int] = None
    ) -> str:
        try:
            log_id = str(uuid.uuid4())
            client = await self._db.client
            
            await client.table('trigger_event_logs').insert({
                'log_id': log_id,
                'trigger_id': event.trigger_id,
                'agent_id': event.agent_id,
                'trigger_type': event.trigger_type.value if hasattr(event.trigger_type, 'value') else str(event.trigger_type),
                'event_data': event.raw_data,
                'success': result.success,
                'should_execute_agent': result.should_execute_agent,
                'should_execute_workflow': result.should_execute_workflow,
                'agent_prompt': result.agent_prompt,
                'workflow_id': result.workflow_id,
                'workflow_input': result.workflow_input,
                'execution_variables': result.execution_variables.variables if result.execution_variables else {},
                'error_message': result.error_message,
                'metadata': result.metadata,
                'execution_time_ms': execution_time_ms,
                'event_timestamp': event.timestamp.isoformat(),
                'logged_at': datetime.now(timezone.utc).isoformat()
            }).execute()
            
            return log_id
        except Exception as e:
            raise RepositoryError(f"Failed to log event: {str(e)}")
    
    async def find_logs_by_trigger_id(
        self,
        trigger_id: str,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        try:
            client = await self._db.client
            result = await client.table('trigger_event_logs')\
                .select('*')\
                .eq('trigger_id', trigger_id)\
                .order('logged_at', desc=True)\
                .limit(limit)\
                .offset(offset)\
                .execute()
            
            return result.data
        except Exception as e:
            raise RepositoryError(f"Failed to find logs by trigger ID: {str(e)}")
    
    async def find_logs_by_agent_id(
        self,
        agent_id: str,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        try:
            client = await self._db.client
            result = await client.table('trigger_event_logs')\
                .select('*')\
                .eq('agent_id', agent_id)\
                .order('logged_at', desc=True)\
                .limit(limit)\
                .offset(offset)\
                .execute()
            
            return result.data
        except Exception as e:
            raise RepositoryError(f"Failed to find logs by agent ID: {str(e)}")
    
    async def find_failed_events(
        self,
        since: Optional[datetime] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        try:
            client = await self._db.client
            query = client.table('trigger_event_logs')\
                .select('*')\
                .eq('success', False)\
                .order('logged_at', desc=True)\
                .limit(limit)
            
            if since:
                query = query.gte('logged_at', since.isoformat())
            
            result = await query.execute()
            return result.data
        except Exception as e:
            raise RepositoryError(f"Failed to find failed events: {str(e)}")
    
    async def get_execution_stats(
        self,
        trigger_id: str,
        hours: int = 24
    ) -> Dict[str, Any]:
        try:
            client = await self._db.client
            since = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            since = since.replace(hour=since.hour - hours)
            
            result = await client.table('trigger_event_logs')\
                .select('success, execution_time_ms')\
                .eq('trigger_id', trigger_id)\
                .gte('logged_at', since.isoformat())\
                .execute()
            
            logs = result.data
            total_executions = len(logs)
            successful_executions = sum(1 for log in logs if log['success'])
            failed_executions = total_executions - successful_executions
            
            execution_times = [log['execution_time_ms'] for log in logs if log['execution_time_ms'] is not None]
            avg_execution_time = sum(execution_times) / len(execution_times) if execution_times else 0
            
            return {
                'total_executions': total_executions,
                'successful_executions': successful_executions,
                'failed_executions': failed_executions,
                'success_rate': successful_executions / total_executions if total_executions > 0 else 0,
                'average_execution_time_ms': avg_execution_time,
                'period_hours': hours
            }
        except Exception as e:
            raise RepositoryError(f"Failed to get execution stats: {str(e)}")
    
    async def cleanup_old_logs(self, days_to_keep: int = 30) -> int:
        try:
            client = await self._db.client
            cutoff_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            cutoff_date = cutoff_date.replace(day=cutoff_date.day - days_to_keep)
            
            result = await client.table('trigger_event_logs')\
                .delete()\
                .lt('logged_at', cutoff_date.isoformat())\
                .execute()
            
            return len(result.data)
        except Exception as e:
            raise RepositoryError(f"Failed to cleanup old logs: {str(e)}") 