import uuid
from typing import Dict, Any
from datetime import datetime, timezone

from ..domain.entities import TriggerResult, TriggerEvent
from services.supabase import DBConnection
from services import redis
from utils.logger import logger, structlog
from run_agent_background import run_agent_background


class TriggerExecutionService:
    def __init__(self, db_connection: DBConnection):
        self._db = db_connection
        self._agent_executor = AgentExecutor(db_connection)
        self._workflow_executor = WorkflowExecutor(db_connection)
    
    async def execute_trigger_result(
        self,
        agent_id: str,
        trigger_result: TriggerResult,
        trigger_event: TriggerEvent
    ) -> Dict[str, Any]:
        try:
            if trigger_result.should_execute_workflow:
                workflow_id = trigger_result.workflow_id
                workflow_input = trigger_result.workflow_input or {}
                
                logger.info(f"Executing workflow {workflow_id} for agent {agent_id}")
                return await self._workflow_executor.execute_triggered_workflow(
                    agent_id=agent_id,
                    workflow_id=workflow_id,
                    workflow_input=workflow_input,
                    trigger_result=trigger_result,
                    trigger_event=trigger_event
                )
            else:
                logger.info(f"Executing agent {agent_id}")
                return await self._agent_executor.execute_triggered_agent(
                    agent_id=agent_id,
                    trigger_result=trigger_result,
                    trigger_event=trigger_event
                )
                
        except Exception as e:
            logger.error(f"Failed to execute trigger result: {e}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to execute trigger"
            }


class AgentExecutor:
    
    def __init__(self, db_connection: DBConnection):
        self._db = db_connection
    
    async def execute_triggered_agent(
        self,
        agent_id: str,
        trigger_result: TriggerResult,
        trigger_event: TriggerEvent
    ) -> Dict[str, Any]:
        try:
            agent_config = await self._get_agent_config(agent_id)
            if not agent_config:
                raise ValueError(f"Agent {agent_id} not found")
            
            thread_id, project_id = await self._create_trigger_thread(
                agent_id=agent_id,
                agent_config=agent_config,
                trigger_event=trigger_event,
                trigger_result=trigger_result
            )
            
            await self._create_initial_message(
                thread_id=thread_id,
                prompt=trigger_result.agent_prompt,
                trigger_data=trigger_result.execution_variables.variables
            )
            
            agent_run_id = await self._start_agent_execution(
                thread_id=thread_id,
                project_id=project_id,
                agent_config=agent_config,
                trigger_variables=trigger_result.execution_variables.variables
            )
            
            return {
                "success": True,
                "thread_id": thread_id,
                "agent_run_id": agent_run_id,
                "message": "Agent execution started successfully"
            }
            
        except Exception as e:
            logger.error(f"Failed to execute triggered agent {agent_id}: {e}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to start agent execution"
            }
    
    async def _get_agent_config(self, agent_id: str) -> Dict[str, Any]:
        client = await self._db.client
        result = await client.table('agents').select('*').eq('agent_id', agent_id).execute()
        return result.data[0] if result.data else None
    
    async def _create_trigger_thread(
        self,
        agent_id: str,
        agent_config: Dict[str, Any],
        trigger_event: TriggerEvent,
        trigger_result: TriggerResult
    ) -> tuple[str, str]:
        client = await self._db.client
        
        thread_data = {
            'thread_id': str(uuid.uuid4()),
            'agent_id': agent_id,
            'project_id': agent_config.get('project_id'),
            'title': f"Trigger: {trigger_event.trigger_id}",
            'created_at': datetime.now(timezone.utc).isoformat(),
            'metadata': {
                'trigger_id': trigger_event.trigger_id,
                'trigger_type': trigger_event.trigger_type.value,
                'created_by_trigger': True
            }
        }
        
        thread = await client.table('threads').insert(thread_data).execute()
        thread_id = thread.data[0]['thread_id']
        project_id = thread.data[0]['project_id']
        
        return thread_id, project_id
    
    async def _create_initial_message(
        self,
        thread_id: str,
        prompt: str,
        trigger_data: Dict[str, Any]
    ) -> str:
        client = await self._db.client
        
        message_data = {
            'message_id': str(uuid.uuid4()),
            'thread_id': thread_id,
            'role': 'user',
            'content': prompt,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'metadata': {
                'trigger_data': trigger_data,
                'created_by_trigger': True
            }
        }
        
        message = await client.table('messages').insert(message_data).execute()
        return message.data[0]['message_id']
    
    async def _start_agent_execution(
        self,
        thread_id: str,
        project_id: str,
        agent_config: Dict[str, Any],
        trigger_variables: Dict[str, Any]
    ) -> str:
        client = await self._db.client

        model_name = "anthropic/claude-sonnet-4-20250514"
        
        agent_run_data = {
            "thread_id": thread_id,
            "agent_id": agent_config['agent_id'],
            "agent_version_id": agent_config.get('current_version_id'),
            "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "metadata": {
                "model_name": model_name,
                "enable_thinking": False,
                "reasoning_effort": "low",
                "enable_context_manager": True,
                "trigger_execution": True,
                "trigger_variables": trigger_variables
            }
        }
        
        agent_run = await client.table('agent_runs').insert(agent_run_data).execute()
        agent_run_id = agent_run.data[0]['id']
        
        instance_id = "trigger_executor"
        instance_key = f"active_run:{instance_id}:{agent_run_id}"
        try:
            await redis.set(instance_key, "running", ex=redis.REDIS_KEY_TTL)
        except Exception as e:
            logger.warning(f"Failed to register agent run in Redis ({instance_key}): {str(e)}")

        request_id = structlog.contextvars.get_contextvars().get('request_id')

        run_agent_background.send(
            agent_run_id=agent_run_id,
            thread_id=thread_id,
            instance_id=instance_id,
            project_id=project_id,
            model_name=model_name,
            enable_thinking=False,
            reasoning_effort="low",
            stream=False,
            enable_context_manager=True,
            agent_config=agent_config,
            is_agent_builder=False,
            target_agent_id=None,
            request_id=request_id,
        )
        
        logger.info(f"Started background agent execution for trigger (run_id: {agent_run_id})")
        return agent_run_id


class WorkflowExecutor:
    
    def __init__(self, db_connection: DBConnection):
        self._db = db_connection
    
    async def execute_triggered_workflow(
        self,
        agent_id: str,
        workflow_id: str,
        workflow_input: Dict[str, Any],
        trigger_result: TriggerResult,
        trigger_event: TriggerEvent
    ) -> Dict[str, Any]:
        try:
            workflow_config = await self._get_workflow_config(workflow_id)
            if not workflow_config:
                raise ValueError(f"Workflow {workflow_id} not found")
            
            if workflow_config['status'] != 'active':
                raise ValueError(f"Workflow {workflow_id} is not active")
            
            agent_config = await self._get_agent_config(agent_id)
            if not agent_config:
                raise ValueError(f"Agent {agent_id} not found")
            
            thread_id, project_id = await self._create_workflow_thread(
                agent_id=agent_id,
                workflow_id=workflow_id,
                agent_config=agent_config,
                workflow_config=workflow_config,
                trigger_event=trigger_event
            )
            
            execution_id = await self._create_workflow_execution(
                workflow_id=workflow_id,
                agent_id=agent_id,
                thread_id=thread_id,
                workflow_input=workflow_input,
                trigger_event=trigger_event
            )
            
            await self._create_workflow_message(
                thread_id=thread_id,
                workflow_config=workflow_config,
                workflow_input=workflow_input,
                trigger_data=trigger_result.execution_variables.variables
            )
            
            return {
                "success": True,
                "thread_id": thread_id,
                "execution_id": execution_id,
                "message": "Workflow execution started successfully"
            }
            
        except Exception as e:
            logger.error(f"Failed to execute triggered workflow {workflow_id}: {e}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to start workflow execution"
            }
    
    async def _get_workflow_config(self, workflow_id: str) -> Dict[str, Any]:
        client = await self._db.client
        result = await client.table('workflows').select('*').eq('workflow_id', workflow_id).execute()
        return result.data[0] if result.data else None
    
    async def _get_agent_config(self, agent_id: str) -> Dict[str, Any]:
        client = await self._db.client
        result = await client.table('agents').select('*').eq('agent_id', agent_id).execute()
        return result.data[0] if result.data else None
    
    async def _create_workflow_thread(
        self,
        agent_id: str,
        workflow_id: str,
        agent_config: Dict[str, Any],
        workflow_config: Dict[str, Any],
        trigger_event: TriggerEvent
    ) -> tuple[str, str]:
        client = await self._db.client
        
        thread_data = {
            'thread_id': str(uuid.uuid4()),
            'agent_id': agent_id,
            'project_id': agent_config.get('project_id'),
            'title': f"Workflow: {workflow_config.get('name', workflow_id)}",
            'created_at': datetime.now(timezone.utc).isoformat(),
            'metadata': {
                'workflow_id': workflow_id,
                'trigger_id': trigger_event.trigger_id,
                'trigger_type': trigger_event.trigger_type.value,
                'created_by_trigger': True,
                'is_workflow_execution': True
            }
        }
        
        thread = await client.table('threads').insert(thread_data).execute()
        thread_id = thread.data[0]['thread_id']
        project_id = thread.data[0]['project_id']
        
        return thread_id, project_id
    
    async def _create_workflow_execution(
        self,
        workflow_id: str,
        agent_id: str,
        thread_id: str,
        workflow_input: Dict[str, Any],
        trigger_event: TriggerEvent
    ) -> str:
        client = await self._db.client
        
        execution_data = {
            'execution_id': str(uuid.uuid4()),
            'workflow_id': workflow_id,
            'agent_id': agent_id,
            'thread_id': thread_id,
            'status': 'running',
            'input_data': workflow_input,
            'started_at': datetime.now(timezone.utc).isoformat(),
            'metadata': {
                'trigger_id': trigger_event.trigger_id,
                'trigger_type': trigger_event.trigger_type.value,
                'created_by_trigger': True
            }
        }
        
        execution = await client.table('workflow_executions').insert(execution_data).execute()
        return execution.data[0]['execution_id']
    
    async def _create_workflow_message(
        self,
        thread_id: str,
        workflow_config: Dict[str, Any],
        workflow_input: Dict[str, Any],
        trigger_data: Dict[str, Any]
    ) -> str:
        client = await self._db.client
        
        prompt = workflow_config.get('initial_prompt', 'Execute workflow with provided input')
        
        message_data = {
            'message_id': str(uuid.uuid4()),
            'thread_id': thread_id,
            'role': 'user',
            'content': prompt,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'metadata': {
                'workflow_input': workflow_input,
                'trigger_data': trigger_data,
                'created_by_trigger': True,
                'is_workflow_message': True
            }
        }
        
        message = await client.table('messages').insert(message_data).execute()
        return message.data[0]['message_id'] 