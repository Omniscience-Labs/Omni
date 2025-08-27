BEGIN;

-- Add comprehensive sharing preference columns to existing agent_templates table
ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS sharing_preferences JSONB DEFAULT '{
  "include_system_prompt": true,
  "include_model_settings": true,
  "include_default_tools": true,
  "include_integrations": true,
  "include_knowledge_bases": true,
  "include_playbooks": true,
  "include_triggers": true
}'::jsonb;

-- Add index for sharing preferences
CREATE INDEX IF NOT EXISTS idx_agent_templates_sharing_preferences ON agent_templates USING gin(sharing_preferences);

-- Comment for documentation
COMMENT ON COLUMN agent_templates.sharing_preferences IS 'Controls what components are included when template is installed: system_prompt, model_settings, default_tools, integrations, knowledge_bases, playbooks, triggers';

COMMIT;
