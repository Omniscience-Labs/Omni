BEGIN;

-- Update templates to mark as Kortix team based on specific criteria
-- This migration runs after agent_templates table and is_kortix_team column exist

-- Check if the table and column exist before running updates
DO $$
BEGIN
    -- Only proceed if both table and column exist
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'agent_templates'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'agent_templates' 
        AND column_name = 'is_kortix_team'
    ) THEN
        
        -- Option 1: Mark templates by specific names that are known Kortix team templates
        UPDATE agent_templates 
        SET is_kortix_team = true 
        WHERE name ILIKE '%kortix%'
           OR name ILIKE '%official%'
           OR name ILIKE '%team%';

        -- Option 2: Mark templates by specific creator IDs (uncomment and adjust as needed)
        -- UPDATE agent_templates 
        -- SET is_kortix_team = true 
        -- WHERE creator_id IN (
        --     'YOUR_KORTIX_TEAM_ACCOUNT_ID_1',
        --     'YOUR_KORTIX_TEAM_ACCOUNT_ID_2'
        -- );

        -- Option 3: Mark specific templates by exact names (uncomment and adjust as needed)
        -- UPDATE agent_templates 
        -- SET is_kortix_team = true 
        -- WHERE name IN (
        --     'Template Name 1',
        --     'Template Name 2',
        --     'Template Name 3'
        -- );

        RAISE NOTICE 'Successfully updated Kortix team templates';
    ELSE
        RAISE NOTICE 'Skipping update - agent_templates table or is_kortix_team column does not exist';
    END IF;
END $$;

COMMIT;
