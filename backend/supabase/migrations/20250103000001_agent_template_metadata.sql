BEGIN;

ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_agent_templates_metadata ON agent_templates USING gin(metadata);

COMMIT; 