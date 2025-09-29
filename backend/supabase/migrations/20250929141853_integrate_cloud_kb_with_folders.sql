BEGIN;

-- Add folder_id to llamacloud_knowledge_bases to integrate with folder system
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='llamacloud_knowledge_bases' 
        AND column_name='folder_id'
    ) THEN
        ALTER TABLE llamacloud_knowledge_bases 
        ADD COLUMN folder_id UUID REFERENCES knowledge_base_folders(folder_id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_llamacloud_kb_folder_id ON llamacloud_knowledge_bases(folder_id);

-- Add summary field to make them more like regular entries for search/display
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='llamacloud_knowledge_bases' 
        AND column_name='summary'
    ) THEN
        ALTER TABLE llamacloud_knowledge_bases 
        ADD COLUMN summary TEXT;
    END IF;
END $$;

-- Add usage_context to match regular knowledge base entries
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='llamacloud_knowledge_bases' 
        AND column_name='usage_context'
    ) THEN
        ALTER TABLE llamacloud_knowledge_bases 
        ADD COLUMN usage_context VARCHAR(100) DEFAULT 'always';
        
        -- Add constraint separately after column is created
        ALTER TABLE llamacloud_knowledge_bases 
        ADD CONSTRAINT llamacloud_kb_usage_context_check 
        CHECK (usage_context IN ('always', 'on_request', 'contextual'));
    END IF;
END $$;

-- Update RLS policies to include folder-based access
DO $$ BEGIN
    -- Drop existing policy if it exists
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'llamacloud_kb_account_access' AND tablename = 'llamacloud_knowledge_bases') THEN
        DROP POLICY llamacloud_kb_account_access ON llamacloud_knowledge_bases;
    END IF;
    
    -- Create new policy that supports both direct account access and folder-based access
    CREATE POLICY llamacloud_kb_account_access ON llamacloud_knowledge_bases
        FOR ALL USING (
            basejump.has_role_on_account(account_id) = true
        );
END $$;

-- Function to get unified knowledge base entries (regular files + cloud KBs) for a folder
-- This function properly checks RLS through the calling user's context
CREATE OR REPLACE FUNCTION get_unified_folder_entries(
    p_folder_id UUID,
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
    -- File-specific fields (NULL for cloud KBs)
    filename VARCHAR(255),
    file_size BIGINT,
    mime_type VARCHAR(255),
    -- Cloud KB specific fields (NULL for files)
    index_name VARCHAR(255)
)
LANGUAGE plpgsql
SECURITY INVOKER  -- Run with caller's permissions, respects RLS
AS $$
BEGIN
    -- Verify folder belongs to account
    IF NOT EXISTS (
        SELECT 1 FROM knowledge_base_folders 
        WHERE folder_id = p_folder_id AND account_id = p_account_id
    ) THEN
        RAISE EXCEPTION 'Folder not found or access denied';
    END IF;

    RETURN QUERY
    -- Regular knowledge base entries
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
        NULL::VARCHAR(255) as index_name
    FROM knowledge_base_entries kbe
    WHERE kbe.folder_id = p_folder_id
    AND kbe.account_id = p_account_id
    AND (p_include_inactive OR kbe.is_active = TRUE)
    
    UNION ALL
    
    -- LlamaCloud knowledge bases in this folder
    SELECT 
        lkb.kb_id as entry_id,
        'cloud_kb'::VARCHAR(20) as entry_type,
        lkb.name,
        COALESCE(lkb.summary, lkb.description) as summary,
        lkb.description,
        lkb.usage_context,
        lkb.is_active,
        lkb.created_at,
        lkb.updated_at,
        NULL::VARCHAR(255) as filename,
        NULL::BIGINT as file_size,
        NULL::VARCHAR(255) as mime_type,
        lkb.index_name
    FROM llamacloud_knowledge_bases lkb
    WHERE lkb.folder_id = p_folder_id
    AND lkb.account_id = p_account_id
    AND (p_include_inactive OR lkb.is_active = TRUE)
    
    ORDER BY created_at DESC;
END;
$$;

-- Function to get unified knowledge base entries at root level (no folder)
CREATE OR REPLACE FUNCTION get_unified_root_entries(
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
    index_name VARCHAR(255)
)
LANGUAGE plpgsql
SECURITY INVOKER  -- Run with caller's permissions, respects RLS
AS $$
BEGIN
    RETURN QUERY
    -- LlamaCloud knowledge bases at root level (not in any folder)
    SELECT 
        lkb.kb_id as entry_id,
        'cloud_kb'::VARCHAR(20) as entry_type,
        lkb.name,
        COALESCE(lkb.summary, lkb.description) as summary,
        lkb.description,
        lkb.usage_context,
        lkb.is_active,
        lkb.created_at,
        lkb.updated_at,
        NULL::VARCHAR(255) as filename,
        NULL::BIGINT as file_size,
        NULL::VARCHAR(255) as mime_type,
        lkb.index_name
    FROM llamacloud_knowledge_bases lkb
    WHERE lkb.folder_id IS NULL
    AND lkb.account_id = p_account_id
    AND (p_include_inactive OR lkb.is_active = TRUE)
    
    ORDER BY created_at DESC;
END;
$$;

-- Function to get total entry count for a folder (files + cloud KBs)
CREATE OR REPLACE FUNCTION get_folder_entry_count(
    p_folder_id UUID,
    p_account_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Count regular files
    SELECT COUNT(*) INTO v_count
    FROM knowledge_base_entries
    WHERE folder_id = p_folder_id
    AND account_id = p_account_id
    AND is_active = TRUE;
    
    -- Add cloud KBs count
    v_count := v_count + (
        SELECT COUNT(*)
        FROM llamacloud_knowledge_bases
        WHERE folder_id = p_folder_id
        AND account_id = p_account_id
        AND is_active = TRUE
    );
    
    RETURN v_count;
END;
$$;

-- Update trigger for timestamp updates on new columns
CREATE OR REPLACE FUNCTION update_llamacloud_kb_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS trigger_llamacloud_kb_updated_at ON llamacloud_knowledge_bases;
CREATE TRIGGER trigger_llamacloud_kb_updated_at
    BEFORE UPDATE ON llamacloud_knowledge_bases
    FOR EACH ROW
    EXECUTE FUNCTION update_llamacloud_kb_timestamp();

COMMIT;