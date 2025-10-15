-- Fix Apollo Webhooks Trigger Function Bug
-- Issue: The Apollo migration incorrectly replaced the global update_updated_at_column() 
-- function used by multiple tables (projects, threads, messages, agent_runs) with a 
-- function that sets completed_at instead of updated_at.
-- 
-- This migration:
-- 1. Restores the original global update_updated_at_column() function
-- 2. Creates a new specific function for Apollo webhooks
-- 3. Updates the Apollo webhook trigger to use the correct function

BEGIN;

-- =====================================================
-- 1. RESTORE the original global update_updated_at_column() function
-- =====================================================
-- This function is used by many tables throughout the system:
-- - projects (update_projects_updated_at trigger)
-- - threads (update_threads_updated_at trigger)
-- - messages (update_messages_updated_at trigger)
-- - agent_runs (update_agent_runs_updated_at trigger)
-- - workflows, workflow_steps, workflow_executions
-- - agent_triggers, custom_trigger_providers, oauth_installations
-- - And many more...

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column() IS 
    'Global trigger function that automatically updates the updated_at timestamp. Used by multiple tables across the system.';

-- =====================================================
-- 2. CREATE a new specific function for Apollo webhooks
-- =====================================================
-- This function specifically handles the completed_at field for Apollo webhook requests

CREATE OR REPLACE FUNCTION update_apollo_webhook_completed_at()
RETURNS TRIGGER AS $$
BEGIN
    -- Only set completed_at when status changes to a terminal state
    IF NEW.status IN ('completed', 'failed', 'timeout') AND OLD.status = 'pending' THEN
        NEW.completed_at = NOW();
        NEW.updated_at = NOW();
    ELSE
        -- For other updates, just update the updated_at timestamp
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_apollo_webhook_completed_at() IS 
    'Specific trigger function for Apollo webhook requests. Sets completed_at when status reaches a terminal state (completed, failed, timeout) and always updates updated_at.';

-- =====================================================
-- 3. ADD updated_at column to apollo_webhook_requests if not exists
-- =====================================================
-- The original migration didn't include an updated_at column, but it's good practice

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'apollo_webhook_requests' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE apollo_webhook_requests 
        ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        
        -- Update existing rows
        UPDATE apollo_webhook_requests SET updated_at = created_at WHERE updated_at IS NULL;
        
        -- Make it NOT NULL after setting defaults
        ALTER TABLE apollo_webhook_requests 
        ALTER COLUMN updated_at SET NOT NULL;
    END IF;
END $$;

-- =====================================================
-- 4. UPDATE the Apollo webhook trigger to use the specific function
-- =====================================================

DROP TRIGGER IF EXISTS update_apollo_webhook_completed_at ON apollo_webhook_requests;

CREATE TRIGGER update_apollo_webhook_completed_at
    BEFORE UPDATE ON apollo_webhook_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_apollo_webhook_completed_at();

COMMENT ON TRIGGER update_apollo_webhook_completed_at ON apollo_webhook_requests IS 
    'Automatically sets completed_at when status changes to terminal state and updates updated_at on all updates';

-- =====================================================
-- 5. VERIFY the fix by checking trigger functions
-- =====================================================
-- This will help with debugging if something goes wrong

DO $$
DECLARE
    trigger_count INTEGER;
    function_body TEXT;
BEGIN
    -- Check how many triggers use update_updated_at_column
    SELECT COUNT(*) INTO trigger_count
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE p.proname = 'update_updated_at_column';
    
    RAISE NOTICE 'Number of triggers using update_updated_at_column(): %', trigger_count;
    
    -- Get the function body to verify it's correct
    SELECT prosrc INTO function_body
    FROM pg_proc
    WHERE proname = 'update_updated_at_column';
    
    IF function_body LIKE '%updated_at%' AND function_body NOT LIKE '%completed_at%' THEN
        RAISE NOTICE '✅ update_updated_at_column() function is correct';
    ELSE
        RAISE WARNING '❌ update_updated_at_column() function may still be incorrect';
    END IF;
    
    -- Verify Apollo function exists
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_apollo_webhook_completed_at') THEN
        RAISE NOTICE '✅ update_apollo_webhook_completed_at() function created successfully';
    END IF;
END $$;

COMMIT;

-- =====================================================
-- Post-Migration Notes
-- =====================================================
-- After running this migration:
-- 1. The global update_updated_at_column() function is restored
-- 2. All existing triggers will work correctly again
-- 3. Apollo webhooks will have their own dedicated trigger function
-- 4. The apollo_webhook_requests table will track both completed_at and updated_at
-- 5. All project/thread/message updates should work normally

