BEGIN;

-- Simple helper function to get team statistics
-- This doesn't conflict with any existing functions
CREATE OR REPLACE FUNCTION get_team_stats(p_account_id UUID)
RETURNS JSON
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Verify user has access to this team
    IF NOT basejump.has_role_on_account(p_account_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;
    
    RETURN json_build_object(
        'member_count', (SELECT COUNT(*) FROM basejump.account_user WHERE account_id = p_account_id),
        'agent_count', (SELECT COUNT(*) FROM agents WHERE account_id = p_account_id),
        'thread_count', (SELECT COUNT(*) FROM threads WHERE account_id = p_account_id),
        'active_users_7d', (SELECT COUNT(DISTINCT account_id) FROM threads 
                           WHERE account_id = p_account_id 
                           AND created_at > NOW() - INTERVAL '7 days'),
        'shared_agents_count', (SELECT COUNT(*) FROM team_agents WHERE team_account_id = p_account_id)
    );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_team_stats TO authenticated;

COMMIT;
