-- ===========================================================================
-- QUICK USER ACCOUNT FINDER
-- ===========================================================================
-- Use this to find a user's account_id before running check_user_triggers.sql
-- ===========================================================================

-- Option 1: Search by email (most common)
-- Replace 'user@example.com' with the actual email or part of it
SELECT 
    '🔍 SEARCH BY EMAIL' as search_type,
    ba.id as account_id,
    ba.name as account_name,
    au.email,
    ba.created_at,
    (SELECT COUNT(*) FROM agents a WHERE a.account_id = ba.id) as agent_count,
    (SELECT COUNT(*) FROM agent_triggers at JOIN agents a ON at.agent_id = a.agent_id WHERE a.account_id = ba.id) as total_triggers,
    (SELECT COUNT(*) FROM agent_triggers at JOIN agents a ON at.agent_id = a.agent_id WHERE a.account_id = ba.id AND at.is_active = true) as active_triggers
FROM basejump.accounts ba
JOIN auth.users au ON au.id = ba.primary_owner_user_id
WHERE au.email ILIKE '%@%'  -- Change this to '%user@example.com%' or just '%user%'
ORDER BY ba.created_at DESC
LIMIT 20;

-- ===========================================================================

-- Option 2: Show all users with triggers (sorted by most triggers)
-- SELECT 
--     '📊 ALL USERS WITH TRIGGERS' as search_type,
--     ba.id as account_id,
--     ba.name as account_name,
--     au.email,
--     ba.created_at,
--     (SELECT COUNT(*) FROM agents a WHERE a.account_id = ba.id) as agent_count,
--     (SELECT COUNT(*) FROM agent_triggers at JOIN agents a ON at.agent_id = a.agent_id WHERE a.account_id = ba.id) as total_triggers,
--     (SELECT COUNT(*) FROM agent_triggers at JOIN agents a ON at.agent_id = a.agent_id WHERE a.account_id = ba.id AND at.is_active = true) as active_triggers,
--     (SELECT MAX(te.timestamp) FROM trigger_events te JOIN agents a ON te.agent_id = a.agent_id WHERE a.account_id = ba.id) as last_trigger_execution
-- FROM basejump.accounts ba
-- JOIN auth.users au ON au.id = ba.primary_owner_user_id
-- WHERE EXISTS (
--     SELECT 1 FROM agent_triggers at 
--     JOIN agents a ON at.agent_id = a.agent_id 
--     WHERE a.account_id = ba.id
-- )
-- ORDER BY total_triggers DESC
-- LIMIT 20;

-- ===========================================================================

-- Option 3: Show most recent users (regardless of triggers)
-- SELECT 
--     '🕐 RECENT USERS' as search_type,
--     ba.id as account_id,
--     ba.name as account_name,
--     au.email,
--     ba.created_at,
--     (SELECT COUNT(*) FROM agents a WHERE a.account_id = ba.id) as agent_count,
--     (SELECT COUNT(*) FROM agent_triggers at JOIN agents a ON at.agent_id = a.agent_id WHERE a.account_id = ba.id) as total_triggers
-- FROM basejump.accounts ba
-- JOIN auth.users au ON au.id = ba.primary_owner_user_id
-- ORDER BY ba.created_at DESC
-- LIMIT 50;

-- ===========================================================================
-- USAGE:
-- 1. Uncomment the option you want to use (remove -- from the beginning)
-- 2. For email search, edit the WHERE clause with the email pattern
-- 3. Copy the account_id from the results
-- 4. Use it in check_user_triggers.sql
-- ===========================================================================


