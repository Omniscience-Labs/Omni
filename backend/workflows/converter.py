from typing import List, Dict, Any, Optional
from .models import WorkflowNode, WorkflowEdge, WorkflowDefinition, WorkflowStep, WorkflowTrigger
import uuid
from utils.logger import logger

class WorkflowConverter:
    """Converts visual workflow flows into executable workflow definitions."""
    
    def __init__(self):
        pass
    
    def convert_flow_to_workflow(
        self, 
        nodes: List[Dict[str, Any]], 
        edges: List[Dict[str, Any]], 
        metadata: Dict[str, Any]
    ) -> WorkflowDefinition:
        """
        Convert a visual workflow flow into an executable workflow definition.
        
        V1 Implementation: Generates a text prompt that describes the workflow
        and creates a single agent step that executes the entire workflow.
        """
        logger.info(f"Converting workflow flow with {len(nodes)} nodes and {len(edges)} edges")
        
        workflow_prompt = self._generate_workflow_prompt(nodes, edges)
        entry_point = self._find_entry_point(nodes, edges)
        
        agent_step = WorkflowStep(
            id="main_agent_step",
            name="Workflow Agent",
            description="Main agent that executes the workflow based on the visual flow",
            type="TOOL",
            config={
                "tool_name": "workflow_agent",
                "system_prompt": workflow_prompt,
                "agent_id": metadata.get("agent_id"),
                "model": "anthropic/claude-3-5-sonnet-latest",
                "max_iterations": 10
            },
            next_steps=[]
        )
        
        trigger = WorkflowTrigger(
            type="MANUAL",
            config={}
        )
        
        workflow = WorkflowDefinition(
            name=metadata.get("name", "Untitled Workflow"),
            description=metadata.get("description", "Generated from visual workflow"),
            steps=[agent_step],
            entry_point="main_agent_step",
            triggers=[trigger],
            project_id=metadata.get("project_id", ""),
            agent_id=metadata.get("agent_id"),
            is_template=metadata.get("is_template", False),
            max_execution_time=metadata.get("max_execution_time", 3600),
            max_retries=metadata.get("max_retries", 3)
        )
        
        return workflow
    
    def _generate_workflow_prompt(self, nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> str:
        """Generate a comprehensive system prompt that describes the workflow."""
        
        prompt_parts = [
            "You are an AI agent executing a workflow. Follow these instructions carefully:",
            "",
            "## Workflow Overview",
            "This workflow was created visually and consists of the following components:",
            ""
        ]

        node_descriptions = []
        agent_nodes = []
        tool_nodes = []
        
        for node in nodes:
            if node.get('type') == 'agentNode':
                agent_nodes.append(node)
                desc = self._describe_agent_node(node, edges)
                node_descriptions.append(desc)
            elif node.get('type') == 'toolConnectionNode':
                tool_nodes.append(node)
                desc = self._describe_tool_node(node, edges)
                node_descriptions.append(desc)
            else:
                desc = self._describe_generic_node(node, edges)
                node_descriptions.append(desc)
        
        prompt_parts.extend(node_descriptions)
        prompt_parts.append("")
        
        prompt_parts.extend([
            "## Execution Instructions",
            "",
            "Execute this workflow by following these steps:",
            "1. Start with the input or trigger conditions",
            "2. Process each component in the logical order defined by the connections",
            "3. Use the available tools as specified in the workflow",
            "4. Follow the data flow between components",
            "5. Provide clear output at each step",
            "6. Handle errors gracefully and provide meaningful feedback",
            "",
            "## Available Tools",
            "You have access to the following tools based on the workflow configuration:"
        ])
        
        for tool_node in tool_nodes:
            tool_data = tool_node.get('data', {})
            tool_name = tool_data.get('nodeId', tool_data.get('label', 'Unknown Tool'))
            tool_desc = tool_data.get('description', 'No description available')
            prompt_parts.append(f"- **{tool_name}**: {tool_desc}")
        
        prompt_parts.extend([
            "",
            "## Workflow Execution",
            "When executing this workflow:",
            "- Follow the logical flow defined by the visual connections",
            "- Use tools in the order and manner specified",
            "- Provide clear, step-by-step output",
            "- If any step fails, explain what went wrong and suggest alternatives",
            "- Complete the workflow by providing the expected output",
            "",
            "Begin execution when the user provides input or triggers the workflow."
        ])
        
        return "\n".join(prompt_parts)
    
    def _describe_agent_node(self, node: Dict[str, Any], edges: List[Dict[str, Any]]) -> str:
        """Describe an agent node and its role in the workflow."""
        data = node.get('data', {})
        name = data.get('label', 'AI Agent')
        instructions = data.get('instructions', 'No specific instructions provided')
        model = data.get('model', 'Default model')
        connected_tools = data.get('connectedTools', [])
        tool_list = [tool.get('name', 'Unknown') for tool in connected_tools]
        
        input_connections = self._find_node_inputs(node.get('id'), edges)
        output_connections = self._find_node_outputs(node.get('id'), edges)
        
        description = [
            f"### {name}",
            f"**Role**: {instructions}",
            f"**Model**: {model}",
        ]
        
        if tool_list:
            description.append(f"**Available Tools**: {', '.join(tool_list)}")
        
        if input_connections:
            description.append(f"**Receives input from**: {', '.join(input_connections)}")
        
        if output_connections:
            description.append(f"**Sends output to**: {', '.join(output_connections)}")
        
        description.append("")
        return "\n".join(description)
    
    def _describe_tool_node(self, node: Dict[str, Any], edges: List[Dict[str, Any]]) -> str:
        """Describe a tool node and its configuration."""
        data = node.get('data', {})
        name = data.get('label', 'Tool')
        tool_id = data.get('nodeId', 'unknown_tool')
        
        input_connections = self._find_node_inputs(node.get('id'), edges)
        output_connections = self._find_node_outputs(node.get('id'), edges)
        
        description = [
            f"### {name} Tool",
            f"**Tool ID**: {tool_id}",
            f"**Purpose**: Provides {name.lower()} functionality to the workflow",
        ]
        
        if input_connections:
            description.append(f"**Connected to agents**: {', '.join(input_connections)}")
        
        description.append("")
        return "\n".join(description)
    
    def _describe_generic_node(self, node: Dict[str, Any], edges: List[Dict[str, Any]]) -> str:
        """Describe a generic node."""
        data = node.get('data', {})
        name = data.get('label', 'Component')
        node_type = node.get('type')
        
        description = [
            f"### {name}",
            f"**Type**: {node_type}",
            f"**Purpose**: {data.get('description', 'Workflow component')}",
            ""
        ]
        
        return "\n".join(description)
    
    def _find_node_inputs(self, node_id: str, edges: List[Dict[str, Any]]) -> List[str]:
        """Find nodes that connect to this node as inputs."""
        inputs = []
        for edge in edges:
            if edge.get('target') == node_id:
                inputs.append(edge.get('source'))
        return inputs
    
    def _find_node_outputs(self, node_id: str, edges: List[Dict[str, Any]]) -> List[str]:
        """Find nodes that this node connects to as outputs."""
        outputs = []
        for edge in edges:
            if edge.get('source') == node_id:
                outputs.append(edge.get('target'))
        return outputs
    
    def _find_entry_point(self, nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> str:
        """Find the entry point of the workflow."""
        for node in nodes:
            if node.get('type') == 'triggerNode':
                return node.get('id')
        
        for node in nodes:
            if node.get('type') == 'inputNode':
                return node.get('id')
        
        node_ids = {node.get('id') for node in nodes}
        nodes_with_inputs = {edge.get('target') for edge in edges}
        root_nodes = node_ids - nodes_with_inputs
        
        if root_nodes:
            return list(root_nodes)[0]
        
        return nodes[0].get('id') if nodes else "main_agent_step"
    


def validate_workflow_flow(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> tuple[bool, List[str]]:
    """Validate a workflow flow for common issues."""
    errors = []
    
    if not nodes:
        errors.append("Workflow must have at least one node")
        return False, errors
    
    connected_nodes = set()
    for edge in edges:
        connected_nodes.add(edge.get('source'))
        connected_nodes.add(edge.get('target'))
    
    node_ids = {node.get('id') for node in nodes}
    disconnected = node_ids - connected_nodes
    
    if len(disconnected) > 1:
        errors.append(f"Found disconnected nodes: {', '.join(disconnected)}")

    for edge in edges:
        if edge.get('source') == edge.get('target'):
            errors.append(f"Self-referencing edge found on node {edge.get('source')}")
    
    has_agent = any(node.get('type') == 'agentNode' for node in nodes)
    if not has_agent:
        errors.append("Workflow should have at least one agent node")
    
    return len(errors) == 0, errors 