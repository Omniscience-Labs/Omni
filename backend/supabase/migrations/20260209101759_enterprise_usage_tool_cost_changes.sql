-- Enterprise Mode: Tool Cost Configuration & Global Settings
-- Adds tool cost tracking, enterprise global settings, and functions
-- for tool credit deduction and pre-flight checks.

-- ============================================================================
-- Enterprise global settings table
-- ============================================================================
-- Stores enterprise-wide configuration as key/value pairs (JSONB values).
-- Used for defaults like monthly spending limits, notification thresholds, etc.

CREATE TABLE IF NOT EXISTS public.enterprise_global_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(255) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    CONSTRAINT enterprise_settings_key_not_empty CHECK (LENGTH(TRIM(setting_key)) > 0)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_enterprise_global_settings_key
    ON enterprise_global_settings(setting_key);

-- Enable RLS
ALTER TABLE enterprise_global_settings ENABLE ROW LEVEL SECURITY;

-- Admin access policy (application layer validates admin role)
DROP POLICY IF EXISTS "enterprise_global_settings_admin_access" ON enterprise_global_settings;
CREATE POLICY "enterprise_global_settings_admin_access" ON enterprise_global_settings
    FOR ALL USING (TRUE);

-- Trigger for updated_at (reuses existing update_updated_at_column function)
DROP TRIGGER IF EXISTS update_enterprise_global_settings_updated_at ON enterprise_global_settings;
CREATE TRIGGER update_enterprise_global_settings_updated_at
    BEFORE UPDATE ON enterprise_global_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Seed default global settings
-- ============================================================================

INSERT INTO public.enterprise_global_settings (setting_key, setting_value, description)
VALUES (
    'default_monthly_limit',
    '{"value": 100.0}',
    'Default monthly spending limit for new enterprise users (in credits)'
) ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO public.enterprise_global_settings (setting_key, setting_value, description)
VALUES (
    'default_settings',
    '{"monthly_limit": 100.0, "allow_overages": false, "notification_threshold": 80.0}',
    'Default settings applied to new enterprise users (values in credits)'
) ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================================
-- get_enterprise_setting - Look up a global setting by key
-- ============================================================================

DROP FUNCTION IF EXISTS get_enterprise_setting(TEXT);

CREATE OR REPLACE FUNCTION public.get_enterprise_setting(p_setting_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT egs.setting_value INTO v_result
    FROM enterprise_global_settings egs
    WHERE egs.setting_key = p_setting_key;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_enterprise_setting(TEXT) TO authenticated;

-- ============================================================================
-- get_default_monthly_limit - Resolve the default monthly limit
-- ============================================================================
-- Reads the 'default_monthly_limit' setting and extracts its numeric value (in credits).
-- Falls back to 100.0 credits if the setting is missing or invalid.

DROP FUNCTION IF EXISTS get_default_monthly_limit();

CREATE OR REPLACE FUNCTION public.get_default_monthly_limit()
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result DECIMAL;
    v_setting_value JSONB;
BEGIN
    SELECT get_enterprise_setting('default_monthly_limit') INTO v_setting_value;

    -- Fallback to 100.0 if setting not found
    IF v_setting_value IS NULL THEN
        RETURN 100.0;
    END IF;

    v_result := (v_setting_value->>'value')::DECIMAL;

    -- Ensure we have a valid positive value
    IF v_result IS NULL OR v_result <= 0 THEN
        RETURN 100.0;
    END IF;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_default_monthly_limit() TO authenticated;

-- ============================================================================
-- Tool costs table
-- ============================================================================
-- Drop and recreate so schema always matches this migration (seed data only).
DROP TABLE IF EXISTS tool_costs;

CREATE TABLE tool_costs (
    tool_name VARCHAR(255) PRIMARY KEY,
    cost NUMERIC(10, 6) NOT NULL DEFAULT 0 CHECK (cost >= 0::NUMERIC),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default tool costs (by tool function name)
-- Only these 21 tools are billed; all other tools are treated as free (not in table = cost 0).
INSERT INTO tool_costs (tool_name, cost, description, is_active)
VALUES
    ('browser_act', 0.025000, 'Click, type, interact page (BrowserTool)', TRUE),
    ('browser_extract_content', 0.025000, 'Extract content from page (BrowserTool)', TRUE),
    ('browser_navigate_to', 0.020000, 'Navigate browser to URL (BrowserTool)', TRUE),
    ('browser_screenshot', 0.030000, 'Capture browser screenshot (BrowserTool)', TRUE),
    ('company_search', 0.100000, 'Search companies business info (CompanySearchTool)', TRUE),
    ('complete', 0.000500, 'Signal task completion to user (MessageTool)', TRUE),
    ('create_slide', 0.100000, 'Create new presentation slide (SandboxPresentationTool)', TRUE),
    ('edit_file', 0.020000, 'AI-assisted code edit via Morph (SandboxFilesTool)', TRUE),
    ('execute_data_provider_call', 0.040000, 'Call LinkedIn, Yahoo, etc (DataProvidersTool)', TRUE),
    ('get_author_papers', 0.200000, 'Get papers by author (PaperSearchTool)', TRUE),
    ('get_call_details', 0.100000, 'Get call status details (VapiVoiceTool)', TRUE),
    ('get_paper_details', 0.200000, 'Get paper details by ID (PaperSearchTool)', TRUE),
    ('image_edit_or_generate', 0.200000, 'Generate or edit images with AI (SandboxImageEditTool)', TRUE),
    ('image_search', 0.200000, 'Search images on internet (SandboxImageSearchTool)', TRUE),
    ('make_phone_call', 0.150000, 'Initiate voice phone call (VapiVoiceTool)', TRUE),
    ('paper_search', 0.100000, 'Search academic papers (PaperSearchTool)', TRUE),
    ('people_search', 0.100000, 'Search people professional info (PeopleSearchTool)', TRUE),
    ('scrape_webpage', 0.100000, 'Scrape webpage content (SandboxWebSearchTool)', TRUE),
    ('search_authors', 0.100000, 'Search academic authors (PaperSearchTool)', TRUE),
    ('search_files', 0.020000, 'Semantic search in KB (SandboxKbTool)', TRUE),
    ('web_search', 0.050000, 'Search web for information (SandboxWebSearchTool)', TRUE)
ON CONFLICT (tool_name) DO UPDATE SET
    cost = EXCLUDED.cost,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- ============================================================================
-- Add tool usage columns to enterprise_usage
-- ============================================================================

ALTER TABLE enterprise_usage ADD COLUMN IF NOT EXISTS tool_name VARCHAR;
ALTER TABLE enterprise_usage ADD COLUMN IF NOT EXISTS tool_cost NUMERIC(10, 6) DEFAULT 0 CHECK (tool_cost >= 0::NUMERIC);
ALTER TABLE enterprise_usage ADD COLUMN IF NOT EXISTS usage_type VARCHAR DEFAULT 'token' CHECK (usage_type IN ('token', 'tool'));

-- Allow NULL model_name for tool usage (tools have no model)
-- Modify the datatype of the model_name column from VARCHAR(255) to TEXT (v2 compatible)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'enterprise_usage'
          AND column_name = 'model_name'
          AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE enterprise_usage ALTER COLUMN model_name DROP NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'enterprise_usage'
          AND column_name = 'model_name'
          AND data_type <> 'text'
    ) THEN
        ALTER TABLE public.enterprise_usage
        ALTER COLUMN model_name
        TYPE TEXT;
    END IF;
END $$;


-- ============================================================================
-- enterprise_can_use_tool - Pre-flight check for tool usage
-- ============================================================================
-- Read-only check that returns whether the user can afford to use a tool,
-- without actually deducting anything. Useful for UI gating / pre-validation.

DROP FUNCTION IF EXISTS enterprise_can_use_tool(UUID, VARCHAR);

CREATE OR REPLACE FUNCTION public.enterprise_can_use_tool(
    p_account_id UUID,
    p_tool_name VARCHAR(255)
)
RETURNS TABLE(can_use BOOLEAN, required_cost DECIMAL, current_balance DECIMAL, user_remaining DECIMAL)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tool_cost DECIMAL;
    v_enterprise_balance DECIMAL;
    v_monthly_limit DECIMAL;
    v_current_usage DECIMAL;
    v_user_remaining DECIMAL;
    v_default_limit DECIMAL;
BEGIN
    -- Resolve the configurable default monthly limit
    SELECT get_default_monthly_limit() INTO v_default_limit;

    -- Get tool cost from tool_costs table
    SELECT tc.cost INTO v_tool_cost
    FROM tool_costs tc
    WHERE tc.tool_name = p_tool_name AND tc.is_active = TRUE;

    -- If no cost found or tool is free, check general enterprise status
    IF v_tool_cost IS NULL OR v_tool_cost = 0 THEN
        -- Get user's remaining allowance
        SELECT eul.monthly_limit, eul.current_month_usage
        INTO v_monthly_limit, v_current_usage
        FROM enterprise_user_limits eul
        WHERE eul.account_id = p_account_id AND eul.is_active = TRUE;

        -- Use default if no limit set
        IF v_monthly_limit IS NULL THEN
            v_monthly_limit := v_default_limit;
            v_current_usage := 0;
        END IF;

        v_user_remaining := v_monthly_limit - v_current_usage;

        -- Get enterprise balance
        SELECT eb.credit_balance INTO v_enterprise_balance
        FROM enterprise_billing eb
        WHERE eb.id = '00000000-0000-0000-0000-000000000000';

        RETURN QUERY SELECT TRUE, COALESCE(v_tool_cost, 0::DECIMAL), v_enterprise_balance, v_user_remaining;
        RETURN;
    END IF;

    -- Get user's monthly limit and usage (no lock -- this is a read-only check)
    SELECT eul.monthly_limit, eul.current_month_usage
    INTO v_monthly_limit, v_current_usage
    FROM enterprise_user_limits eul
    WHERE eul.account_id = p_account_id AND eul.is_active = TRUE;

    -- If no limit set, assume defaults (do NOT insert -- keep this read-only)
    IF v_monthly_limit IS NULL THEN
        v_monthly_limit := v_default_limit;
        v_current_usage := 0;
    END IF;

    v_user_remaining := v_monthly_limit - v_current_usage;

    -- Check if user has remaining monthly allowance for this tool
    IF v_current_usage + v_tool_cost > v_monthly_limit THEN
        SELECT eb.credit_balance INTO v_enterprise_balance
        FROM enterprise_billing eb
        WHERE eb.id = '00000000-0000-0000-0000-000000000000';

        RETURN QUERY SELECT FALSE, v_tool_cost, v_enterprise_balance, v_user_remaining;
        RETURN;
    END IF;

    -- Get enterprise balance
    SELECT eb.credit_balance INTO v_enterprise_balance
    FROM enterprise_billing eb
    WHERE eb.id = '00000000-0000-0000-0000-000000000000';

    -- Check if enterprise has enough credit
    IF v_enterprise_balance < v_tool_cost THEN
        RETURN QUERY SELECT FALSE, v_tool_cost, v_enterprise_balance, v_user_remaining;
        RETURN;
    END IF;

    -- User can use the tool
    RETURN QUERY SELECT TRUE, v_tool_cost, v_enterprise_balance, v_user_remaining;
END;
$$;

-- Grant permission
GRANT EXECUTE ON FUNCTION enterprise_can_use_tool(UUID, VARCHAR) TO authenticated;

-- ============================================================================
-- enterprise_use_tool_credits - Atomic tool credit deduction
-- ============================================================================
-- Looks up the tool cost from tool_costs, validates pool balance and user
-- monthly limit, deducts credits, and logs the usage with usage_type = 'tool'.

DROP FUNCTION IF EXISTS enterprise_use_tool_credits(UUID, VARCHAR, TEXT, TEXT);

-- Also drop the old function with the incorrect signature from v2
DROP FUNCTION IF EXISTS enterprise_use_tool_credits(UUID, VARCHAR, UUID, UUID);

CREATE OR REPLACE FUNCTION public.enterprise_use_tool_credits(
    p_account_id UUID,
    p_tool_name VARCHAR(255),
    p_thread_id TEXT DEFAULT NULL,
    p_message_id TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, cost_charged DECIMAL, new_balance DECIMAL, user_remaining DECIMAL)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tool_cost DECIMAL;
    v_current_balance DECIMAL;
    v_monthly_limit DECIMAL;
    v_current_usage DECIMAL;
    v_new_balance DECIMAL;
    v_user_remaining DECIMAL;
    v_default_limit DECIMAL;
BEGIN
    -- Resolve the configurable default monthly limit
    SELECT get_default_monthly_limit() INTO v_default_limit;

    -- Get tool cost (no lock needed -- tool_costs is a config table, rarely updated)
    SELECT tc.cost INTO v_tool_cost
    FROM tool_costs tc
    WHERE tc.tool_name = p_tool_name AND tc.is_active = TRUE;

    -- If no cost found or free tool, return success without locking
    IF v_tool_cost IS NULL OR v_tool_cost = 0 THEN
        SELECT eul.monthly_limit, eul.current_month_usage
        INTO v_monthly_limit, v_current_usage
        FROM enterprise_user_limits eul
        WHERE eul.account_id = p_account_id AND eul.is_active = TRUE;

        IF v_monthly_limit IS NULL THEN
            v_monthly_limit := v_default_limit;
            v_current_usage := 0;
        END IF;

        v_user_remaining := v_monthly_limit - v_current_usage;

        SELECT eb.credit_balance INTO v_current_balance
        FROM enterprise_billing eb
        WHERE eb.id = '00000000-0000-0000-0000-000000000000';

        RETURN QUERY SELECT TRUE, 0::DECIMAL, v_current_balance, v_user_remaining;
        RETURN;
    END IF;

    -- Lock and get the enterprise pool balance (serializes concurrent deductions)
    SELECT eb.credit_balance INTO v_current_balance
    FROM enterprise_billing eb
    WHERE eb.id = '00000000-0000-0000-0000-000000000000'
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        RETURN QUERY SELECT FALSE, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL;
        RETURN;
    END IF;

    -- Lock and get user limits (serializes concurrent deductions for this user)
    SELECT eul.monthly_limit, eul.current_month_usage
    INTO v_monthly_limit, v_current_usage
    FROM enterprise_user_limits eul
    WHERE eul.account_id = p_account_id AND eul.is_active = TRUE
    FOR UPDATE;

    -- If no limit set, create default
    IF v_monthly_limit IS NULL THEN
        INSERT INTO enterprise_user_limits (account_id)
        VALUES (p_account_id)
        ON CONFLICT (account_id) DO UPDATE SET is_active = TRUE;

        v_monthly_limit := v_default_limit;
        v_current_usage := 0;
    END IF;

    v_user_remaining := v_monthly_limit - v_current_usage;

    -- Check monthly limit
    IF v_current_usage + v_tool_cost > v_monthly_limit THEN
        RETURN QUERY SELECT FALSE, 0::DECIMAL, v_current_balance, v_user_remaining;
        RETURN;
    END IF;

    -- Check sufficient pool balance
    IF v_current_balance < v_tool_cost THEN
        RETURN QUERY SELECT FALSE, 0::DECIMAL, v_current_balance, v_user_remaining;
        RETURN;
    END IF;

    -- All checks passed with locks held -- deduct from enterprise balance
    UPDATE enterprise_billing
    SET credit_balance = credit_balance - v_tool_cost,
        total_used = total_used + v_tool_cost,
        updated_at = NOW()
    WHERE id = '00000000-0000-0000-0000-000000000000'
    RETURNING credit_balance INTO v_new_balance;

    -- Update user's monthly usage
    UPDATE enterprise_user_limits
    SET current_month_usage = current_month_usage + v_tool_cost,
        updated_at = NOW()
    WHERE account_id = p_account_id;

    -- Log tool usage (no model_name for tools, set cost and tool_cost to same value)
    INSERT INTO enterprise_usage (
        account_id, thread_id, message_id, cost, tool_name, tool_cost, usage_type, model_name
    ) VALUES (
        p_account_id, p_thread_id, p_message_id, v_tool_cost, p_tool_name, v_tool_cost, 'tool', NULL
    );

    v_user_remaining := v_user_remaining - v_tool_cost;

    RETURN QUERY SELECT TRUE, v_tool_cost, v_new_balance, v_user_remaining;
END;
$$;

-- Grant permission
GRANT EXECUTE ON FUNCTION enterprise_use_tool_credits(UUID, VARCHAR, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- enterprise_can_use_tools_batch - Batch pre-flight check for multiple tools
-- ============================================================================
-- Read-only check that sums the cost of all requested tools and validates
-- the user's monthly allowance and enterprise pool balance against the total.
-- More efficient than N individual enterprise_can_use_tool calls.

DROP FUNCTION IF EXISTS enterprise_can_use_tools_batch(UUID, VARCHAR[]);

CREATE OR REPLACE FUNCTION public.enterprise_can_use_tools_batch(
    p_account_id UUID,
    p_tool_names VARCHAR[]
)
RETURNS TABLE(
    can_use BOOLEAN,
    total_cost DECIMAL,
    current_balance DECIMAL,
    user_remaining DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_cost DECIMAL := 0;
    v_enterprise_balance DECIMAL;
    v_monthly_limit DECIMAL;
    v_current_usage DECIMAL;
    v_user_remaining DECIMAL;
    v_default_limit DECIMAL;
BEGIN
    -- Resolve the configurable default monthly limit
    SELECT get_default_monthly_limit() INTO v_default_limit;

    -- Sum the cost of all requested (active) tools in a single query.
    -- Tools not found in tool_costs are treated as free (cost = 0).
    SELECT COALESCE(SUM(tc.cost), 0)
    INTO v_total_cost
    FROM unnest(p_tool_names) AS requested(name)
    JOIN tool_costs tc ON tc.tool_name = requested.name AND tc.is_active = TRUE;

    -- Get user's monthly limit and current usage (read-only, no lock)
    SELECT eul.monthly_limit, eul.current_month_usage
    INTO v_monthly_limit, v_current_usage
    FROM enterprise_user_limits eul
    WHERE eul.account_id = p_account_id AND eul.is_active = TRUE;

    IF v_monthly_limit IS NULL THEN
        v_monthly_limit := v_default_limit;
        v_current_usage := 0;
    END IF;

    v_user_remaining := v_monthly_limit - v_current_usage;

    -- If total cost is zero (all free / unknown tools), pass immediately
    IF v_total_cost = 0 THEN
        SELECT eb.credit_balance INTO v_enterprise_balance
        FROM enterprise_billing eb
        WHERE eb.id = '00000000-0000-0000-0000-000000000000';

        RETURN QUERY SELECT TRUE, v_total_cost, v_enterprise_balance, v_user_remaining;
        RETURN;
    END IF;

    -- Validate user monthly allowance
    IF v_current_usage + v_total_cost > v_monthly_limit THEN
        SELECT eb.credit_balance INTO v_enterprise_balance
        FROM enterprise_billing eb
        WHERE eb.id = '00000000-0000-0000-0000-000000000000';

        RETURN QUERY SELECT FALSE, v_total_cost, v_enterprise_balance, v_user_remaining;
        RETURN;
    END IF;

    -- Validate enterprise pool balance
    SELECT eb.credit_balance INTO v_enterprise_balance
    FROM enterprise_billing eb
    WHERE eb.id = '00000000-0000-0000-0000-000000000000';

    IF v_enterprise_balance < v_total_cost THEN
        RETURN QUERY SELECT FALSE, v_total_cost, v_enterprise_balance, v_user_remaining;
        RETURN;
    END IF;

    -- All checks passed
    RETURN QUERY SELECT TRUE, v_total_cost, v_enterprise_balance, v_user_remaining;
END;
$$;

-- Grant permission
GRANT EXECUTE ON FUNCTION enterprise_can_use_tools_batch(UUID, VARCHAR[]) TO authenticated;
