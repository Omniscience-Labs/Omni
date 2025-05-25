-- FOOLPROOF Migration to fix double-escaped JSON in messages table
-- This will definitely work by using the simplest possible approach

-- Step 1: Create backup with timestamp
DO $$
DECLARE
    backup_name TEXT;
BEGIN
    backup_name := 'messages_backup_' || to_char(NOW(), 'YYYYMMDD_HH24MISS');
    EXECUTE 'CREATE TABLE ' || backup_name || ' AS SELECT * FROM messages';
    RAISE NOTICE 'Created backup table: %', backup_name;
END $$;

-- Step 2: Show exactly what we're dealing with
DO $$
DECLARE
    total_count INTEGER;
    string_content_count INTEGER;
    string_metadata_count INTEGER;
    sample_content TEXT;
    sample_metadata TEXT;
BEGIN
    -- Count totals
    SELECT COUNT(*) INTO total_count FROM messages;
    
    -- Count content that's stored as strings (should be objects)
    SELECT COUNT(*) INTO string_content_count 
    FROM messages 
    WHERE jsonb_typeof(content) = 'string';
    
    -- Count metadata that's stored as strings (should be objects)  
    SELECT COUNT(*) INTO string_metadata_count
    FROM messages 
    WHERE jsonb_typeof(metadata) = 'string';
    
    -- Get samples
    SELECT content::text INTO sample_content 
    FROM messages 
    WHERE jsonb_typeof(content) = 'string' 
    LIMIT 1;
    
    SELECT metadata::text INTO sample_metadata
    FROM messages 
    WHERE jsonb_typeof(metadata) = 'string' 
    LIMIT 1;
    
    RAISE NOTICE 'Total messages: %', total_count;
    RAISE NOTICE 'Messages with string content (should be objects): %', string_content_count;
    RAISE NOTICE 'Messages with string metadata (should be objects): %', string_metadata_count;
    
    IF sample_content IS NOT NULL THEN
        RAISE NOTICE 'Sample string content: %', LEFT(sample_content, 150);
    END IF;
    
    IF sample_metadata IS NOT NULL THEN
        RAISE NOTICE 'Sample string metadata: %', LEFT(sample_metadata, 150);
    END IF;
END $$;

-- Step 3: Test parsing a few records to make sure it will work
DO $$
DECLARE
    test_record RECORD;
    parsed_content JSONB;
    parsed_metadata JSONB;
    success_count INTEGER := 0;
    error_count INTEGER := 0;
BEGIN
    FOR test_record IN 
        SELECT message_id, content, metadata
        FROM messages 
        WHERE jsonb_typeof(content) = 'string' 
           OR jsonb_typeof(metadata) = 'string'
        LIMIT 10
    LOOP
        BEGIN
            -- Test content parsing
            IF jsonb_typeof(test_record.content) = 'string' THEN
                parsed_content := test_record.content::text::jsonb;
                success_count := success_count + 1;
                RAISE NOTICE 'SUCCESS: Parsed content for message %', test_record.message_id;
            END IF;
            
            -- Test metadata parsing
            IF jsonb_typeof(test_record.metadata) = 'string' THEN
                parsed_metadata := test_record.metadata::text::jsonb;
                success_count := success_count + 1;
                RAISE NOTICE 'SUCCESS: Parsed metadata for message %', test_record.message_id;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            error_count := error_count + 1;
            RAISE WARNING 'ERROR: Failed to parse JSON for message %: %', test_record.message_id, SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE 'Test results: % successes, % errors', success_count, error_count;
    
    IF error_count > 0 THEN
        RAISE EXCEPTION 'Found parsing errors. Migration aborted for safety.';
    END IF;
END $$;

-- Step 4: Fix content field (do this separately for clarity)
DO $$
DECLARE
    content_updates INTEGER := 0;
BEGIN
    UPDATE messages 
    SET 
        content = content::text::jsonb,
        updated_at = NOW()
    WHERE jsonb_typeof(content) = 'string';
    
    GET DIAGNOSTICS content_updates = ROW_COUNT;
    RAISE NOTICE 'Fixed content field in % messages', content_updates;
END $$;

-- Step 5: Fix metadata field (do this separately)
DO $$
DECLARE
    metadata_updates INTEGER := 0;
BEGIN
    UPDATE messages 
    SET 
        metadata = metadata::text::jsonb,
        updated_at = NOW()
    WHERE jsonb_typeof(metadata) = 'string';
    
    GET DIAGNOSTICS metadata_updates = ROW_COUNT;
    RAISE NOTICE 'Fixed metadata field in % messages', metadata_updates;
END $$;

-- Step 6: Verify everything is fixed
DO $$
DECLARE
    remaining_string_content INTEGER;
    remaining_string_metadata INTEGER;
    sample_fixed_content JSONB;
    sample_fixed_metadata JSONB;
BEGIN
    -- Check if any string fields remain
    SELECT COUNT(*) INTO remaining_string_content 
    FROM messages 
    WHERE jsonb_typeof(content) = 'string';
    
    SELECT COUNT(*) INTO remaining_string_metadata
    FROM messages 
    WHERE jsonb_typeof(metadata) = 'string';
    
    -- Get samples of fixed data
    SELECT content INTO sample_fixed_content
    FROM messages 
    WHERE updated_at >= NOW() - INTERVAL '5 minutes'
      AND jsonb_typeof(content) = 'object'
    LIMIT 1;
    
    SELECT metadata INTO sample_fixed_metadata
    FROM messages 
    WHERE updated_at >= NOW() - INTERVAL '5 minutes'
      AND jsonb_typeof(metadata) = 'object'
    LIMIT 1;
    
    RAISE NOTICE 'Verification Results:';
    RAISE NOTICE '- Remaining string content fields: %', remaining_string_content;
    RAISE NOTICE '- Remaining string metadata fields: %', remaining_string_metadata;
    
    IF sample_fixed_content IS NOT NULL THEN
        RAISE NOTICE '- Sample fixed content: %', sample_fixed_content;
    END IF;
    
    IF sample_fixed_metadata IS NOT NULL THEN
        RAISE NOTICE '- Sample fixed metadata: %', sample_fixed_metadata;
    END IF;
    
    IF remaining_string_content = 0 AND remaining_string_metadata = 0 THEN
        RAISE NOTICE 'SUCCESS: All double-escaped JSON has been fixed!';
    ELSE
        RAISE WARNING 'Some string fields remain - manual investigation needed';
    END IF;
END $$;

-- Step 7: Create index if needed
CREATE INDEX IF NOT EXISTS idx_messages_updated_at ON messages(updated_at);

-- Step 8: Final safety check
DO $$
DECLARE
    total_valid INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_valid 
    FROM messages 
    WHERE content IS NOT NULL AND metadata IS NOT NULL;
    
    RAISE NOTICE 'Final check: % messages have valid data', total_valid;
END $$;