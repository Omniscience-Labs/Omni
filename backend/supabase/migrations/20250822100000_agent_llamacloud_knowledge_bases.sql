BEGIN;

-- Create table for agent LlamaCloud knowledge base configurations
-- This is completely separate from the existing agent_knowledge_base_entries table
CREATE TABLE IF NOT EXISTS agent_llamacloud_knowledge_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    
    -- LlamaCloud Configuration
    name VARCHAR(255) NOT NULL,           -- Tool function name (e.g., "documentation")
    index_name VARCHAR(255) NOT NULL,     -- LlamaCloud index identifier
    description TEXT,                     -- What this knowledge base contains
    
    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT agent_llamacloud_kb_name_not_empty CHECK (
        name IS NOT NULL AND LENGTH(TRIM(name)) > 0
    ),
    CONSTRAINT agent_llamacloud_kb_index_name_not_empty CHECK (
        index_name IS NOT NULL AND LENGTH(TRIM(index_name)) > 0
    ),
    -- Ensure unique name per agent for clean function generation
    CONSTRAINT agent_llamacloud_kb_unique_name_per_agent UNIQUE (agent_id, name)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_llamacloud_kb_agent_id ON agent_llamacloud_knowledge_bases(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_llamacloud_kb_account_id ON agent_llamacloud_knowledge_bases(account_id);
CREATE INDEX IF NOT EXISTS idx_agent_llamacloud_kb_is_active ON agent_llamacloud_knowledge_bases(is_active);
CREATE INDEX IF NOT EXISTS idx_agent_llamacloud_kb_created_at ON agent_llamacloud_knowledge_bases(created_at);

-- Enable RLS
ALTER TABLE agent_llamacloud_knowledge_bases ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for agent LlamaCloud knowledge bases
CREATE POLICY agent_llamacloud_kb_user_access ON agent_llamacloud_knowledge_bases
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM agents a
            WHERE a.agent_id = agent_llamacloud_knowledge_bases.agent_id
            AND basejump.has_role_on_account(a.account_id) = true
        )
    );

-- Function to get agent LlamaCloud knowledge bases
CREATE OR REPLACE FUNCTION get_agent_llamacloud_knowledge_bases(
    p_agent_id UUID,
    p_include_inactive BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    index_name VARCHAR(255),
    description TEXT,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        alkb.id,
        alkb.name,
        alkb.index_name,
        alkb.description,
        alkb.is_active,
        alkb.created_at,
        alkb.updated_at
    FROM agent_llamacloud_knowledge_bases alkb
    WHERE alkb.agent_id = p_agent_id
    AND (p_include_inactive OR alkb.is_active = TRUE)
    ORDER BY alkb.created_at DESC;
END;
$$;

-- Create trigger for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_agent_llamacloud_kb_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_agent_llamacloud_kb_updated_at
    BEFORE UPDATE ON agent_llamacloud_knowledge_bases
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_llamacloud_kb_timestamp();

-- Grant permissions
GRANT ALL PRIVILEGES ON TABLE agent_llamacloud_knowledge_bases TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_agent_llamacloud_knowledge_bases TO authenticated, service_role;

-- Add comments
COMMENT ON TABLE agent_llamacloud_knowledge_bases IS 'Stores LlamaCloud knowledge base configurations for agents - completely separate from the file-based knowledge base system';
COMMENT ON FUNCTION get_agent_llamacloud_knowledge_bases IS 'Retrieves all LlamaCloud knowledge base configurations for a specific agent';

COMMIT;
