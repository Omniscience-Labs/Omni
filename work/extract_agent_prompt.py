"""
Extract the exact system prompt for a specific agent.
Usage: python extract_agent_prompt.py
"""

import asyncio
import json
import os
import sys

# Add the backend to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'omni', 'Omni', 'backend'))

from core.config_helper import get_supabase_admin_client


async def extract_agent_system_prompt(agent_id: str):
    """Extract the exact system prompt and configuration for an agent."""
    
    client = await get_supabase_admin_client()
    
    print(f"\n{'='*80}")
    print(f"Extracting system prompt for agent: {agent_id}")
    print(f"{'='*80}\n")
    
    # Get the agent's current configuration
    agent_result = await client.table('agents').select(
        'agent_id, name, description, system_prompt, configured_mcps, agentpress_tools, custom_mcps, metadata, current_version_id, created_at, updated_at'
    ).eq('agent_id', agent_id).execute()
    
    if not agent_result.data:
        print(f"❌ Agent not found: {agent_id}")
        return
    
    agent = agent_result.data[0]
    agent_name = agent.get('name', 'Unknown')
    system_prompt = agent.get('system_prompt', 'No system prompt found')
    current_version_id = agent.get('current_version_id')
    configured_mcps = agent.get('configured_mcps', [])
    agentpress_tools = agent.get('agentpress_tools', {})
    custom_mcps = agent.get('custom_mcps', [])
    
    print(f"📝 Agent Name: {agent_name}")
    print(f"📄 Description: {agent.get('description', 'N/A')}")
    print(f"🆔 Agent ID: {agent_id}")
    print(f"📅 Created: {agent.get('created_at')}")
    print(f"🔄 Updated: {agent.get('updated_at')}")
    print(f"📦 Current Version ID: {current_version_id}")
    print(f"\n{'-'*80}")
    print("SYSTEM PROMPT (from agents.system_prompt):")
    print(f"{'-'*80}")
    print(system_prompt)
    print(f"\n{'-'*80}")
    
    # Display tools configuration
    print(f"\n{'='*80}")
    print("TOOLS CONFIGURATION:")
    print(f"{'='*80}")
    print(f"\nConfigured MCPs: {json.dumps(configured_mcps, indent=2)}")
    print(f"\nCustom MCPs: {json.dumps(custom_mcps, indent=2)}")
    print(f"\nAgentpress Tools: {json.dumps(agentpress_tools, indent=2)}")
    
    # Get the current version's system prompt if versioning is used
    if current_version_id:
        version_result = await client.table('agent_versions').select(
            'version_id, version_name, version_number, system_prompt, configured_mcps, custom_mcps, agentpress_tools, is_active, created_at'
        ).eq('version_id', current_version_id).execute()
        
        if version_result.data:
            version = version_result.data[0]
            version_system_prompt = version.get('system_prompt', 'No system prompt found')
            
            print(f"\n{'='*80}")
            print(f"CURRENT VERSION: {version.get('version_name')} (v{version.get('version_number')})")
            print(f"{'='*80}")
            print(f"Version ID: {version.get('version_id')}")
            print(f"Active: {version.get('is_active')}")
            print(f"Created: {version.get('created_at')}")
            print(f"\n{'-'*80}")
            print("SYSTEM PROMPT (from agent_versions.system_prompt):")
            print(f"{'-'*80}")
            print(version_system_prompt)
            print(f"\n{'-'*80}")
            
            # Display version tools
            print(f"\nVersion Tools Configuration:")
            print(f"  Configured MCPs: {json.dumps(version.get('configured_mcps', []), indent=2)}")
            print(f"  Custom MCPs: {json.dumps(version.get('custom_mcps', []), indent=2)}")
            print(f"  Agentpress Tools: {json.dumps(version.get('agentpress_tools', {}), indent=2)}")
    
    # Get all versions if any exist
    all_versions_result = await client.table('agent_versions').select(
        'version_id, version_name, version_number, is_active, created_at'
    ).eq('agent_id', agent_id).order('version_number', desc=True).execute()
    
    if all_versions_result.data:
        print(f"\n{'='*80}")
        print(f"ALL VERSIONS ({len(all_versions_result.data)} total):")
        print(f"{'='*80}")
        for v in all_versions_result.data:
            status = "✓ ACTIVE" if v['is_active'] else "✗ Inactive"
            current = "← CURRENT" if v['version_id'] == current_version_id else ""
            print(f"  • v{v['version_number']} - {v['version_name']} ({status}) {current}")
            print(f"    Created: {v['created_at']}")
    
    print(f"\n{'='*80}")
    print("✅ Extraction complete!")
    print(f"{'='*80}\n")


async def main():
    agent_id = "06ebb3f9-5e01-4def-8787-9ce48a1f0dbf"
    await extract_agent_system_prompt(agent_id)


if __name__ == "__main__":
    asyncio.run(main())

