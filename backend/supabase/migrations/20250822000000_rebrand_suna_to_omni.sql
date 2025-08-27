BEGIN;

-- Migration to rebrand Suna agents to Omni agents
-- This updates existing agent metadata to reflect the new Omni branding
-- while preserving all functionality and user data

-- Update agent metadata: is_suna_default -> is_omni_default
UPDATE agents 
SET metadata = jsonb_set(
    jsonb_set(
        metadata,
        '{is_omni_default}',
        (metadata->>'is_suna_default')::jsonb
    ),
    '{is_suna_default}',
    'null'::jsonb
)
WHERE metadata->>'is_suna_default' = 'true';

-- Update agent names from 'Suna' to 'Omni' for default agents
UPDATE agents 
SET name = 'Omni'
WHERE name = 'Suna' 
AND metadata->>'is_omni_default' = 'true';

-- Update agent_templates metadata if any reference Suna
UPDATE agent_templates
SET metadata = jsonb_set(
    jsonb_set(
        metadata,
        '{is_omni_default}',
        (metadata->>'is_suna_default')::jsonb
    ),
    '{is_suna_default}',
    'null'::jsonb
)
WHERE metadata->>'is_suna_default' = 'true';

-- Create new RPC functions for Omni (duplicating Suna functions with new names)
-- This ensures backward compatibility while supporting the new branding

-- Create RPC function to find Omni default agent for an account
CREATE OR REPLACE FUNCTION find_omni_default_agent_for_account(p_account_id UUID)
RETURNS TABLE (
    agent_id UUID,
    account_id UUID,
    name VARCHAR(255),
    system_prompt TEXT,
    model VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    current_version_id UUID,
    is_default BOOLEAN,
    metadata JSONB,
    config JSONB,
    version_count INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.agent_id,
        a.account_id,
        a.name,
        a.system_prompt,
        a.model,
        a.created_at,
        a.updated_at,
        a.current_version_id,
        a.is_default,
        a.metadata,
        a.config,
        COALESCE(a.version_count, 1) as version_count
    FROM agents a
    WHERE a.account_id = p_account_id 
    AND COALESCE((a.metadata->>'is_omni_default')::boolean, false) = true
    ORDER BY a.created_at DESC
    LIMIT 1;
END;
$$;

-- Create function to get all Omni default agents
CREATE OR REPLACE FUNCTION get_all_omni_default_agents()
RETURNS TABLE (
    agent_id UUID,
    account_id UUID,
    name VARCHAR(255),
    system_prompt TEXT,
    model VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    current_version_id UUID,
    is_default BOOLEAN,
    metadata JSONB,
    config JSONB,
    version_count INTEGER,
    installation_date TIMESTAMPTZ,
    management_version TEXT,
    centrally_managed BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.agent_id,
        a.account_id,
        a.name,
        a.system_prompt,
        a.model,
        a.created_at,
        a.updated_at,
        a.current_version_id,
        a.is_default,
        a.metadata,
        a.config,
        COALESCE(a.version_count, 1) as version_count,
        (a.metadata->>'installation_date')::timestamptz as installation_date,
        a.metadata->>'management_version' as management_version,
        COALESCE((a.metadata->>'centrally_managed')::boolean, false) as centrally_managed
    FROM agents a
    WHERE COALESCE((a.metadata->>'is_omni_default')::boolean, false) = true
    ORDER BY a.created_at DESC;
END;
$$;

-- Create function to count Omni agents by version
CREATE OR REPLACE FUNCTION count_omni_agents_by_version(p_version TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    agent_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO agent_count
    FROM agents a
    WHERE COALESCE((a.metadata->>'is_omni_default')::boolean, false) = true
    AND a.metadata->>'management_version' = p_version;
    
    RETURN COALESCE(agent_count, 0);
END;
$$;

-- Create function to get Omni default agent statistics
CREATE OR REPLACE FUNCTION get_omni_default_agent_stats()
RETURNS TABLE (
    total_agents INTEGER,
    active_agents INTEGER,
    inactive_agents INTEGER,
    version_breakdown JSONB,
    monthly_breakdown JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    total_count INTEGER;
    active_count INTEGER;
    inactive_count INTEGER;
    version_data JSONB;
    monthly_data JSONB;
BEGIN
    -- Get total count
    SELECT COUNT(*) INTO total_count
    FROM agents a
    WHERE COALESCE((a.metadata->>'is_omni_default')::boolean, false) = true;
    
    -- Get active count (all Omni agents are considered active)
    SELECT COUNT(*) INTO active_count
    FROM agents a
    WHERE COALESCE((a.metadata->>'is_omni_default')::boolean, false) = true;
    
    -- Calculate inactive count
    inactive_count := total_count - active_count;
    
    -- Get version breakdown
    SELECT jsonb_agg(
        jsonb_build_object(
            'version', version,
            'count', version_count
        )
    ) INTO version_data
    FROM (
        SELECT 
            COALESCE(a.metadata->>'management_version', 'unknown') as version,
            COUNT(*) as version_count
        FROM agents a
        WHERE COALESCE((a.metadata->>'is_omni_default')::boolean, false) = true
        GROUP BY COALESCE(a.metadata->>'management_version', 'unknown')
    ) version_data;
    
    -- Get monthly breakdown
    SELECT jsonb_agg(
        jsonb_build_object(
            'month', creation_month,
            'count', month_count
        )
    ) INTO monthly_data
    FROM (
        SELECT 
            TO_CHAR(a.created_at, 'YYYY-MM') as creation_month,
            COUNT(*) as month_count
        FROM agents a
        WHERE COALESCE((a.metadata->>'is_omni_default')::boolean, false) = true
        GROUP BY TO_CHAR(a.created_at, 'YYYY-MM')
        ORDER BY creation_month DESC
        LIMIT 12  -- Last 12 months
    ) monthly_data;
    
    RETURN QUERY
    SELECT 
        total_count,
        active_count,
        inactive_count,
        COALESCE(version_data, '[]'::jsonb),
        COALESCE(monthly_data, '[]'::jsonb);
END;
$$;

-- Create function to find outdated Omni agents
CREATE OR REPLACE FUNCTION find_outdated_omni_agents(p_target_version TEXT)
RETURNS TABLE (
    agent_id UUID,
    account_id UUID,
    name VARCHAR(255),
    current_version TEXT,
    last_central_update TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.agent_id,
        a.account_id,
        a.name,
        COALESCE(a.metadata->>'management_version', 'unknown') as current_version,
        (a.metadata->>'last_central_update')::timestamptz as last_central_update
    FROM agents a
    WHERE COALESCE((a.metadata->>'is_omni_default')::boolean, false) = true
    AND COALESCE((a.metadata->>'centrally_managed')::boolean, false) = true
    AND (
        a.metadata->>'management_version' IS NULL 
        OR a.metadata->>'management_version' != p_target_version
    )
    ORDER BY a.created_at DESC;
END;
$$;

-- Grant permissions to the new functions
GRANT EXECUTE ON FUNCTION find_omni_default_agent_for_account(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_all_omni_default_agents() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION count_omni_agents_by_version(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_omni_default_agent_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION find_outdated_omni_agents(TEXT) TO authenticated, service_role;

-- Update any existing templates that reference kortix team to use omni
UPDATE agent_templates
SET is_kortix_team = true
WHERE metadata->>'is_omni_default' = 'true'
   OR metadata->>'is_official' = 'true';

-- Log the migration completion
DO $$
DECLARE
    updated_agents_count INTEGER;
    updated_templates_count INTEGER;
BEGIN
    -- Count updated agents
    SELECT COUNT(*) INTO updated_agents_count
    FROM agents
    WHERE metadata->>'is_omni_default' = 'true';
    
    -- Count updated templates
    SELECT COUNT(*) INTO updated_templates_count
    FROM agent_templates
    WHERE metadata->>'is_omni_default' = 'true';
    
    RAISE NOTICE 'Migration completed: Updated % agents and % templates from Suna to Omni branding', 
        updated_agents_count, updated_templates_count;
END $$;

COMMIT;
