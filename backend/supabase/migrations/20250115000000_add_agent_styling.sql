BEGIN;

ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS avatar VARCHAR(10),
ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(7);

CREATE INDEX IF NOT EXISTS idx_agents_avatar ON agents(avatar);
CREATE INDEX IF NOT EXISTS idx_agents_avatar_color ON agents(avatar_color);

COMMENT ON COLUMN agents.avatar IS 'Emoji character used as agent avatar (e.g., 🤖)';
COMMENT ON COLUMN agents.avatar_color IS 'Hex color code for agent avatar background (e.g., #3b82f6)';

COMMIT; 