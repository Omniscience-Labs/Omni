-- Check what columns actually exist in the agents table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'agents'
  AND table_schema = 'public'
ORDER BY ordinal_position;

