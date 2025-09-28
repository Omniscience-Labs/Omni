-- Custom Automations Migration
-- Table for storing user-specific browser automation configurations

BEGIN;

-- Create custom_automations table
CREATE TABLE IF NOT EXISTS custom_automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    config_name VARCHAR(255) NOT NULL,
    description TEXT,
    profile_path TEXT NOT NULL,
    script_path TEXT NOT NULL, 
    script_content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_custom_automations_account_id ON custom_automations(account_id);
CREATE INDEX IF NOT EXISTS idx_custom_automations_config_name ON custom_automations(config_name);

-- Add unique constraint for account_id + config_name
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_automations_account_config ON custom_automations(account_id, config_name);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_custom_automations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at (drop first if exists)
DROP TRIGGER IF EXISTS trigger_custom_automations_updated_at ON custom_automations;
CREATE TRIGGER trigger_custom_automations_updated_at
    BEFORE UPDATE ON custom_automations
    FOR EACH ROW
    EXECUTE FUNCTION update_custom_automations_updated_at();

-- Enable RLS on custom_automations table
ALTER TABLE custom_automations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS custom_automations_select_own ON custom_automations;
DROP POLICY IF EXISTS custom_automations_insert_own ON custom_automations;  
DROP POLICY IF EXISTS custom_automations_update_own ON custom_automations;
DROP POLICY IF EXISTS custom_automations_delete_own ON custom_automations;

-- Policy for users to see their own automations
CREATE POLICY custom_automations_select_own ON custom_automations
    FOR SELECT
    USING (account_id = (SELECT auth.uid()));

-- Policy for users to insert their own automations  
CREATE POLICY custom_automations_insert_own ON custom_automations
    FOR INSERT
    WITH CHECK (account_id = (SELECT auth.uid()));

-- Policy for users to update their own automations
CREATE POLICY custom_automations_update_own ON custom_automations
    FOR UPDATE
    USING (account_id = (SELECT auth.uid()));

-- Policy for users to delete their own automations
CREATE POLICY custom_automations_delete_own ON custom_automations
    FOR DELETE
    USING (account_id = (SELECT auth.uid()));

COMMIT;


