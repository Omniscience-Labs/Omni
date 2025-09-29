BEGIN;

-- Create global LlamaCloud knowledge bases table (similar to knowledge_base_entries pattern)
CREATE TABLE IF NOT EXISTS llamacloud_knowledge_bases (
    kb_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    
    -- LlamaCloud Configuration
    name VARCHAR(255) NOT NULL,           -- Display name for knowledge base
    index_name VARCHAR(255) NOT NULL,     -- LlamaCloud index identifier
    description TEXT,                     -- What this knowledge base contains
    
    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT llamacloud_kb_name_not_empty CHECK (
        name IS NOT NULL AND LENGTH(TRIM(name)) > 0
    ),
    CONSTRAINT llamacloud_kb_index_name_not_empty CHECK (
        index_name IS NOT NULL AND LENGTH(TRIM(index_name)) > 0
    ),
    -- Ensure unique index name per account
    CONSTRAINT llamacloud_kb_unique_index_per_account UNIQUE (account_id, index_name)
);

-- Create agent assignments for LlamaCloud knowledge bases (similar to agent_knowledge_entry_assignments)
CREATE TABLE IF NOT EXISTS agent_llamacloud_kb_assignments (
    assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    kb_id UUID NOT NULL REFERENCES llamacloud_knowledge_bases(kb_id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    
    enabled BOOLEAN DEFAULT TRUE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(agent_id, kb_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_llamacloud_kb_account_id ON llamacloud_knowledge_bases(account_id);
CREATE INDEX IF NOT EXISTS idx_llamacloud_kb_is_active ON llamacloud_knowledge_bases(is_active);
CREATE INDEX IF NOT EXISTS idx_llamacloud_kb_created_at ON llamacloud_knowledge_bases(created_at);

CREATE INDEX IF NOT EXISTS idx_agent_llamacloud_assignments_agent_id ON agent_llamacloud_kb_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_llamacloud_assignments_kb_id ON agent_llamacloud_kb_assignments(kb_id);

-- Enable RLS
ALTER TABLE llamacloud_knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_llamacloud_kb_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies following the same pattern as regular KB entries
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'llamacloud_kb_account_access' AND tablename = 'llamacloud_knowledge_bases') THEN
        CREATE POLICY llamacloud_kb_account_access ON llamacloud_knowledge_bases
            FOR ALL USING (basejump.has_role_on_account(account_id) = true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'llamacloud_kb_assignments_account_access' AND tablename = 'agent_llamacloud_kb_assignments') THEN
        CREATE POLICY llamacloud_kb_assignments_account_access ON agent_llamacloud_kb_assignments
            FOR ALL USING (basejump.has_role_on_account(account_id) = true);
    END IF;
END $$;

-- Migrate existing agent-specific LlamaCloud KBs to global system
INSERT INTO llamacloud_knowledge_bases (
    account_id,
    name,
    index_name,
    description,
    is_active,
    created_at,
    updated_at
)
SELECT DISTINCT
    account_id,
    name,
    index_name,
    description,
    is_active,
    created_at,
    updated_at
FROM agent_llamacloud_knowledge_bases
ON CONFLICT (account_id, index_name) DO NOTHING;

-- Create assignments for migrated LlamaCloud KBs
INSERT INTO agent_llamacloud_kb_assignments (
    agent_id,
    kb_id,
    account_id,
    enabled,
    assigned_at
)
SELECT 
    alkb.agent_id,
    gkb.kb_id,
    alkb.account_id,
    alkb.is_active,
    alkb.created_at
FROM agent_llamacloud_knowledge_bases alkb
JOIN llamacloud_knowledge_bases gkb ON (
    gkb.account_id = alkb.account_id 
    AND gkb.index_name = alkb.index_name
)
ON CONFLICT (agent_id, kb_id) DO NOTHING;

-- Function to get global LlamaCloud knowledge bases for an account
CREATE OR REPLACE FUNCTION get_global_llamacloud_knowledge_bases(
    p_account_id UUID,
    p_include_inactive BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    kb_id UUID,
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
        lkb.kb_id,
        lkb.name,
        lkb.index_name,
        lkb.description,
        lkb.is_active,
        lkb.created_at,
        lkb.updated_at
    FROM llamacloud_knowledge_bases lkb
    WHERE lkb.account_id = p_account_id
    AND (p_include_inactive OR lkb.is_active = TRUE)
    ORDER BY lkb.created_at DESC;
END;
$$;

-- Function to get agent's assigned LlamaCloud knowledge bases
CREATE OR REPLACE FUNCTION get_agent_assigned_llamacloud_kbs(
    p_agent_id UUID,
    p_include_inactive BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    kb_id UUID,
    name VARCHAR(255),
    index_name VARCHAR(255),
    description TEXT,
    is_active BOOLEAN,
    enabled BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    assigned_at TIMESTAMPTZ
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        lkb.kb_id,
        lkb.name,
        lkb.index_name,
        lkb.description,
        lkb.is_active,
        ala.enabled,
        lkb.created_at,
        lkb.updated_at,
        ala.assigned_at
    FROM llamacloud_knowledge_bases lkb
    JOIN agent_llamacloud_kb_assignments ala ON lkb.kb_id = ala.kb_id
    WHERE ala.agent_id = p_agent_id
    AND (p_include_inactive OR (lkb.is_active = TRUE AND ala.enabled = TRUE))
    ORDER BY ala.assigned_at DESC;
END;
$$;

-- Create trigger for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_llamacloud_kb_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_llamacloud_kb_updated_at
    BEFORE UPDATE ON llamacloud_knowledge_bases
    FOR EACH ROW
    EXECUTE FUNCTION update_llamacloud_kb_timestamp();

-- Grant permissions
GRANT ALL PRIVILEGES ON TABLE llamacloud_knowledge_bases TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE agent_llamacloud_kb_assignments TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_global_llamacloud_knowledge_bases TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_agent_assigned_llamacloud_kbs TO authenticated, service_role;

-- Log migration results
DO $$
DECLARE
    global_kb_count INTEGER;
    assignment_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO global_kb_count FROM llamacloud_knowledge_bases;
    SELECT COUNT(*) INTO assignment_count FROM agent_llamacloud_kb_assignments;
    
    RAISE NOTICE 'Global LlamaCloud KB migration completed:';
    RAISE NOTICE '  - Global LlamaCloud KBs created: %', global_kb_count;
    RAISE NOTICE '  - Agent assignments created: %', assignment_count;
END $$;

COMMIT;
