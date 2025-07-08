-- =====================================================
-- DATABASE CLEANUP MIGRATION
-- =====================================================
-- This migration:
-- 1. Removes unused OLD workflow tables (workflows, workflow_variables, workflow_templates, workflow_flows, workflow_execution_logs)
-- 2. Removes webhook_registrations (not used anywhere)
-- 3. Removes scheduled_jobs (part of old workflow system)
-- 4. Removes agent_instances (using agent_templates + user credentials instead)
-- 5. Removes user_mcp_credentials (replaced by user_mcp_credential_profiles)
-- 6. Consolidates agent configuration into single JSONB config column
-- 7. Comments out oauth_installations (not removed, just renamed to indicate deprecated)
-- 8. Consolidates agent_version_history into agent_versions table
-- =====================================================

BEGIN;

-- =====================================================
-- 1. DROP OLD WORKFLOW SYSTEM TABLES
-- =====================================================
-- These are the old workflow tables from April 2025, NOT the new agent_workflows from July 2025
-- Note: workflow_executions is used by BOTH systems, so we don't drop it
DROP TABLE IF EXISTS workflow_flows CASCADE;
DROP TABLE IF EXISTS workflow_execution_logs CASCADE;
DROP TABLE IF EXISTS workflow_variables CASCADE;
DROP TABLE IF EXISTS webhook_registrations CASCADE;
DROP TABLE IF EXISTS scheduled_jobs CASCADE;
DROP TABLE IF EXISTS triggers CASCADE;
-- DO NOT DROP workflow_executions - it's used by agent_workflows system
DROP TABLE IF EXISTS workflow_templates CASCADE;
DROP TABLE IF EXISTS workflows CASCADE;

-- Drop old workflow types (being careful not to drop types used by agent workflows)
DROP TYPE IF EXISTS connection_type CASCADE;
DROP TYPE IF EXISTS node_type CASCADE;
DROP TYPE IF EXISTS trigger_type CASCADE;
DROP TYPE IF EXISTS execution_status CASCADE;
DROP TYPE IF EXISTS workflow_status CASCADE;
-- DO NOT DROP workflow_execution_status - it's used by agent_workflows system

-- =====================================================
-- 2. REMOVE AGENT_INSTANCES TABLE
-- =====================================================
-- This table is not used - we have agent_templates for marketplace
-- and agents table for user's actual agents
DROP TABLE IF EXISTS agent_instances CASCADE;

-- =====================================================
-- 3. REMOVE USER_MCP_CREDENTIALS TABLE
-- =====================================================
-- This is replaced by user_mcp_credential_profiles
DROP TABLE IF EXISTS user_mcp_credentials CASCADE;

-- =====================================================
-- 4. CONSOLIDATE AGENT CONFIGURATION
-- =====================================================
-- Add new unified config column to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;

-- Migrate existing data to unified config
-- Note: agentpress_tools currently stores {tool_name: {enabled: bool, description: string}}
-- The description is redundant as it's the same for all agents. In the new structure,
-- we'll just store {tool_name: boolean} for enabled/disabled state
UPDATE agents 
SET config = jsonb_build_object(
    'system_prompt', COALESCE(system_prompt, ''),
    'tools', jsonb_build_object(
        'agentpress', (
            SELECT jsonb_object_agg(
                key, 
                (value->>'enabled')::boolean
            )
            FROM jsonb_each(COALESCE(agentpress_tools, '{}'::jsonb))
            WHERE value IS NOT NULL AND value != 'null'::jsonb
        ),
        'mcp', COALESCE(configured_mcps, '[]'::jsonb),
        'custom_mcp', COALESCE(custom_mcps, '[]'::jsonb)
    ),
    'metadata', jsonb_build_object(
        'avatar', avatar,
        'avatar_color', avatar_color
    )
)
WHERE config = '{}'::jsonb OR config IS NULL;

-- Update agent_versions table to use unified config
ALTER TABLE agent_versions ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;

UPDATE agent_versions 
SET config = jsonb_build_object(
    'system_prompt', COALESCE(system_prompt, ''),
    'tools', jsonb_build_object(
        'agentpress', (
            SELECT jsonb_object_agg(
                key, 
                (value->>'enabled')::boolean
            )
            FROM jsonb_each(COALESCE(agentpress_tools, '{}'::jsonb))
            WHERE value IS NOT NULL AND value != 'null'::jsonb
        ),
        'mcp', COALESCE(configured_mcps, '[]'::jsonb),
        'custom_mcp', COALESCE(custom_mcps, '[]'::jsonb)
    )
)
WHERE config = '{}'::jsonb OR config IS NULL;

-- =====================================================
-- 5. CONSOLIDATE AGENT_VERSION_HISTORY INTO AGENT_VERSIONS
-- =====================================================
-- Add history fields to agent_versions
ALTER TABLE agent_versions ADD COLUMN IF NOT EXISTS change_description TEXT;
ALTER TABLE agent_versions ADD COLUMN IF NOT EXISTS previous_version_id UUID REFERENCES agent_versions(version_id);

-- Migrate history data
UPDATE agent_versions v
SET change_description = (
    SELECT h.change_description 
    FROM agent_version_history h 
    WHERE h.version_id = v.version_id 
    AND h.action = 'created'
    LIMIT 1
);

-- Drop the separate history table
DROP TABLE IF EXISTS agent_version_history CASCADE;

-- =====================================================
-- 6. CLEAN UP USER_AGENT_LIBRARY
-- =====================================================
-- This table tracks which marketplace agents users have imported
-- Add a comment to clarify its purpose
COMMENT ON TABLE user_agent_library IS 'Tracks which marketplace agent templates users have imported/cloned to their library';
COMMENT ON COLUMN user_agent_library.original_agent_id IS 'The original marketplace agent that was cloned';
COMMENT ON COLUMN user_agent_library.agent_id IS 'The user''s cloned copy of the agent';

-- =====================================================
-- 7. COMMENT OUT OAUTH_INSTALLATIONS
-- =====================================================
-- As requested, comment out OAuth installations functionality
-- We'll rename the table to indicate it's deprecated
ALTER TABLE IF EXISTS oauth_installations RENAME TO _deprecated_oauth_installations;
COMMENT ON TABLE _deprecated_oauth_installations IS 'DEPRECATED: OAuth installations table - functionality has been commented out';

-- =====================================================
-- 8. UPDATE AGENT TRIGGERS TO WORK WITH AGENT_WORKFLOWS
-- =====================================================
-- Add workflow execution capability to triggers
ALTER TABLE agent_triggers ADD COLUMN IF NOT EXISTS execution_type VARCHAR(50) DEFAULT 'agent' CHECK (execution_type IN ('agent', 'workflow'));
ALTER TABLE agent_triggers ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES agent_workflows(id) ON DELETE SET NULL;

-- Update trigger_events to track workflow executions
-- Note: workflow_executions table exists from agent_workflows system
ALTER TABLE trigger_events ADD COLUMN IF NOT EXISTS workflow_execution_id UUID REFERENCES workflow_executions(id) ON DELETE SET NULL;

-- =====================================================
-- 9. CLEAN UP COLUMNS AFTER MIGRATION
-- =====================================================
-- Schedule these to be dropped in a future migration after code is updated
COMMENT ON COLUMN agents.system_prompt IS 'DEPRECATED: Use config->>system_prompt instead';
COMMENT ON COLUMN agents.configured_mcps IS 'DEPRECATED: Use config->>tools->>mcp instead';
COMMENT ON COLUMN agents.agentpress_tools IS 'DEPRECATED: Use config->>tools->>agentpress instead';
COMMENT ON COLUMN agents.custom_mcps IS 'DEPRECATED: Use config->>tools->>custom_mcp instead';
COMMENT ON COLUMN agents.avatar IS 'DEPRECATED: Use config->>metadata->>avatar instead';
COMMENT ON COLUMN agents.avatar_color IS 'DEPRECATED: Use config->>metadata->>avatar_color instead';

COMMENT ON COLUMN agent_versions.system_prompt IS 'DEPRECATED: Use config->>system_prompt instead';
COMMENT ON COLUMN agent_versions.configured_mcps IS 'DEPRECATED: Use config->>tools->>mcp instead';
COMMENT ON COLUMN agent_versions.agentpress_tools IS 'DEPRECATED: Use config->>tools->>agentpress instead';
COMMENT ON COLUMN agent_versions.custom_mcps IS 'DEPRECATED: Use config->>tools->>custom_mcp instead';

-- =====================================================
-- 10. CREATE HELPER FUNCTIONS FOR NEW CONFIG FORMAT
-- =====================================================
-- Function to get agent config in a backward-compatible way
CREATE OR REPLACE FUNCTION get_agent_config(p_agent_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_agent RECORD;
    v_config JSONB;
BEGIN
    SELECT * INTO v_agent FROM agents WHERE agent_id = p_agent_id;
    
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    
    -- If config is already populated, return it
    IF v_agent.config IS NOT NULL AND v_agent.config != '{}'::jsonb THEN
        RETURN v_agent.config;
    END IF;
    
    -- Otherwise build it from legacy columns
    v_config := jsonb_build_object(
        'system_prompt', COALESCE(v_agent.system_prompt, ''),
        'tools', jsonb_build_object(
            'agentpress', (
                SELECT jsonb_object_agg(
                    key, 
                    (value->>'enabled')::boolean
                )
                FROM jsonb_each(COALESCE(v_agent.agentpress_tools, '{}'::jsonb))
                WHERE value IS NOT NULL AND value != 'null'::jsonb
            ),
            'mcp', COALESCE(v_agent.configured_mcps, '[]'::jsonb),
            'custom_mcp', COALESCE(v_agent.custom_mcps, '[]'::jsonb)
        ),
        'metadata', jsonb_build_object(
            'avatar', v_agent.avatar,
            'avatar_color', v_agent.avatar_color
        )
    );
    
    RETURN v_config;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_agent_config(UUID) TO authenticated, service_role;

-- =====================================================
-- 11. ADD COMMENTS FOR CLARITY
-- =====================================================
COMMENT ON TABLE agent_workflows IS 'Agent workflows - step-by-step task execution';
COMMENT ON TABLE workflow_steps IS 'Individual steps within an agent workflow';
COMMENT ON TABLE workflow_executions IS 'Execution history of agent workflows';
COMMENT ON TABLE workflow_step_executions IS 'Detailed execution logs for each workflow step';

COMMENT ON COLUMN agents.config IS 'Unified configuration object containing all agent settings';
COMMENT ON COLUMN agent_versions.config IS 'Versioned configuration snapshot';

COMMENT ON COLUMN agents.is_default IS 'Whether this agent is the default for the account (only one allowed per account)';
COMMENT ON COLUMN agent_triggers.execution_type IS 'Whether trigger executes an agent conversation or a workflow';

COMMIT; 