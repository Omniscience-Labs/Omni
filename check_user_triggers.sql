-- ===========================================================================
-- USER TRIGGER DIAGNOSTIC TOOL
-- ===========================================================================
-- STEP 1: Find the user's account_id (run SECTION 0 first if you don't know it)
-- STEP 2: Replace 'YOUR_ACCOUNT_ID_HERE' below with the actual account_id
-- STEP 3: Run the rest of the query
-- ===========================================================================

-- ===========================================================================
-- SECTION 0: FIND USER ACCOUNT (Run this first if you don't know account_id)
-- ===========================================================================
-- Option A: Find by email
SELECT 
    '===== FIND USER BY EMAIL =====' as section,
    ba.id as account_id,
    ba.name as account_name,
    au.email,
    ba.created_at,
    (SELECT COUNT(*) FROM agents a WHERE a.account_id = ba.id) as agent_count,
    (SELECT COUNT(*) FROM agent_triggers at JOIN agents a ON at.agent_id = a.agent_id WHERE a.account_id = ba.id) as trigger_count
FROM basejump.accounts ba
JOIN auth.users au ON au.id = ba.primary_owner_user_id
WHERE au.email ILIKE '%@%'  -- Replace with: '%user@example.com%' to search
ORDER BY ba.created_at DESC
LIMIT 20;

-- Option B: Find by account name
-- SELECT 
--     '===== FIND USER BY NAME =====' as section,
--     ba.id as account_id,
--     ba.name as account_name,
--     au.email,
--     ba.created_at,
--     (SELECT COUNT(*) FROM agents a WHERE a.account_id = ba.id) as agent_count
-- FROM basejump.accounts ba
-- JOIN auth.users au ON au.id = ba.primary_owner_user_id
-- WHERE ba.name ILIKE '%%'  -- Replace %% with '%username%'
-- ORDER BY ba.created_at DESC;

-- Option C: Show all recent users with triggers
-- SELECT 
--     '===== ALL RECENT USERS WITH TRIGGERS =====' as section,
--     ba.id as account_id,
--     ba.name as account_name,
--     au.email,
--     (SELECT COUNT(*) FROM agents a WHERE a.account_id = ba.id) as agent_count,
--     (SELECT COUNT(*) FROM agent_triggers at JOIN agents a ON at.agent_id = a.agent_id WHERE a.account_id = ba.id) as trigger_count,
--     (SELECT COUNT(*) FROM agent_triggers at JOIN agents a ON at.agent_id = a.agent_id WHERE a.account_id = ba.id AND at.is_active = true) as active_trigger_count
-- FROM basejump.accounts ba
-- JOIN auth.users au ON au.id = ba.primary_owner_user_id
-- WHERE EXISTS (SELECT 1 FROM agents a WHERE a.account_id = ba.id)
-- ORDER BY (SELECT COUNT(*) FROM agent_triggers at JOIN agents a ON at.agent_id = a.agent_id WHERE a.account_id = ba.id) DESC
-- LIMIT 20;

-- ===========================================================================
-- NOW USE THE ACCOUNT_ID FROM ABOVE:
-- ===========================================================================
\set account_id 'YOUR_ACCOUNT_ID_HERE'

-- ===========================================================================
-- SECTION 1: User's Agents Overview
-- ===========================================================================
SELECT 
    '===== 1. USER AGENTS =====' as section,
    a.agent_id,
    a.name as agent_name,
    a.description,
    a.is_default,
    a.created_at,
    (SELECT COUNT(*) FROM agent_triggers at WHERE at.agent_id = a.agent_id) as trigger_count
FROM agents a
WHERE a.account_id = :'account_id'
ORDER BY a.created_at DESC;

-- ===========================================================================
-- SECTION 2: All Triggers for User's Agents
-- ===========================================================================
SELECT 
    '===== 2. USER TRIGGERS =====' as section,
    at.trigger_id,
    at.name as trigger_name,
    at.trigger_type,
    at.is_active,
    at.description,
    a.name as agent_name,
    at.config->>'cron_expression' as schedule,
    at.config->>'cron_job_name' as cron_job_name,
    at.config->>'cron_job_id' as cron_job_id,
    at.config->>'execution_type' as execution_type,
    at.config->>'workflow_id' as workflow_id,
    at.created_at,
    at.updated_at,
    -- Count of successful executions
    (SELECT COUNT(*) 
     FROM trigger_events te 
     WHERE te.trigger_id = at.trigger_id 
     AND te.success = true) as successful_runs,
    -- Count of failed executions
    (SELECT COUNT(*) 
     FROM trigger_events te 
     WHERE te.trigger_id = at.trigger_id 
     AND te.success = false) as failed_runs,
    -- Last execution time
    (SELECT MAX(te.timestamp) 
     FROM trigger_events te 
     WHERE te.trigger_id = at.trigger_id) as last_execution,
    -- Last execution result
    (SELECT te.success 
     FROM trigger_events te 
     WHERE te.trigger_id = at.trigger_id 
     ORDER BY te.timestamp DESC 
     LIMIT 1) as last_execution_success
FROM agent_triggers at
JOIN agents a ON at.agent_id = a.agent_id
WHERE a.account_id = :'account_id'
ORDER BY at.is_active DESC, at.created_at DESC;

-- ===========================================================================
-- SECTION 3: Execution History Summary (Last 30 Days)
-- ===========================================================================
SELECT 
    '===== 3. EXECUTION HISTORY (LAST 30 DAYS) =====' as section,
    at.trigger_id,
    at.name as trigger_name,
    DATE(te.timestamp) as execution_date,
    COUNT(*) as total_executions,
    SUM(CASE WHEN te.success THEN 1 ELSE 0 END) as successful,
    SUM(CASE WHEN NOT te.success THEN 1 ELSE 0 END) as failed,
    ROUND(AVG(CASE WHEN te.success THEN 1 ELSE 0 END) * 100, 2) as success_rate_percent
FROM agent_triggers at
JOIN agents a ON at.agent_id = a.agent_id
LEFT JOIN trigger_events te ON te.trigger_id = at.trigger_id
WHERE a.account_id = :'account_id'
    AND te.timestamp > NOW() - INTERVAL '30 days'
GROUP BY at.trigger_id, at.name, DATE(te.timestamp)
ORDER BY execution_date DESC, at.name;

-- ===========================================================================
-- SECTION 4: Recent Trigger Events (Last 20)
-- ===========================================================================
SELECT 
    '===== 4. RECENT TRIGGER EVENTS =====' as section,
    te.event_id,
    at.name as trigger_name,
    a.name as agent_name,
    te.trigger_type,
    te.timestamp,
    te.success,
    te.should_execute_agent,
    te.error_message,
    te.metadata
FROM trigger_events te
JOIN agent_triggers at ON te.trigger_id = at.trigger_id
JOIN agents a ON te.agent_id = a.agent_id
WHERE a.account_id = :'account_id'
ORDER BY te.timestamp DESC
LIMIT 20;

-- ===========================================================================
-- SECTION 5: Scheduled Triggers - Cron Job Status
-- ===========================================================================
SELECT 
    '===== 5. CRON JOB STATUS =====' as section,
    at.trigger_id,
    at.name as trigger_name,
    at.is_active as trigger_is_active,
    at.config->>'cron_expression' as schedule,
    at.config->>'cron_job_name' as cron_job_name,
    cj.jobid as actual_cron_jobid,
    cj.active as cron_is_active,
    cj.schedule as actual_schedule,
    -- Check if cron job name matches
    CASE 
        WHEN cj.jobid IS NULL THEN '❌ CRON JOB NOT FOUND'
        WHEN cj.active = false THEN '⚠️ CRON JOB INACTIVE'
        WHEN at.is_active = false THEN '⚠️ TRIGGER INACTIVE'
        ELSE '✅ CONFIGURED'
    END as status,
    -- Recent cron executions count
    (SELECT COUNT(*) 
     FROM cron.job_run_details jrd 
     WHERE jrd.jobid = cj.jobid 
     AND jrd.start_time > NOW() - INTERVAL '7 days') as recent_executions_7d,
    -- Last cron execution
    (SELECT MAX(jrd.start_time) 
     FROM cron.job_run_details jrd 
     WHERE jrd.jobid = cj.jobid) as last_cron_execution,
    -- Last cron status
    (SELECT jrd.status 
     FROM cron.job_run_details jrd 
     WHERE jrd.jobid = cj.jobid 
     ORDER BY jrd.start_time DESC 
     LIMIT 1) as last_cron_status
FROM agent_triggers at
JOIN agents a ON at.agent_id = a.agent_id
LEFT JOIN cron.job cj ON cj.jobname = at.config->>'cron_job_name'
WHERE a.account_id = :'account_id'
    AND at.trigger_type = 'schedule'
ORDER BY at.is_active DESC, at.created_at DESC;

-- ===========================================================================
-- SECTION 6: Cron Execution Details (Last 10 for user's triggers)
-- ===========================================================================
SELECT 
    '===== 6. RECENT CRON EXECUTIONS =====' as section,
    at.name as trigger_name,
    jrd.runid,
    cj.jobname,
    jrd.status,
    SUBSTRING(jrd.return_message, 1, 200) as error_message,
    jrd.start_time,
    jrd.end_time,
    EXTRACT(EPOCH FROM (jrd.end_time - jrd.start_time)) as duration_seconds,
    CASE 
        WHEN jrd.status = 'succeeded' THEN '✅'
        WHEN jrd.status = 'failed' THEN '❌'
        ELSE '⚠️'
    END as status_icon
FROM cron.job_run_details jrd
JOIN cron.job cj ON cj.jobid = jrd.jobid
JOIN agent_triggers at ON at.config->>'cron_job_name' = cj.jobname
JOIN agents a ON at.agent_id = a.agent_id
WHERE a.account_id = :'account_id'
ORDER BY jrd.start_time DESC
LIMIT 10;

-- ===========================================================================
-- SECTION 7: Agent Runs Triggered by Scheduled Triggers
-- ===========================================================================
SELECT 
    '===== 7. AGENT RUNS FROM TRIGGERS =====' as section,
    ar.id as run_id,
    a.name as agent_name,
    ar.status as run_status,
    ar.started_at,
    ar.completed_at,
    EXTRACT(EPOCH FROM (ar.completed_at - ar.started_at)) as duration_seconds,
    ar.created_at,
    -- Try to identify which trigger caused this
    (SELECT at.name 
     FROM agent_triggers at 
     JOIN trigger_events te ON te.trigger_id = at.trigger_id
     WHERE te.agent_id = ar.agent_id 
     AND te.timestamp <= ar.created_at
     AND te.timestamp >= ar.created_at - INTERVAL '1 minute'
     ORDER BY te.timestamp DESC 
     LIMIT 1) as likely_trigger
FROM agent_runs ar
JOIN agents a ON ar.agent_id = a.agent_id
WHERE a.account_id = :'account_id'
    AND ar.created_at > NOW() - INTERVAL '7 days'
ORDER BY ar.created_at DESC
LIMIT 20;

-- ===========================================================================
-- SECTION 8: Issues & Recommendations
-- ===========================================================================
WITH trigger_issues AS (
    SELECT 
        at.trigger_id,
        at.name as trigger_name,
        at.trigger_type,
        at.is_active,
        at.config->>'cron_job_name' as cron_job_name,
        cj.jobid as cron_exists,
        cj.active as cron_active,
        (SELECT COUNT(*) FROM trigger_events te WHERE te.trigger_id = at.trigger_id AND te.success = false AND te.timestamp > NOW() - INTERVAL '7 days') as recent_failures,
        (SELECT COUNT(*) FROM cron.job_run_details jrd WHERE jrd.jobid = cj.jobid AND jrd.status = 'failed' AND jrd.start_time > NOW() - INTERVAL '7 days') as cron_failures,
        (SELECT MAX(te.timestamp) FROM trigger_events te WHERE te.trigger_id = at.trigger_id) as last_event
    FROM agent_triggers at
    JOIN agents a ON at.agent_id = a.agent_id
    LEFT JOIN cron.job cj ON cj.jobname = at.config->>'cron_job_name'
    WHERE a.account_id = :'account_id'
        AND at.trigger_type = 'schedule'
)
SELECT 
    '===== 8. ISSUES & RECOMMENDATIONS =====' as section,
    trigger_name,
    CASE 
        WHEN NOT is_active THEN '⚠️ TRIGGER IS DISABLED - Enable it in the UI'
        WHEN cron_exists IS NULL THEN '❌ CRON JOB MISSING - Recreate the trigger'
        WHEN NOT cron_active THEN '❌ CRON JOB INACTIVE - Check database cron.job table'
        WHEN recent_failures > 5 THEN '⚠️ HIGH FAILURE RATE - Check error logs in Section 4'
        WHEN cron_failures > 5 THEN '⚠️ CRON EXECUTION FAILURES - Check Section 6 for errors'
        WHEN last_event IS NULL THEN '⚠️ NEVER EXECUTED - Cron may not be running'
        WHEN last_event < NOW() - INTERVAL '24 hours' THEN '⚠️ NO RECENT EXECUTIONS - Check cron schedule'
        ELSE '✅ APPEARS HEALTHY'
    END as issue,
    CASE 
        WHEN NOT is_active THEN 'Go to Triggers page and toggle the trigger to active'
        WHEN cron_exists IS NULL THEN 'Delete and recreate the trigger, or manually create cron job'
        WHEN NOT cron_active THEN 'Run: UPDATE cron.job SET active = true WHERE jobname = ''' || cron_job_name || ''''
        WHEN recent_failures > 5 THEN 'Check trigger_events.error_message for the specific failure reason'
        WHEN cron_failures > 5 THEN 'Check cron.job_run_details.return_message - likely network or permission issue'
        WHEN last_event IS NULL THEN 'Check if pg_cron extension is running: SELECT * FROM cron.job_run_details LIMIT 1'
        WHEN last_event < NOW() - INTERVAL '24 hours' THEN 'Verify cron schedule is correct and frequent enough'
        ELSE 'No action needed'
    END as recommendation
FROM trigger_issues
ORDER BY 
    CASE 
        WHEN NOT is_active THEN 1
        WHEN cron_exists IS NULL THEN 2
        WHEN NOT cron_active THEN 3
        WHEN recent_failures > 5 THEN 4
        WHEN cron_failures > 5 THEN 5
        WHEN last_event IS NULL THEN 6
        WHEN last_event < NOW() - INTERVAL '24 hours' THEN 7
        ELSE 8
    END;

-- ===========================================================================
-- SECTION 9: Quick Stats Summary
-- ===========================================================================
SELECT 
    '===== 9. SUMMARY STATISTICS =====' as section,
    (SELECT COUNT(*) FROM agent_triggers at JOIN agents a ON at.agent_id = a.agent_id WHERE a.account_id = :'account_id') as total_triggers,
    (SELECT COUNT(*) FROM agent_triggers at JOIN agents a ON at.agent_id = a.agent_id WHERE a.account_id = :'account_id' AND at.is_active = true) as active_triggers,
    (SELECT COUNT(*) FROM agent_triggers at JOIN agents a ON at.agent_id = a.agent_id WHERE a.account_id = :'account_id' AND at.trigger_type = 'schedule') as scheduled_triggers,
    (SELECT COUNT(*) FROM trigger_events te JOIN agents a ON te.agent_id = a.agent_id WHERE a.account_id = :'account_id') as total_executions,
    (SELECT COUNT(*) FROM trigger_events te JOIN agents a ON te.agent_id = a.agent_id WHERE a.account_id = :'account_id' AND te.success = true) as successful_executions,
    (SELECT COUNT(*) FROM trigger_events te JOIN agents a ON te.agent_id = a.agent_id WHERE a.account_id = :'account_id' AND te.success = false) as failed_executions,
    (SELECT COUNT(*) FROM trigger_events te JOIN agents a ON te.agent_id = a.agent_id WHERE a.account_id = :'account_id' AND te.timestamp > NOW() - INTERVAL '24 hours') as executions_last_24h,
    (SELECT MAX(te.timestamp) FROM trigger_events te JOIN agents a ON te.agent_id = a.agent_id WHERE a.account_id = :'account_id') as last_execution_time;

-- ===========================================================================
-- END OF DIAGNOSTIC REPORT
-- ===========================================================================
-- 
-- NEXT STEPS:
-- 1. Review Section 8 for specific issues and recommendations
-- 2. Check Section 5 to see if cron jobs are properly configured
-- 3. Review Section 4 for recent error messages
-- 4. Check Section 6 to see if cron is actually executing
-- 
-- COMMON ISSUES:
-- - Trigger is disabled (is_active = false)
-- - Cron job not found (missing from cron.job table)
-- - Cron job inactive (active = false in cron.job)
-- - Network issues (check cron.job_run_details.return_message)
-- - Webhook endpoint errors (check trigger_events.error_message)
-- ===========================================================================

