BEGIN;

-- Create agent_default_files table for storing default file metadata
-- Uses uploaded_at (matching v2 schema) for backward compatibility with existing databases
CREATE TABLE IF NOT EXISTS agent_default_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    size BIGINT NOT NULL,
    mime_type TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    uploaded_by UUID REFERENCES auth.users(id),
    
    -- Ensure unique filenames per agent
    CONSTRAINT agent_default_files_unique_name_per_agent UNIQUE(agent_id, name),
    
    -- Ensure valid file names
    CONSTRAINT agent_default_files_name_not_empty CHECK (
        name IS NOT NULL AND LENGTH(TRIM(name)) > 0
    ),
    
    -- Ensure valid storage path
    CONSTRAINT agent_default_files_storage_path_not_empty CHECK (
        storage_path IS NOT NULL AND LENGTH(TRIM(storage_path)) > 0
    ),
    
    -- Ensure valid file size
    CONSTRAINT agent_default_files_size_positive CHECK (size > 0)
);

-- Enable RLS
ALTER TABLE agent_default_files ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing RLS policies (both v2 and v3 names) to avoid conflicts
DROP POLICY IF EXISTS agent_default_files_user_access ON agent_default_files;  -- v2 policy
DROP POLICY IF EXISTS agent_default_files_select ON agent_default_files;
DROP POLICY IF EXISTS agent_default_files_insert_owner ON agent_default_files;
DROP POLICY IF EXISTS agent_default_files_update_owner ON agent_default_files;
DROP POLICY IF EXISTS agent_default_files_delete_owner ON agent_default_files;

-- RLS: Any account member can view; only primary account owner can write
CREATE POLICY agent_default_files_select ON agent_default_files
    FOR SELECT USING (basejump.has_role_on_account(account_id));

CREATE POLICY agent_default_files_insert_owner ON agent_default_files
    FOR INSERT WITH CHECK (basejump.has_role_on_account(account_id, 'owner'));

CREATE POLICY agent_default_files_update_owner ON agent_default_files
    FOR UPDATE USING (basejump.has_role_on_account(account_id, 'owner'));

CREATE POLICY agent_default_files_delete_owner ON agent_default_files
    FOR DELETE USING (basejump.has_role_on_account(account_id, 'owner'));

-- Create indexes for better query performance (use IF NOT EXISTS for safety)
CREATE INDEX IF NOT EXISTS idx_agent_default_files_agent_id ON agent_default_files(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_default_files_account_id ON agent_default_files(account_id);
CREATE INDEX IF NOT EXISTS idx_agent_default_files_uploaded_at ON agent_default_files(uploaded_at);

-- Auto-update uploaded_at on row update (matching v2 function name for compatibility)
CREATE OR REPLACE FUNCTION update_agent_default_files_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.uploaded_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop ALL existing triggers (both v2 and v3 names) to avoid duplicates
DROP TRIGGER IF EXISTS trigger_agent_default_files_updated_at ON agent_default_files;  -- v2 trigger
DROP TRIGGER IF EXISTS update_agent_default_files_updated_at ON agent_default_files;   -- v3 trigger

CREATE TRIGGER trigger_agent_default_files_updated_at
    BEFORE UPDATE ON agent_default_files
    FOR EACH ROW EXECUTE FUNCTION update_agent_default_files_timestamp();

-- Grant permissions
GRANT ALL PRIVILEGES ON TABLE agent_default_files TO authenticated, service_role;

-- Storage bucket for agent default files (private, 500MB limit)
-- Path structure: {account_id}/{agent_id}/{filename}
INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
    'agent-default-files',
    'agent-default-files',
    false,
    NULL,
    524288000
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 524288000;

-- Drop ALL existing storage policies (both v2 and v3 names) to avoid duplicates
DROP POLICY IF EXISTS "Users can view agent default files in their accounts" ON storage.objects;  -- v2
DROP POLICY IF EXISTS "Users can upload agent default files" ON storage.objects;                   -- v2
DROP POLICY IF EXISTS "Users can update agent default files" ON storage.objects;                   -- v2
DROP POLICY IF EXISTS "Users can delete agent default files" ON storage.objects;                   -- v2
DROP POLICY IF EXISTS "agent-default-files select" ON storage.objects;                             -- v3
DROP POLICY IF EXISTS "agent-default-files insert" ON storage.objects;                             -- v3
DROP POLICY IF EXISTS "agent-default-files update" ON storage.objects;                             -- v3
DROP POLICY IF EXISTS "agent-default-files delete" ON storage.objects;                             -- v3

-- Storage policies: account members can read; only owners can write
CREATE POLICY "agent-default-files select" ON storage.objects
FOR SELECT USING (
    bucket_id = 'agent-default-files'
    AND auth.role() = 'authenticated'
    AND basejump.has_role_on_account((storage.foldername(name))[1]::uuid) = true
);

CREATE POLICY "agent-default-files insert" ON storage.objects
FOR INSERT WITH CHECK (
    bucket_id = 'agent-default-files'
    AND auth.role() = 'authenticated'
    AND basejump.has_role_on_account((storage.foldername(name))[1]::uuid, 'owner') = true
);

CREATE POLICY "agent-default-files update" ON storage.objects
FOR UPDATE USING (
    bucket_id = 'agent-default-files'
    AND auth.role() = 'authenticated'
    AND basejump.has_role_on_account((storage.foldername(name))[1]::uuid, 'owner') = true
);

CREATE POLICY "agent-default-files delete" ON storage.objects
FOR DELETE USING (
    bucket_id = 'agent-default-files'
    AND auth.role() = 'authenticated'
    AND basejump.has_role_on_account((storage.foldername(name))[1]::uuid, 'owner') = true
);

COMMIT;
