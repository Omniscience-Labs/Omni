import asyncio
import uuid
import json
from datetime import datetime, timezone
from typing import Dict, Any, Optional, AsyncGenerator, List, Set
from .models import WorkflowDefinition, WorkflowExecution
from services.supabase import DBConnection
from utils.logger import logger
from dataclasses import dataclass
from enum import Enum

class NodeType(Enum):
    INPUT = "inputNode"
    AGENT = "agentNode" 
    TOOL = "toolConnectionNode"
    MCP = "mcpNode"

class NodeStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"

@dataclass
class NodeExecution:
    node_id: str
    node_type: NodeType
    status: NodeStatus
    input_data: Dict[str, Any]
    output_data: Dict[str, Any]
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

@dataclass
class LoopState:
    """Track loop execution state."""
    loop_id: str
    current_iteration: int
    max_iterations: int
    condition_met: bool
    loop_nodes: Set[str]
    entry_node: str
    exit_condition_node: Optional[str]

@dataclass
class WorkflowContext:
    variables: Dict[str, Any]
    node_outputs: Dict[str, Any]  # Store outputs from each node
    execution_history: List[NodeExecution]
    current_iteration: int = 0
    max_iterations: int = 100
    active_loops: Dict[str, LoopState] = None  # Track active loops
    
    def __post_init__(self):
        if self.active_loops is None:
            self.active_loops = {}

class DeterministicWorkflowExecutor:
    """Executes workflows by following the visual flow deterministically."""
    
    def __init__(self, db: DBConnection):
        self.db = db
    
    async def execute_workflow(
        self,
        workflow: WorkflowDefinition,
        variables: Optional[Dict[str, Any]] = None,
        thread_id: Optional[str] = None,
        project_id: Optional[str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        
        if not thread_id:
            thread_id = str(uuid.uuid4())
        
        if not project_id:
            project_id = workflow.project_id
        
        logger.info(f"Executing deterministic workflow {workflow.name} (ID: {workflow.id}) in thread {thread_id}")
        
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
            
            # Ensure project has a sandbox before executing workflow
            await self._ensure_project_has_sandbox(project_id)
            
            # Load visual flow data if not present in workflow
            workflow_with_flow = await self._ensure_workflow_has_flow_data(workflow)
            
            # Build prompt and tool configuration from visual flow
            flow_config = self._analyze_visual_flow(workflow_with_flow, variables or {})
            
            # Create thread with the flow-based prompt
            await self._ensure_workflow_thread_exists(thread_id, project_id, workflow_with_flow, variables)
            
            # Build agent configuration from the visual flow analysis
            agent_config = {
                "name": f"Deterministic Workflow Agent: {workflow.name}",
                "description": workflow.description or "Generated deterministic workflow agent",
                "system_prompt": flow_config["system_prompt"],
                "agentpress_tools": flow_config["enabled_tools"],
                "configured_mcps": flow_config["configured_mcps"],
                "custom_mcps": flow_config["custom_mcps"]
            }
            
            logger.info(f"Deterministic agent config - tools: {list(flow_config['enabled_tools'].keys())}")
            logger.info(f"Deterministic agent config - configured_mcps: {len(flow_config['configured_mcps'])} servers")
            logger.info(f"Deterministic agent config - custom_mcps: {len(flow_config['custom_mcps'])} servers")
            
            # Run the agent (same as legacy executor, but with flow-based configuration)
            from agent.run import run_agent
            
            async for response in run_agent(
                thread_id=thread_id,
                project_id=project_id,
                stream=True,
                model_name="anthropic/claude-3-5-sonnet-latest",
                enable_thinking=False,
                reasoning_effort="low",
                enable_context_manager=True,
                agent_config=agent_config,
                max_iterations=10  # Allow more iterations for complex workflows
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
                    "message": "Deterministic workflow completed successfully"
                }
        
        except Exception as e:
            logger.error(f"Error executing deterministic workflow {workflow.id}: {e}")
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
    
    def _analyze_visual_flow(self, workflow: WorkflowDefinition, variables: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze the visual flow to build prompt and tool configuration."""
        logger.info(f"Analyzing visual flow for workflow {workflow.id}")
        
        # Start with default tools (same as legacy executor)
        enabled_tools = {
            "sb_files_tool": {"enabled": True, "description": "File operations"},
            "message_tool": {"enabled": True, "description": "Send messages"}, 
            "expand_msg_tool": {"enabled": True, "description": "Expand messages"}
        }
        
        configured_mcps = []
        custom_mcps = []
        workflow_instructions = []
        main_prompt = ""
        
        # If no visual flow data, fall back to legacy extraction
        if not workflow.nodes or not workflow.edges:
            logger.info("No visual flow data, using legacy extraction methods")
            enabled_tools.update(self._extract_enabled_tools_from_workflow(workflow))
            mcp_configs = asyncio.run(self._extract_mcp_configurations_from_workflow_and_agent(workflow))
            configured_mcps = mcp_configs["configured_mcps"]
            custom_mcps = mcp_configs["custom_mcps"]
            
            # Get prompt from workflow steps
            if workflow.steps:
                main_step = workflow.steps[0]
                main_prompt = main_step.config.get("input_prompt", "")
                if not main_prompt:
                    main_prompt = f"Execute the workflow: {workflow.name}"
        else:
            logger.info(f"Analyzing visual flow with {len(workflow.nodes)} nodes and {len(workflow.edges)} edges")
            
            # Analyze nodes to extract tools, MCPs, and prompts
            for node in workflow.nodes:
                node_data = node.data
                node_type = node.type
                
                if node_type == "inputNode":
                    # Extract main prompt from input node
                    prompt = node_data.get('prompt', '')
                    if prompt:
                        main_prompt = prompt
                        logger.info(f"Found main prompt from input node: {prompt[:100]}...")
                
                elif node_type == "toolConnectionNode":
                    # Extract tool configuration
                    tool_id = node_data.get('nodeId')
                    tool_name = node_data.get('label', tool_id)
                    instructions = node_data.get('instructions', '')
                    
                    if tool_id:
                        enabled_tools[tool_id] = {
                            "enabled": True,
                            "description": tool_name,
                            "instructions": instructions
                        }
                        logger.info(f"Added tool from visual flow: {tool_id}")
                        
                        if instructions:
                            workflow_instructions.append(f"For {tool_name}: {instructions}")
                
                elif node_type == "mcpNode":
                    # Extract MCP configuration
                    if node_data.get('mcpType') == 'custom' or node_data.get('isCustom'):
                        # Custom MCP
                        custom_config = node_data.get('customConfig', {})
                        custom_mcps.append({
                            "name": node_data.get('label', 'Custom MCP'),
                            "isCustom": True,
                            "customType": custom_config.get('type', 'http'),
                            "config": custom_config.get('config', {}),
                            "enabledTools": node_data.get('enabledTools', []),
                            "selectedProfileId": node_data.get('selectedProfileId'),
                            "instructions": node_data.get('instructions', '')
                        })
                        logger.info(f"Added custom MCP from visual flow: {node_data.get('label')}")
                    else:
                        # Regular MCP
                        qualified_name = node_data.get('qualifiedName')
                        if qualified_name:
                            configured_mcps.append({
                                "name": node_data.get('label', qualified_name),
                                "qualifiedName": qualified_name,
                                "config": node_data.get('config', {}),
                                "enabledTools": node_data.get('enabledTools', []),
                                "selectedProfileId": node_data.get('selectedProfileId'),
                                "instructions": node_data.get('instructions', '')
                            })
                            logger.info(f"Added configured MCP from visual flow: {qualified_name}")
                
                elif node_type == "agentNode":
                    # Extract agent-specific instructions
                    instructions = node_data.get('instructions', '')
                    if instructions:
                        workflow_instructions.append(f"Agent instructions: {instructions}")
            
            # Also extract from legacy workflow steps as fallback
            try:
                legacy_tools = self._extract_enabled_tools_from_workflow(workflow)
                enabled_tools.update(legacy_tools)
                
                mcp_configs = asyncio.run(self._extract_mcp_configurations_from_workflow_and_agent(workflow))
                configured_mcps.extend(mcp_configs["configured_mcps"])
                custom_mcps.extend(mcp_configs["custom_mcps"])
            except Exception as e:
                logger.warning(f"Error extracting legacy configurations: {e}")
        
        # Build comprehensive system prompt
        system_prompt = self._build_flow_system_prompt(
            workflow, main_prompt, workflow_instructions, variables
        )
        
        return {
            "system_prompt": system_prompt,
            "enabled_tools": enabled_tools,
            "configured_mcps": configured_mcps,
            "custom_mcps": custom_mcps,
            "main_prompt": main_prompt,
            "instructions": workflow_instructions
        }
    
    def _build_flow_system_prompt(
        self, 
        workflow: WorkflowDefinition, 
        main_prompt: str, 
        instructions: List[str], 
        variables: Dict[str, Any]
    ) -> str:
        """Build a comprehensive system prompt from the visual flow analysis."""
        
        prompt_parts = [
            f"You are executing a deterministic workflow: {workflow.name}",
            ""
        ]
        
        if workflow.description:
            prompt_parts.extend([
                f"Workflow Description: {workflow.description}",
                ""
            ])
        
        if main_prompt:
            prompt_parts.extend([
                "Main Task:",
                main_prompt,
                ""
            ])
        
        if instructions:
            prompt_parts.extend([
                "Specific Instructions:",
                *[f"- {instruction}" for instruction in instructions],
                ""
            ])
        
        if variables:
            prompt_parts.extend([
                "Available Variables:",
                *[f"- {key}: {value}" for key, value in variables.items()],
                ""
            ])
        
        prompt_parts.extend([
            "Instructions:",
            "- Follow the workflow requirements exactly as specified",
            "- Use the available tools and MCP connections as needed",
            "- Complete all tasks in the correct order",
            "- Provide clear output for any file operations or reports",
            "- Be thorough and comprehensive in your analysis",
            ""
        ])
        
        return "\n".join(prompt_parts)
    
    def _transform_agent_response_to_workflow_update(
        self, 
        agent_response: Dict[str, Any], 
        execution_id: str
    ) -> Dict[str, Any]:
        """Transform agent response into workflow execution update."""
        workflow_response = {
            **agent_response,
            "execution_id": execution_id,
            "source": "deterministic_workflow_executor"
        }
        
        if isinstance(workflow_response.get('metadata'), str):
            try:
                metadata = json.loads(workflow_response['metadata'])
            except:
                metadata = {}
        else:
            metadata = workflow_response.get('metadata', {})
        
        metadata.update({
            "is_deterministic_workflow": True,
            "workflow_execution_id": execution_id
        })
        
        workflow_response['metadata'] = json.dumps(metadata) if isinstance(workflow_response.get('metadata'), str) else metadata
        
        return workflow_response
    
    
    def _find_entry_points(self, graph: Dict[str, Dict[str, Any]]) -> List[str]:
        """Find nodes that have no incoming edges (entry points)."""
        entry_points = []
        for node_id, node_info in graph.items():
            if not node_info['incoming_edges']:
                entry_points.append(node_id)
        return entry_points
    
    async def _execute_graph(
        self,
        graph: Dict[str, Dict[str, Any]],
        entry_points: List[str],
        context: WorkflowContext,
        workflow: WorkflowDefinition,
        thread_id: str,
        project_id: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Execute the workflow graph following the visual flow with loop support."""
        
        detected_loops = self._detect_loops(graph)
        context.active_loops.update(detected_loops)
        
        node_status = {node_id: NodeStatus.PENDING for node_id in graph.keys()}
        execution_queue = list(entry_points)  # Start with entry points
        completed_nodes = set()
        
        yield {
            "type": "workflow_progress",
            "message": f"Starting execution with entry points: {entry_points}",
            "total_nodes": len(graph),
            "completed_nodes": 0,
            "detected_loops": len(detected_loops)
        }
        
        while execution_queue and context.current_iteration < context.max_iterations:
            context.current_iteration += 1
            current_node_id = execution_queue.pop(0)
            
            current_loop = self._get_node_loop(current_node_id, context.active_loops)
            
            if current_loop:
                loop_result = await self._handle_loop_execution(
                    current_node_id, current_loop, graph, context, workflow, thread_id, project_id
                )
                
                if loop_result['action'] == 'skip':
                    continue
                elif loop_result['action'] == 'exit_loop':
                    self._exit_loop(current_loop, graph, execution_queue, completed_nodes)
                    continue
                elif loop_result['action'] == 'restart_loop':
                    execution_queue.insert(0, current_loop.entry_node)
                    continue
            
            if current_node_id in completed_nodes and not current_loop:
                continue
            
            node_info = graph[current_node_id]

            if not self._are_dependencies_satisfied(node_info['dependencies'], completed_nodes, current_loop):
                execution_queue.append(current_node_id)
                continue
            
            logger.info(f"Executing node {current_node_id} (type: {node_info['type'].value})")
            node_status[current_node_id] = NodeStatus.RUNNING
            
            yield {
                "type": "node_status",
                "node_id": current_node_id,
                "status": "running",
                "message": f"Executing {node_info['type'].value} node",
                "loop_info": {
                    "in_loop": current_loop is not None,
                    "loop_id": current_loop.loop_id if current_loop else None,
                    "iteration": current_loop.current_iteration if current_loop else None
                } if current_loop else None
            }
            
            try:
                node_result = await self._execute_node(
                    current_node_id,
                    node_info,
                    context,
                    workflow,
                    thread_id,
                    project_id
                )
                
                context.node_outputs[current_node_id] = node_result
                if not current_loop:
                    completed_nodes.add(current_node_id)
                
                node_status[current_node_id] = NodeStatus.COMPLETED
                
                yield {
                    "type": "node_status",
                    "node_id": current_node_id,
                    "status": "completed",
                    "output": node_result,
                    "message": f"Completed {node_info['type'].value} node"
                }
                
                for dependent_id in node_info['dependents']:
                    if dependent_id not in execution_queue:
                        if current_loop and dependent_id == current_loop.entry_node:
                            current_loop.current_iteration += 1
                            should_exit = await self._check_loop_exit_condition(
                                current_loop, context, node_result
                            )
                            
                            if should_exit:
                                yield {
                                    "type": "loop_status",
                                    "loop_id": current_loop.loop_id,
                                    "status": "exiting",
                                    "iteration": current_loop.current_iteration,
                                    "message": "Loop exit condition met"
                                }
                                continue
                            else:
                                yield {
                                    "type": "loop_status",
                                    "loop_id": current_loop.loop_id,
                                    "status": "continuing",
                                    "iteration": current_loop.current_iteration,
                                    "message": f"Loop iteration {current_loop.current_iteration}"
                                }
                                execution_queue.insert(0, dependent_id)
                        else:
                            execution_queue.append(dependent_id)
                
                yield {
                    "type": "workflow_progress",
                    "message": f"Completed node {current_node_id}",
                    "total_nodes": len(graph),
                    "completed_nodes": len(completed_nodes)
                }
                
            except Exception as e:
                logger.error(f"Error executing node {current_node_id}: {e}")
                node_status[current_node_id] = NodeStatus.FAILED
                
                yield {
                    "type": "node_status",
                    "node_id": current_node_id,
                    "status": "failed",
                    "error": str(e),
                    "message": f"Failed to execute {node_info['type'].value} node: {str(e)}"
                }
                
                yield {
                    "type": "workflow_status",
                    "status": "failed",
                    "error": f"Node {current_node_id} failed: {str(e)}"
                }
                return
        
        if context.current_iteration >= context.max_iterations:
            yield {
                "type": "workflow_status",
                "status": "failed",
                "error": f"Workflow exceeded maximum iterations ({context.max_iterations})"
            }
        elif len(completed_nodes) == len(graph):
            yield {
                "type": "workflow_status",
                "status": "completed",
                "message": f"All {len(completed_nodes)} nodes completed successfully"
            }
        else:
            pending_nodes = [node_id for node_id, status in node_status.items() if status == NodeStatus.PENDING]
            yield {
                "type": "workflow_status",
                "status": "completed",
                "message": f"Workflow completed with {len(completed_nodes)} nodes. Pending: {pending_nodes}"
            }
    
    def _detect_loops(self, graph: Dict[str, Dict[str, Any]]) -> Dict[str, LoopState]:
        """Detect loops in the workflow graph."""
        loops = {}
        visited = set()
        rec_stack = set()
        
        def dfs(node_id, path):
            if node_id in rec_stack:
                cycle_start = path.index(node_id)
                loop_nodes = set(path[cycle_start:])
                loop_id = f"loop_{len(loops)}"
                
                loops[loop_id] = LoopState(
                    loop_id=loop_id,
                    current_iteration=0,
                    max_iterations=10,
                    condition_met=True,
                    loop_nodes=loop_nodes,
                    entry_node=node_id,
                    exit_condition_node=None
                )
                return
            
            if node_id in visited:
                return
            
            visited.add(node_id)
            rec_stack.add(node_id)
            
            for edge in graph[node_id]['outgoing_edges']:
                target_id = edge['target']
                dfs(target_id, path + [target_id])
            
            rec_stack.remove(node_id)
        
        for node_id in graph:
            if node_id not in visited:
                dfs(node_id, [node_id])
        
        logger.info(f"Detected {len(loops)} loops in workflow")
        return loops

    def _get_node_loop(self, node_id: str, active_loops: Dict[str, LoopState]) -> Optional[LoopState]:
        """Get the loop that contains this node, if any."""
        for loop in active_loops.values():
            if node_id in loop.loop_nodes:
                return loop
        return None

    async def _handle_loop_execution(
        self,
        node_id: str,
        loop_state: LoopState,
        graph: Dict[str, Dict[str, Any]],
        context: WorkflowContext,
        workflow: WorkflowDefinition,
        thread_id: str,
        project_id: str
    ) -> Dict[str, str]:
        """Handle loop execution logic."""
        
        if loop_state.current_iteration >= loop_state.max_iterations:
            logger.warning(f"Loop {loop_state.loop_id} exceeded max iterations")
            return {'action': 'exit_loop'}
        
        if node_id == loop_state.entry_node and loop_state.current_iteration > 0:
            return {'action': 'restart_loop'}
        
        return {'action': 'continue'}

    async def _check_loop_exit_condition(
        self,
        loop_state: LoopState,
        context: WorkflowContext,
        node_result: Dict[str, Any]
    ) -> bool:
        """Check if the loop should exit based on conditions."""
        
        if loop_state.current_iteration >= loop_state.max_iterations:
            return True
        
        if node_result.get('type') == 'agent':
            output = node_result.get('output', '').upper()
            if 'STOP' in output or 'COMPLETE' in output or 'DONE' in output:
                return True
        
        return False

    def _exit_loop(
        self,
        loop_state: LoopState,
        graph: Dict[str, Dict[str, Any]],
        execution_queue: List[str],
        completed_nodes: Set[str]
    ):
        """Exit a loop and add post-loop nodes to execution queue."""
        
        loop_exit_nodes = set()
        for node_id in loop_state.loop_nodes:
            node_info = graph[node_id]
            for edge in node_info['outgoing_edges']:
                target_id = edge['target']
                if target_id not in loop_state.loop_nodes:
                    loop_exit_nodes.add(target_id)
        
        for node_id in loop_exit_nodes:
            if node_id not in execution_queue:
                execution_queue.append(node_id)
        
        completed_nodes.update(loop_state.loop_nodes)

    def _are_dependencies_satisfied(
        self, 
        dependencies: Set[str], 
        completed_nodes: Set[str], 
        current_loop: Optional[LoopState] = None
    ) -> bool:
        """Check if all dependencies for a node are satisfied, considering loops."""
        
        if current_loop:
            loop_dependencies = dependencies.intersection(current_loop.loop_nodes)
            external_dependencies = dependencies - current_loop.loop_nodes
            
            return external_dependencies.issubset(completed_nodes)
        
        return dependencies.issubset(completed_nodes)
    
    async def _ensure_workflow_has_flow_data(self, workflow: WorkflowDefinition) -> WorkflowDefinition:
        """Ensure the workflow has nodes and edges data for deterministic execution."""
        
        if (hasattr(workflow, 'nodes') and hasattr(workflow, 'edges') and 
            workflow.nodes is not None and workflow.edges is not None):
            logger.info(f"Workflow {workflow.id} already has flow data with {len(workflow.nodes)} nodes and {len(workflow.edges)} edges")
            return workflow
        
        try:
            client = await self.db.client
            result = await client.table('workflow_flows').select('*').eq('workflow_id', workflow.id).execute()
            
            logger.info(f"Database query result for workflow {workflow.id}: {result.data}")
            
            if result.data:
                flow_data = result.data[0]
                nodes_data = flow_data.get('nodes', [])
                edges_data = flow_data.get('edges', [])
                
                logger.info(f"Loaded flow data for workflow {workflow.id}: {len(nodes_data)} nodes, {len(edges_data)} edges")
                from .models import WorkflowNode, WorkflowEdge
                
                nodes = []
                for node_data in nodes_data:
                    if isinstance(node_data, dict):
                        node = WorkflowNode(
                            id=node_data.get('id', ''),
                            type=node_data.get('type', ''),
                            position=node_data.get('position', {'x': 0, 'y': 0}),
                            data=node_data.get('data', {})
                        )
                        nodes.append(node)
                
                edges = []
                for edge_data in edges_data:
                    if isinstance(edge_data, dict):
                        edge = WorkflowEdge(
                            id=edge_data.get('id', ''),
                            source=edge_data.get('source', ''),
                            target=edge_data.get('target', ''),
                            sourceHandle=edge_data.get('sourceHandle'),
                            targetHandle=edge_data.get('targetHandle')
                        )
                        edges.append(edge)
                
                workflow_dict = workflow.model_dump() if hasattr(workflow, 'model_dump') else workflow.dict()
                workflow_dict['nodes'] = nodes if nodes else []
                workflow_dict['edges'] = edges if edges else []
                
                enhanced_workflow = type(workflow)(**workflow_dict)
                return enhanced_workflow
            
            else:
                logger.warning(f"No visual flow data found for workflow {workflow.id}")
                logger.info(f"Falling back to legacy executor since no visual flow data exists")
                raise ValueError("No visual flow data found - falling back to legacy executor")
                
        except Exception as e:
            logger.error(f"Error loading visual flow data for workflow {workflow.id}: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            workflow_dict = workflow.model_dump() if hasattr(workflow, 'model_dump') else workflow.dict()
            workflow_dict['nodes'] = []
            workflow_dict['edges'] = []
            enhanced_workflow = type(workflow)(**workflow_dict)
            logger.info(f"Created workflow with empty flow data as fallback")
            return enhanced_workflow
    
    async def _execute_node(
        self,
        node_id: str,
        node_info: Dict[str, Any],
        context: WorkflowContext,
        workflow: WorkflowDefinition,
        thread_id: str,
        project_id: str
    ) -> Dict[str, Any]:
        """Execute a single node based on its type."""
        
        node_type = node_info['type']
        node_data = node_info['data']

        input_data = self._prepare_node_input(node_id, node_info, context)
        
        if node_type == NodeType.INPUT:
            return await self._execute_input_node(node_id, node_data, input_data, context)
        
        elif node_type == NodeType.MCP:
            return await self._execute_mcp_node(node_id, node_data, input_data, context, workflow)
        
        elif node_type == NodeType.TOOL:
            return await self._execute_tool_node(node_id, node_data, input_data, context, workflow)
        
        elif node_type == NodeType.AGENT:
            return await self._execute_agent_node(
                node_id, node_data, input_data, context, workflow, thread_id, project_id
            )
        
        else:
            raise ValueError(f"Unknown node type: {node_type}")
    
    def _prepare_node_input(
        self, 
        node_id: str, 
        node_info: Dict[str, Any], 
        context: WorkflowContext
    ) -> Dict[str, Any]:
        """Prepare input data for a node from its dependencies."""
        input_data = {}

        for edge in node_info['incoming_edges']:
            source_id = edge['source']
            source_handle = edge.get('source_handle', 'output')
            target_handle = edge.get('target_handle', 'input')
            
            if source_id in context.node_outputs:
                source_output = context.node_outputs[source_id]
                
                if target_handle == 'tools':
                    if 'available_tools' not in input_data:
                        input_data['available_tools'] = []
                    input_data['available_tools'].append(source_output)
                elif target_handle == 'mcp':
                    if 'available_mcps' not in input_data:
                        input_data['available_mcps'] = []
                    input_data['available_mcps'].append(source_output)
                else:
                    input_data[target_handle] = source_output
        
        input_data['variables'] = context.variables
        
        return input_data
    
    async def _execute_input_node(
        self,
        node_id: str,
        node_data: Dict[str, Any],
        input_data: Dict[str, Any],
        context: WorkflowContext
    ) -> Dict[str, Any]:
        """Execute an input node."""
        logger.info(f"Executing input node {node_id}")

        prompt = node_data.get('prompt', '')
        
        for var_name, var_value in context.variables.items():
            prompt = prompt.replace(f"{{{var_name}}}", str(var_value))
        
        return {
            'type': 'input',
            'prompt': prompt,
            'data': node_data
        }
    
    async def _execute_mcp_node(
        self,
        node_id: str,
        node_data: Dict[str, Any],
        input_data: Dict[str, Any],
        context: WorkflowContext,
        workflow: WorkflowDefinition
    ) -> Dict[str, Any]:
        """Execute an MCP node - this makes MCP tools available."""
        logger.info(f"Executing MCP node {node_id}")
        
        mcp_config = {
            'name': node_data.get('label', 'MCP Server'),
            'qualified_name': node_data.get('qualifiedName'),
            'enabled_tools': node_data.get('enabledTools', []),
            'config': node_data.get('config', {}),
            'custom_type': node_data.get('customType'),
            'is_custom': node_data.get('isCustom', False)
        }
        
        return {
            'type': 'mcp',
            'mcp_config': mcp_config,
            'data': node_data
        }
    
    async def _execute_tool_node(
        self,
        node_id: str,
        node_data: Dict[str, Any],
        input_data: Dict[str, Any],
        context: WorkflowContext,
        workflow: WorkflowDefinition
    ) -> Dict[str, Any]:
        """Execute a tool node - this makes tools available or executes them if they're final nodes."""
        logger.info(f"Executing tool node {node_id}")
        
        tool_id = node_data.get('nodeId')
        tool_name = node_data.get('label')
        instructions = node_data.get('instructions', '')
        
        has_outgoing_edges = False
        
        if hasattr(workflow, 'edges') and workflow.edges:
            for edge in workflow.edges:
                if (hasattr(edge, 'source') and edge.source == node_id) or \
                   (isinstance(edge, dict) and edge.get('source') == node_id):
                    has_outgoing_edges = True
                    break
        if not has_outgoing_edges:
            logger.info(f"Tool node {node_id} is a final node, executing tool {tool_id}")
            
            agent_output = ""
            agent_data = None
            for key, value in input_data.items():
                if isinstance(value, dict) and value.get('type') == 'agent':
                    agent_output = value.get('output', '')
                    agent_data = value
                    break
            
            return await self._execute_tool_with_agentpress(
                tool_id, tool_name, instructions, agent_output, agent_data, context, workflow
            )
        else:
            logger.info(f"Tool node {node_id} has outgoing connections, making tool {tool_id} available")
            tool_config = {
                'id': tool_id,
                'name': tool_name,
                'instructions': instructions,
                'enabled': True
            }
            
            return {
                'type': 'tool',
                'tool_config': tool_config,
                'data': node_data
            }
    
    def _prepare_tool_input(
        self,
        tool_id: str,
        tool_name: str,
        instructions: str,
        agent_output: str,
        agent_data: Dict[str, Any],
        context: WorkflowContext
    ) -> Dict[str, Any]:
        """Prepare input for any tool based on its type and the available data."""
        
        tool_input = {}
        
        if tool_id == 'sb_files_tool':
            tool_input = {
                'operation': 'create',
                'content': agent_output,
                'filename': f"workflow_report_{context.current_iteration}.md",
                'instructions': instructions
            }
            
        elif tool_id == 'message_tool':
            tool_input = {
                'message': agent_output,
                'instructions': instructions
            }
            
        elif tool_id == 'web_search_tool':
            search_query = instructions if instructions else "search query from workflow"
            tool_input = {
                'query': search_query,
                'instructions': instructions
            }
            
        elif 'search' in tool_id.lower():
            search_query = instructions if instructions else agent_output[:100]
            tool_input = {
                'query': search_query,
                'instructions': instructions
            }
            
        elif 'file' in tool_id.lower() or 'document' in tool_id.lower():
            tool_input = {
                'content': agent_output,
                'instructions': instructions,
                'operation': 'create'
            }
            
        elif 'email' in tool_id.lower() or 'mail' in tool_id.lower():
            tool_input = {
                'subject': f"Workflow Report - {tool_name}",
                'body': agent_output,
                'instructions': instructions
            }
            
        else:
            tool_input = {
                'input': agent_output,
                'instructions': instructions,
                'data': agent_output,
                'content': agent_output,
                'text': agent_output
            }
        
        tool_input['workflow_context'] = {
            'workflow_id': workflow.id,
            'workflow_name': workflow.name,
            'node_outputs': context.node_outputs,
            'variables': context.variables
        }
        
        logger.info(f"Prepared input for tool {tool_id}: {list(tool_input.keys())}")
        return tool_input
    
    async def _execute_file_operations_tool(
        self,
        node_id: str,
        tool_name: str,
        instructions: str,
        agent_output: str,
        context: WorkflowContext
    ) -> Dict[str, Any]:
        """Execute the file operations tool to create a report."""
        logger.info(f"Executing file operations tool for node {node_id}")
        
        try:
            report_content = self._create_report_from_agent_output(agent_output, instructions)
            
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            filename = f"workflow_report_{timestamp}.md"
            
            logger.info(f"Created report: {filename} ({len(report_content)} characters)")
            
            return {
                'type': 'file_operation',
                'operation': 'create_report',
                'filename': filename,
                'content': report_content,
                'message': f"Successfully created {filename} with {len(report_content)} characters",
                'data': {
                    'tool_name': tool_name,
                    'instructions': instructions,
                    'agent_output_length': len(agent_output)
                }
            }
            
        except Exception as e:
            logger.error(f"Error executing file operations tool: {e}")
            return {
                'type': 'file_operation',
                'operation': 'create_report',
                'error': str(e),
                'message': f"Failed to create report: {str(e)}"
            }
    
    def _create_report_from_agent_output(self, agent_output: str, instructions: str) -> str:
        """Create a formatted markdown report from agent output."""
        
        from datetime import datetime
        current_date = datetime.now().strftime("%B %d, %Y")
        
        report = f"""# Daily Stock Market Analysis Report

**Date:** {current_date}
**Generated by:** Automated Workflow System

## Executive Summary

{self._extract_summary_from_output(agent_output)}

## Detailed Analysis

{self._format_agent_output_as_markdown(agent_output)}

## Instructions Applied

{instructions}

---

*This report was automatically generated based on the analysis instructions: "{instructions}"*

**Report Statistics:**
- Analysis Length: {len(agent_output)} characters
- Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
"""
        
        return report
    
    def _extract_summary_from_output(self, agent_output: str) -> str:
        """Extract a summary from the agent output."""
        sentences = agent_output.split('. ')
        if len(sentences) >= 2:
            return '. '.join(sentences[:2]) + '.'
        else:
            return agent_output[:200] + "..." if len(agent_output) > 200 else agent_output
    
    def _format_agent_output_as_markdown(self, agent_output: str) -> str:
        """Format the agent output as proper markdown."""
        formatted = agent_output
        
        formatted = formatted.replace('\n\n', '\n\n')
        
        lines = formatted.split('\n')
        formatted_lines = []
        
        for line in lines:
            if line.strip() and line.strip()[0].isdigit() and '. ' in line:
                formatted_lines.append(f"1. {line.strip().split('. ', 1)[1]}")

            elif line.strip() and len(line.strip()) > 2 and line.strip()[1:3] == '. ':
                formatted_lines.append(f"- {line.strip().split('. ', 1)[1]}")
            else:
                formatted_lines.append(line)
        
        return '\n'.join(formatted_lines)
    
    async def _execute_agent_node(
        self,
        node_id: str,
        node_data: Dict[str, Any],
        input_data: Dict[str, Any],
        context: WorkflowContext,
        workflow: WorkflowDefinition,
        thread_id: str,
        project_id: str
    ) -> Dict[str, Any]:
        """Execute an agent node - this runs the actual agent with available tools."""
        logger.info(f"Executing agent node {node_id}")
        
        available_tools = {
            "sb_files_tool": {"enabled": True, "description": "File operations"},
            "message_tool": {"enabled": True, "description": "Send messages"}, 
            "expand_msg_tool": {"enabled": True, "description": "Expand messages"}
        }
        
        for tool_data in input_data.get('available_tools', []):
            if tool_data['type'] == 'tool':
                tool_config = tool_data['tool_config']
                tool_id = tool_config['id']
                if tool_id:
                    available_tools[tool_id] = {
                        'enabled': True,
                        'description': tool_config.get('name', tool_config['id']),
                        'instructions': tool_config.get('instructions', '')
                    }
                    logger.info(f"Added tool from visual flow: {tool_id}")
        
        workflow_tools = self._extract_enabled_tools_from_workflow(workflow)
        available_tools.update(workflow_tools)
        
        available_mcps = []
        custom_mcps = []
        
        for mcp_data in input_data.get('available_mcps', []):
            if mcp_data['type'] == 'mcp':
                mcp_config = mcp_data['mcp_config']
                if mcp_config.get('is_custom'):
                    custom_mcps.append({
                        'name': mcp_config['name'],
                        'customType': mcp_config.get('custom_type', 'http'),
                        'config': mcp_config.get('config', {}),
                        'enabledTools': mcp_config.get('enabled_tools', []),
                        'isCustom': True
                    })
                else:
                    available_mcps.append({
                        'name': mcp_config['name'],
                        'qualifiedName': mcp_config.get('qualified_name'),
                        'config': mcp_config.get('config', {}),
                        'enabledTools': mcp_config.get('enabled_tools', [])
                    })
        
        try:
            workflow_mcps = await self._extract_mcp_configurations_from_workflow_and_agent(workflow)
            available_mcps.extend(workflow_mcps["configured_mcps"])
            custom_mcps.extend(workflow_mcps["custom_mcps"])
        except Exception as e:
            logger.warning(f"Error extracting MCP configurations from workflow: {e}")
        
        prompt = ""
        for key, value in input_data.items():
            if isinstance(value, dict) and value.get('type') == 'input':
                prompt = value.get('prompt', '')
                break

        if not prompt and workflow.steps:
            main_step = workflow.steps[0]
            prompt = main_step.config.get("input_prompt", "")
        
        agent_config = {
            'name': node_data.get('label', 'Workflow Agent'),
            'system_prompt': self._build_agent_system_prompt(node_data, workflow, prompt),
            'agentpress_tools': available_tools,
            'configured_mcps': available_mcps,
            'custom_mcps': custom_mcps
        }
        
        logger.info(f"Agent config for deterministic workflow - tools: {list(available_tools.keys())}")
        logger.info(f"Agent config for deterministic workflow - configured_mcps: {len(available_mcps)} servers")
        logger.info(f"Agent config for deterministic workflow - custom_mcps: {len(custom_mcps)} servers")
        
        from agent.run import run_agent
        
        agent_output = []
        try:
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
                if response.get('type') == 'assistant':
                    content = response.get('content', {})
                    if isinstance(content, str):
                        content = json.loads(content)
                    agent_output.append(content.get('content', ''))
                elif response.get('type') == 'status':
                    status = response.get('status')
                    if status in ['completed', 'failed', 'stopped']:
                        break
        
        except Exception as e:
            logger.error(f"Error running agent in node {node_id}: {e}")
            raise
        
        return {
            'type': 'agent',
            'output': '\n'.join(agent_output),
            'agent_config': agent_config,
            'data': node_data
        }
    
    def _extract_enabled_tools_from_workflow(self, workflow: WorkflowDefinition) -> Dict[str, Dict[str, Any]]:
        """Extract tools that should be enabled based on workflow configuration (same as legacy executor)."""
        enabled_tools = {}
        
        logger.info(f"Processing workflow with {len(workflow.steps)} steps for tool extraction")
        
        for step in workflow.steps:
            step_config = step.config or {}
            tools_section = step_config.get("tools", [])
            
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
        
        logger.info(f"Final enabled tools from workflow steps: {list(enabled_tools.keys())}")
        return enabled_tools

    async def _extract_mcp_configurations_from_workflow_and_agent(self, workflow: WorkflowDefinition) -> Dict[str, List[Dict[str, Any]]]:
        """Extract MCP configurations from workflow steps and agent using credential manager (same as legacy executor)."""
        configured_mcps = []
        custom_mcps = []
        
        logger.info(f"Processing workflow with {len(workflow.steps)} steps for MCP extraction")

        for step in workflow.steps:
            step_config = step.config or {}
            
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
                            "selectedProfileId": mcp.get("selectedProfileId"),
                            "instructions": mcp.get("instructions", "")
                        })
                        logger.info(f"Added configured MCP from workflow step: {qualified_name}")
            
            step_custom_mcps = step_config.get("custom_mcps", [])
            logger.info(f"Step {step.id} - custom_mcps: {step_custom_mcps}")
            
            for mcp in step_custom_mcps:
                if isinstance(mcp, dict):
                    mcp_name = mcp.get("name", "Custom MCP")
                    custom_mcps.append({
                        "name": mcp_name,
                        "isCustom": True,
                        "customType": mcp.get("customType", mcp.get("type", "sse")),
                        "config": mcp.get("config", {}),
                        "enabledTools": mcp.get("enabledTools", []),
                        "selectedProfileId": mcp.get("selectedProfileId"),
                        "instructions": mcp.get("instructions", "")
                    })
                    logger.info(f"Added custom MCP from workflow step: {mcp_name}")
        
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
                            credential = await credential_manager.get_credential_by_profile(account_id, selected_profile_id)
                        else:
                            credential = await credential_manager.get_default_credential_profile(account_id, qualified_name)
                        
                        if credential:
                            configured_mcps[i]["config"] = credential.config
                            logger.info(f"Added credentials for MCP {qualified_name}")
                        else:
                            logger.warning(f"No credential profile found for MCP {qualified_name}")
                            
                    except Exception as e:
                        logger.error(f"Error getting credential for MCP {qualified_name}: {e}")
            
            # Load credentials for custom MCPs
            for i, mcp in enumerate(custom_mcps):
                mcp_name = mcp.get("name", "Custom MCP")
                selected_profile_id = mcp.get("selectedProfileId")
                
                if not mcp.get("config"):
                    try:
                        if selected_profile_id:
                            credential = await credential_manager.get_credential_by_profile(account_id, selected_profile_id)
                        else:
                            # Fallback to default profile lookup for custom MCPs
                            mcp_type = mcp.get("customType", "sse")
                            custom_qualified_name = f"custom_{mcp_type}_{mcp_name.replace(' ', '_').lower()}"
                            credential = await credential_manager.get_default_credential_profile(account_id, custom_qualified_name)
                        
                        if credential:
                            custom_mcps[i]["config"] = credential.config
                            logger.info(f"Added credentials for custom MCP {mcp_name}")
                        else:
                            logger.warning(f"No credential profile found for custom MCP {mcp_name}")
                            
                    except Exception as e:
                        logger.error(f"Error getting credential for custom MCP {mcp_name}: {e}")
        
        logger.info(f"Final configured MCPs: {len(configured_mcps)} servers")
        logger.info(f"Final custom MCPs: {len(custom_mcps)} servers")
        
        return {
            "configured_mcps": configured_mcps,
            "custom_mcps": custom_mcps
        }
    
    def _build_agent_system_prompt(
        self, 
        node_data: Dict[str, Any], 
        workflow: WorkflowDefinition, 
        input_prompt: str
    ) -> str:
        """Build the system prompt for an agent node."""
        
        base_prompt = f"""You are executing a step in a visual workflow: {workflow.name}

WORKFLOW STEP: {node_data.get('label', 'Agent Node')}

USER INPUT: {input_prompt}

INSTRUCTIONS:
- Execute this workflow step based on the input provided
- Use the available tools and MCP connections as needed
- Provide clear output that can be used by subsequent workflow steps
- Be concise but thorough in your response

"""
        
        # Add any custom instructions from the node
        if node_data.get('instructions'):
            base_prompt += f"\nADDITIONAL INSTRUCTIONS: {node_data['instructions']}\n"
        
        return base_prompt
    
    # Helper methods (same as original executor)
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
    
    async def _ensure_workflow_thread_exists(
        self, 
        thread_id: str, 
        project_id: str, 
        workflow: WorkflowDefinition, 
        variables: Optional[Dict[str, Any]] = None
    ):
        """Ensure a thread exists for workflow execution."""
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
                    "is_workflow_execution": True,
                    "workflow_run_name": f"Deterministic Workflow Run: {workflow.name}"
                },
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await client.table('threads').insert(thread_data).execute()
            
            # Create initial message with workflow context
            initial_message = f"Starting deterministic execution of workflow: {workflow.name}"
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
            logger.info(f"Created workflow thread {thread_id} for deterministic workflow {workflow.id}")
            
        except Exception as e:
            logger.error(f"Failed to create workflow thread: {e}")
            raise

    async def _ensure_project_has_sandbox(self, project_id: str):
        """Ensure that a project has a sandbox, creating one if it doesn't exist."""
        try:
            client = await self.db.client
            
            # Get project data
            project_result = await client.table('projects').select('*').eq('project_id', project_id).execute()
            if not project_result.data:
                raise ValueError(f"Project {project_id} not found")
            
            project_data = project_result.data[0]
            sandbox_info = project_data.get('sandbox', {})
            sandbox_id = sandbox_info.get('id') if sandbox_info else None
            
            # If no sandbox exists, create one
            if not sandbox_id:
                logger.info(f"No sandbox found for workflow project {project_id}, creating new sandbox")
                await self._create_new_sandbox_for_project(client, project_id)
            else:
                # Sandbox ID exists, try to ensure it's running
                logger.info(f"Sandbox {sandbox_id} already exists for workflow project {project_id}, ensuring it's active")
                try:
                    from sandbox.sandbox import get_or_start_sandbox
                    await get_or_start_sandbox(sandbox_id)
                    logger.info(f"Sandbox {sandbox_id} is now active for workflow project {project_id}")
                except Exception as sandbox_error:
                    # If sandbox doesn't exist in Daytona, create a new one
                    if "not found" in str(sandbox_error).lower():
                        logger.warning(f"Sandbox {sandbox_id} not found in Daytona system, creating new sandbox for project {project_id}")
                        await self._create_new_sandbox_for_project(client, project_id)
                    else:
                        # Re-raise other errors
                        raise sandbox_error
            
        except Exception as e:
            logger.error(f"Failed to ensure sandbox for workflow project {project_id}: {e}")
            raise

    async def _create_new_sandbox_for_project(self, client, project_id: str):
        """Create a new sandbox and update the project record."""
        from sandbox.sandbox import create_sandbox
        import uuid
        
        # Create a new sandbox
        sandbox_pass = str(uuid.uuid4())
        sandbox = create_sandbox(sandbox_pass, project_id)
        sandbox_id = sandbox.id
        logger.info(f"Created new sandbox {sandbox_id} for workflow project {project_id}")
        
        # Get preview links
        vnc_link = sandbox.get_preview_link(6080)
        website_link = sandbox.get_preview_link(8080)
        vnc_url = vnc_link.url if hasattr(vnc_link, 'url') else str(vnc_link).split("url='")[1].split("'")[0]
        website_url = website_link.url if hasattr(website_link, 'url') else str(website_link).split("url='")[1].split("'")[0]
        token = None
        if hasattr(vnc_link, 'token'):
            token = vnc_link.token
        elif "token='" in str(vnc_link):
            token = str(vnc_link).split("token='")[1].split("'")[0]
        
        # Update project with sandbox info
        update_result = await client.table('projects').update({
            'sandbox': {
                'id': sandbox_id, 
                'pass': sandbox_pass, 
                'vnc_preview': vnc_url,
                'sandbox_url': website_url, 
                'token': token
            }
        }).eq('project_id', project_id).execute()
        
        if not update_result.data:
            logger.error(f"Failed to update project {project_id} with new sandbox {sandbox_id}")
            # Clean up the sandbox if database update failed
            try:
                from sandbox.sandbox import delete_sandbox
                await delete_sandbox(sandbox_id)
            except Exception as cleanup_e:
                logger.error(f"Error cleaning up sandbox {sandbox_id}: {str(cleanup_e)}")
            raise Exception("Failed to update project with sandbox information")
        
        logger.info(f"Successfully created and configured sandbox {sandbox_id} for workflow project {project_id}") 