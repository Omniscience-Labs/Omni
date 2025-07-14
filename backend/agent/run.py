import os
import json
import asyncio
from typing import Optional, Dict, List, Any, AsyncGenerator, Tuple
from dataclasses import dataclass, field

from agent.tools.message_tool import MessageTool
from agent.tools.sb_deploy_tool import SandboxDeployTool
from agent.tools.sb_expose_tool import SandboxExposeTool
from agent.tools.web_search_tool import SandboxWebSearchTool
from dotenv import load_dotenv
from utils.config import config
from flags.flags import is_enabled
from agent.agent_builder_prompt import get_agent_builder_prompt
from agentpress.thread_manager import ThreadManager
from agentpress.response_processor import ProcessorConfig
from agent.tools.sb_shell_tool import SandboxShellTool
from agent.tools.sb_files_tool import SandboxFilesTool
from agent.tools.sb_browser_tool import SandboxBrowserTool
from agent.tools.data_providers_tool import DataProvidersTool
from agent.tools.expand_msg_tool import ExpandMessageTool
from agent.prompt import get_system_prompt
from utils.logger import logger
from utils.auth_utils import get_account_id_from_thread
from services.billing import check_billing_status
from agent.tools.sb_vision_tool import SandboxVisionTool
from agent.tools.sb_image_edit_tool import SandboxImageEditTool
from services.langfuse import langfuse
from langfuse.client import StatefulTraceClient
from agent.gemini_prompt import get_gemini_system_prompt
from agent.tools.mcp_tool_wrapper import MCPToolWrapper
from agentpress.tool import SchemaType

load_dotenv()

@dataclass
class AgentRunConfig:
    thread_id: str
    project_id: str
    stream: bool
    thread_manager: Optional[ThreadManager] = None
    native_max_auto_continues: int = 25
    max_iterations: int = 100
    model_name: str = "anthropic/claude-sonnet-4-20250514"
    enable_thinking: Optional[bool] = False
    reasoning_effort: Optional[str] = 'low'
    enable_context_manager: bool = True
    agent_config: Optional[dict] = None
    trace: Optional[StatefulTraceClient] = None
    is_agent_builder: Optional[bool] = False
    target_agent_id: Optional[str] = None

@dataclass
class ExecutionContext:
    client: Any
    account_id: str
    project_data: Dict
    sandbox_info: Dict
    mcp_wrapper_instance: Optional[MCPToolWrapper] = None

class AgentExecutionError(Exception):
    pass

def get_model_max_tokens(model_name: str) -> Optional[int]:
    if "sonnet" in model_name.lower():
        return 8192
    elif "gpt-4" in model_name.lower():
        return 4096
    elif "gemini-2.5-pro" in model_name.lower():
        return 64000
    return None

def is_vision_model(model_name: str) -> bool:
    return any(x in model_name.lower() for x in ['gemini', 'anthropic', 'openai'])

async def setup_execution_context(config: AgentRunConfig) -> ExecutionContext:
    client = await config.thread_manager.db.client
    
    account_id = await get_account_id_from_thread(client, config.thread_id)
    if not account_id:
        raise AgentExecutionError("Could not determine account ID for thread")

    project = await client.table('projects').select('*').eq('project_id', config.project_id).execute()
    if not project.data or len(project.data) == 0:
        raise AgentExecutionError(f"Project {config.project_id} not found")

    project_data = project.data[0]
    sandbox_info = project_data.get('sandbox', {})
    if not sandbox_info.get('id'):
        raise AgentExecutionError(f"No sandbox found for project {config.project_id}")

    return ExecutionContext(
        client=client,
        account_id=account_id,
        project_data=project_data,
        sandbox_info=sandbox_info
    )

def register_agent_builder_tools(thread_manager: ThreadManager, target_agent_id: str):
    from agent.tools.agent_builder_tools.agent_config_tool import AgentConfigTool
    from agent.tools.agent_builder_tools.mcp_search_tool import MCPSearchTool
    from agent.tools.agent_builder_tools.credential_profile_tool import CredentialProfileTool
    from agent.tools.agent_builder_tools.workflow_tool import WorkflowTool
    from agent.tools.agent_builder_tools.trigger_tool import TriggerTool
    from services.supabase import DBConnection
    
    db = DBConnection()
    thread_manager.add_tool(AgentConfigTool, thread_manager=thread_manager, db_connection=db, agent_id=target_agent_id)
    thread_manager.add_tool(MCPSearchTool, thread_manager=thread_manager, db_connection=db, agent_id=target_agent_id)
    thread_manager.add_tool(CredentialProfileTool, thread_manager=thread_manager, db_connection=db, agent_id=target_agent_id)
    thread_manager.add_tool(WorkflowTool, thread_manager=thread_manager, db_connection=db, agent_id=target_agent_id)
    thread_manager.add_tool(TriggerTool, thread_manager=thread_manager, db_connection=db, agent_id=target_agent_id)

def register_default_tools(thread_manager: ThreadManager, agent_config: AgentRunConfig):
    thread_manager.add_tool(SandboxShellTool, project_id=agent_config.project_id, thread_manager=thread_manager)
    thread_manager.add_tool(SandboxFilesTool, project_id=agent_config.project_id, thread_manager=thread_manager)
    thread_manager.add_tool(SandboxBrowserTool, project_id=agent_config.project_id, thread_id=agent_config.thread_id, thread_manager=thread_manager)
    thread_manager.add_tool(SandboxDeployTool, project_id=agent_config.project_id, thread_manager=thread_manager)
    thread_manager.add_tool(SandboxExposeTool, project_id=agent_config.project_id, thread_manager=thread_manager)
    thread_manager.add_tool(ExpandMessageTool, thread_id=agent_config.thread_id, thread_manager=thread_manager)
    thread_manager.add_tool(MessageTool)
    thread_manager.add_tool(SandboxWebSearchTool, project_id=agent_config.project_id, thread_manager=thread_manager)
    thread_manager.add_tool(SandboxVisionTool, project_id=agent_config.project_id, thread_id=agent_config.thread_id, thread_manager=thread_manager)
    thread_manager.add_tool(SandboxImageEditTool, project_id=agent_config.project_id, thread_id=agent_config.thread_id, thread_manager=thread_manager)
    
    if config.RAPID_API_KEY:
        thread_manager.add_tool(DataProvidersTool)

def register_custom_tools(thread_manager: ThreadManager, agent_config: AgentRunConfig, enabled_tools: Dict):
    thread_manager.add_tool(ExpandMessageTool, thread_id=agent_config.thread_id, thread_manager=thread_manager)
    thread_manager.add_tool(MessageTool)
    
    tool_mapping = {
        'sb_shell_tool': (SandboxShellTool, {'project_id': agent_config.project_id, 'thread_manager': thread_manager}),
        'sb_files_tool': (SandboxFilesTool, {'project_id': agent_config.project_id, 'thread_manager': thread_manager}),
        'sb_browser_tool': (SandboxBrowserTool, {'project_id': agent_config.project_id, 'thread_id': agent_config.thread_id, 'thread_manager': thread_manager}),
        'sb_deploy_tool': (SandboxDeployTool, {'project_id': agent_config.project_id, 'thread_manager': thread_manager}),
        'sb_expose_tool': (SandboxExposeTool, {'project_id': agent_config.project_id, 'thread_manager': thread_manager}),
        'web_search_tool': (SandboxWebSearchTool, {'project_id': agent_config.project_id, 'thread_manager': thread_manager}),
        'sb_vision_tool': (SandboxVisionTool, {'project_id': agent_config.project_id, 'thread_id': agent_config.thread_id, 'thread_manager': thread_manager}),
    }
    
    for tool_name, (tool_class, kwargs) in tool_mapping.items():
        if enabled_tools.get(tool_name, {}).get('enabled', False):
            thread_manager.add_tool(tool_class, **kwargs)
    
    if config.RAPID_API_KEY and enabled_tools.get('data_providers_tool', {}).get('enabled', False):
        thread_manager.add_tool(DataProvidersTool)

async def setup_pipedream_mcp_config(custom_mcp: Dict, account_id: str) -> Dict:
    if 'config' not in custom_mcp:
        custom_mcp['config'] = {}
    
    if not custom_mcp['config'].get('external_user_id'):
        profile_id = custom_mcp['config'].get('profile_id')
        if profile_id:
            try:
                from pipedream.profiles import get_profile_manager
                from services.supabase import DBConnection
                profile_db = DBConnection()
                profile_manager = get_profile_manager(profile_db)
                
                profile = await profile_manager.get_profile(account_id, profile_id)
                if profile:
                    custom_mcp['config']['external_user_id'] = profile.external_user_id
                    logger.info(f"Retrieved external_user_id from profile {profile_id} for Pipedream MCP")
                else:
                    logger.error(f"Could not find profile {profile_id} for Pipedream MCP")
            except Exception as e:
                logger.error(f"Error retrieving external_user_id from profile {profile_id}: {e}")
    
    if 'headers' in custom_mcp['config'] and 'x-pd-app-slug' in custom_mcp['config']['headers']:
        custom_mcp['config']['app_slug'] = custom_mcp['config']['headers']['x-pd-app-slug']
    
    return custom_mcp

def create_mcp_config(custom_mcp: Dict, custom_type: str) -> Dict:
    return {
        'name': custom_mcp['name'],
        'qualifiedName': f"custom_{custom_type}_{custom_mcp['name'].replace(' ', '_').lower()}",
        'config': custom_mcp['config'],
        'enabledTools': custom_mcp.get('enabledTools', []),
        'instructions': custom_mcp.get('instructions', ''),
        'isCustom': True,
        'customType': custom_type
    }

async def setup_mcp_tools(thread_manager: ThreadManager, config: AgentRunConfig, context: ExecutionContext) -> Optional[MCPToolWrapper]:
    if not config.agent_config:
        return None
    
    all_mcps = []
    
    if config.agent_config.get('configured_mcps'):
        all_mcps.extend(config.agent_config['configured_mcps'])
    
    if config.agent_config.get('custom_mcps'):
        for custom_mcp in config.agent_config['custom_mcps']:
            custom_type = custom_mcp.get('customType', custom_mcp.get('type', 'sse'))
            
            if custom_type == 'pipedream':
                custom_mcp = await setup_pipedream_mcp_config(custom_mcp, context.account_id)
            
            mcp_config = create_mcp_config(custom_mcp, custom_type)
            all_mcps.append(mcp_config)
    
    if not all_mcps:
        return None
    
    logger.info(f"Registering MCP tool wrapper for {len(all_mcps)} MCP servers")
    thread_manager.add_tool(MCPToolWrapper, mcp_configs=all_mcps)
    
    mcp_wrapper_instance = None
    for tool_name, tool_info in thread_manager.tool_registry.tools.items():
        if isinstance(tool_info['instance'], MCPToolWrapper):
            mcp_wrapper_instance = tool_info['instance']
            break
    
    if mcp_wrapper_instance:
        try:
            await mcp_wrapper_instance.initialize_and_register_tools()
            logger.info("MCP tools initialized successfully")
            
            updated_schemas = mcp_wrapper_instance.get_schemas()
            logger.info(f"MCP wrapper has {len(updated_schemas)} schemas available")
            
            for method_name, schema_list in updated_schemas.items():
                if method_name != 'call_mcp_tool':
                    for schema in schema_list:
                        if schema.schema_type == SchemaType.OPENAPI:
                            thread_manager.tool_registry.tools[method_name] = {
                                "instance": mcp_wrapper_instance,
                                "schema": schema
                            }
                            logger.info(f"Registered dynamic MCP tool: {method_name}")
            
            all_tools = list(thread_manager.tool_registry.tools.keys())
            logger.info(f"All registered tools after MCP initialization: {all_tools}")
            
        except Exception as e:
            logger.error(f"Failed to initialize MCP tools: {e}")
    
    return mcp_wrapper_instance

def setup_tools(thread_manager: ThreadManager, agent_config: AgentRunConfig) -> None:
    if agent_config.is_agent_builder:
        register_agent_builder_tools(thread_manager, agent_config.target_agent_id)
    
    enabled_tools = None
    if agent_config.agent_config and 'agentpress_tools' in agent_config.agent_config:
        enabled_tools = agent_config.agent_config['agentpress_tools']
        logger.info("Using custom tool configuration from agent")
    
    if enabled_tools is None:
        logger.info("No agent specified - registering all tools for full Suna capabilities")
        register_default_tools(thread_manager, agent_config)
    else:
        logger.info("Custom agent specified - registering only enabled tools")
        register_custom_tools(thread_manager, agent_config, enabled_tools)

def get_base_system_prompt(model_name: str) -> str:
    if "gemini-2.5-flash" in model_name.lower() and "gemini-2.5-pro" not in model_name.lower():
        return get_gemini_system_prompt()
    return get_system_prompt()

def add_sample_response(system_content: str, model_name: str) -> str:
    if "anthropic" not in model_name.lower():
        sample_response_path = os.path.join(os.path.dirname(__file__), 'sample_responses/1.txt')
        with open(sample_response_path, 'r') as file:
            sample_response = file.read()
        return system_content + "\n\n <sample_assistant_response>" + sample_response + "</sample_assistant_response>"
    return system_content

async def add_knowledge_base_context(system_content: str, config: AgentRunConfig) -> str:
    if not await is_enabled("knowledge_base"):
        return system_content
    
    try:
        from services.supabase import DBConnection
        kb_db = DBConnection()
        kb_client = await kb_db.client
        
        current_agent_id = config.agent_config.get('agent_id') if config.agent_config else None
        
        kb_result = await kb_client.rpc('get_combined_knowledge_base_context', {
            'p_thread_id': config.thread_id,
            'p_agent_id': current_agent_id,
            'p_max_tokens': 4000
        }).execute()
        
        if kb_result.data and kb_result.data.strip():
            logger.info(f"Adding combined knowledge base context to system prompt")
            return system_content + "\n\n" + kb_result.data
        else:
            logger.debug(f"No knowledge base context found")
            
    except Exception as e:
        logger.error(f"Error retrieving knowledge base context: {e}")
    
    return system_content

def add_mcp_instructions(system_content: str, config: AgentRunConfig, mcp_wrapper_instance: Optional[MCPToolWrapper]) -> str:
    if not (config.agent_config and (config.agent_config.get('configured_mcps') or config.agent_config.get('custom_mcps'))):
        return system_content
    
    if not (mcp_wrapper_instance and mcp_wrapper_instance._initialized):
        return system_content
    
    mcp_info = "\n\n--- MCP Tools Available ---\n"
    mcp_info += "You have access to external MCP (Model Context Protocol) server tools.\n"
    mcp_info += "MCP tools can be called directly using their native function names in the standard function calling format:\n"
    mcp_info += '<function_calls>\n'
    mcp_info += '<invoke name="{tool_name}">\n'
    mcp_info += '<parameter name="param1">value1</parameter>\n'
    mcp_info += '<parameter name="param2">value2</parameter>\n'
    mcp_info += '</invoke>\n'
    mcp_info += '</function_calls>\n\n'
    
    mcp_info += "Available MCP tools:\n"
    try:
        registered_schemas = mcp_wrapper_instance.get_schemas()
        for method_name, schema_list in registered_schemas.items():
            if method_name == 'call_mcp_tool':
                continue
                
            for schema in schema_list:
                if schema.schema_type == SchemaType.OPENAPI:
                    func_info = schema.schema.get('function', {})
                    description = func_info.get('description', 'No description available')
                    
                    mcp_info += f"- **{method_name}**: {description}\n"
                    
                    params = func_info.get('parameters', {})
                    props = params.get('properties', {})
                    if props:
                        mcp_info += f"  Parameters: {', '.join(props.keys())}\n"
                        
    except Exception as e:
        logger.error(f"Error listing MCP tools: {e}")
        mcp_info += "- Error loading MCP tool list\n"
    
    mcp_info += "\n🚨 CRITICAL MCP TOOL RESULT INSTRUCTIONS 🚨\n"
    mcp_info += "When you use ANY MCP (Model Context Protocol) tools:\n"
    mcp_info += "1. ALWAYS read and use the EXACT results returned by the MCP tool\n"
    mcp_info += "2. For search tools: ONLY cite URLs, sources, and information from the actual search results\n"
    mcp_info += "3. For any tool: Base your response entirely on the tool's output - do NOT add external information\n"
    mcp_info += "4. DO NOT fabricate, invent, hallucinate, or make up any sources, URLs, or data\n"
    mcp_info += "5. If you need more information, call the MCP tool again with different parameters\n"
    mcp_info += "6. When writing reports/summaries: Reference ONLY the data from MCP tool results\n"
    mcp_info += "7. If the MCP tool doesn't return enough information, explicitly state this limitation\n"
    mcp_info += "8. Always double-check that every fact, URL, and reference comes from the MCP tool output\n"
    mcp_info += "\nIMPORTANT: MCP tool results are your PRIMARY and ONLY source of truth for external data!\n"
    mcp_info += "NEVER supplement MCP results with your training data or make assumptions beyond what the tools provide.\n"
    
    return system_content + mcp_info

async def build_system_prompt(config: AgentRunConfig, mcp_wrapper_instance: Optional[MCPToolWrapper]) -> Dict:
    base_prompt = get_base_system_prompt(config.model_name)
    system_content = add_sample_response(base_prompt, config.model_name)
    
    if config.agent_config and config.agent_config.get('system_prompt'):
        custom_system_prompt = config.agent_config['system_prompt'].strip()
        system_content = custom_system_prompt
        logger.info(f"Using ONLY custom agent system prompt")
    elif config.is_agent_builder:
        system_content = get_agent_builder_prompt()
        logger.info("Using agent builder system prompt")
    else:
        logger.info("Using default system prompt only")
    
    system_content = await add_knowledge_base_context(system_content, config)
    system_content = add_mcp_instructions(system_content, config, mcp_wrapper_instance)
    
    return {"role": "system", "content": system_content}

async def get_browser_state_content(client: Any, thread_id: str, model_name: str, trace: Optional[StatefulTraceClient]) -> List[Dict]:
    content_list = []
    
    latest_browser_state_msg = await client.table('messages').select('*').eq('thread_id', thread_id).eq('type', 'browser_state').order('created_at', desc=True).limit(1).execute()
    
    if not (latest_browser_state_msg.data and len(latest_browser_state_msg.data) > 0):
        return content_list
    
    try:
        browser_content = latest_browser_state_msg.data[0]["content"]
        if isinstance(browser_content, str):
            browser_content = json.loads(browser_content)
        
        screenshot_base64 = browser_content.get("screenshot_base64")
        screenshot_url = browser_content.get("image_url")
        
        browser_state_text = browser_content.copy()
        browser_state_text.pop('screenshot_base64', None)
        browser_state_text.pop('image_url', None)

        if browser_state_text:
            content_list.append({
                "type": "text",
                "text": f"The following is the current state of the browser:\n{json.dumps(browser_state_text, indent=2)}"
            })
        
        if is_vision_model(model_name):
            if screenshot_url:
                content_list.append({
                    "type": "image_url",
                    "image_url": {
                        "url": screenshot_url,
                        "format": "image/jpeg"
                    }
                })
                if trace:
                    trace.event(name="screenshot_url_added_to_temporary_message", level="DEFAULT")
            elif screenshot_base64:
                content_list.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{screenshot_base64}",
                    }
                })
                if trace:
                    trace.event(name="screenshot_base64_added_to_temporary_message", level="WARNING")
            else:
                logger.warning("Browser state found but no screenshot data.")
                if trace:
                    trace.event(name="browser_state_found_but_no_screenshot_data", level="WARNING")
        else:
            logger.warning("Model doesn't support vision, skipping screenshot.")
            if trace:
                trace.event(name="model_doesnt_support_vision", level="WARNING")

    except Exception as e:
        logger.error(f"Error parsing browser state: {e}")
        if trace:
            trace.event(name="error_parsing_browser_state", level="ERROR", status_message=str(e))
    
    return content_list

async def get_image_context_content(client: Any, thread_id: str) -> List[Dict]:
    content_list = []
    
    latest_image_context_msg = await client.table('messages').select('*').eq('thread_id', thread_id).eq('type', 'image_context').order('created_at', desc=True).limit(1).execute()
    
    if not (latest_image_context_msg.data and len(latest_image_context_msg.data) > 0):
        return content_list
    
    try:
        image_context_content = latest_image_context_msg.data[0]["content"]
        if isinstance(image_context_content, str):
            image_context_content = json.loads(image_context_content)
        
        base64_image = image_context_content.get("base64")
        mime_type = image_context_content.get("mime_type")
        file_path = image_context_content.get("file_path", "unknown file")

        if base64_image and mime_type:
            content_list.extend([
                {
                    "type": "text",
                    "text": f"Here is the image you requested to see: '{file_path}'"
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{base64_image}",
                    }
                }
            ])
        else:
            logger.warning(f"Image context found for '{file_path}' but missing base64 or mime_type.")

        await client.table('messages').delete().eq('message_id', latest_image_context_msg.data[0]["message_id"]).execute()
        
    except Exception as e:
        logger.error(f"Error parsing image context: {e}")
    
    return content_list

async def build_temporary_message(client: Any, config: AgentRunConfig, trace: Optional[StatefulTraceClient]) -> Optional[Dict]:
    temp_message_content_list = []
    
    browser_content = await get_browser_state_content(client, config.thread_id, config.model_name, trace)
    temp_message_content_list.extend(browser_content)
    
    image_content = await get_image_context_content(client, config.thread_id)
    temp_message_content_list.extend(image_content)
    
    if temp_message_content_list:
        return {"role": "user", "content": temp_message_content_list}
    
    return None

async def should_continue_execution(client: Any, thread_id: str, trace: Optional[StatefulTraceClient]) -> bool:
    latest_message = await client.table('messages').select('*').eq('thread_id', thread_id).in_('type', ['assistant', 'tool', 'user']).order('created_at', desc=True).limit(1).execute()
    
    if latest_message.data and len(latest_message.data) > 0:
        message_type = latest_message.data[0].get('type')
        if message_type == 'assistant':
            logger.info("Last message was from assistant, stopping execution")
            if trace:
                trace.event(name="last_message_from_assistant", level="DEFAULT")
            return False
    
    return True

async def check_billing_limits(client: Any, account_id: str, trace: Optional[StatefulTraceClient]) -> Tuple[bool, str]:
    can_run, message, subscription = await check_billing_status(client, account_id)
    if not can_run:
        error_msg = f"Billing limit reached: {message}"
        if trace:
            trace.event(name="billing_limit_reached", level="ERROR", status_message=error_msg)
        return False, error_msg
    return True, ""

class ResponseProcessor:
    def __init__(self, trace: Optional[StatefulTraceClient]):
        self.trace = trace
        self.last_tool_call = None
        self.agent_should_terminate = False
        self.full_response = ""
    
    def check_termination_signal(self, chunk: Dict) -> None:
        if chunk.get('type') != 'status':
            return
        
        try:
            metadata = chunk.get('metadata', {})
            if isinstance(metadata, str):
                metadata = json.loads(metadata)
            
            if metadata.get('agent_should_terminate'):
                self.agent_should_terminate = True
                logger.info("Agent termination signal detected")
                if self.trace:
                    self.trace.event(name="agent_termination_signal_detected", level="DEFAULT")
                
                content = chunk.get('content', {})
                if isinstance(content, str):
                    content = json.loads(content)
                
                if content.get('function_name'):
                    self.last_tool_call = content['function_name']
                elif content.get('xml_tag_name'):
                    self.last_tool_call = content['xml_tag_name']
                    
        except Exception as e:
            logger.debug(f"Error parsing status message for termination check: {e}")
    
    def check_xml_tools(self, chunk: Dict) -> None:
        if chunk.get('type') != 'assistant' or 'content' not in chunk:
            return
        
        try:
            content = chunk.get('content', '{}')
            if isinstance(content, str):
                assistant_content_json = json.loads(content)
            else:
                assistant_content_json = content

            assistant_text = assistant_content_json.get('content', '')
            self.full_response += assistant_text
            
            if isinstance(assistant_text, str):
                for tool in ['ask', 'complete', 'web-browser-takeover']:
                    if f'</{tool}>' in assistant_text:
                        self.last_tool_call = tool
                        logger.info(f"Agent used XML tool: {tool}")
                        if self.trace:
                            self.trace.event(name="agent_used_xml_tool", level="DEFAULT", status_message=f"Agent used XML tool: {tool}")
                        break
        
        except json.JSONDecodeError:
            logger.warning(f"Could not parse assistant content JSON: {chunk.get('content')}")
            if self.trace:
                self.trace.event(name="warning_could_not_parse_assistant_content_json", level="WARNING")
        except Exception as e:
            logger.error(f"Error processing assistant chunk: {e}")
            if self.trace:
                self.trace.event(name="error_processing_assistant_chunk", level="ERROR", status_message=str(e))
    
    def process_chunk(self, chunk: Dict) -> None:
        self.check_termination_signal(chunk)
        self.check_xml_tools(chunk)
    
    def should_terminate(self) -> bool:
        return (self.agent_should_terminate or 
                self.last_tool_call in ['ask', 'complete', 'web-browser-takeover'])

async def process_llm_response(response: Any, processor: ResponseProcessor, trace: Optional[StatefulTraceClient]) -> AsyncGenerator[Dict, None]:
    try:
        if hasattr(response, '__aiter__') and not isinstance(response, dict):
            async for chunk in response:
                if isinstance(chunk, dict) and chunk.get('type') == 'status' and chunk.get('status') == 'error':
                    logger.error(f"Error chunk detected: {chunk.get('message', 'Unknown error')}")
                    if trace:
                        trace.event(name="error_chunk_detected", level="ERROR", status_message=chunk.get('message', 'Unknown error'))
                    yield chunk
                    return
                
                processor.process_chunk(chunk)
                yield chunk
        else:
            logger.error(f"Response is not iterable: {response}")
            yield {
                "type": "status",
                "status": "error",
                "message": "Response is not iterable"
            }
            
    except Exception as e:
        error_msg = f"Error during response streaming: {str(e)}"
        logger.error(error_msg)
        if trace:
            trace.event(name="error_during_response_streaming", level="ERROR", status_message=error_msg)
        yield {
            "type": "status",
            "status": "error",
            "message": error_msg
        }

async def run_single_iteration(
    config: AgentRunConfig, 
    context: ExecutionContext, 
    system_message: Dict, 
    temporary_message: Optional[Dict],
    iteration_count: int
) -> AsyncGenerator[Dict, None]:
    
    can_continue, error_msg = await check_billing_limits(context.client, context.account_id, config.trace)
    if not can_continue:
        yield {
            "type": "status",
            "status": "stopped",
            "message": error_msg
        }
        return

    if not await should_continue_execution(context.client, config.thread_id, config.trace):
        return

    max_tokens = get_model_max_tokens(config.model_name)
    generation = config.trace.generation(name="thread_manager.run_thread") if config.trace else None
    processor = ResponseProcessor(config.trace)
    
    try:
        response = await config.thread_manager.run_thread(
            thread_id=config.thread_id,
            system_prompt=system_message,
            stream=config.stream,
            llm_model=config.model_name,
            llm_temperature=0,
            llm_max_tokens=max_tokens,
            tool_choice="auto",
            max_xml_tool_calls=1,
            temporary_message=temporary_message,
            processor_config=ProcessorConfig(
                xml_tool_calling=True,
                native_tool_calling=False,
                execute_tools=True,
                execute_on_stream=True,
                tool_execution_strategy="parallel",
                xml_adding_strategy="user_message"
            ),
            native_max_auto_continues=config.native_max_auto_continues,
            include_xml_examples=True,
            enable_thinking=config.enable_thinking,
            reasoning_effort=config.reasoning_effort,
            enable_context_manager=config.enable_context_manager,
            generation=generation
        )

        if isinstance(response, dict) and response.get("status") == "error":
            logger.error(f"Error response from run_thread: {response.get('message', 'Unknown error')}")
            if config.trace:
                config.trace.event(name="error_response_from_run_thread", level="ERROR", status_message=response.get('message', 'Unknown error'))
            yield response
            return

        async for chunk in process_llm_response(response, processor, config.trace):
            yield chunk

        if processor.should_terminate():
            logger.info(f"Agent decided to stop with tool: {processor.last_tool_call}")
            if config.trace:
                config.trace.event(name="agent_decided_to_stop_with_tool", level="DEFAULT", status_message=f"Agent decided to stop with tool: {processor.last_tool_call}")
            
            if generation:
                generation.end(output=processor.full_response, status_message="agent_stopped")
            
            yield {
                "type": "status", 
                "status": "completed",
                "terminate": True
            }
        else:
            if generation:
                generation.end(output=processor.full_response)

    except Exception as e:
        error_msg = f"Error running thread: {str(e)}"
        logger.error(error_msg)
        if config.trace:
            config.trace.event(name="error_running_thread", level="ERROR", status_message=error_msg)
        if generation:
            generation.end(output=processor.full_response, status_message=error_msg, level="ERROR")
        yield {
            "type": "status",
            "status": "error",
            "message": error_msg
        }

async def setup_trace_input(config: AgentRunConfig, context: ExecutionContext) -> None:
    if not config.trace:
        return
    
    latest_user_message = await context.client.table('messages').select('*').eq('thread_id', config.thread_id).eq('type', 'user').order('created_at', desc=True).limit(1).execute()
    
    if latest_user_message.data and len(latest_user_message.data) > 0:
        data = latest_user_message.data[0]['content']
        if isinstance(data, str):
            data = json.loads(data)
        config.trace.update(input=data['content'])

async def run_agent(
    thread_id: str,
    project_id: str,
    stream: bool,
    thread_manager: Optional[ThreadManager] = None,
    native_max_auto_continues: int = 25,
    max_iterations: int = 100,
    model_name: str = "anthropic/claude-sonnet-4-20250514",
    enable_thinking: Optional[bool] = False,
    reasoning_effort: Optional[str] = 'low',
    enable_context_manager: bool = True,
    agent_config: Optional[dict] = None,    
    trace: Optional[StatefulTraceClient] = None,
    is_agent_builder: Optional[bool] = False,
    target_agent_id: Optional[str] = None
):
    logger.info(f"🚀 Starting agent with model: {model_name}")
    if agent_config:
        logger.info(f"Using custom agent: {agent_config.get('name', 'Unknown')}")

    config = AgentRunConfig(
        thread_id=thread_id,
        project_id=project_id,
        stream=stream,
        thread_manager=thread_manager,
        native_max_auto_continues=native_max_auto_continues,
        max_iterations=max_iterations,
        model_name=model_name,
        enable_thinking=enable_thinking,
        reasoning_effort=reasoning_effort,
        enable_context_manager=enable_context_manager,
        agent_config=agent_config,
        trace=trace or langfuse.trace(name="run_agent", session_id=thread_id, metadata={"project_id": project_id}),
        is_agent_builder=is_agent_builder or False,
        target_agent_id=target_agent_id
    )

    config.thread_manager = ThreadManager(
        trace=config.trace, 
        is_agent_builder=config.is_agent_builder, 
        target_agent_id=config.target_agent_id, 
        agent_config=config.agent_config
    )

    try:
        context = await setup_execution_context(config)
        setup_tools(config.thread_manager, config)
        mcp_wrapper_instance = await setup_mcp_tools(config.thread_manager, config, context)
        system_message = await build_system_prompt(config, mcp_wrapper_instance)
        await setup_trace_input(config, context)

        iteration_count = 0
        
        while iteration_count < config.max_iterations:
            iteration_count += 1
            logger.info(f"🔄 Running iteration {iteration_count} of {config.max_iterations}...")

            temporary_message = await build_temporary_message(context.client, config, config.trace)
            
            should_terminate = False
            async for result in run_single_iteration(config, context, system_message, temporary_message, iteration_count):
                yield result
                if result.get('terminate'):
                    should_terminate = True
                    break
                if result.get('type') == 'status' and result.get('status') in ['error', 'stopped']:
                    should_terminate = True
                    break
            
            if should_terminate:
                break

    except AgentExecutionError as e:
        error_msg = str(e)
        logger.error(f"Agent execution error: {error_msg}")
        if config.trace:
            config.trace.event(name="agent_execution_error", level="ERROR", status_message=error_msg)
        yield {
            "type": "status",
            "status": "error",
            "message": error_msg
        }
    except Exception as e:
        error_msg = f"Unexpected error in run_agent: {str(e)}"
        logger.error(error_msg)
        if config.trace:
            config.trace.event(name="unexpected_error_in_run_agent", level="ERROR", status_message=error_msg)
        yield {
            "type": "status",
            "status": "error",
            "message": error_msg
        }
    finally:
        asyncio.create_task(asyncio.to_thread(lambda: langfuse.flush()))
