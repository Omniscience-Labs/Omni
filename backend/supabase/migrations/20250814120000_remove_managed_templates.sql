BEGIN;

-- Remove managed template functionality completely
-- Keep sharing preferences functionality intact

-- 1. Remove managed_template column from agent_templates table
ALTER TABLE agent_templates DROP COLUMN IF EXISTS managed_template;

-- 2. Drop any indexes for managed_template if they exist
DROP INDEX IF EXISTS idx_agent_templates_managed_template;

-- 3. Clean up installed_by_users metadata from all agents
UPDATE agents 
SET metadata = metadata - 'installed_by_users'
WHERE metadata ? 'installed_by_users';

-- 4. Clean up original_agent_id from template metadata
UPDATE agent_templates 
SET metadata = metadata - 'original_agent_id'
WHERE metadata ? 'original_agent_id';

-- 5. Simplify marketplace_install metadata in agents
UPDATE agents 
SET metadata = jsonb_set(
    metadata, 
    '{marketplace_install}', 
    jsonb_build_object(
        'template_id', metadata->'marketplace_install'->>'template_id',
        'template_name', metadata->'marketplace_install'->>'template_name',
        'installed_at', metadata->'marketplace_install'->>'installed_at'
    )
)
WHERE metadata->'marketplace_install' ? 'is_managed' 
   OR metadata->'marketplace_install' ? 'is_favorite'
   OR metadata->'marketplace_install' ? 'original_agent_id';

-- Update comments to reflect removal of managed templates
COMMENT ON COLUMN agent_templates.sharing_preferences IS 'Controls what components are included when template is installed: system_prompt, model_settings, default_tools, integrations, knowledge_bases, playbooks, triggers. All templates create independent copies for users.';

COMMIT;
