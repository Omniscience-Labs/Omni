from typing import List, Dict, Any, Optional
from .models import WorkflowNode, WorkflowEdge, WorkflowDefinition, WorkflowStep, WorkflowTrigger, InputNodeConfig, ScheduleConfig, WebhookConfig
from .tool_examples import get_tools_xml_examples
import uuid
from utils.logger import logger
from datetime import datetime

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
        
        logger.info(f"Looking for tool and MCP nodes in {len(nodes)} total nodes")
        for node in nodes:
            logger.info(f"Node: id={node.get('id')}, type={node.get('type')}, data={node.get('data', {})}")
        
        # Extract regular tool nodes
        tool_nodes = [node for node in nodes if node.get('type') == 'toolConnectionNode']
        logger.info(f"Found {len(tool_nodes)} tool connection nodes")
        
        # Extract MCP nodes
        mcp_nodes = [node for node in nodes if node.get('type') == 'mcpNode']
        logger.info(f"Found {len(mcp_nodes)} MCP nodes")
        
        # Process regular tools
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
        
        # Process MCP nodes and extract MCP configurations
        mcp_configs = self._extract_mcp_configurations(mcp_nodes)
        logger.info(f"Extracted {len(mcp_configs['configured_mcps'])} Smithery MCPs and {len(mcp_configs['custom_mcps'])} custom MCPs")
        
        logger.info(f"Final enabled_tools list: {enabled_tools}")

        # Extract model from input node configuration, default to Claude Sonnet 4
        selected_model = "anthropic/claude-sonnet-4-20250514"
        if input_config:
            # Look for model in input node data
            for node in nodes:
                if node.get('type') == 'inputNode':
                    node_data = node.get('data', {})
                    if node_data.get('model'):
                        selected_model = node_data['model']
                        # Ensure the model ID has the correct format
                        if not selected_model.startswith(('anthropic/', 'openai/', 'google/', 'meta-llama/', 'mistralai/', 'deepseek/')):
                            # Map common model names to their full IDs
                            model_mapping = {
                                'claude-sonnet-4': 'anthropic/claude-sonnet-4-20250514',
                                'claude-sonnet-3.7': 'anthropic/claude-3-7-sonnet-latest',
                                'claude-3.5': 'anthropic/claude-3-5-sonnet-latest',
                                'claude-3-5-sonnet-latest': 'anthropic/claude-3-5-sonnet-latest',
                                'claude-3-5-sonnet-20241022': 'anthropic/claude-3-5-sonnet-20241022',
                                'claude-3-5-haiku-latest': 'anthropic/claude-3-5-haiku-latest',
                                'gpt-4o': 'openai/gpt-4o',
                                'gpt-4o-mini': 'openai/gpt-4o-mini',
                                'gpt-4.1': 'openai/gpt-4.1',
                                'gpt-4.1-mini': 'gpt-4.1-mini',
                                'deepseek-chat': 'openrouter/deepseek/deepseek-chat',
                                'deepseek': 'openrouter/deepseek/deepseek-chat',
                                'deepseek-r1': 'openrouter/deepseek/deepseek-r1',
                                'gemini-2.0-flash-exp': 'google/gemini-2.0-flash-exp',
                                'gemini-flash-2.5': 'openrouter/google/gemini-2.5-flash-preview-05-20',
                                'gemini-2.5-flash:thinking': 'openrouter/google/gemini-2.5-flash-preview-05-20:thinking',
                                'gemini-2.5-pro-preview': 'openrouter/google/gemini-2.5-pro-preview',
                                'gemini-2.5-pro': 'openrouter/google/gemini-2.5-pro-preview',
                                'qwen3': 'openrouter/qwen/qwen3-235b-a22b'
                            }
                            selected_model = model_mapping.get(selected_model, f"anthropic/{selected_model}")
                        break

        agent_step = WorkflowStep(
            id="main_agent_step",
            name="Workflow Agent",
            description="Main agent that executes the workflow based on the visual flow",
            type="TOOL",
            config={
                "tool_name": "workflow_agent",
                "system_prompt": workflow_prompt,
                "agent_id": metadata.get("agent_id"),
                "model": selected_model,
                "max_iterations": 10,
                "input_prompt": input_config.prompt if input_config else "",
                "tools": enabled_tools,
                "configured_mcps": mcp_configs["configured_mcps"],
                "custom_mcps": mcp_configs["custom_mcps"]
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
                    if schedule_data.get('type'):
                        # New format: {'type': 'simple', 'simple': {...}, 'cron': {...}, 'advanced': {...}}
                        schedule_type = schedule_data.get('type')
                        enabled = schedule_data.get('enabled', True)
                        
                        if schedule_type == 'simple' and schedule_data.get('simple'):
                            simple_config = schedule_data['simple']
                            schedule_config = ScheduleConfig(
                                interval_type=simple_config.get('interval_type'),
                                interval_value=simple_config.get('interval_value'),
                                timezone=schedule_data.get('timezone', 'UTC'),
                                enabled=enabled
                            )
                        elif schedule_type == 'cron' and schedule_data.get('cron'):
                            cron_config = schedule_data['cron']
                            schedule_config = ScheduleConfig(
                                cron_expression=cron_config.get('cron_expression'),
                                timezone=schedule_data.get('timezone', 'UTC'),
                                enabled=enabled
                            )
                        elif schedule_type == 'advanced' and schedule_data.get('advanced'):
                            advanced_config = schedule_data['advanced']
                            schedule_config = ScheduleConfig(
                                cron_expression=advanced_config.get('cron_expression'),
                                timezone=advanced_config.get('timezone', 'UTC'),
                                start_date=datetime.fromisoformat(advanced_config['start_date']) if advanced_config.get('start_date') else None,
                                end_date=datetime.fromisoformat(advanced_config['end_date']) if advanced_config.get('end_date') else None,
                                enabled=enabled
                            )
                    else:
                        schedule_config = ScheduleConfig(
                            cron_expression=schedule_data.get('cron_expression'),
                            interval_type=schedule_data.get('interval_type'),
                            interval_value=schedule_data.get('interval_value'),
                            timezone=schedule_data.get('timezone', 'UTC'),
                            start_date=schedule_data.get('start_date'),
                            end_date=schedule_data.get('end_date'),
                            enabled=schedule_data.get('enabled', True)
                        )
                
                webhook_config = None
                if data.get('trigger_type') == 'WEBHOOK' and data.get('webhook_config'):
                    webhook_data = data.get('webhook_config', {})
                    try:
                        webhook_config = WebhookConfig(**webhook_data)
                    except Exception as e:
                        logger.warning(f"Failed to parse webhook config: {e}, using raw data")
                        webhook_config = webhook_data
                
                return InputNodeConfig(
                    prompt=data.get('prompt', ''),
                    trigger_type=data.get('trigger_type', 'MANUAL'),
                    webhook_config=webhook_config,
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
                    elif webhook_config.type == 'telegram' and webhook_config.telegram:
                        telegram_config = webhook_config.telegram
                        if hasattr(telegram_config, 'model_dump'):
                            trigger_config['telegram'] = telegram_config.model_dump()
                        elif hasattr(telegram_config, 'dict'):
                            trigger_config['telegram'] = telegram_config.dict()
                        else:
                            trigger_config['telegram'] = telegram_config
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
                    elif webhook_config.get('type') == 'telegram' and webhook_config.get('telegram'):
                        trigger_config['telegram'] = webhook_config['telegram']
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
            f"You are Suna - Workflows, an autonomous AI Agent created by the Kortix team, specialized in executing visual workflows.",
            "",
            "# 1. CORE IDENTITY & CAPABILITIES",
            "You are a workflow-specialized autonomous agent capable of executing complex visual workflows across domains including information gathering, content creation, software development, data analysis, and problem-solving. You operate within the Suna platform and have access to a comprehensive toolkit for workflow execution.",
            "",
            "# 2. EXECUTION ENVIRONMENT",
            "",
            "## 2.1 SYSTEM INFORMATION",
            f"- CURRENT YEAR: 2025",
            f"- UTC DATE: {datetime.now().strftime('%Y-%m-%d')}",
            f"- UTC TIME: {datetime.now().strftime('%H:%M:%S')}",
            "- TIME CONTEXT: When searching for latest news or time-sensitive information, ALWAYS use these current date/time values as reference points. Never use outdated information or assume different dates.",
            "- PLATFORM: Suna - Workflows",
            "",
        ]
        
        # Add input prompt if available
        if input_config and input_config.prompt:
            prompt_parts.extend([
                "# 3. WORKFLOW INPUT PROMPT",
                input_config.prompt,
                "",
            ])
        
        prompt_parts.extend([
            "# 4. WORKFLOW OVERVIEW",
            "This workflow was created visually in Suna and consists of the following components:",
            ""
        ])

        node_descriptions = []
        agent_nodes = []
        tool_nodes = []
        mcp_nodes = []
        
        for node in nodes:
            if node.get('type') == 'agentNode':
                agent_nodes.append(node)
                desc = self._describe_agent_node(node, edges)
                node_descriptions.append(desc)
            elif node.get('type') == 'toolConnectionNode':
                tool_nodes.append(node)
                desc = self._describe_tool_node(node, edges)
                node_descriptions.append(desc)
            elif node.get('type') == 'mcpNode':
                mcp_nodes.append(node)
                desc = self._describe_mcp_node(node, edges)
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
                "# 5. TRIGGER CONFIGURATION",
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
            "# 6. AVAILABLE TOOLS",
            "You have access to the following tools based on the workflow configuration:"
        ])
        
        # Extract tool IDs and generate tool descriptions
        tool_ids = []
        enabled_tools = []
        
        # Process regular tools
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
        
        # Process MCP tools
        mcp_tool_descriptions = []
        for mcp_node in mcp_nodes:
            mcp_data = mcp_node.get('data', {})
            mcp_type = mcp_data.get('mcpType', 'smithery')
            enabled_tools_list = mcp_data.get('enabledTools', [])
            mcp_instructions = mcp_data.get('instructions', '')
            
            if mcp_data.get('isConfigured', False) and enabled_tools_list:
                server_name = mcp_data.get('label', 'MCP Server')
                
                if mcp_type == 'smithery':
                    qualified_name = mcp_data.get('qualifiedName', '')
                    for tool_name in enabled_tools_list:
                        # Use the clean tool name as the callable method name (same as MCPToolWrapper)
                        # MCPToolWrapper creates methods using just the tool name, not the full mcp_server_tool format
                        clean_tool_name = tool_name.replace('-', '_')
                        tool_description = f"- **{clean_tool_name}** (MCP): From {server_name} ({qualified_name})"
                        if mcp_instructions:
                            tool_description += f" - Instructions: {mcp_instructions}"
                        mcp_tool_descriptions.append(tool_description)
                        tool_ids.append(clean_tool_name)
                elif mcp_type == 'custom':
                    for tool_name in enabled_tools_list:
                        # Use the clean tool name as the callable method name (same as MCPToolWrapper)
                        clean_tool_name = tool_name.replace('-', '_')
                        tool_description = f"- **{clean_tool_name}** (Custom MCP): From {server_name}"
                        if mcp_instructions:
                            tool_description += f" - Instructions: {mcp_instructions}"
                        mcp_tool_descriptions.append(tool_description)
                        tool_ids.append(clean_tool_name)
        
        # Add MCP tool descriptions to prompt
        if mcp_tool_descriptions:
            prompt_parts.extend([
                "",
                "## MCP Server Tools",
                "The following tools are available from MCP servers:"
            ])
            prompt_parts.extend(mcp_tool_descriptions)
        
        # Add XML tool examples if tools are available
        if tool_ids:
            xml_examples = get_tools_xml_examples(tool_ids)
            if xml_examples:
                prompt_parts.extend([
                    "",
                    "# 7. TOOL USAGE EXAMPLES",
                    "Use the following XML format to call tools. Each tool call must be wrapped in <function_calls> tags:",
                    "",
                    xml_examples
                ])
        
        prompt_parts.extend([
            "",
            "# 8. COMMUNICATION PROTOCOLS",
            "",
            "## 8.1 COMMUNICATION GUIDELINES",
            "- **Core Principle**: Communicate proactively, directly, and descriptively throughout your responses.",
            "- **Narrative-Style Communication**: Integrate descriptive Markdown-formatted text directly in your responses before, between, and after tool calls",
            "- **Communication Structure**: Use headers, brief paragraphs, and formatting for enhanced readability",
            "- Balance detail with conciseness - be informative without being verbose",
            "",
            "## 8.2 MESSAGE TYPES & USAGE",
            "- **Direct Narrative**: Embed clear, descriptive text directly in your responses explaining your actions, reasoning, and observations",
            "- **'ask' tool (USER CAN RESPOND)**: Use ONLY for essential needs requiring user input (clarification, confirmation, options, missing info, validation). This blocks execution until user responds.",
            "- **Minimize blocking operations ('ask')**: Maximize narrative descriptions in your regular responses.",
            "",
            "## 8.3 ATTACHMENT PROTOCOL",
            "- When using the 'ask' tool, ALWAYS attach ALL visualizations, markdown files, charts, graphs, reports, and any viewable content created",
            "- Include the 'attachments' parameter with file paths when sharing resources",
            "- Remember: If the user should SEE it, you must ATTACH it with the 'ask' tool",
            "",
            "# 9. WORKFLOW EXECUTION INSTRUCTIONS",
            "",
            "Execute this workflow by following these steps:",
            "1. **Start with the input or trigger conditions** - Begin execution based on the configured trigger",
            "2. **Process each component in logical order** - Follow the visual connections defined in the workflow",
            "3. **Use available tools as specified** - Employ the tools configured in this workflow using the XML format shown above",
            "4. **Follow the data flow between components** - Respect the connections and dependencies between workflow nodes",
            "5. **Provide clear output at each step** - Use narrative updates to keep the user informed of progress",
            "6. **Handle errors gracefully** - Provide meaningful feedback and suggest alternatives when steps fail",
            "7. **Complete the workflow successfully** - Deliver the expected output as defined by the workflow configuration",
            "",
            "## 9.1 EXECUTION BEST PRACTICES",
            "- Follow the logical flow defined by the visual connections",
            "- Use tools in the order and manner specified using the XML format shown above",
            "- For MCP tools, use the exact tool names and formats shown in the examples",
            "- Provide clear, step-by-step output with narrative updates",
            "- If any step fails, explain what went wrong and suggest alternatives",
            "- Complete the workflow by providing the expected output",
            "- Use the 'ask' tool when you need essential user input to proceed",
            "- Attach all relevant files and visualizations when using the 'ask' tool",
            "",
            "## 9.2 COMPLETION PROTOCOLS",
            "- Use 'ask' tool when you need essential user input to proceed (USER CAN RESPOND)",
            "- Provide narrative updates frequently to keep the user informed without requiring their input",
            "- Attach all deliverables, visualizations, and viewable content when using 'ask'",
            "- Signal completion appropriately based on workflow requirements",
            "",
            "**Begin execution when the user provides input or triggers the workflow. You are operating within the Suna platform as a specialized workflow execution agent.**"
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
            
            if schedule_config.get('type'):
                schedule_type = schedule_config.get('type')
                if schedule_type == 'simple' and schedule_config.get('simple'):
                    simple_config = schedule_config['simple']
                    description.append(f"**Schedule**: Every {simple_config.get('interval_value')} {simple_config.get('interval_type')}")
                elif schedule_type == 'cron' and schedule_config.get('cron'):
                    cron_config = schedule_config['cron']
                    description.append(f"**Schedule**: {cron_config.get('cron_expression')} (cron)")
                elif schedule_type == 'advanced' and schedule_config.get('advanced'):
                    advanced_config = schedule_config['advanced']
                    description.append(f"**Schedule**: {advanced_config.get('cron_expression')} (advanced cron)")
            else:
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
    
    def _describe_mcp_node(self, node: Dict[str, Any], edges: List[Dict[str, Any]]) -> str:
        """Describe an MCP node and its configuration."""
        data = node.get('data', {})
        name = data.get('label', 'MCP Server')
        mcp_type = data.get('mcpType', 'smithery')
        enabled_tools = data.get('enabledTools', [])
        is_configured = data.get('isConfigured', False)
        instructions = data.get('instructions', '')
        
        input_connections = self._find_node_inputs(node.get('id'), edges)
        output_connections = self._find_node_outputs(node.get('id'), edges)
        
        description = [
            f"### {name}",
        ]
        
        if mcp_type == 'smithery':
            qualified_name = data.get('qualifiedName', '')
            description.extend([
                f"**Type**: Smithery MCP Server",
                f"**Qualified Name**: {qualified_name}",
            ])
        elif mcp_type == 'custom':
            custom_config = data.get('customConfig', {})
            custom_type = custom_config.get('type', 'sse')
            description.extend([
                f"**Type**: Custom MCP Server ({custom_type.upper()})",
            ])
        
        description.append(f"**Status**: {'Configured' if is_configured else 'Not Configured'}")
        
        if enabled_tools:
            description.append(f"**Enabled Tools**: {', '.join(enabled_tools)}")
            description.append(f"**Purpose**: Provides {len(enabled_tools)} MCP tool{'s' if len(enabled_tools) != 1 else ''} to the workflow")
        else:
            description.append("**Purpose**: MCP server (no tools enabled)")
        
        if instructions:
            description.append(f"**Instructions**: {instructions}")
        
        if input_connections:
            description.append(f"**Connected from**: {', '.join(input_connections)}")
        
        if output_connections:
            description.append(f"**Connected to**: {', '.join(output_connections)}")
        
        description.append("")
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
    
    def _extract_mcp_configurations(self, mcp_nodes: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Extract MCP configurations from MCP nodes."""
        configured_mcps = []
        custom_mcps = []
        
        for mcp_node in mcp_nodes:
            mcp_data = mcp_node.get('data', {})
            mcp_type = mcp_data.get('mcpType', 'smithery')
            is_configured = mcp_data.get('isConfigured', False)
            enabled_tools = mcp_data.get('enabledTools', [])
            selected_profile_id = mcp_data.get('selectedProfileId')  # Get the selected profile ID
            instructions = mcp_data.get('instructions', '')  # Get the instructions
            
            logger.info(f"Processing MCP node: id={mcp_node.get('id')}, type={mcp_type}, data={mcp_data}")
            logger.info(f"MCP node configured: {is_configured}, enabled tools: {enabled_tools}, selected profile: {selected_profile_id}")
            
            # Process configured nodes
            if is_configured:
                if mcp_type == 'smithery':
                    # Smithery MCP server
                    qualified_name = mcp_data.get('qualifiedName', '')
                    if qualified_name:
                        mcp_config = {
                            'name': mcp_data.get('label', qualified_name),
                            'qualifiedName': qualified_name,
                            'config': mcp_data.get('config', {}),
                            'enabledTools': enabled_tools,  # Can be empty, will be populated from credential manager
                            'selectedProfileId': selected_profile_id,  # Include the selected profile ID
                            'instructions': instructions  # Include the instructions
                        }
                        configured_mcps.append(mcp_config)
                        logger.info(f"Added Smithery MCP: {qualified_name} with {len(enabled_tools)} enabled tools and profile {selected_profile_id}")
                    else:
                        logger.warning(f"Smithery MCP node {mcp_data.get('label', 'Unknown')} missing qualifiedName")
                
                elif mcp_type == 'custom' and enabled_tools:
                    custom_config = mcp_data.get('customConfig', {})
                    custom_mcp = {
                        'name': mcp_data.get('label', 'Custom MCP'),
                        'isCustom': True,
                        'customType': custom_config.get('type', 'sse'),
                        'config': custom_config.get('config', {}),
                        'enabledTools': enabled_tools,
                        'selectedProfileId': selected_profile_id,
                        'instructions': instructions  # Include the instructions
                    }
                    custom_mcps.append(custom_mcp)
                    logger.info(f"Added custom MCP: {custom_mcp['name']} with profile {selected_profile_id}")
                elif mcp_type == 'custom':
                    logger.warning(f"Custom MCP node {mcp_data.get('label', 'Unknown')} is configured but has no enabled tools")
            else:
                logger.warning(f"MCP node {mcp_data.get('label', 'Unknown')} is not configured")
        
        return {
            "configured_mcps": configured_mcps,
            "custom_mcps": custom_mcps
        }

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
                
                if schedule_config.get('type'):
                    schedule_type = schedule_config.get('type')
                    if schedule_type == 'simple':
                        simple_config = schedule_config.get('simple', {})
                        if not (simple_config.get('interval_type') and simple_config.get('interval_value')):
                            errors.append("Simple schedule must have interval type and value configured")
                    elif schedule_type == 'cron':
                        cron_config = schedule_config.get('cron', {})
                        if not cron_config.get('cron_expression'):
                            errors.append("Cron schedule must have cron expression configured")
                    elif schedule_type == 'advanced':
                        advanced_config = schedule_config.get('advanced', {})
                        if not advanced_config.get('cron_expression'):
                            errors.append("Advanced schedule must have cron expression configured")
                    else:
                        errors.append("Schedule must have a valid type (simple, cron, or advanced)")
                else:
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