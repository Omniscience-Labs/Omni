-- Comprehensive Recurring Trigger Execution Diagnostic
-- This will show us WHERE triggers are failing

-- ============================================================
-- STEP 1: Check if cron jobs are RUNNING
-- ============================================================
SELECT 
    '1. CRON JOB EXECUTIONS' as diagnostic_section,
    jr.runid,
    jr.jobid,
    j.jobname,
    jr.status,
    SUBSTRING(jr.return_message, 1, 200) as error_message,
    jr.start_time,
    jr.end_time,
    EXTRACT(EPOCH FROM (jr.end_time - jr.start_time)) as duration_seconds
FROM cron.job_run_details jr
JOIN cron.job j ON j.jobid = jr.jobid
WHERE j.jobname LIKE 'trigger_%'
ORDER BY jr.start_time DESC
LIMIT 20;

-- If this returns NO ROWS → Cron jobs never executed
-- If status = 'failed' → Cron execution failing
-- If status = 'succeeded' → Cron ran, check if webhook was called

-- ============================================================
-- STEP 2: Check trigger configurations
-- ============================================================
SELECT 
    '2. TRIGGER CONFIGS' as diagnostic_section,
    at.trigger_id,
    at.name,
    at.is_active,
    at.trigger_type,
    at.config->>'cron_expression' as schedule,
    at.config->>'cron_job_name' as cron_job_name,
    at.config->>'execution_type' as execution_type,
    at.config->>'agent_prompt' as agent_prompt,
    at.config->>'workflow_id' as workflow_id,
    at.created_at
FROM agent_triggers at
WHERE at.trigger_type = 'schedule'
ORDER BY at.created_at DESC;

-- ============================================================
-- STEP 3: Check if there are recent agent runs from triggers
-- ============================================================
SELECT 
    '3. RECENT AGENT RUNS' as diagnostic_section,
    ar.id as run_id,
    ar.agent_id,
    ar.thread_id,
    ar.status,
    ar.started_at,
    ar.completed_at,
    ar.created_at,
    EXTRACT(EPOCH FROM (ar.completed_at - ar.started_at)) as duration_seconds
FROM agent_runs ar
ORDER BY ar.created_at DESC
LIMIT 20;

-- If no recent agent_runs → Webhooks aren't triggering agent execution

-- ============================================================
-- STEP 4: Check the actual cron job commands
-- ============================================================
SELECT 
    '4. CRON JOB COMMANDS' as diagnostic_section,
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    SUBSTRING(j.command, 1, 300) as command_preview
FROM cron.job j
WHERE j.jobname LIKE 'trigger_%'
ORDER BY j.jobid DESC;

-- This shows what the cron job is actually trying to execute

-- ============================================================
-- STEP 5: Check pg_net HTTP request logs (if available)
-- ============================================================
-- Note: This table structure varies by Supabase version
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'net' AND table_name = 'http_request_queue') THEN
        RAISE NOTICE 'Checking net.http_request_queue...';
    ELSE
        RAISE NOTICE 'net.http_request_queue table not accessible or does not exist';
    END IF;
END $$;

-- Try to get recent HTTP requests (may fail if table doesn't exist or schema is different)
-- SELECT 
--     '5. HTTP REQUEST LOGS' as diagnostic_section,
--     *
-- FROM net.http_request_queue
-- ORDER BY id DESC
-- LIMIT 20;

-- ============================================================
-- STEP 6: Check for any trigger_events logs
-- ============================================================
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trigger_events') THEN
        RAISE NOTICE 'trigger_events table exists - checking logs...';
    ELSE
        RAISE NOTICE 'trigger_events table does not exist (may have been dropped in cleanup migration)';
    END IF;
END $$;

-- Note: trigger_events table may have been dropped in cleanup migration
-- If it exists, check for recent events:
-- SELECT 
--     '6. TRIGGER EVENT LOGS' as diagnostic_section,
--     COUNT(*) as total_events
-- FROM trigger_events
-- WHERE timestamp > NOW() - INTERVAL '7 days';

-- ============================================================
-- SUMMARY: What to look for
-- ============================================================
/*
INTERPRETATION GUIDE:

SCENARIO A: No cron executions (Step 1 is empty)
→ Cron jobs scheduled but not running
→ Possible causes: Cron scheduler not active, jobs marked inactive

SCENARIO B: Cron executions fail (Step 1 status = 'failed')
→ Cron is trying to run but failing
→ Check error_message in Step 1
→ Common cause: pg_net can't make HTTP request

SCENARIO C: Cron succeeds but no agent runs (Step 1 success, Step 3 empty)
→ Webhook endpoint not receiving/processing requests
→ Possible causes:
  - Wrong webhook URL
  - Webhook endpoint not authenticating the request
  - Backend not processing the webhook

SCENARIO D: Agent runs exist but wrong agents (Step 3 has runs but wrong agents)
→ Webhook routing issue
→ Check if trigger_id mapping is correct

NEXT STEPS:
1. Run this script
2. Share ALL sections of output
3. I'll identify the exact failure point
4. Provide targeted fix
*/

