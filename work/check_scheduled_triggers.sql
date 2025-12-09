-- Query to show exactly which agents have scheduled triggers
-- This shows each agent and their scheduled triggers

SELECT 
    a.agent_id,
    a.name AS agent_name,
    a.account_id,
    COUNT(at.trigger_id) AS number_of_scheduled_triggers,
    COUNT(at.trigger_id) FILTER (WHERE at.is_active = true) AS active_triggers,
    COUNT(at.trigger_id) FILTER (WHERE at.is_active = false) AS inactive_triggers,
    STRING_AGG(at.name, ', ' ORDER BY at.name) AS trigger_names,
    STRING_AGG(at.trigger_id::text, ', ' ORDER BY at.name) AS trigger_ids
FROM 
    agents a
    INNER JOIN agent_triggers at ON a.agent_id = at.agent_id
WHERE 
    at.trigger_type = 'schedule'
GROUP BY 
    a.agent_id, a.name, a.account_id
ORDER BY 
    a.name;

-- Detailed view: Show all scheduled triggers with full details for each agent
SELECT 
    a.agent_id,
    a.name AS agent_name,
    a.account_id,
    at.trigger_id,
    at.name AS trigger_name,
    at.description AS trigger_description,
    at.is_active,
    at.config->>'cron_expression' AS cron_expression,
    at.config->>'timezone' AS timezone,
    at.config->>'agent_prompt' AS agent_prompt,
    at.config->>'cron_job_name' AS cron_job_name,
    at.created_at,
    at.updated_at
FROM 
    agent_triggers at
    INNER JOIN agents a ON at.agent_id = a.agent_id
WHERE 
    at.trigger_type = 'schedule'
ORDER BY 
    a.name, at.created_at DESC;

-- WHEN THE LAST SCHEDULED TRIGGER RAN
-- Shows when each scheduled trigger last executed (from cron job run details)

SELECT 
    a.agent_id,
    a.name AS agent_name,
    at.trigger_id,
    at.name AS trigger_name,
    at.config->>'cron_job_name' AS cron_job_name,
    at.is_active,
    MAX(jr.start_time) AS last_execution_time,
    MAX(jr.end_time) AS last_execution_end_time,
    COUNT(jr.runid) AS total_executions,
    COUNT(jr.runid) FILTER (WHERE jr.status = 'succeeded') AS successful_executions,
    COUNT(jr.runid) FILTER (WHERE jr.status = 'failed') AS failed_executions,
    last_run.status AS last_status,
    SUBSTRING(last_run.return_message, 1, 200) AS last_error_message,
    NOW() - MAX(jr.start_time) AS time_since_last_execution
FROM 
    agent_triggers at
    INNER JOIN agents a ON at.agent_id = a.agent_id
    LEFT JOIN cron.job j ON j.jobname = COALESCE(at.config->>'cron_job_name', 'trigger_' || at.trigger_id::text)
    LEFT JOIN cron.job_run_details jr ON jr.jobid = j.jobid
    LEFT JOIN LATERAL (
        SELECT status, return_message 
        FROM cron.job_run_details jr2 
        WHERE jr2.jobid = j.jobid 
        ORDER BY jr2.start_time DESC 
        LIMIT 1
    ) last_run ON true
WHERE 
    at.trigger_type = 'schedule'
GROUP BY 
    a.agent_id, a.name, at.trigger_id, at.name, at.config->>'cron_job_name', at.is_active, j.jobid, last_run.status, last_run.return_message
ORDER BY 
    MAX(jr.start_time) DESC NULLS LAST, a.name;

-- Summary: Last execution time per agent
SELECT 
    a.agent_id,
    a.name AS agent_name,
    MAX(jr.start_time) AS last_trigger_execution_time,
    COUNT(DISTINCT at.trigger_id) AS scheduled_triggers_count,
    COUNT(DISTINCT jr.runid) AS total_executions,
    COUNT(DISTINCT jr.runid) FILTER (WHERE jr.status = 'succeeded') AS successful_executions,
    COUNT(DISTINCT jr.runid) FILTER (WHERE jr.status = 'failed') AS failed_executions,
    NOW() - MAX(jr.start_time) AS time_since_last_execution
FROM 
    agents a
    INNER JOIN agent_triggers at ON a.agent_id = at.agent_id
    LEFT JOIN cron.job j ON j.jobname = COALESCE(at.config->>'cron_job_name', 'trigger_' || at.trigger_id::text)
    LEFT JOIN cron.job_run_details jr ON jr.jobid = j.jobid
WHERE 
    at.trigger_type = 'schedule'
GROUP BY 
    a.agent_id, a.name
ORDER BY 
    MAX(jr.start_time) DESC NULLS LAST;

