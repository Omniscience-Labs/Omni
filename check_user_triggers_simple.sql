-- ===========================================================================
-- USER TRIGGER DIAGNOSTIC TOOL - SIMPLIFIED (CURRENT SCHEMA)
-- ===========================================================================
-- Account ID: afbde13a-e0ea-4f6d-bd24-d9ed2f696d28
-- Works with current schema (no trigger_events table)
-- ===========================================================================

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
WHERE a.account_id = 'afbde13a-e0ea-4f6d-bd24-d9ed2f696d28'
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
    at.updated_at
FROM agent_triggers at
JOIN agents a ON at.agent_id = a.agent_id
WHERE a.account_id = 'afbde13a-e0ea-4f6d-bd24-d9ed2f696d28'
ORDER BY at.is_active DESC, at.created_at DESC;

-- ===========================================================================
-- SECTION 3: Scheduled Triggers - Cron Job Status
-- ===========================================================================
SELECT 
    '===== 3. CRON JOB STATUS =====' as section,
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
     AND jrd.start_time > NOW() - INTERVAL '7 days') as executions_last_7d,
    -- Last cron execution
    (SELECT MAX(jrd.start_time) 
     FROM cron.job_run_details jrd 
     WHERE jrd.jobid = cj.jobid) as last_cron_execution,
    -- Last cron status
    (SELECT jrd.status 
     FROM cron.job_run_details jrd 
     WHERE jrd.jobid = cj.jobid 
     ORDER BY jrd.start_time DESC 
     LIMIT 1) as last_cron_status,
    -- Last error message
    (SELECT SUBSTRING(jrd.return_message, 1, 200)
     FROM cron.job_run_details jrd 
     WHERE jrd.jobid = cj.jobid 
     AND jrd.status = 'failed'
     ORDER BY jrd.start_time DESC 
     LIMIT 1) as last_error
FROM agent_triggers at
JOIN agents a ON at.agent_id = a.agent_id
LEFT JOIN cron.job cj ON cj.jobname = at.config->>'cron_job_name'
WHERE a.account_id = 'afbde13a-e0ea-4f6d-bd24-d9ed2f696d28'
    AND at.trigger_type = 'schedule'
ORDER BY at.is_active DESC, at.created_at DESC;

-- ===========================================================================
-- SECTION 4: Cron Execution Details (Last 20 for user's triggers)
-- ===========================================================================
SELECT 
    '===== 4. RECENT CRON EXECUTIONS =====' as section,
    at.name as trigger_name,
    jrd.runid,
    cj.jobname,
    jrd.status,
    jrd.start_time,
    jrd.end_time,
    EXTRACT(EPOCH FROM (jrd.end_time - jrd.start_time)) as duration_seconds,
    SUBSTRING(jrd.return_message, 1, 300) as message,
    CASE 
        WHEN jrd.status = 'succeeded' THEN '✅'
        WHEN jrd.status = 'failed' THEN '❌'
        ELSE '⚠️'
    END as status_icon
FROM cron.job_run_details jrd
JOIN cron.job cj ON cj.jobid = jrd.jobid
JOIN agent_triggers at ON at.config->>'cron_job_name' = cj.jobname
JOIN agents a ON at.agent_id = a.agent_id
WHERE a.account_id = 'afbde13a-e0ea-4f6d-bd24-d9ed2f696d28'
ORDER BY jrd.start_time DESC
LIMIT 20;

-- ===========================================================================
-- SECTION 5: Agent Runs (Last 20 for this user)
-- ===========================================================================
SELECT 
    '===== 5. RECENT AGENT RUNS =====' as section,
    ar.id as run_id,
    a.name as agent_name,
    ar.status as run_status,
    ar.started_at,
    ar.completed_at,
    ar.created_at,
    EXTRACT(EPOCH FROM (ar.completed_at - ar.started_at)) as duration_seconds,
    ar.thread_id
FROM agent_runs ar
JOIN agents a ON ar.agent_id = a.agent_id
WHERE a.account_id = 'afbde13a-e0ea-4f6d-bd24-d9ed2f696d28'
    AND ar.created_at > NOW() - INTERVAL '7 days'
ORDER BY ar.created_at DESC
LIMIT 20;

-- ===========================================================================
-- SECTION 6: Issues & Recommendations
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
        (SELECT COUNT(*) 
         FROM cron.job_run_details jrd 
         WHERE jrd.jobid = cj.jobid 
         AND jrd.status = 'failed' 
         AND jrd.start_time > NOW() - INTERVAL '7 days') as cron_failures_7d,
        (SELECT COUNT(*) 
         FROM cron.job_run_details jrd 
         WHERE jrd.jobid = cj.jobid 
         AND jrd.start_time > NOW() - INTERVAL '7 days') as cron_executions_7d,
        (SELECT MAX(jrd.start_time) 
         FROM cron.job_run_details jrd 
         WHERE jrd.jobid = cj.jobid) as last_execution
    FROM agent_triggers at
    JOIN agents a ON at.agent_id = a.agent_id
    LEFT JOIN cron.job cj ON cj.jobname = at.config->>'cron_job_name'
    WHERE a.account_id = 'afbde13a-e0ea-4f6d-bd24-d9ed2f696d28'
        AND at.trigger_type = 'schedule'
)
SELECT 
    '===== 6. ISSUES & RECOMMENDATIONS =====' as section,
    trigger_name,
    trigger_type,
    CASE 
        WHEN NOT is_active THEN '⚠️ TRIGGER IS DISABLED'
        WHEN cron_exists IS NULL THEN '❌ CRON JOB NOT FOUND'
        WHEN NOT cron_active THEN '❌ CRON JOB INACTIVE'
        WHEN cron_failures_7d > 5 THEN '⚠️ HIGH CRON FAILURE RATE'
        WHEN last_execution IS NULL THEN '⚠️ NEVER EXECUTED'
        WHEN last_execution < NOW() - INTERVAL '24 hours' THEN '⚠️ NO RECENT EXECUTIONS'
        WHEN cron_executions_7d = 0 THEN '⚠️ NOT RUNNING (7 days)'
        ELSE '✅ APPEARS HEALTHY'
    END as issue,
    cron_executions_7d as runs_last_7_days,
    cron_failures_7d as failures_last_7_days,
    last_execution,
    CASE 
        WHEN NOT is_active THEN 'Enable the trigger in the Triggers UI page'
        WHEN cron_exists IS NULL THEN 'The cron job is missing. Delete and recreate the trigger in the UI'
        WHEN NOT cron_active THEN 'Run this SQL to activate: UPDATE cron.job SET active = true WHERE jobname = ''' || cron_job_name || ''''
        WHEN cron_failures_7d > 5 THEN 'Check Section 4 for error messages. Likely network/webhook issue'
        WHEN last_execution IS NULL THEN 'Cron job exists but never ran. Check if pg_cron extension is enabled and running'
        WHEN last_execution < NOW() - INTERVAL '24 hours' THEN 'Used to run but stopped. Check Section 4 for recent errors'
        WHEN cron_executions_7d = 0 THEN 'No executions in 7 days. Check cron schedule and pg_cron status'
        ELSE 'No issues detected - trigger is running normally'
    END as recommendation
FROM trigger_issues
ORDER BY 
    CASE 
        WHEN NOT is_active THEN 1
        WHEN cron_exists IS NULL THEN 2
        WHEN NOT cron_active THEN 3
        WHEN cron_failures_7d > 5 THEN 4
        WHEN last_execution IS NULL THEN 5
        WHEN last_execution < NOW() - INTERVAL '24 hours' THEN 6
        WHEN cron_executions_7d = 0 THEN 7
        ELSE 8
    END;

-- ===========================================================================
-- SECTION 7: Summary Statistics
-- ===========================================================================
SELECT 
    '===== 7. SUMMARY STATISTICS =====' as section,
    (SELECT COUNT(*) 
     FROM agent_triggers at 
     JOIN agents a ON at.agent_id = a.agent_id 
     WHERE a.account_id = 'afbde13a-e0ea-4f6d-bd24-d9ed2f696d28') as total_triggers,
    (SELECT COUNT(*) 
     FROM agent_triggers at 
     JOIN agents a ON at.agent_id = a.agent_id 
     WHERE a.account_id = 'afbde13a-e0ea-4f6d-bd24-d9ed2f696d28' 
     AND at.is_active = true) as active_triggers,
    (SELECT COUNT(*) 
     FROM agent_triggers at 
     JOIN agents a ON at.agent_id = a.agent_id 
     WHERE a.account_id = 'afbde13a-e0ea-4f6d-bd24-d9ed2f696d28' 
     AND at.trigger_type = 'schedule') as scheduled_triggers,
    (SELECT COUNT(*) 
     FROM agent_runs ar 
     JOIN agents a ON ar.agent_id = a.agent_id 
     WHERE a.account_id = 'afbde13a-e0ea-4f6d-bd24-d9ed2f696d28' 
     AND ar.created_at > NOW() - INTERVAL '7 days') as agent_runs_last_7d,
    (SELECT MAX(ar.created_at) 
     FROM agent_runs ar 
     JOIN agents a ON ar.agent_id = a.agent_id 
     WHERE a.account_id = 'afbde13a-e0ea-4f6d-bd24-d9ed2f696d28') as last_agent_run;

-- ===========================================================================
-- SECTION 8: All Cron Jobs for User's Triggers (with commands)
-- ===========================================================================
SELECT 
    '===== 8. CRON JOB DETAILS =====' as section,
    cj.jobid,
    cj.jobname,
    cj.schedule,
    cj.active,
    SUBSTRING(cj.command, 1, 150) as command_preview,
    at.name as trigger_name,
    at.is_active as trigger_active
FROM cron.job cj
JOIN agent_triggers at ON at.config->>'cron_job_name' = cj.jobname
JOIN agents a ON at.agent_id = a.agent_id
WHERE a.account_id = 'afbde13a-e0ea-4f6d-bd24-d9ed2f696d28'
ORDER BY cj.jobid DESC;

-- ===========================================================================
-- END OF DIAGNOSTIC REPORT
-- ===========================================================================
-- 
-- 🎯 QUICK GUIDE:
-- 
-- 1. **Section 7 (Summary)** - Quick overview
-- 2. **Section 6 (Issues)** - ⭐ START HERE - Shows what's wrong and how to fix it
-- 3. **Section 3 (Cron Status)** - Check if cron jobs exist and are running
-- 4. **Section 4 (Cron Executions)** - See execution history and error messages
-- 5. **Section 5 (Agent Runs)** - Verify agents are actually executing
-- 
-- 📊 INTERPRETING RESULTS:
-- 
-- ✅ APPEARS HEALTHY = Everything is working
-- ⚠️ TRIGGER IS DISABLED = Just enable it in the UI
-- ❌ CRON JOB NOT FOUND = Delete and recreate the trigger
-- ❌ CRON JOB INACTIVE = Run the SQL command in Section 6
-- ⚠️ HIGH CRON FAILURE RATE = Check error messages in Section 4
-- ⚠️ NEVER EXECUTED = pg_cron might not be running
-- ⚠️ NO RECENT EXECUTIONS = Check Section 4 for what went wrong
-- 
-- ===========================================================================


