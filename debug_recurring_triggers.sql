-- Debug script for recurring triggers
-- Run this in Supabase SQL Editor

-- 1. Check if extensions are enabled
SELECT 'Extension Check' as check_type, extname, extversion 
FROM pg_extension 
WHERE extname IN ('pg_cron', 'pg_net');

-- 2. Check active cron jobs
SELECT 'Active Cron Jobs' as check_type, 
       jobid, 
       jobname, 
       schedule, 
       active,
       substring(command from 'https://([^/]+)') as target_domain
FROM cron.job
WHERE jobname LIKE 'trigger_%'
ORDER BY jobid DESC;

-- 3. Check recent cron job executions
SELECT 'Recent Cron Executions' as check_type,
       jr.runid,
       jr.jobid,
       j.jobname,
       jr.status,
       jr.return_message,
       jr.start_time,
       jr.end_time
FROM cron.job_run_details jr
JOIN cron.job j ON j.jobid = jr.jobid
WHERE j.jobname LIKE 'trigger_%'
ORDER BY jr.start_time DESC
LIMIT 10;

-- 4. Check for HTTP requests (try different possible schemas)
-- First, let's see what tables exist in the net schema
SELECT 'Net Schema Tables' as check_type, 
       tablename 
FROM pg_tables 
WHERE schemaname = 'net';

-- 5. Check agent_runs to see if anything executed recently
SELECT 'Recent Agent Runs' as check_type,
       id as run_id,
       thread_id,
       status,
       started_at,
       completed_at,
       created_at
FROM agent_runs
ORDER BY created_at DESC
LIMIT 10;

-- 6. Check if any of your triggers are active
SELECT 'Active Schedule Triggers' as check_type,
       trigger_id,
       name,
       is_active,
       config->>'cron_expression' as cron_schedule,
       config->>'cron_job_name' as job_name,
       config->>'cron_job_id' as job_id,
       created_at
FROM agent_triggers
WHERE trigger_type = 'schedule' AND is_active = true
ORDER BY created_at DESC;

