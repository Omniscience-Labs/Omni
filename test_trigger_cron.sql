-- Test why trigger cron jobs aren't executing

-- 1. Check if trigger jobs exist and are active
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  database,
  username,
  substring(command from 1 for 100) as command_preview
FROM cron.job
WHERE jobname LIKE 'trigger_%'
ORDER BY jobid DESC
LIMIT 5;

-- 2. Check if there are ANY execution records for trigger jobs
SELECT 
  jr.jobid,
  j.jobname,
  jr.status,
  jr.return_message,
  jr.start_time
FROM cron.job_run_details jr
JOIN cron.job j ON j.jobid = jr.jobid
WHERE j.jobname LIKE 'trigger_%'
ORDER BY jr.start_time DESC
LIMIT 5;

-- 3. Test net.http_post directly (manual test)
SELECT net.http_post(
    url := 'https://operator-proprietary-eia8.onrender.com/api/health',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
);

-- Wait a moment, then check the response
SELECT 
  id,
  created,
  status_code,
  content::text as response,
  error_msg
FROM net._http_response
ORDER BY created DESC
LIMIT 1;
