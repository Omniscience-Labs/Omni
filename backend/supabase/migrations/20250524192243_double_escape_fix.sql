-- Migration to fix double-escaped JSON in messages table
-- This fixes both content and metadata fields that were incorrectly stored as JSON strings

-- First, let's check how many messages need fixing (optional - for logging)
DO $$
DECLARE
    total_records INTEGER;
    records_to_fix INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_records FROM messages;
    
    SELECT COUNT(*) INTO records_to_fix 
    FROM messages 
    WHERE (jsonb_typeof(content) = 'string' AND content::text LIKE '{%}')
       OR (content ? 'content' AND jsonb_typeof(content->'content') = 'string' AND (content->'content')::text LIKE '{%}')
       OR (jsonb_typeof(metadata) = 'string' AND metadata::text LIKE '{%}')
       OR (metadata ? 'metadata' AND jsonb_typeof(metadata->'metadata') = 'string' AND (metadata->'metadata')::text LIKE '{%}');
    
    RAISE NOTICE 'Total messages: %, Messages to fix: %', total_records, records_to_fix;
END $$;

-- Create a backup table before making changes
CREATE TABLE IF NOT EXISTS messages_backup_before_json_fix AS 
SELECT * FROM messages;

-- Fix all messages with double-escaped JSON
UPDATE messages
SET 
    content = 
        CASE 
            -- Handle case where entire content field is a JSON string
            WHEN jsonb_typeof(content) = 'string' AND content::text LIKE '{%}' THEN
                content::text::jsonb
            WHEN jsonb_typeof(content) = 'string' AND content::text LIKE '[%]' THEN
                content::text::jsonb
            -- Handle case where 'content' field inside the JSON is improperly escaped
            WHEN content ? 'content' AND jsonb_typeof(content->'content') = 'string' AND 
                 ((content->'content')::text LIKE '{%}' OR (content->'content')::text LIKE '[%]') THEN
                jsonb_set(content, '{content}', (content->'content')::text::jsonb)
            ELSE content
        END,
    metadata = 
        CASE 
            -- Handle case where entire metadata field is a JSON string
            WHEN jsonb_typeof(metadata) = 'string' AND metadata::text LIKE '{%}' THEN
                metadata::text::jsonb
            WHEN jsonb_typeof(metadata) = 'string' AND metadata::text LIKE '[%]' THEN
                metadata::text::jsonb
            -- Handle case where nested values in metadata need fixing
            WHEN metadata ? 'metadata' AND jsonb_typeof(metadata->'metadata') = 'string' AND 
                 ((metadata->'metadata')::text LIKE '{%}' OR (metadata->'metadata')::text LIKE '[%]') THEN
                jsonb_set(metadata, '{metadata}', (metadata->'metadata')::text::jsonb)
            ELSE metadata
        END,
    updated_at = NOW()
WHERE 
    -- Only update records that actually need fixing
    (jsonb_typeof(content) = 'string' AND (content::text LIKE '{%}' OR content::text LIKE '[%]'))
    OR (content ? 'content' AND jsonb_typeof(content->'content') = 'string' AND 
        ((content->'content')::text LIKE '{%}' OR (content->'content')::text LIKE '[%]'))
    OR (jsonb_typeof(metadata) = 'string' AND (metadata::text LIKE '{%}' OR metadata::text LIKE '[%]'))
    OR (metadata ? 'metadata' AND jsonb_typeof(metadata->'metadata') = 'string' AND 
        ((metadata->'metadata')::text LIKE '{%}' OR (metadata->'metadata')::text LIKE '[%]'));

-- Log the number of records updated
DO $$
DECLARE
    rows_updated INTEGER;
BEGIN
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    RAISE NOTICE 'Updated % messages with double-escaped JSON', rows_updated;
END $$;

-- Verify the fix by checking if any messages still have double-escaped JSON
DO $$
DECLARE
    remaining_issues INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_issues 
    FROM messages 
    WHERE (jsonb_typeof(content) = 'string' AND (content::text LIKE '{%}' OR content::text LIKE '[%]'))
       OR (content ? 'content' AND jsonb_typeof(content->'content') = 'string' AND 
           ((content->'content')::text LIKE '{%}' OR (content->'content')::text LIKE '[%]'))
       OR (jsonb_typeof(metadata) = 'string' AND (metadata::text LIKE '{%}' OR metadata::text LIKE '[%]'))
       OR (metadata ? 'metadata' AND jsonb_typeof(metadata->'metadata') = 'string' AND 
           ((metadata->'metadata')::text LIKE '{%}' OR (metadata->'metadata')::text LIKE '[%]'));
    
    IF remaining_issues > 0 THEN
        RAISE WARNING 'There are still % messages with potential double-escaped JSON', remaining_issues;
    ELSE
        RAISE NOTICE 'All double-escaped JSON issues have been fixed successfully';
    END IF;
END $$;

-- Optional: Create an index on updated_at if not exists to help with future queries
CREATE INDEX IF NOT EXISTS idx_messages_updated_at ON messages(updated_at); 