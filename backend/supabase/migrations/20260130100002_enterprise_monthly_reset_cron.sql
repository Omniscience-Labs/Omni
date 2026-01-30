-- Enterprise Mode: Monthly Usage Reset Cron Job
-- This migration attempts to set up a pg_cron job for monthly reset
-- If pg_cron is not available, it fails silently

-- ============================================================================
-- Check if pg_cron extension exists and create the job
-- ============================================================================

DO $$
BEGIN
    -- Check if pg_cron extension is available
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        -- First, unschedule the job if it already exists (for idempotency)
        BEGIN
            PERFORM cron.unschedule('enterprise-monthly-reset');
        EXCEPTION
            WHEN OTHERS THEN
                -- Job doesn't exist, that's fine
                NULL;
        END;
        
        -- Schedule the monthly reset job
        -- Runs at 00:00 on the 1st of every month (UTC)
        PERFORM cron.schedule(
            'enterprise-monthly-reset',  -- job name
            '0 0 1 * *',                 -- cron schedule: midnight on 1st of month
            $$SELECT reset_enterprise_monthly_usage()$$
        );
        
        RAISE NOTICE 'Enterprise monthly reset cron job scheduled successfully';
    ELSE
        RAISE NOTICE 'pg_cron extension not available. Monthly reset will need to be triggered externally (via API endpoint or external cron).';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Fail silently if pg_cron is not set up correctly
        RAISE NOTICE 'Could not schedule pg_cron job: %. Monthly reset will need to be triggered externally.', SQLERRM;
END;
$$;

-- ============================================================================
-- Alternative: Create an API-callable reset function with logging
-- ============================================================================
-- This can be called from an external cron (Render cron job, etc.)

-- Drop existing function first (V2 may have different signature)
DROP FUNCTION IF EXISTS api_reset_enterprise_monthly_usage();

CREATE OR REPLACE FUNCTION api_reset_enterprise_monthly_usage()
RETURNS JSONB AS $$
DECLARE
    v_users_reset INTEGER;
    v_reset_time TIMESTAMPTZ := NOW();
BEGIN
    -- Perform the reset
    SELECT reset_enterprise_monthly_usage() INTO v_users_reset;

    -- Log the reset event (using enterprise_credit_loads as an audit trail)
    INSERT INTO enterprise_credit_loads (
        amount,
        type,
        description,
        performed_by,
        balance_after
    ) VALUES (
        0,
        'load',  -- Using 'load' type with 0 amount to log system events
        'Monthly usage reset - ' || v_users_reset || ' users reset at ' || v_reset_time::TEXT,
        'SYSTEM_CRON',
        (SELECT credit_balance FROM enterprise_billing WHERE id = '00000000-0000-0000-0000-000000000000'::uuid)
    );

    RETURN jsonb_build_object(
        'success', true,
        'users_reset', v_users_reset,
        'reset_time', v_reset_time,
        'message', 'Monthly usage reset completed'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permission
GRANT EXECUTE ON FUNCTION api_reset_enterprise_monthly_usage TO authenticated;
