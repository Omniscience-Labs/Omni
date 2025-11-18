-- Add index for cost calculation query performance
-- This index significantly speeds up queries filtering by type and date range
CREATE INDEX IF NOT EXISTS idx_messages_type_created_at 
  ON messages(type, created_at) 
  WHERE type = 'assistant_response_end';

-- Also add a GIN index for JSONB usage queries if not exists
CREATE INDEX IF NOT EXISTS idx_messages_content_usage_gin 
  ON messages USING GIN (content jsonb_path_ops)
  WHERE type = 'assistant_response_end' AND content ? 'usage';

COMMENT ON INDEX idx_messages_type_created_at IS 'Optimizes cost calculation queries that filter by type and date range';
COMMENT ON INDEX idx_messages_content_usage_gin IS 'Optimizes JSONB usage field lookups for cost calculations';

