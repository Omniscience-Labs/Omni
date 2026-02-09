-- Add description and sharing_preferences columns to agent_templates table

ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS sharing_preferences JSONB DEFAULT '{}'::jsonb;
