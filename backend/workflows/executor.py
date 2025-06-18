import asyncio
import uuid
import json
from datetime import datetime, timezone
from typing import Dict, Any, Optional, AsyncGenerator
from .models import WorkflowDefinition, WorkflowExecution
from services.supabase import DBConnection
from utils.logger import logger
from typing import List

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
            await self._ensure_workflow_thread_exists(thread_id, project_id, workflow, variables)

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

            # Extract enabled tools from workflow steps
            enabled_tools = self._extract_enabled_tools_from_workflow(workflow)
            
            # Extract MCP configurations from workflow steps and agent
            mcp_configs = await self._extract_mcp_configurations_from_workflow_and_agent(workflow)
            
            agent_config = {
                "name": f"Workflow Agent: {workflow.name}",
                "description": workflow.description or "Generated workflow agent",
                "system_prompt": system_prompt,
                "agentpress_tools": enabled_tools,
                "configured_mcps": mcp_configs["configured_mcps"],
                "custom_mcps": mcp_configs["custom_mcps"]
            }
            
            # Debug: Log the final agent config
            logger.info(f"Agent config for workflow - configured_mcps: {len(agent_config['configured_mcps'])} servers")
            logger.info(f"Agent config for workflow - custom_mcps: {len(agent_config['custom_mcps'])} servers")
            
            from agent.run import run_agent

            try:
                client = await self.db.client
                debug_messages = await client.table('messages').select('*').eq('thread_id', thread_id).execute()
                logger.info(f"[Workflow Debug] Found {len(debug_messages.data) if debug_messages.data else 0} messages in thread {thread_id}")
                if debug_messages.data:
                    for msg in debug_messages.data:
                        logger.info(f"[Workflow Debug] Message: type={msg.get('type', 'unknown')}, created_at={msg.get('created_at', 'no timestamp')}, is_llm_message={msg.get('is_llm_message', False)}")
                else:
                    logger.error(f"[Workflow Debug] No messages found in thread {thread_id} - this will cause 'Received Messages=[]' error")
            except Exception as e:
                logger.error(f"[Workflow Debug] Error checking messages: {e}")
            
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
        # Preserve the original agent response structure for frontend compatibility
        # but add workflow context metadata
        workflow_response = {
            **agent_response,
            "execution_id": execution_id,
            "source": "workflow_executor"
        }
        
        # Add workflow metadata to metadata field if it exists, or create it
        if isinstance(workflow_response.get('metadata'), str):
            try:
                metadata = json.loads(workflow_response['metadata'])
            except:
                metadata = {}
        else:
            metadata = workflow_response.get('metadata', {})
        
        metadata.update({
            "is_workflow_response": True,
            "workflow_execution_id": execution_id
        })
        
        workflow_response['metadata'] = json.dumps(metadata) if isinstance(workflow_response.get('metadata'), str) else metadata
        
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
    
    async def _ensure_workflow_thread_exists(
        self, 
        thread_id: str, 
        project_id: str, 
        workflow: WorkflowDefinition, 
        variables: Optional[Dict[str, Any]] = None
    ):
        """Ensure a thread exists for workflow execution (create only if missing)."""
        try:
            client = await self.db.client
            existing_thread = await client.table('threads').select('thread_id').eq('thread_id', thread_id).execute()
            
            if existing_thread.data:
                logger.info(f"Thread {thread_id} already exists, skipping creation")
                return
            await self._create_workflow_thread(thread_id, project_id, workflow, variables)
            
        except Exception as e:
            logger.error(f"Failed to ensure workflow thread exists: {e}")
            raise

    def _extract_enabled_tools_from_workflow(self, workflow: WorkflowDefinition) -> Dict[str, Dict[str, Any]]:
        """Extract tools that should be enabled based on workflow configuration."""
        enabled_tools = {
            "sb_files_tool": {"enabled": True, "description": "File operations"},
            "message_tool": {"enabled": True, "description": "Send messages"}, 
            "expand_msg_tool": {"enabled": True, "description": "Expand messages"}
        }
        
        logger.info(f"Processing workflow with {len(workflow.steps)} steps")
        logger.info(f"Workflow name: {workflow.name}")
        logger.info(f"Workflow ID: {workflow.id}")
        
        for step in workflow.steps:
            step_config = step.config or {}
            tools_section = step_config.get("tools", [])
            
            logger.info(f"Step {step.id} - config keys: {list(step_config.keys())}")
            logger.info(f"Step {step.id} - tools section: {tools_section}")
            
            for tool in tools_section:
                if isinstance(tool, dict):
                    tool_id = tool.get("id") or tool.get("tool_id") or tool.get("nodeId")
                    tool_name = tool.get("name", tool_id)
                    tool_desc = tool.get("description", f"Tool: {tool_name}")
                    
                    logger.info(f"Processing tool dict: {tool}")
                    logger.info(f"Extracted tool_id: {tool_id}")
                    
                    if tool_id:
                        enabled_tools[tool_id] = {
                            "enabled": True,
                            "description": tool_desc
                        }
                        logger.info(f"Added tool {tool_id} to enabled_tools")
                elif isinstance(tool, str):
                    enabled_tools[tool] = {
                        "enabled": True,
                        "description": f"Tool: {tool}"
                    }
                    logger.info(f"Added string tool {tool} to enabled_tools")
        
        if hasattr(workflow, 'metadata') and workflow.metadata:
            logger.info(f"Workflow metadata: {workflow.metadata}")
            workflow_tools = workflow.metadata.get("tools", [])
            logger.info(f"Workflow metadata tools: {workflow_tools}")
            for tool in workflow_tools:
                if isinstance(tool, dict):
                    tool_id = tool.get("id") or tool.get("nodeId")
                    if tool_id:
                        enabled_tools[tool_id] = {
                            "enabled": True,
                            "description": tool.get("description", f"Tool: {tool_id}")
                        }
                        logger.info(f"Added metadata tool {tool_id} to enabled_tools")
        else:
            logger.info("No workflow metadata found")
        
        logger.info(f"Final enabled tools for workflow: {list(enabled_tools.keys())}")
        return enabled_tools

    async def _extract_mcp_configurations_from_workflow_and_agent(self, workflow: WorkflowDefinition) -> Dict[str, List[Dict[str, Any]]]:
        """Extract MCP configurations from workflow steps and agent using credential manager."""
        configured_mcps = []
        custom_mcps = []
        
        logger.info(f"Processing workflow with {len(workflow.steps)} steps for MCP extraction")
        logger.info(f"Workflow name: {workflow.name}")
        logger.info(f"Workflow ID: {workflow.id}")
        logger.info(f"Workflow agent_id: {workflow.agent_id}")
        
        # First, extract MCP configurations from workflow steps
        for step in workflow.steps:
            step_config = step.config or {}
            
            # Extract configured MCPs (Smithery servers) from step config
            step_configured_mcps = step_config.get("configured_mcps", [])
            logger.info(f"Step {step.id} - configured_mcps: {step_configured_mcps}")
            
            for mcp in step_configured_mcps:
                if isinstance(mcp, dict):
                    qualified_name = mcp.get("qualifiedName")
                    if qualified_name:
                        configured_mcps.append({
                            "name": mcp.get("name", qualified_name),
                            "qualifiedName": qualified_name,
                            "config": mcp.get("config", {}),
                            "enabledTools": mcp.get("enabledTools", []),
                            "selectedProfileId": mcp.get("selectedProfileId")
                        })
                        logger.info(f"Added configured MCP from workflow step: {qualified_name} with profile {mcp.get('selectedProfileId')}")
            
            # Extract custom MCPs from step config
            step_custom_mcps = step_config.get("custom_mcps", [])
            logger.info(f"Step {step.id} - custom_mcps: {step_custom_mcps}")
            
            for mcp in step_custom_mcps:
                if isinstance(mcp, dict):
                    mcp_name = mcp.get("name", "Custom MCP")
                    custom_mcps.append({
                        "name": mcp_name,
                        "isCustom": True,
                        "customType": mcp.get("type", "sse"),
                        "config": mcp.get("config", {}),
                        "enabledTools": mcp.get("enabledTools", []),
                        "selectedProfileId": mcp.get("selectedProfileId")
                    })
                    logger.info(f"Added custom MCP from workflow step: {mcp_name} with profile {mcp.get('selectedProfileId')}")
        
        from mcp_local.credential_manager import credential_manager
        
        try:
            client = await self.db.client
            project_result = await client.table('projects').select('account_id').eq('project_id', workflow.project_id).execute()
            if not project_result.data:
                raise ValueError(f"Project {workflow.project_id} not found")
            account_id = project_result.data[0]['account_id']
            logger.info(f"Getting MCP credentials for workflow account_id: {account_id}")
        except Exception as e:
            logger.error(f"Error getting account_id from project: {e}")
            account_id = None
        
        if account_id:
            for i, mcp in enumerate(configured_mcps):
                qualified_name = mcp.get("qualifiedName")
                selected_profile_id = mcp.get("selectedProfileId")
                
                if qualified_name and not mcp.get("config"):
                    try:
                        if selected_profile_id:
                            logger.info(f"Using selected profile {selected_profile_id} for MCP {qualified_name}")
                            credential = await credential_manager.get_credential_by_profile(account_id, selected_profile_id)
                        else:
                            logger.info(f"No profile selected, using default profile for MCP {qualified_name}")
                            credential = await credential_manager.get_default_credential_profile(account_id, qualified_name)
                        
                        if credential:
                            configured_mcps[i]["config"] = credential.config
                            logger.info(f"Added credentials for MCP {qualified_name} using profile: {getattr(credential, 'profile_name', 'legacy')}")
                        else:
                            logger.warning(f"No credential profile found for MCP {qualified_name}")
                            
                    except Exception as e:
                        logger.error(f"Error getting credential for MCP {qualified_name}: {e}")
            
            for i, mcp in enumerate(custom_mcps):
                mcp_name = mcp.get("name", "Custom MCP")
                mcp_type = mcp.get("customType", "sse")
                selected_profile_id = mcp.get("selectedProfileId")
                
                if not mcp.get("config"):  # Only if config is empty
                    try:
                        if selected_profile_id:
                            logger.info(f"Using selected profile {selected_profile_id} for custom MCP {mcp_name}")
                            credential = await credential_manager.get_credential_by_profile(account_id, selected_profile_id)
                        else:
                            # Fallback to default profile lookup for custom MCPs
                            custom_qualified_name = f"custom_{mcp_type}_{mcp_name.replace(' ', '_').lower()}"
                            logger.info(f"No profile selected, using default profile for custom MCP {mcp_name}")
                            credential = await credential_manager.get_default_credential_profile(account_id, custom_qualified_name)
                        
                        if credential:
                            custom_mcps[i]["config"] = credential.config
                            logger.info(f"Added credentials for custom MCP {mcp_name} using profile: {getattr(credential, 'profile_name', 'legacy')}")
                        else:
                            logger.warning(f"No credential profile found for custom MCP {mcp_name}")
                            
                    except Exception as e:
                        logger.error(f"Error getting credential for custom MCP {mcp_name}: {e}")
        else:
            logger.warning("No account_id found, skipping MCP credential lookup")
        
        logger.info(f"Final configured MCPs for workflow: {len(configured_mcps)} servers")
        logger.info(f"Final custom MCPs for workflow: {len(custom_mcps)} servers")
        
        # Debug: Log the actual MCP configurations
        for mcp in configured_mcps:
            config_keys = list(mcp.get('config', {}).keys()) if mcp.get('config') else []
            logger.info(f"Configured MCP: {mcp.get('qualifiedName')} with tools: {mcp.get('enabledTools', [])} and config keys: {config_keys}")
        for mcp in custom_mcps:
            config_keys = list(mcp.get('config', {}).keys()) if mcp.get('config') else []
            logger.info(f"Custom MCP: {mcp.get('name')} with tools: {mcp.get('enabledTools', [])} and config keys: {config_keys}")
        
        return {
            "configured_mcps": configured_mcps,
            "custom_mcps": custom_mcps
        }

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
            input_prompt = ""
            if workflow.steps:
                main_step = workflow.steps[0]
                input_prompt = main_step.config.get("input_prompt", "")
            
            if input_prompt:
                initial_message = input_prompt
            else:
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