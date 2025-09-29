-- Fix get_unified_root_entries and get_unified_folder_entries to include account_id and folder_id
-- These fields are required by the TypeScript CloudKBEntry interface

-- Drop existing functions first (must drop to change return type)
DROP FUNCTION IF EXISTS get_unified_folder_entries(UUID, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS get_unified_root_entries(UUID, BOOLEAN);

-- Recreate folder entries function with account_id and folder_id
CREATE FUNCTION get_unified_folder_entries(
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
    filename VARCHAR(255),
    file_size BIGINT,
    mime_type VARCHAR(255),
    index_name VARCHAR(255),
    account_id UUID,
    folder_id UUID
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
        NULL::VARCHAR(255) as index_name,
        kbe.account_id,
        kbe.folder_id
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
        lkb.index_name,
        lkb.account_id,
        lkb.folder_id
    FROM llamacloud_knowledge_bases lkb
    WHERE lkb.folder_id = p_folder_id
    AND lkb.account_id = p_account_id
    AND (p_include_inactive OR lkb.is_active = TRUE)
    
    ORDER BY created_at DESC;
END;
$$;

-- Recreate root entries function with account_id and folder_id
CREATE FUNCTION get_unified_root_entries(
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
        lkb.index_name,
        lkb.account_id,
        lkb.folder_id
    FROM llamacloud_knowledge_bases lkb
    WHERE lkb.folder_id IS NULL
    AND lkb.account_id = p_account_id
    AND (p_include_inactive OR lkb.is_active = TRUE)
    
    ORDER BY created_at DESC;
END;
$$;
