from typing import Dict, Any, List
from core.utils.logger import logger

CORE_TOOLS = {
    'ask_tool': True,
    'task_list_tool': True,
    'expand_message_tool': True,
}

# Tools that are always disabled and never accessible to any agent (hidden from UI + never registered)
RESTRICTED_TOOLS: List[str] = [
    'people_search_tool',
    'company_search_tool',
    'paper_search_tool',
    'vapi_voice_tool',
]

def ensure_core_tools_enabled(agentpress_tools: Dict[str, Any]) -> Dict[str, Any]:
    if agentpress_tools is None:
        agentpress_tools = {}
    
    updated_tools = dict(agentpress_tools)
    
    for tool_name, enabled in CORE_TOOLS.items():
        if isinstance(updated_tools.get(tool_name), dict):
            updated_tools[tool_name] = {
                **updated_tools[tool_name],
                'enabled': enabled
            }
        else:
            updated_tools[tool_name] = enabled
        
    logger.debug(f"Ensured core tools are enabled: {list(CORE_TOOLS.keys())}")
    
    return updated_tools

def is_core_tool(tool_name: str) -> bool:
    return tool_name in CORE_TOOLS

def get_core_tools() -> Dict[str, bool]:
    return CORE_TOOLS.copy()
