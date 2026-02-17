BEGIN;

-- LlamaCloud Global Knowledge Base Tables
-- These tables support the global knowledge base model where KBs are shared across agents

-- Global LlamaCloud knowledge bases table
CREATE TABLE IF NOT EXISTS llamacloud_knowledge_bases (
    kb_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES knowledge_base_folders(folder_id) ON DELETE SET NULL,
    
    name VARCHAR(255) NOT NULL,
    index_name VARCHAR(255) NOT NULL, -- LlamaCloud index name
    description TEXT,
    summary TEXT, -- V2 compatibility: optional summary for display
    usage_context VARCHAR(100) DEFAULT 'always', -- V2 compatibility: when to use this KB
    
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT llamacloud_kb_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT llamacloud_kb_index_not_empty CHECK (LENGTH(TRIM(index_name)) > 0),
    CONSTRAINT llamacloud_kb_account_name_unique UNIQUE(account_id, name)
);

-- Add summary and usage_context columns if they don't exist (V2 DB already has them)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='llamacloud_knowledge_bases' AND column_name='summary'
    ) THEN
        ALTER TABLE llamacloud_knowledge_bases ADD COLUMN summary TEXT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='llamacloud_knowledge_bases' AND column_name='usage_context'
    ) THEN
        ALTER TABLE llamacloud_knowledge_bases ADD COLUMN usage_context VARCHAR(100) DEFAULT 'always';
    END IF;
END $$;

-- Agent assignments to global LlamaCloud knowledge bases
CREATE TABLE IF NOT EXISTS agent_llamacloud_kb_assignments (
    assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    kb_id UUID NOT NULL REFERENCES llamacloud_knowledge_bases(kb_id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    
    enabled BOOLEAN DEFAULT TRUE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(agent_id, kb_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_llamacloud_kb_account_id ON llamacloud_knowledge_bases(account_id);
CREATE INDEX IF NOT EXISTS idx_llamacloud_kb_folder_id ON llamacloud_knowledge_bases(folder_id);
CREATE INDEX IF NOT EXISTS idx_llamacloud_kb_is_active ON llamacloud_knowledge_bases(is_active);
CREATE INDEX IF NOT EXISTS idx_agent_llamacloud_assignments_agent_id ON agent_llamacloud_kb_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_llamacloud_assignments_kb_id ON agent_llamacloud_kb_assignments(kb_id);

-- Enable RLS
ALTER TABLE llamacloud_knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_llamacloud_kb_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
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

-- Updated_at triggers
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'llamacloud_kb_updated_at') THEN
        CREATE TRIGGER llamacloud_kb_updated_at
            BEFORE UPDATE ON llamacloud_knowledge_bases
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Functions (drop first so return types can change vs existing definitions)
DROP FUNCTION IF EXISTS get_agent_assigned_llamacloud_kbs(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS get_account_llamacloud_kbs(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS get_folder_unified_entries(UUID, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS get_folder_unified_entries(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS get_root_llamacloud_kbs(UUID, BOOLEAN);

-- Get agent's assigned LlamaCloud knowledge bases
CREATE OR REPLACE FUNCTION get_agent_assigned_llamacloud_kbs(
    p_agent_id UUID,
    p_include_inactive BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    kb_id UUID,
    name VARCHAR(255),
    index_name VARCHAR(255),
    description TEXT,
    summary TEXT,
    usage_context VARCHAR(100),
    is_active BOOLEAN,
    enabled BOOLEAN,
    assigned_at TIMESTAMPTZ,
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
        lkb.summary,
        COALESCE(lkb.usage_context, 'always'::VARCHAR(100)) as usage_context,
        lkb.is_active,
        akla.enabled,
        akla.assigned_at,
        lkb.created_at,
        lkb.updated_at
    FROM llamacloud_knowledge_bases lkb
    JOIN agent_llamacloud_kb_assignments akla ON lkb.kb_id = akla.kb_id
    WHERE akla.agent_id = p_agent_id
    AND akla.enabled = TRUE
    AND (p_include_inactive OR lkb.is_active = TRUE)
    ORDER BY lkb.created_at DESC;
END;
$$;

-- Get all global LlamaCloud knowledge bases for an account
CREATE OR REPLACE FUNCTION get_account_llamacloud_kbs(
    p_account_id UUID,
    p_include_inactive BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    kb_id UUID,
    name VARCHAR(255),
    index_name VARCHAR(255),
    description TEXT,
    summary TEXT,
    usage_context VARCHAR(100),
    folder_id UUID,
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
        lkb.summary,
        COALESCE(lkb.usage_context, 'always'::VARCHAR(100)) as usage_context,
        lkb.folder_id,
        lkb.is_active,
        lkb.created_at,
        lkb.updated_at
    FROM llamacloud_knowledge_bases lkb
    WHERE lkb.account_id = p_account_id
    AND (p_include_inactive OR lkb.is_active = TRUE)
    ORDER BY lkb.created_at DESC;
END;
$$;

-- Get unified knowledge base entries for folder (including LlamaCloud KBs)
CREATE OR REPLACE FUNCTION get_folder_unified_entries(
    p_folder_id UUID,
    p_account_id UUID DEFAULT NULL,
    p_include_inactive BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    entry_id UUID,
    entry_type VARCHAR(20),
    name VARCHAR(255),
    summary TEXT,
    description TEXT,
    usage_context VARCHAR(100),
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    filename VARCHAR(255),
    file_size BIGINT,
    mime_type VARCHAR(255),
    index_name VARCHAR(255),
    account_id UUID,
    folder_id UUID
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Verify folder ownership if account_id is provided
    IF p_account_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM knowledge_base_folders 
            WHERE knowledge_base_folders.folder_id = p_folder_id 
            AND knowledge_base_folders.account_id = p_account_id
        ) THEN
            RAISE EXCEPTION 'Folder not found or access denied';
        END IF;
    END IF;

    -- Return file entries
    RETURN QUERY
    SELECT 
        kbe.entry_id,
        'file'::VARCHAR(20) as entry_type,
        kbe.filename as name,
        kbe.summary,
        NULL::TEXT as description,
        kbe.usage_context,
        kbe.is_active,
        kbe.created_at,
        kbe.updated_at,
        kbe.filename,
        kbe.file_size,
        kbe.mime_type,
        NULL::VARCHAR(255) as index_name,
        kbe.account_id,
        kbe.folder_id
    FROM knowledge_base_entries kbe
    WHERE kbe.folder_id = p_folder_id
    AND (p_include_inactive OR kbe.is_active = TRUE);
    
    -- Return cloud KB entries (using actual column values from V2 data)
    RETURN QUERY
    SELECT 
        lkb.kb_id as entry_id,
        'cloud_kb'::VARCHAR(20) as entry_type,
        lkb.name,
        COALESCE(lkb.summary, lkb.description) as summary,
        lkb.description,
        COALESCE(lkb.usage_context, 'always'::VARCHAR(100)) as usage_context,
        lkb.is_active,
        lkb.created_at,
        lkb.updated_at,
        NULL::VARCHAR(255) as filename,
        NULL::BIGINT as file_size,
        NULL::VARCHAR(255) as mime_type,
        lkb.index_name,
        lkb.account_id,
        lkb.folder_id
    FROM llamacloud_knowledge_bases lkb
    WHERE lkb.folder_id = p_folder_id
    AND (p_include_inactive OR lkb.is_active = TRUE);
END;
$$;

-- Get root level cloud knowledge bases (not in any folder)
CREATE OR REPLACE FUNCTION get_root_llamacloud_kbs(
    p_account_id UUID,
    p_include_inactive BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    entry_id UUID,
    entry_type VARCHAR(20),
    name VARCHAR(255),
    summary TEXT,
    description TEXT,
    usage_context VARCHAR(100),
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    filename VARCHAR(255),
    file_size BIGINT,
    mime_type VARCHAR(255),
    index_name VARCHAR(255),
    account_id UUID,
    folder_id UUID
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        lkb.kb_id as entry_id,
        'cloud_kb'::VARCHAR(20) as entry_type,
        lkb.name,
        COALESCE(lkb.summary, lkb.description) as summary,
        lkb.description,
        COALESCE(lkb.usage_context, 'always'::VARCHAR(100)) as usage_context,
        lkb.is_active,
        lkb.created_at,
        lkb.updated_at,
        NULL::VARCHAR(255) as filename,
        NULL::BIGINT as file_size,
        NULL::VARCHAR(255) as mime_type,
        lkb.index_name,
        lkb.account_id,
        lkb.folder_id
    FROM llamacloud_knowledge_bases lkb
    WHERE lkb.account_id = p_account_id
    AND lkb.folder_id IS NULL
    AND (p_include_inactive OR lkb.is_active = TRUE)
    ORDER BY lkb.created_at DESC;
END;
$$;

-- Permissions
GRANT ALL ON llamacloud_knowledge_bases TO authenticated, service_role;
GRANT ALL ON agent_llamacloud_kb_assignments TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_agent_assigned_llamacloud_kbs(UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_account_llamacloud_kbs(UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_folder_unified_entries(UUID, UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_root_llamacloud_kbs(UUID, BOOLEAN) TO authenticated, service_role;

COMMIT;
