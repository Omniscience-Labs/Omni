BEGIN;

ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS sharing_preferences JSONB DEFAULT '{
  "include_system_prompt": true,
  "include_default_tools": true,
  "include_integrations": true,
  "include_knowledge_bases": true,
  "include_triggers": true,
  "include_default_files": true
}'::jsonb;

ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

COMMENT ON COLUMN agent_templates.sharing_preferences IS 'Controls what components are included when template is installed: system_prompt, default_tools, integrations, knowledge_bases, triggers, default_files. All templates create independent copies for users.';

COMMIT;
