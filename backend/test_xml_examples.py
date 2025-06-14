#!/usr/bin/env python3
"""
Test script to verify that XML tool examples are correctly included in workflow system prompts.
"""

import asyncio
import json
from workflows.converter import WorkflowConverter
from workflows.tool_examples import get_tools_xml_examples

def test_xml_examples_integration():
    """Test that XML tool examples are correctly included in workflow system prompts."""
    
    print("🧪 Testing XML Tool Examples Integration")
    print("=" * 50)
    
    # Create a sample workflow with input node and tools
    nodes = [
        {
            "id": "input-1",
            "type": "inputNode",
            "position": {"x": 100, "y": 100},
            "data": {
                "label": "Workflow Input",
                "prompt": "Search for information about AI and create a summary file.",
                "trigger_type": "MANUAL",
                "variables": {
                    "topic": "artificial intelligence",
                    "output_format": "markdown"
                }
            }
        },
        {
            "id": "agent-1",
            "type": "agentNode",
            "position": {"x": 400, "y": 100},
            "data": {
                "label": "Research Agent",
                "instructions": "You are a research assistant that searches for information and creates summaries",
                "model": "anthropic/claude-3-5-sonnet-latest",
                "connectedTools": [
                    {"id": "tool-1", "name": "Web Search", "type": "web_search_tool"},
                    {"id": "tool-2", "name": "File Operations", "type": "sb_files_tool"}
                ]
            }
        },
        {
            "id": "tool-1",
            "type": "toolConnectionNode",
            "position": {"x": 100, "y": 200},
            "data": {
                "label": "Web Search",
                "nodeId": "web_search_tool",
                "description": "Search the web for information"
            }
        },
        {
            "id": "tool-2",
            "type": "toolConnectionNode",
            "position": {"x": 100, "y": 300},
            "data": {
                "label": "File Operations",
                "nodeId": "sb_files_tool",
                "description": "Create and manage files"
            }
        }
    ]
    
    edges = [
        {
            "id": "e-input-1-agent-1",
            "source": "input-1",
            "target": "agent-1",
            "sourceHandle": "output",
            "targetHandle": "input"
        },
        {
            "id": "e-tool-1-agent-1",
            "source": "tool-1",
            "target": "agent-1",
            "sourceHandle": "tool-connection",
            "targetHandle": "tools"
        },
        {
            "id": "e-tool-2-agent-1",
            "source": "tool-2",
            "target": "agent-1",
            "sourceHandle": "tool-connection",
            "targetHandle": "tools"
        }
    ]
    
    metadata = {
        "name": "Research and Summary Workflow",
        "description": "A workflow that searches for information and creates summaries",
        "project_id": "test-project-123"
    }
    
    # Convert flow to workflow definition
    converter = WorkflowConverter()
    workflow_def = converter.convert_flow_to_workflow(nodes, edges, metadata)
    
    print(f"✅ Workflow Definition Created:")
    print(f"   Name: {workflow_def.name}")
    print(f"   Steps: {len(workflow_def.steps)}")
    
    # Get the system prompt
    main_step = workflow_def.steps[0]
    system_prompt = main_step.config.get("system_prompt", "")
    
    print(f"\n📝 System Prompt Analysis:")
    print(f"   System Prompt Length: {len(system_prompt)} characters")
    
    # Check that input prompt is included
    input_prompt = main_step.config.get("input_prompt", "")
    if "Search for information about AI" in system_prompt:
        print("✅ Input prompt correctly included in system prompt")
    else:
        print("❌ ERROR: Input prompt not found in system prompt!")
        return False
    
    # Check that tool examples section exists
    if "## Tool Usage Examples" in system_prompt:
        print("✅ Tool Usage Examples section found in system prompt")
    else:
        print("❌ ERROR: Tool Usage Examples section not found!")
        return False
    
    # Check for specific XML examples
    if "<function_calls>" in system_prompt:
        print("✅ XML function_calls format found in system prompt")
    else:
        print("❌ ERROR: XML function_calls format not found!")
        return False
    
    # Check for web search tool example
    if "web_search" in system_prompt and "<invoke name=\"web_search\">" in system_prompt:
        print("✅ Web search tool XML example found")
    else:
        print("❌ ERROR: Web search tool XML example not found!")
        return False
    
    # Check for file operations tool example
    if "create_file" in system_prompt and "<invoke name=\"create_file\">" in system_prompt:
        print("✅ File operations tool XML example found")
    else:
        print("❌ ERROR: File operations tool XML example not found!")
        return False
    
    # Test the tool examples function directly
    print(f"\n🔧 Testing Tool Examples Function:")
    tool_ids = ["web_search_tool", "sb_files_tool"]
    xml_examples = get_tools_xml_examples(tool_ids)
    
    if xml_examples:
        print(f"✅ Tool examples generated successfully ({len(xml_examples)} characters)")
        
        # Check that both tools are included
        if "Web Search Tool" in xml_examples and "Sb Files Tool" in xml_examples:
            print("✅ Both tool examples included in output")
        else:
            print("❌ ERROR: Not all tool examples included!")
            return False
    else:
        print("❌ ERROR: No tool examples generated!")
        return False
    
    # Print a sample of the system prompt for verification
    print(f"\n📄 System Prompt Sample (first 500 chars):")
    print("-" * 50)
    print(system_prompt[:500] + "..." if len(system_prompt) > 500 else system_prompt)
    print("-" * 50)
    
    # Look for the tool examples section specifically
    if "## Tool Usage Examples" in system_prompt:
        start_idx = system_prompt.find("## Tool Usage Examples")
        end_idx = system_prompt.find("## Workflow Execution", start_idx)
        if end_idx == -1:
            end_idx = start_idx + 1000  # Show next 1000 chars if no end found
        
        tool_examples_section = system_prompt[start_idx:end_idx]
        print(f"\n🔧 Tool Examples Section:")
        print("-" * 50)
        print(tool_examples_section)
        print("-" * 50)
    
    print(f"\n🎉 All Tests Passed!")
    print(f"   ✓ Input prompt integration")
    print(f"   ✓ Tool Usage Examples section")
    print(f"   ✓ XML function_calls format")
    print(f"   ✓ Web search tool example")
    print(f"   ✓ File operations tool example")
    print(f"   ✓ Tool examples function")
    
    return True

def main():
    """Run the test."""
    try:
        result = test_xml_examples_integration()
        if result:
            print(f"\n🎯 Test Summary: SUCCESS")
            print(f"   XML tool examples are now automatically included in workflow system prompts!")
            print(f"   When workflows are saved, agents will know exactly how to call tools using XML format.")
        else:
            print(f"\n❌ Test Summary: FAILED")
            print(f"   There are issues with XML tool examples integration.")
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main() 