import asyncio
import uuid
import json
from datetime import datetime, timezone
from typing import Dict, Any, Optional, AsyncGenerator
from .models import WorkflowDefinition, WorkflowExecution
from agent.run import run_agent
from services.supabase import DBConnection
from utils.logger import logger

class WorkflowExecutor:
    """Executes workflows using the AgentPress agent system."""
    
    def __init__(self, db: DBConnection):
        self.db = db
    
    async def execute_workflow(
        self,
        workflow: WorkflowDefinition,
        variables: Optional[Dict[str, Any]] = None,
        thread_id: Optional[str] = None,
        project_id: Optional[str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Execute a workflow definition.
        
        V1 Implementation: Generates a system prompt from the workflow
        and executes it as a single agent call.
        """
        if not thread_id:
            thread_id = str(uuid.uuid4())
        
        if not project_id:
            project_id = workflow.project_id
        
        logger.info(f"Executing workflow {workflow.name} (ID: {workflow.id}) in thread {thread_id}")
        
        execution = WorkflowExecution(
            id=str(uuid.uuid4()),
            workflow_id=workflow.id or str(uuid.uuid4()),
            status="running",
            started_at=datetime.now(timezone.utc),
            trigger_type="MANUAL",
            trigger_data={},
            variables=variables or {}
        )
        
        try:
            await self._store_execution(execution)
            await self._create_workflow_thread(thread_id, project_id, workflow, variables)

            if not workflow.steps:
                raise ValueError("Workflow has no steps defined")
            
            main_step = workflow.steps[0]
            system_prompt = main_step.config.get("system_prompt", "")

            if variables:
                variables_text = "\n\n## Workflow Variables\n"
                variables_text += "The following variables are available for this workflow execution:\n"
                for key, value in variables.items():
                    variables_text += f"- **{key}**: {value}\n"
                variables_text += "\nUse these variables as needed during workflow execution.\n"
                system_prompt += variables_text

            agent_config = {
                "name": f"Workflow Agent: {workflow.name}",
                "description": workflow.description or "Generated workflow agent",
                "system_prompt": system_prompt,
                "agentpress_tools": {
                    "sb_files_tool": {"enabled": True, "description": "File operations"},
                    "message_tool": {"enabled": True, "description": "Send messages"},
                    "expand_msg_tool": {"enabled": True, "description": "Expand messages"}
                },
                "configured_mcps": [],
                "custom_mcps": []
            }
            
            async for response in run_agent(
                thread_id=thread_id,
                project_id=project_id,
                stream=True,
                model_name="anthropic/claude-3-5-sonnet-latest",
                enable_thinking=False,
                reasoning_effort="low",
                enable_context_manager=True,
                agent_config=agent_config,
                max_iterations=5
            ):
                yield self._transform_agent_response_to_workflow_update(response, execution.id)

                if response.get('type') == 'status':
                    status = response.get('status')
                    if status in ['completed', 'failed', 'stopped']:
                        execution.status = status.lower()
                        execution.completed_at = datetime.now(timezone.utc)
                        if status == 'failed':
                            execution.error = response.get('message', 'Workflow execution failed')
                        await self._update_execution(execution)
                        break

            if execution.status == "running":
                execution.status = "completed"
                execution.completed_at = datetime.now(timezone.utc)
                await self._update_execution(execution)
                
                yield {
                    "type": "workflow_status",
                    "execution_id": execution.id,
                    "status": "completed",
                    "message": "Workflow completed successfully"
                }
        
        except Exception as e:
            logger.error(f"Error executing workflow {workflow.id}: {e}")
            execution.status = "failed"
            execution.completed_at = datetime.now(timezone.utc)
            execution.error = str(e)
            await self._update_execution(execution)
            
            yield {
                "type": "workflow_status",
                "execution_id": execution.id,
                "status": "failed",
                "error": str(e)
            }
    
    def _transform_agent_response_to_workflow_update(
        self, 
        agent_response: Dict[str, Any], 
        execution_id: str
    ) -> Dict[str, Any]:
        """Transform agent response into workflow execution update."""
        workflow_response = {
            **agent_response,
            "execution_id": execution_id,
            "source": "workflow_executor"
        }
        if agent_response.get('type') == 'assistant':
            workflow_response['type'] = 'workflow_step'
            workflow_response['step_name'] = 'workflow_execution'
        
        elif agent_response.get('type') == 'tool_call':
            workflow_response['type'] = 'workflow_tool_call'
        
        elif agent_response.get('type') == 'tool_result':
            workflow_response['type'] = 'workflow_tool_result'
        
        return workflow_response
    
    async def _store_execution(self, execution: WorkflowExecution):
        """Store workflow execution in database."""
        try:
            client = await self.db.client
            logger.info(f"Execution {execution.id} handled by API endpoint")
        except Exception as e:
            logger.error(f"Failed to store workflow execution: {e}")

    async def _update_execution(self, execution: WorkflowExecution):
        """Update workflow execution in database."""
        try:
            client = await self.db.client
            
            update_data = {
                "status": execution.status,
                "completed_at": execution.completed_at.isoformat() if execution.completed_at else None,
                "error": execution.error
            }
            
            await client.table('workflow_executions').update(update_data).eq('id', execution.id).execute()
            logger.info(f"Updated workflow execution {execution.id} status to {execution.status}")
            
        except Exception as e:
            logger.error(f"Failed to update workflow execution: {e}")
    
    async def get_execution_status(self, execution_id: str) -> Optional[WorkflowExecution]:
        """Get the status of a workflow execution."""
        try:
            client = await self.db.client
            result = await client.table('workflow_executions').select('*').eq('id', execution_id).execute()
            
            if result.data:
                data = result.data[0]
                return WorkflowExecution(
                    id=data['id'],
                    workflow_id=data['workflow_id'],
                    status=data['status'],
                    started_at=datetime.fromisoformat(data['started_at']) if data['started_at'] else None,
                    completed_at=datetime.fromisoformat(data['completed_at']) if data['completed_at'] else None,
                    trigger_type=data.get('triggered_by', 'MANUAL'),
                    trigger_data={},
                    variables=data.get('execution_context', {}),
                    error=data.get('error')
                )
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get execution status: {e}")
            return None
    
    async def _create_workflow_thread(
        self, 
        thread_id: str, 
        project_id: str, 
        workflow: WorkflowDefinition, 
        variables: Optional[Dict[str, Any]] = None
    ):
        """Create a thread in the database for workflow execution."""
        try:
            client = await self.db.client
            project_result = await client.table('projects').select('account_id').eq('project_id', project_id).execute()
            if not project_result.data:
                raise ValueError(f"Project {project_id} not found")
            
            account_id = project_result.data[0]['account_id']
            
            thread_data = {
                "thread_id": thread_id,
                "project_id": project_id,
                "account_id": account_id,
                "metadata": {
                    "workflow_id": workflow.id,
                    "workflow_name": workflow.name,
                    "is_workflow_execution": True
                },
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await client.table('threads').insert(thread_data).execute()
            initial_message = f"Execute the workflow: {workflow.name}"
            if workflow.description:
                initial_message += f"\n\nDescription: {workflow.description}"
            
            if variables:
                initial_message += f"\n\nVariables: {json.dumps(variables, indent=2)}"
            
            message_data = {
                "message_id": str(uuid.uuid4()),
                "thread_id": thread_id,
                "type": "user",
                "is_llm_message": True,
                "content": json.dumps({"role": "user", "content": initial_message}),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await client.table('messages').insert(message_data).execute()
            logger.info(f"Created workflow thread {thread_id} for workflow {workflow.id}")
            
        except Exception as e:
            logger.error(f"Failed to create workflow thread: {e}")
            raise 