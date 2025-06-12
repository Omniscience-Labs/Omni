"""
Workflow Orchestrator

Manages workflow execution, coordination, and state management.
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Set
from collections import defaultdict

from .models import (
    WorkflowDefinition, ExecutionContext, ExecutionStatus,
    NodeType, NodeConfig, Connection, WorkflowExecution
)
from .executor import WorkflowExecutor
from .state import WorkflowStateManager
from services.redis import redis
from services.supabase import DBConnection
from utils.logger import logger
import dramatiq


class WorkflowOrchestrator:
    """Orchestrates workflow execution"""
    
    def __init__(self, db: DBConnection):
        self.db = db
        self.state_manager = WorkflowStateManager(redis)
        self.executor = WorkflowExecutor(db, self.state_manager)
        self.active_executions: Dict[str, asyncio.Task] = {}
        
    async def initialize(self):
        """Initialize the orchestrator"""
        logger.info("Initializing workflow orchestrator")
        
        # Start execution queue consumer
        asyncio.create_task(self._execution_queue_consumer())
        
        # Start execution monitor
        asyncio.create_task(self._execution_monitor())
        
    async def execute_workflow(self, workflow_id: str, execution_id: str):
        """Execute a workflow"""
        try:
            # Load workflow definition
            workflow = await self._load_workflow(workflow_id)
            if not workflow:
                raise ValueError(f"Workflow {workflow_id} not found")
                
            # Load execution context
            context = await self.state_manager.get_execution_context(execution_id)
            if not context:
                raise ValueError(f"Execution context {execution_id} not found")
                
            # Create execution record
            execution = await self._create_execution_record(workflow, context)
            
            # Update context status
            context.status = ExecutionStatus.RUNNING
            await self.state_manager.save_execution_context(context)
            
            # Create execution task
            task = asyncio.create_task(
                self._execute_workflow_async(workflow, context, execution)
            )
            self.active_executions[execution_id] = task
            
            # Wait for completion with timeout
            try:
                await asyncio.wait_for(task, timeout=workflow.timeout_seconds)
            except asyncio.TimeoutError:
                logger.error(f"Workflow execution {execution_id} timed out")
                context.status = ExecutionStatus.TIMEOUT
                execution.status = ExecutionStatus.TIMEOUT
                execution.error = "Workflow execution timed out"
                
        except Exception as e:
            logger.error(f"Error executing workflow {workflow_id}: {e}")
            if context:
                context.status = ExecutionStatus.FAILED
                context.errors.append({
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                })
                await self.state_manager.save_execution_context(context)
                
        finally:
            # Clean up
            if execution_id in self.active_executions:
                del self.active_executions[execution_id]
                
            # Update execution record
            if execution:
                await self._update_execution_record(execution)
                
    async def cancel_execution(self, execution_id: str) -> bool:
        """Cancel a running workflow execution"""
        if execution_id in self.active_executions:
            task = self.active_executions[execution_id]
            task.cancel()
            
            # Update context
            context = await self.state_manager.get_execution_context(execution_id)
            if context:
                context.status = ExecutionStatus.CANCELLED
                await self.state_manager.save_execution_context(context)
                
            return True
        return False
        
    async def get_execution_status(self, execution_id: str) -> Optional[Dict[str, Any]]:
        """Get the status of a workflow execution"""
        context = await self.state_manager.get_execution_context(execution_id)
        if not context:
            return None
            
        return {
            "execution_id": execution_id,
            "workflow_id": context.workflow_id,
            "status": context.status,
            "started_at": context.started_at.isoformat(),
            "completed_at": context.completed_at.isoformat() if context.completed_at else None,
            "node_statuses": context.node_statuses,
            "errors": context.errors,
            "progress": self._calculate_progress(context)
        }
        
    async def _execute_workflow_async(self, workflow: WorkflowDefinition, 
                                    context: ExecutionContext,
                                    execution: WorkflowExecution):
        """Execute workflow asynchronously"""
        try:
            # Build execution graph
            graph = self._build_execution_graph(workflow)
            
            # Find entry nodes (nodes with no incoming connections)
            entry_nodes = self._find_entry_nodes(workflow, graph)
            
            # Execute nodes in topological order
            executed_nodes: Set[str] = set()
            execution_queue: List[str] = entry_nodes.copy()
            
            while execution_queue:
                # Get nodes that can be executed in parallel
                ready_nodes = []
                for node_id in execution_queue[:]:
                    if self._can_execute_node(node_id, executed_nodes, graph):
                        ready_nodes.append(node_id)
                        execution_queue.remove(node_id)
                        
                if not ready_nodes:
                    # Check for circular dependencies
                    if execution_queue:
                        raise ValueError("Circular dependency detected in workflow")
                    break
                    
                # Execute ready nodes in parallel
                node_tasks = []
                for node_id in ready_nodes:
                    node = next(n for n in workflow.nodes if n.id == node_id)
                    task = asyncio.create_task(
                        self._execute_node(node, context, workflow)
                    )
                    node_tasks.append((node_id, task))
                    
                # Wait for all parallel nodes to complete
                for node_id, task in node_tasks:
                    try:
                        await task
                        executed_nodes.add(node_id)
                        
                        # Add downstream nodes to queue
                        for downstream_id in graph["downstream"].get(node_id, []):
                            if downstream_id not in executed_nodes and downstream_id not in execution_queue:
                                execution_queue.append(downstream_id)
                                
                    except Exception as e:
                        logger.error(f"Error executing node {node_id}: {e}")
                        context.node_statuses[node_id] = ExecutionStatus.FAILED
                        context.errors.append({
                            "node_id": node_id,
                            "error": str(e),
                            "timestamp": datetime.utcnow().isoformat()
                        })
                        
                        # Handle error based on node configuration
                        node = next(n for n in workflow.nodes if n.id == node_id)
                        if node.on_error == "fail":
                            raise
                        elif node.on_error == "continue":
                            executed_nodes.add(node_id)
                            
                # Save intermediate state
                await self.state_manager.save_execution_context(context)
                
            # Workflow completed successfully
            context.status = ExecutionStatus.COMPLETED
            context.completed_at = datetime.utcnow()
            
            execution.status = ExecutionStatus.COMPLETED
            execution.completed_at = context.completed_at
            execution.nodes_executed = len(executed_nodes)
            
        except asyncio.CancelledError:
            logger.info(f"Workflow execution {context.execution_id} was cancelled")
            context.status = ExecutionStatus.CANCELLED
            execution.status = ExecutionStatus.CANCELLED
            raise
            
        except Exception as e:
            logger.error(f"Workflow execution {context.execution_id} failed: {e}")
            context.status = ExecutionStatus.FAILED
            context.errors.append({
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            })
            
            execution.status = ExecutionStatus.FAILED
            execution.error = str(e)
            
        finally:
            # Save final state
            await self.state_manager.save_execution_context(context)
            
            # Calculate metrics
            if execution.started_at and execution.completed_at:
                execution.duration_seconds = (
                    execution.completed_at - execution.started_at
                ).total_seconds()
                
            execution.tokens_used = context.total_tokens
            execution.cost = context.total_cost
            
    async def _execute_node(self, node: NodeConfig, context: ExecutionContext,
                          workflow: WorkflowDefinition):
        """Execute a single node"""
        start_time = datetime.utcnow()
        context.node_statuses[node.id] = ExecutionStatus.RUNNING
        
        try:
            # Get input data from upstream nodes
            input_data = await self._gather_node_inputs(node, context, workflow)
            
            # Execute node based on type
            output = await self.executor.execute_node(node, input_data, context)
            
            # Store output
            context.node_outputs[node.id] = output
            context.node_statuses[node.id] = ExecutionStatus.COMPLETED
            
            # Record duration
            duration = (datetime.utcnow() - start_time).total_seconds()
            context.node_durations[node.id] = duration
            
            logger.info(f"Node {node.id} ({node.name}) completed in {duration:.2f}s")
            
        except Exception as e:
            context.node_statuses[node.id] = ExecutionStatus.FAILED
            raise
            
    async def _gather_node_inputs(self, node: NodeConfig, context: ExecutionContext,
                                workflow: WorkflowDefinition) -> Dict[str, Any]:
        """Gather inputs for a node from upstream connections"""
        inputs = {}
        
        # Find incoming connections
        for connection in workflow.connections:
            if connection.target_node_id == node.id:
                source_output = context.node_outputs.get(connection.source_node_id)
                
                if source_output is not None:
                    # Apply transformation if configured
                    if connection.transform:
                        source_output = await self._apply_transformation(
                            source_output, connection.transform
                        )
                        
                    # Store input by handle name
                    handle_name = connection.target_handle
                    if handle_name not in inputs:
                        inputs[handle_name] = []
                    inputs[handle_name].append(source_output)
                    
        # Flatten single-item lists
        for key, value in inputs.items():
            if isinstance(value, list) and len(value) == 1:
                inputs[key] = value[0]
                
        return inputs
        
    async def _apply_transformation(self, data: Any, transform: Dict[str, Any]) -> Any:
        """Apply data transformation"""
        # TODO: Implement data transformation logic
        # This could include JSONPath, JMESPath, or custom transformations
        return data
        
    def _build_execution_graph(self, workflow: WorkflowDefinition) -> Dict[str, Dict[str, List[str]]]:
        """Build execution graph from workflow definition"""
        graph = {
            "upstream": defaultdict(list),
            "downstream": defaultdict(list)
        }
        
        for connection in workflow.connections:
            graph["downstream"][connection.source_node_id].append(connection.target_node_id)
            graph["upstream"][connection.target_node_id].append(connection.source_node_id)
            
        return graph
        
    def _find_entry_nodes(self, workflow: WorkflowDefinition, 
                         graph: Dict[str, Dict[str, List[str]]]) -> List[str]:
        """Find entry nodes (nodes with no upstream dependencies)"""
        entry_nodes = []
        
        for node in workflow.nodes:
            if node.id not in graph["upstream"] or not graph["upstream"][node.id]:
                entry_nodes.append(node.id)
                
        return entry_nodes
        
    def _can_execute_node(self, node_id: str, executed_nodes: Set[str],
                         graph: Dict[str, Dict[str, List[str]]]) -> bool:
        """Check if a node can be executed"""
        # Check if all upstream nodes have been executed
        upstream_nodes = graph["upstream"].get(node_id, [])
        return all(upstream_id in executed_nodes for upstream_id in upstream_nodes)
        
    def _calculate_progress(self, context: ExecutionContext) -> float:
        """Calculate workflow execution progress"""
        if not context.node_statuses:
            return 0.0
            
        completed_nodes = sum(
            1 for status in context.node_statuses.values()
            if status in [ExecutionStatus.COMPLETED, ExecutionStatus.FAILED]
        )
        
        total_nodes = len(context.node_statuses)
        return (completed_nodes / total_nodes) * 100 if total_nodes > 0 else 0.0
        
    async def _load_workflow(self, workflow_id: str) -> Optional[WorkflowDefinition]:
        """Load workflow definition from database"""
        client = await self.db.client
        result = await client.table('workflows').select('*').eq('id', workflow_id).single().execute()
        
        if result.data:
            return WorkflowDefinition(**result.data)
        return None
        
    async def _create_execution_record(self, workflow: WorkflowDefinition,
                                     context: ExecutionContext) -> WorkflowExecution:
        """Create workflow execution record"""
        execution = WorkflowExecution(
            workflow_id=workflow.id,
            workflow_version=workflow.version,
            workflow_name=workflow.name,
            execution_context=context,
            project_id=workflow.project_id,
            triggered_by=context.trigger_data.get("user_id", "system"),
            started_at=datetime.utcnow(),
            status=ExecutionStatus.RUNNING
        )
        
        # Store in database
        client = await self.db.client
        await client.table('workflow_executions').insert({
            "id": execution.id,
            "workflow_id": execution.workflow_id,
            "workflow_version": execution.workflow_version,
            "workflow_name": execution.workflow_name,
            "execution_context": context.dict(),
            "project_id": execution.project_id,
            "triggered_by": execution.triggered_by,
            "started_at": execution.started_at.isoformat(),
            "status": execution.status
        }).execute()
        
        return execution
        
    async def _update_execution_record(self, execution: WorkflowExecution):
        """Update workflow execution record"""
        client = await self.db.client
        await client.table('workflow_executions').update({
            "completed_at": execution.completed_at.isoformat() if execution.completed_at else None,
            "duration_seconds": execution.duration_seconds,
            "status": execution.status,
            "result": execution.result,
            "error": execution.error,
            "nodes_executed": execution.nodes_executed,
            "tokens_used": execution.tokens_used,
            "cost": execution.cost
        }).eq("id", execution.id).execute()
        
    async def _execution_queue_consumer(self):
        """Consume workflow execution queue"""
        while True:
            try:
                # Get next execution from queue
                item = await redis.brpop("workflow_execution_queue", timeout=1)
                if not item:
                    continue
                    
                _, data = item
                execution_data = json.loads(data)
                
                workflow_id = execution_data["workflow_id"]
                execution_id = execution_data["execution_id"]
                
                # Execute workflow
                asyncio.create_task(self.execute_workflow(workflow_id, execution_id))
                
            except Exception as e:
                logger.error(f"Error in execution queue consumer: {e}")
                await asyncio.sleep(1)
                
    async def _execution_monitor(self):
        """Monitor active executions for timeouts and health"""
        while True:
            try:
                # Check active executions
                for execution_id, task in list(self.active_executions.items()):
                    if task.done():
                        del self.active_executions[execution_id]
                        
                # Log status
                if self.active_executions:
                    logger.info(f"Active workflow executions: {len(self.active_executions)}")
                    
                await asyncio.sleep(30)  # Check every 30 seconds
                
            except Exception as e:
                logger.error(f"Error in execution monitor: {e}")
                await asyncio.sleep(30) 