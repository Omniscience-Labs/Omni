#!/usr/bin/env python3
"""
Test script to verify enhanced response processor for agent builder tools.
"""

import asyncio
import json
from backend.agentpress.response_processor import ResponseProcessor
from backend.agentpress.tool_registry import ToolRegistry
from backend.agentpress.tool import ToolResult

class MockTool:
    """Mock tool for testing."""
    
    def success_response(self, data):
        return ToolResult(success=True, output=json.dumps(data, indent=2))
    
    def fail_response(self, msg):
        return ToolResult(success=False, output=msg)

async def mock_add_message(thread_id, type, content, is_llm_message, metadata=None):
    """Mock add message callback."""
    return {
        "message_id": "test-message-id",
        "thread_id": thread_id,
        "type": type,
        "content": content,
        "is_llm_message": is_llm_message,
        "metadata": metadata or {}
    }

def test_update_agent_response():
    """Test update_agent tool response formatting."""
    
    # Create mock tool result for update_agent
    mock_tool = MockTool()
    update_result = mock_tool.success_response({
        "message": "Agent updated successfully",
        "updated_fields": ["name", "description", "system_prompt"],
        "agent": {
            "agent_id": "test-agent-123",
            "name": "Research Assistant",
            "description": "An AI assistant specialized in research",
            "system_prompt": "You are a research assistant with expertise in gathering, analyzing, and synthesizing information from various sources.",
            "agentpress_tools": {
                "web_search": {"enabled": True, "description": "Search the web"},
                "sb_files": {"enabled": True, "description": "File operations"}
            },
            "configured_mcps": [
                {"name": "Exa Search", "qualifiedName": "exa", "enabledTools": ["search"]}
            ],
            "avatar": "🔬",
            "avatar_color": "#4F46E5"
        }
    })
    
    # Test with agent builder mode
    tool_registry = ToolRegistry()
    processor = ResponseProcessor(
        tool_registry=tool_registry,
        add_message_callback=mock_add_message,
        is_agent_builder=True,
        target_agent_id="test-agent-123"
    )
    
    tool_call = {
        "function_name": "update_agent",
        "xml_tag_name": "update_agent",
        "arguments": {"name": "Research Assistant"}
    }
    
    structured_result = processor._create_structured_tool_result(tool_call, update_result)
    
    print("=== Agent Builder Mode - Update Agent Tool Response ===")
    print(structured_result["summary"])
    print("\n" + "="*60 + "\n")
    
    # Test without agent builder mode
    processor_normal = ResponseProcessor(
        tool_registry=tool_registry,
        add_message_callback=mock_add_message,
        is_agent_builder=False
    )
    
    structured_result_normal = processor_normal._create_structured_tool_result(tool_call, update_result)
    
    print("=== Normal Mode - Update Agent Tool Response ===")
    print(structured_result_normal["summary"])
    print("\n" + "="*60 + "\n")

def test_get_current_agent_config_response():
    """Test get_current_agent_config tool response formatting."""
    
    mock_tool = MockTool()
    config_result = mock_tool.success_response({
        "summary": "Agent 'Research Assistant' has 2 tools enabled and 1 MCP servers configured.",
        "configuration": {
            "agent_id": "test-agent-123",
            "name": "Research Assistant",
            "description": "An AI assistant specialized in research",
            "system_prompt": "You are a research assistant with expertise in gathering, analyzing, and synthesizing information from various sources. Your approach is thorough and methodical.",
            "agentpress_tools": {
                "web_search": {"enabled": True, "description": "Search the web"},
                "sb_files": {"enabled": False, "description": "File operations"}
            },
            "configured_mcps": [],
            "avatar": "🔬",
            "avatar_color": "#4F46E5"
        }
    })
    
    tool_registry = ToolRegistry()
    processor = ResponseProcessor(
        tool_registry=tool_registry,
        add_message_callback=mock_add_message,
        is_agent_builder=True,
        target_agent_id="test-agent-123"
    )
    
    tool_call = {
        "function_name": "get_current_agent_config",
        "xml_tag_name": "get_current_agent_config",
        "arguments": {}
    }
    
    structured_result = processor._create_structured_tool_result(tool_call, config_result)
    
    print("=== Agent Builder Mode - Get Current Agent Config Response ===")
    print(structured_result["summary"])
    print("\n" + "="*60 + "\n")

if __name__ == "__main__":
    print("Testing Enhanced Response Processor for Agent Builder Tools\n")
    test_update_agent_response()
    test_get_current_agent_config_response()
    print("✅ All tests completed!") 