-- Get the system prompt/instructions for agent: 06ebb3f9-5e01-4def-8787-9ce48a1f0dbf

-- Option 1: Check if current_version_id exists and get its prompt
SELECT 
    a.name AS agent_name,
    av.version_name,
    av.config->>'system_prompt' AS system_prompt_instructions
FROM agents a
LEFT JOIN agent_versions av ON av.version_id = a.current_version_id
WHERE a.agent_id = '06ebb3f9-5e01-4def-8787-9ce48a1f0dbf';

-- Option 2: Get the latest/most recent version's prompt if current_version_id is null
SELECT 
    version_name,
    version_number,
    config->>'system_prompt' AS system_prompt_instructions
FROM agent_versions
WHERE agent_id = '06ebb3f9-5e01-4def-8787-9ce48a1f0dbf'
ORDER BY version_number DESC
LIMIT 1;

-- Option 3: Get ALL versions to see all prompts
SELECT 
    version_name,
    version_number,
    config->>'system_prompt' AS system_prompt_instructions
FROM agent_versions
WHERE agent_id = '06ebb3f9-5e01-4def-8787-9ce48a1f0dbf'
ORDER BY version_number DESC;
