-- Extract the exact system prompt for agent: 06ebb3f9-5e01-4def-8787-9ce48a1f0dbf

-- First, get the agent's current configuration and system prompt
SELECT 
    agent_id,
    name,
    description,
    system_prompt AS current_system_prompt,
    configured_mcps,
    agentpress_tools,
    custom_mcps,
    current_version_id,
    metadata,
    created_at,
    updated_at
FROM agents
WHERE agent_id = '06ebb3f9-5e01-4def-8787-9ce48a1f0dbf';

-- Also get the current version's system prompt (if versioning is being used)
SELECT 
    av.version_id,
    av.version_name,
    av.version_number,
    av.system_prompt AS version_system_prompt,
    av.configured_mcps,
    av.custom_mcps,
    av.agentpress_tools,
    av.is_active,
    av.created_at,
    a.name AS agent_name
FROM agent_versions av
JOIN agents a ON a.agent_id = av.agent_id
WHERE av.agent_id = '06ebb3f9-5e01-4def-8787-9ce48a1f0dbf'
    AND av.version_id = (SELECT current_version_id FROM agents WHERE agent_id = '06ebb3f9-5e01-4def-8787-9ce48a1f0dbf')
ORDER BY av.version_number DESC;

-- Get all versions' system prompts for this agent (to see history)
SELECT 
    av.version_id,
    av.version_name,
    av.version_number,
    av.system_prompt AS version_system_prompt,
    av.is_active,
    av.created_at
FROM agent_versions av
WHERE av.agent_id = '06ebb3f9-5e01-4def-8787-9ce48a1f0dbf'
ORDER BY av.version_number DESC;

