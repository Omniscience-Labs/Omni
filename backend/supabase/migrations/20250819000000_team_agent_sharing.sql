BEGIN;

-- =====================================================
-- TEAM AGENT SHARING FEATURE
-- =====================================================
-- This migration adds support for sharing agents with specific teams
-- without modifying existing tables (per requirements)

-- Create team_agents table for team-specific agent sharing
CREATE TABLE IF NOT EXISTS team_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    team_account_id UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    shared_by_account_id UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    shared_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique agent-team combinations
    UNIQUE(agent_id, team_account_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_team_agents_agent_id ON team_agents(agent_id);
CREATE INDEX IF NOT EXISTS idx_team_agents_team_account_id ON team_agents(team_account_id);
CREATE INDEX IF NOT EXISTS idx_team_agents_shared_by ON team_agents(shared_by_account_id);
CREATE INDEX IF NOT EXISTS idx_team_agents_shared_at ON team_agents(shared_at);

-- Create agent_visibility_settings table instead of modifying agents table
-- This stores visibility settings separately to avoid modifying existing table
CREATE TABLE IF NOT EXISTS agent_visibility_settings (
    agent_id UUID PRIMARY KEY REFERENCES agents(agent_id) ON DELETE CASCADE,
    visibility VARCHAR(20) DEFAULT 'private' CHECK (visibility IN ('private', 'public', 'teams')),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_visibility_settings_visibility ON agent_visibility_settings(visibility);

-- Enable RLS on new tables
ALTER TABLE team_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_visibility_settings ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Team agents policies
-- Users can view team shares if they're members of the target team
CREATE POLICY team_agents_select ON team_agents
    FOR SELECT
    USING (basejump.has_role_on_account(team_account_id));

-- Only agent owners who are also team owners can share agents
CREATE POLICY team_agents_insert ON team_agents
    FOR INSERT
    WITH CHECK (
        -- User must own the agent (be owner of the account that owns it)
        EXISTS (
            SELECT 1 FROM agents 
            WHERE agent_id = team_agents.agent_id 
            AND basejump.has_role_on_account(account_id, 'owner')
        )
        -- AND user must be owner of the target team
        AND basejump.has_role_on_account(team_account_id, 'owner')
    );

-- Can delete shares if you're the sharer or owner of the target team
CREATE POLICY team_agents_delete ON team_agents
    FOR DELETE
    USING (
        basejump.has_role_on_account(team_account_id, 'owner')
        OR basejump.has_role_on_account(shared_by_account_id, 'owner')
    );

-- Visibility settings policies
-- Agent owners can view and modify visibility settings
CREATE POLICY agent_visibility_select ON agent_visibility_settings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM agents 
            WHERE agent_id = agent_visibility_settings.agent_id 
            AND basejump.has_role_on_account(account_id)
        )
    );

CREATE POLICY agent_visibility_insert ON agent_visibility_settings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM agents 
            WHERE agent_id = agent_visibility_settings.agent_id 
            AND basejump.has_role_on_account(account_id, 'owner')
        )
    );

CREATE POLICY agent_visibility_update ON agent_visibility_settings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM agents 
            WHERE agent_id = agent_visibility_settings.agent_id 
            AND basejump.has_role_on_account(account_id, 'owner')
        )
    );

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to set agent visibility and share with teams
CREATE OR REPLACE FUNCTION set_agent_visibility(
    p_agent_id UUID,
    p_visibility VARCHAR(20),
    p_team_ids UUID[] DEFAULT NULL
)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Verify user owns the agent
    IF NOT EXISTS (
        SELECT 1 FROM agents 
        WHERE agent_id = p_agent_id 
        AND basejump.has_role_on_account(account_id, 'owner')
    ) THEN
        RAISE EXCEPTION 'Agent not found or access denied';
    END IF;
    
    -- Update or insert visibility settings
    INSERT INTO agent_visibility_settings (agent_id, visibility, updated_at)
    VALUES (p_agent_id, p_visibility, NOW())
    ON CONFLICT (agent_id) 
    DO UPDATE SET 
        visibility = EXCLUDED.visibility,
        updated_at = EXCLUDED.updated_at;
    
    -- Handle team sharing based on visibility
    IF p_visibility = 'teams' AND p_team_ids IS NOT NULL THEN
        -- Clear existing team shares for this agent
        DELETE FROM team_agents WHERE agent_id = p_agent_id;
        
        -- Add new team shares (only for teams where user is owner)
        INSERT INTO team_agents (agent_id, team_account_id, shared_by_account_id)
        SELECT 
            p_agent_id, 
            unnest(p_team_ids),
            auth.uid()
        WHERE basejump.has_role_on_account(unnest(p_team_ids), 'owner');
    ELSIF p_visibility != 'teams' THEN
        -- Clear all team shares if not team visibility
        DELETE FROM team_agents WHERE agent_id = p_agent_id;
    END IF;
    
    -- Update is_public flag for backward compatibility
    IF p_visibility = 'public' THEN
        UPDATE agents 
        SET is_public = true, marketplace_published_at = NOW()
        WHERE agent_id = p_agent_id;
    ELSIF p_visibility = 'private' THEN
        UPDATE agents 
        SET is_public = false, marketplace_published_at = NULL
        WHERE agent_id = p_agent_id;
    END IF;
END;
$$;

-- Enhanced marketplace function that includes team-shared agents
CREATE OR REPLACE FUNCTION get_marketplace_agents_with_teams(
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0,
    p_search TEXT DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_account_id UUID DEFAULT NULL -- Current team context
)
RETURNS TABLE (
    agent_id UUID,
    name VARCHAR(255),
    description TEXT,
    system_prompt TEXT,
    configured_mcps JSONB,
    agentpress_tools JSONB,
    tags TEXT[],
    download_count INTEGER,
    marketplace_published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    creator_name TEXT,
    avatar TEXT,
    avatar_color TEXT,
    visibility TEXT,
    is_team_shared BOOLEAN
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.agent_id,
        a.name,
        a.description,
        a.system_prompt,
        a.configured_mcps,
        a.agentpress_tools,
        a.tags,
        a.download_count,
        a.marketplace_published_at,
        a.created_at,
        COALESCE(acc.name, 'Anonymous')::TEXT as creator_name,
        a.avatar::TEXT,
        a.avatar_color::TEXT,
        COALESCE(avs.visibility, CASE WHEN a.is_public THEN 'public' ELSE 'private' END)::TEXT as visibility,
        EXISTS(
            SELECT 1 FROM team_agents ta 
            WHERE ta.agent_id = a.agent_id 
            AND ta.team_account_id = p_account_id
        ) as is_team_shared
    FROM agents a
    LEFT JOIN basejump.accounts acc ON a.account_id = acc.id
    LEFT JOIN agent_visibility_settings avs ON a.agent_id = avs.agent_id
    WHERE (
        -- Show public agents to everyone
        a.is_public = true
        OR
        -- Show team's own agents
        (p_account_id IS NOT NULL AND a.account_id = p_account_id)
        OR
        -- Show agents shared with this team
        (p_account_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_agents ta
            WHERE ta.agent_id = a.agent_id
            AND ta.team_account_id = p_account_id
        ))
    )
    AND (p_search IS NULL OR 
         a.name ILIKE '%' || p_search || '%' OR 
         a.description ILIKE '%' || p_search || '%')
    AND (p_tags IS NULL OR a.tags && p_tags)
    ORDER BY 
        CASE WHEN a.account_id = p_account_id THEN 0 ELSE 1 END, -- Team's own agents first
        a.marketplace_published_at DESC NULLS LAST,
        a.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to get teams where an agent is shared
CREATE OR REPLACE FUNCTION get_agent_shared_teams(p_agent_id UUID)
RETURNS TABLE (
    team_id UUID,
    team_name TEXT,
    team_slug TEXT,
    shared_at TIMESTAMPTZ
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only agent owner can see where it's shared
    IF NOT EXISTS (
        SELECT 1 FROM agents 
        WHERE agent_id = p_agent_id 
        AND basejump.has_role_on_account(account_id, 'owner')
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;
    
    RETURN QUERY
    SELECT 
        ta.team_account_id as team_id,
        acc.name as team_name,
        acc.slug as team_slug,
        ta.shared_at
    FROM team_agents ta
    JOIN basejump.accounts acc ON acc.id = ta.team_account_id
    WHERE ta.agent_id = p_agent_id
    ORDER BY ta.shared_at DESC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION set_agent_visibility TO authenticated;
GRANT EXECUTE ON FUNCTION get_marketplace_agents_with_teams TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_agent_shared_teams TO authenticated;
GRANT ALL PRIVILEGES ON TABLE team_agents TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE agent_visibility_settings TO authenticated, service_role;

COMMIT;
