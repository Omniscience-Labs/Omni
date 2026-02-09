-- Backfill source_template_id for agents installed from templates
-- The installation service was using 'created_from_template' instead of 'source_template_id'
-- This migration fixes existing agents so they are correctly identified as "Installed Agents"

UPDATE agents
SET metadata = jsonb_set(
  metadata,
  '{source_template_id}',
  metadata->'created_from_template'
)
WHERE metadata ? 'created_from_template'
  AND NOT (metadata ? 'source_template_id');
