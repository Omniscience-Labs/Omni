from typing import List, Dict, Any, Optional
from .models import WorkflowNode, WorkflowEdge, WorkflowDefinition, WorkflowStep, WorkflowTrigger, InputNodeConfig, ScheduleConfig
from .tool_examples import get_tools_xml_examples
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
        logger.info(f"Converting workflow flow with {len(nodes)} nodes and {len(edges)} edges")

        input_config = self._extract_input_configuration(nodes)
        workflow_prompt = self._generate_workflow_prompt(nodes, edges, input_config)
        entry_point = self._find_entry_point(nodes, edges)
        triggers = self._extract_triggers_from_input(input_config)
        
        logger.info(f"Looking for tool nodes in {len(nodes)} total nodes")
        for node in nodes:
            logger.info(f"Node: id={node.get('id')}, type={node.get('type')}, data={node.get('data', {})}")
        
        tool_nodes = [node for node in nodes if node.get('type') == 'toolConnectionNode']
        logger.info(f"Found {len(tool_nodes)} tool connection nodes")
        
        enabled_tools = []
        for tool_node in tool_nodes:
            tool_data = tool_node.get('data', {})
            tool_id = tool_data.get('nodeId')
            logger.info(f"Processing tool node: id={tool_node.get('id')}, data={tool_data}, tool_id={tool_id}")
            
            if tool_id:
                enabled_tools.append({
                    "id": tool_id,
                    "name": tool_data.get('label', tool_id),
                    "description": tool_data.get('description', 'No description available'),
                    "instructions": tool_data.get('instructions', '')
                })
                logger.info(f"Added tool {tool_id} to enabled_tools")
            else:
                logger.warning(f"Tool node {tool_node.get('id')} has no nodeId in data: {tool_data}")
        
        logger.info(f"Final enabled_tools list: {enabled_tools}")

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
                "max_iterations": 10,
                "input_prompt": input_config.prompt if input_config else "",
                "tools": enabled_tools
            },
            next_steps=[]
        )
        
        workflow = WorkflowDefinition(
            name=metadata.get("name", "Untitled Workflow"),
            description=metadata.get("description", "Generated from visual workflow"),
            steps=[agent_step],
            entry_point="main_agent_step",
            triggers=triggers,
            project_id=metadata.get("project_id", ""),
            agent_id=metadata.get("agent_id"),
            is_template=metadata.get("is_template", False),
            max_execution_time=metadata.get("max_execution_time", 3600),
            max_retries=metadata.get("max_retries", 3)
        )
        
        return workflow
    
    def _extract_input_configuration(self, nodes: List[Dict[str, Any]]) -> Optional[InputNodeConfig]:
        """Extract input node configuration from the workflow nodes."""
        for node in nodes:
            if node.get('type') == 'inputNode':
                data = node.get('data', {})
                
                schedule_config = None
                if data.get('trigger_type') == 'SCHEDULE' and data.get('schedule_config'):
                    schedule_data = data.get('schedule_config', {})
                    schedule_config = ScheduleConfig(
                        cron_expression=schedule_data.get('cron_expression'),
                        interval_type=schedule_data.get('interval_type'),
                        interval_value=schedule_data.get('interval_value'),
                        timezone=schedule_data.get('timezone', 'UTC'),
                        start_date=schedule_data.get('start_date'),
                        end_date=schedule_data.get('end_date'),
                        enabled=schedule_data.get('enabled', True)
                    )
                
                return InputNodeConfig(
                    prompt=data.get('prompt', ''),
                    trigger_type=data.get('trigger_type', 'MANUAL'),
                    webhook_config=data.get('webhook_config'),
                    schedule_config=schedule_config,
                    variables=data.get('variables')
                )
        
        return None
    
    def _extract_triggers_from_input(self, input_config: Optional[InputNodeConfig]) -> List[WorkflowTrigger]:
        """Extract workflow triggers from input node configuration."""
        if not input_config:
            return [WorkflowTrigger(type="MANUAL", config={})]
        
        triggers = []
        
        if input_config.trigger_type == 'MANUAL':
            triggers.append(WorkflowTrigger(type="MANUAL", config={}))
        
        elif input_config.trigger_type == 'WEBHOOK':
            webhook_config = input_config.webhook_config
            if webhook_config:
                if hasattr(webhook_config, 'type'):
                    trigger_config = {
                        "type": webhook_config.type or 'slack',
                        "method": webhook_config.method or 'POST',
                        "authentication": webhook_config.authentication or 'none'
                    }
                    
                    if webhook_config.type == 'slack' and webhook_config.slack:
                        slack_config = webhook_config.slack
                        if hasattr(slack_config, 'model_dump'):
                            trigger_config['slack'] = slack_config.model_dump()
                        elif hasattr(slack_config, 'dict'):
                            trigger_config['slack'] = slack_config.dict()
                        else:
                            trigger_config['slack'] = slack_config
                    elif webhook_config.generic:
                        generic_config = webhook_config.generic
                        if hasattr(generic_config, 'model_dump'):
                            trigger_config['generic'] = generic_config.model_dump()
                        elif hasattr(generic_config, 'dict'):
                            trigger_config['generic'] = generic_config.dict()
                        else:
                            trigger_config['generic'] = generic_config
                else:
                    trigger_config = {
                        "type": webhook_config.get('type', 'slack'),
                        "method": webhook_config.get('method', 'POST'),
                        "authentication": webhook_config.get('authentication', 'none')
                    }
                    
                    if webhook_config.get('type') == 'slack' and webhook_config.get('slack'):
                        trigger_config['slack'] = webhook_config['slack']
                    elif webhook_config.get('generic'):
                        trigger_config['generic'] = webhook_config['generic']
                
                triggers.append(WorkflowTrigger(type="WEBHOOK", config=trigger_config))
            else:
                triggers.append(WorkflowTrigger(type="WEBHOOK", config={"type": "slack", "method": "POST", "authentication": "none"}))
        
        elif input_config.trigger_type == 'SCHEDULE':
            if input_config.schedule_config:
                schedule_config = {
                    "cron_expression": input_config.schedule_config.cron_expression,
                    "interval_type": input_config.schedule_config.interval_type,
                    "interval_value": input_config.schedule_config.interval_value,
                    "timezone": input_config.schedule_config.timezone,
                    "start_date": input_config.schedule_config.start_date.isoformat() if input_config.schedule_config.start_date else None,
                    "end_date": input_config.schedule_config.end_date.isoformat() if input_config.schedule_config.end_date else None,
                    "enabled": input_config.schedule_config.enabled
                }
                triggers.append(WorkflowTrigger(type="SCHEDULE", config=schedule_config))
            else:
                # Default schedule trigger
                triggers.append(WorkflowTrigger(
                    type="SCHEDULE", 
                    config={
                        "interval_type": "hours",
                        "interval_value": 1,
                        "timezone": "UTC",
                        "enabled": True
                    }
                ))
        
        return triggers
    
    def _generate_workflow_prompt(self, nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]], input_config: Optional[InputNodeConfig] = None) -> str:
        """Generate a comprehensive system prompt that describes the workflow."""
        
        prompt_parts = [
            "You are an AI agent executing a workflow. Follow these instructions carefully:",
            "",
        ]
        
        # Add input prompt if available
        if input_config and input_config.prompt:
            prompt_parts.extend([
                "## Workflow Input Prompt",
                input_config.prompt,
                "",
            ])
        
        prompt_parts.extend([
            "## Workflow Overview",
            "This workflow was created visually and consists of the following components:",
            ""
        ])

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
            elif node.get('type') == 'inputNode':
                desc = self._describe_input_node(node, edges)
                node_descriptions.append(desc)
            else:
                desc = self._describe_generic_node(node, edges)
                node_descriptions.append(desc)
        
        prompt_parts.extend(node_descriptions)
        prompt_parts.append("")
        
        # Add trigger information
        if input_config:
            prompt_parts.extend([
                "## Trigger Configuration",
                f"**Trigger Type**: {input_config.trigger_type}",
            ])
            
            if input_config.trigger_type == 'SCHEDULE' and input_config.schedule_config:
                schedule = input_config.schedule_config
                if schedule.cron_expression:
                    prompt_parts.append(f"**Schedule**: {schedule.cron_expression} (cron)")
                elif schedule.interval_type and schedule.interval_value:
                    prompt_parts.append(f"**Schedule**: Every {schedule.interval_value} {schedule.interval_type}")
                prompt_parts.append(f"**Timezone**: {schedule.timezone}")
            
            if input_config.variables:
                prompt_parts.extend([
                    "",
                    "## Default Variables",
                    "The following default variables are configured:"
                ])
                for key, value in input_config.variables.items():
                    prompt_parts.append(f"- **{key}**: {value}")
            
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
        
        # Extract tool IDs and generate tool descriptions
        tool_ids = []
        enabled_tools = []
        for tool_node in tool_nodes:
            tool_data = tool_node.get('data', {})
            tool_name = tool_data.get('nodeId', tool_data.get('label', 'Unknown Tool'))
            tool_desc = tool_data.get('description', 'No description available')
            tool_instructions = tool_data.get('instructions', '')
            
            # Build tool description with instructions if provided
            tool_description = f"- **{tool_name}**: {tool_desc}"
            if tool_instructions:
                tool_description += f" - Instructions: {tool_instructions}"
            prompt_parts.append(tool_description)
            
            # Collect tool ID for XML examples and enabled tools
            tool_id = tool_data.get('nodeId')
            if tool_id:
                tool_ids.append(tool_id)
                enabled_tools.append({
                    "id": tool_id,
                    "name": tool_data.get('label', tool_name),
                    "description": tool_desc,
                    "instructions": tool_instructions
                })
        
        # Add XML tool examples if tools are available
        if tool_ids:
            xml_examples = get_tools_xml_examples(tool_ids)
            if xml_examples:
                prompt_parts.extend([
                    "",
                    "## Tool Usage Examples",
                    "Use the following XML format to call tools. Each tool call must be wrapped in <function_calls> tags:",
                    "",
                    xml_examples
                ])
        
        prompt_parts.extend([
            "",
            "## Workflow Execution",
            "When executing this workflow:",
            "- Follow the logical flow defined by the visual connections",
            "- Use tools in the order and manner specified using the XML format shown above",
            "- Provide clear, step-by-step output",
            "- If any step fails, explain what went wrong and suggest alternatives",
            "- Complete the workflow by providing the expected output",
            "",
            "Begin execution when the user provides input or triggers the workflow."
        ])
        
        return "\n".join(prompt_parts)
    
    def _describe_input_node(self, node: Dict[str, Any], edges: List[Dict[str, Any]]) -> str:
        """Describe an input node and its configuration."""
        data = node.get('data', {})
        prompt = data.get('prompt', 'No prompt specified')
        trigger_type = data.get('trigger_type', 'MANUAL')
        
        output_connections = self._find_node_outputs(node.get('id'), edges)
        
        description = [
            f"### Input Configuration",
            f"**Prompt**: {prompt}",
            f"**Trigger Type**: {trigger_type}",
        ]
        
        if trigger_type == 'SCHEDULE':
            schedule_config = data.get('schedule_config', {})
            if schedule_config.get('cron_expression'):
                description.append(f"**Schedule**: {schedule_config['cron_expression']} (cron)")
            elif schedule_config.get('interval_type') and schedule_config.get('interval_value'):
                description.append(f"**Schedule**: Every {schedule_config['interval_value']} {schedule_config['interval_type']}")
        
        if output_connections:
            description.append(f"**Connects to**: {', '.join(output_connections)}")
        
        description.append("")
        return "\n".join(description)
    
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
        instructions = data.get('instructions', '')
        
        input_connections = self._find_node_inputs(node.get('id'), edges)
        output_connections = self._find_node_outputs(node.get('id'), edges)
        
        description = [
            f"### {name} Tool",
            f"**Tool ID**: {tool_id}",
            f"**Purpose**: Provides {name.lower()} functionality to the workflow",
        ]
        
        # Add instructions if provided
        if instructions:
            description.append(f"**Instructions**: {instructions}")
        
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
    
    # Check for required input node
    has_input = any(node.get('type') == 'inputNode' for node in nodes)
    if not has_input:
        errors.append("Every workflow must have an input node")
    
    # Validate input node configuration
    for node in nodes:
        if node.get('type') == 'inputNode':
            data = node.get('data', {})
            if not data.get('prompt'):
                errors.append("Input node must have a prompt configured")
            
            trigger_type = data.get('trigger_type', 'MANUAL')
            if trigger_type == 'SCHEDULE':
                schedule_config = data.get('schedule_config', {})
                if not schedule_config.get('cron_expression') and not (schedule_config.get('interval_type') and schedule_config.get('interval_value')):
                    errors.append("Schedule trigger must have either cron expression or interval configuration")
            elif trigger_type == 'WEBHOOK':
                webhook_config = data.get('webhook_config', {})
                if not webhook_config:
                    errors.append("Webhook trigger must have webhook configuration")
    
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