-- Enterprise Mode Billing Tables
-- These tables implement the V2-style enterprise billing system
-- Only used when ENTERPRISE_MODE=true in the application config

-- ============================================================================
-- 1. enterprise_billing - The Shared Corporate Credit Pool
-- ============================================================================
-- A single row holding the company's total money
-- Uses a fixed UUID as the primary key for simplicity (single-tenant model)

CREATE TABLE IF NOT EXISTS enterprise_billing (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    credit_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_loaded NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_used NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns for V2 migration compatibility
ALTER TABLE enterprise_billing ADD COLUMN IF NOT EXISTS total_loaded NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE enterprise_billing ADD COLUMN IF NOT EXISTS total_used NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE enterprise_billing ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Insert the single enterprise billing row if it doesn't exist
INSERT INTO enterprise_billing (id, credit_balance, total_loaded, total_used)
VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 0.00, 0.00, 0.00)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. enterprise_user_limits - Per-User Monthly Spending Limits
-- ============================================================================
-- Controls how much each user can spend per month from the shared pool

CREATE TABLE IF NOT EXISTS enterprise_user_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    monthly_limit NUMERIC(10, 2) NOT NULL DEFAULT 100.00,
    current_month_usage NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    last_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id)
);

-- Add missing columns for V2 migration compatibility
ALTER TABLE enterprise_user_limits ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE enterprise_user_limits ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE enterprise_user_limits ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE enterprise_user_limits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Index for fast lookup by account_id
CREATE INDEX IF NOT EXISTS idx_enterprise_user_limits_account_id 
    ON enterprise_user_limits(account_id);

CREATE INDEX IF NOT EXISTS idx_enterprise_user_limits_is_active 
    ON enterprise_user_limits(is_active) WHERE is_active = true;

-- ============================================================================
-- 3. enterprise_usage - Usage Audit Log
-- ============================================================================
-- Strict logging of every cent spent in Enterprise Mode

CREATE TABLE IF NOT EXISTS enterprise_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    thread_id TEXT,
    message_id TEXT,
    cost NUMERIC(10, 4) NOT NULL,
    model_name TEXT NOT NULL DEFAULT 'unknown',
    tokens_used INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns for V2 migration compatibility
ALTER TABLE enterprise_usage ADD COLUMN IF NOT EXISTS model_name TEXT DEFAULT 'unknown';
ALTER TABLE enterprise_usage ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0;
ALTER TABLE enterprise_usage ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0;
ALTER TABLE enterprise_usage ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0;

-- Indexes for reporting and analytics
CREATE INDEX IF NOT EXISTS idx_enterprise_usage_account_id 
    ON enterprise_usage(account_id);

CREATE INDEX IF NOT EXISTS idx_enterprise_usage_created_at 
    ON enterprise_usage(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enterprise_usage_account_created 
    ON enterprise_usage(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enterprise_usage_thread_id 
    ON enterprise_usage(thread_id) WHERE thread_id IS NOT NULL;

-- ============================================================================
-- 4. enterprise_credit_loads - Admin Credit Load History
-- ============================================================================
-- Audit trail of when Admins added or removed money from the pool

CREATE TABLE IF NOT EXISTS enterprise_credit_loads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amount NUMERIC(12, 2) NOT NULL,
    type TEXT NOT NULL DEFAULT 'load' CHECK (type IN ('load', 'negate')),
    description TEXT,
    performed_by TEXT NOT NULL DEFAULT 'SYSTEM',
    balance_after NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns to existing tables (for V2 migration compatibility)
ALTER TABLE enterprise_credit_loads ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'load';
ALTER TABLE enterprise_credit_loads ADD COLUMN IF NOT EXISTS performed_by TEXT DEFAULT 'SYSTEM';
ALTER TABLE enterprise_credit_loads ADD COLUMN IF NOT EXISTS balance_after NUMERIC(12, 2) DEFAULT 0;

-- Add check constraint if not exists (wrapped in DO block to handle existing constraint)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'enterprise_credit_loads_type_check'
    ) THEN
        ALTER TABLE enterprise_credit_loads ADD CONSTRAINT enterprise_credit_loads_type_check 
            CHECK (type IN ('load', 'negate'));
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_enterprise_credit_loads_created_at 
    ON enterprise_credit_loads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enterprise_credit_loads_type 
    ON enterprise_credit_loads(type);

-- ============================================================================
-- 5. Database Functions
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 5a. load_enterprise_credits - Add credits to the enterprise pool
-- -----------------------------------------------------------------------------
-- Drop existing function first (V2 may have different signature)
DROP FUNCTION IF EXISTS load_enterprise_credits(NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS load_enterprise_credits(NUMERIC(12,2), TEXT, TEXT);

CREATE OR REPLACE FUNCTION load_enterprise_credits(
    p_amount NUMERIC(12, 2),
    p_performed_by TEXT,
    p_description TEXT DEFAULT 'Credit load'
) RETURNS JSONB AS $$
DECLARE
    v_new_balance NUMERIC(12, 2);
    v_new_total_loaded NUMERIC(12, 2);
    v_load_id UUID;
BEGIN
    -- Validate amount
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Amount must be positive'
        );
    END IF;

    -- Update the enterprise billing pool
    UPDATE enterprise_billing
    SET 
        credit_balance = credit_balance + p_amount,
        total_loaded = total_loaded + p_amount,
        updated_at = NOW()
    WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
    RETURNING credit_balance, total_loaded INTO v_new_balance, v_new_total_loaded;

    -- If no row exists, create it
    IF NOT FOUND THEN
        INSERT INTO enterprise_billing (id, credit_balance, total_loaded, total_used)
        VALUES ('00000000-0000-0000-0000-000000000000'::uuid, p_amount, p_amount, 0.00)
        RETURNING credit_balance, total_loaded INTO v_new_balance, v_new_total_loaded;
    END IF;

    -- Log the transaction
    INSERT INTO enterprise_credit_loads (amount, type, description, performed_by, balance_after)
    VALUES (p_amount, 'load', p_description, p_performed_by, v_new_balance)
    RETURNING id INTO v_load_id;

    RETURN jsonb_build_object(
        'success', true,
        'load_id', v_load_id,
        'amount_loaded', p_amount,
        'new_balance', v_new_balance,
        'total_loaded', v_new_total_loaded
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 5b. negate_enterprise_credits - Remove credits from the enterprise pool
-- -----------------------------------------------------------------------------
-- Drop existing function first (V2 may have different signature)
DROP FUNCTION IF EXISTS negate_enterprise_credits(NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS negate_enterprise_credits(NUMERIC(12,2), TEXT, TEXT);

CREATE OR REPLACE FUNCTION negate_enterprise_credits(
    p_amount NUMERIC(12, 2),
    p_performed_by TEXT,
    p_description TEXT DEFAULT 'Credit negation'
) RETURNS JSONB AS $$
DECLARE
    v_current_balance NUMERIC(12, 2);
    v_new_balance NUMERIC(12, 2);
    v_load_id UUID;
BEGIN
    -- Validate amount
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Amount must be positive'
        );
    END IF;

    -- Get current balance
    SELECT credit_balance INTO v_current_balance
    FROM enterprise_billing
    WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Enterprise billing not initialized'
        );
    END IF;

    -- Check if enough balance
    IF v_current_balance < p_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient balance',
            'current_balance', v_current_balance,
            'requested', p_amount
        );
    END IF;

    -- Update the enterprise billing pool
    UPDATE enterprise_billing
    SET 
        credit_balance = credit_balance - p_amount,
        updated_at = NOW()
    WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
    RETURNING credit_balance INTO v_new_balance;

    -- Log the transaction
    INSERT INTO enterprise_credit_loads (amount, type, description, performed_by, balance_after)
    VALUES (p_amount, 'negate', p_description, p_performed_by, v_new_balance)
    RETURNING id INTO v_load_id;

    RETURN jsonb_build_object(
        'success', true,
        'load_id', v_load_id,
        'amount_negated', p_amount,
        'new_balance', v_new_balance
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 5c. use_enterprise_credits_simple - Atomic credit deduction
-- -----------------------------------------------------------------------------
-- Performs the transaction atomically:
-- 1. Check if enterprise_billing.credit_balance > cost
-- 2. Check if enterprise_user_limits allows the spend
-- 3. Deduct from global balance, increment user usage, insert into enterprise_usage

-- Drop existing function first (V2 may have different signature)
DROP FUNCTION IF EXISTS use_enterprise_credits_simple(UUID, NUMERIC, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT);
DROP FUNCTION IF EXISTS use_enterprise_credits_simple(UUID, NUMERIC(10,4), TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION use_enterprise_credits_simple(
    p_account_id UUID,
    p_cost NUMERIC(10, 4),
    p_model_name TEXT,
    p_tokens_used INTEGER DEFAULT 0,
    p_prompt_tokens INTEGER DEFAULT 0,
    p_completion_tokens INTEGER DEFAULT 0,
    p_thread_id TEXT DEFAULT NULL,
    p_message_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_pool_balance NUMERIC(12, 2);
    v_user_limit NUMERIC(10, 2);
    v_user_usage NUMERIC(10, 2);
    v_user_is_active BOOLEAN;
    v_new_pool_balance NUMERIC(12, 2);
    v_new_user_usage NUMERIC(10, 2);
    v_usage_id UUID;
BEGIN
    -- Lock and get the enterprise pool balance
    SELECT credit_balance INTO v_pool_balance
    FROM enterprise_billing
    WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Enterprise billing not initialized',
            'error_code', 'ENTERPRISE_NOT_INITIALIZED'
        );
    END IF;

    -- Check if pool has sufficient balance
    IF v_pool_balance < p_cost THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient enterprise credits',
            'error_code', 'INSUFFICIENT_POOL_BALANCE',
            'pool_balance', v_pool_balance,
            'cost', p_cost
        );
    END IF;

    -- Lock and get user limits
    SELECT monthly_limit, current_month_usage, is_active
    INTO v_user_limit, v_user_usage, v_user_is_active
    FROM enterprise_user_limits
    WHERE account_id = p_account_id
    FOR UPDATE;

    -- If user doesn't have a limit record, create one with defaults
    IF NOT FOUND THEN
        INSERT INTO enterprise_user_limits (account_id, monthly_limit, current_month_usage, is_active)
        VALUES (p_account_id, 100.00, 0.00, true)
        RETURNING monthly_limit, current_month_usage, is_active
        INTO v_user_limit, v_user_usage, v_user_is_active;
    END IF;

    -- Check if user is active
    IF NOT v_user_is_active THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User account is deactivated',
            'error_code', 'USER_DEACTIVATED'
        );
    END IF;

    -- Check if user would exceed their monthly limit
    IF (v_user_usage + p_cost) > v_user_limit THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Monthly spending limit exceeded',
            'error_code', 'MONTHLY_LIMIT_EXCEEDED',
            'current_usage', v_user_usage,
            'monthly_limit', v_user_limit,
            'cost', p_cost,
            'remaining', v_user_limit - v_user_usage
        );
    END IF;

    -- All checks passed - deduct from pool
    UPDATE enterprise_billing
    SET 
        credit_balance = credit_balance - p_cost,
        total_used = total_used + p_cost,
        updated_at = NOW()
    WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
    RETURNING credit_balance INTO v_new_pool_balance;

    -- Update user usage
    UPDATE enterprise_user_limits
    SET 
        current_month_usage = current_month_usage + p_cost,
        updated_at = NOW()
    WHERE account_id = p_account_id
    RETURNING current_month_usage INTO v_new_user_usage;

    -- Log the usage
    INSERT INTO enterprise_usage (
        account_id, thread_id, message_id, cost, model_name, 
        tokens_used, prompt_tokens, completion_tokens
    ) VALUES (
        p_account_id, p_thread_id, p_message_id, p_cost, p_model_name,
        p_tokens_used, p_prompt_tokens, p_completion_tokens
    )
    RETURNING id INTO v_usage_id;

    RETURN jsonb_build_object(
        'success', true,
        'usage_id', v_usage_id,
        'cost', p_cost,
        'new_pool_balance', v_new_pool_balance,
        'new_user_usage', v_new_user_usage,
        'user_monthly_limit', v_user_limit,
        'user_remaining', v_user_limit - v_new_user_usage
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 5d. check_enterprise_billing_status - Check if user can spend
-- -----------------------------------------------------------------------------
-- Drop existing function first (V2 may have different signature)
DROP FUNCTION IF EXISTS check_enterprise_billing_status(UUID, NUMERIC);
DROP FUNCTION IF EXISTS check_enterprise_billing_status(UUID, NUMERIC(10,4));
DROP FUNCTION IF EXISTS check_enterprise_billing_status(UUID);

CREATE OR REPLACE FUNCTION check_enterprise_billing_status(
    p_account_id UUID,
    p_estimated_cost NUMERIC(10, 4) DEFAULT 0.01
) RETURNS JSONB AS $$
DECLARE
    v_pool_balance NUMERIC(12, 2);
    v_user_limit NUMERIC(10, 2);
    v_user_usage NUMERIC(10, 2);
    v_user_is_active BOOLEAN;
    v_remaining NUMERIC(10, 2);
BEGIN
    -- Get the enterprise pool balance
    SELECT credit_balance INTO v_pool_balance
    FROM enterprise_billing
    WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;

    IF NOT FOUND OR v_pool_balance IS NULL THEN
        RETURN jsonb_build_object(
            'can_spend', false,
            'error', 'Enterprise billing not initialized',
            'error_code', 'ENTERPRISE_NOT_INITIALIZED'
        );
    END IF;

    -- Check pool balance
    IF v_pool_balance < p_estimated_cost THEN
        RETURN jsonb_build_object(
            'can_spend', false,
            'error', 'Insufficient enterprise credits',
            'error_code', 'INSUFFICIENT_POOL_BALANCE',
            'pool_balance', v_pool_balance
        );
    END IF;

    -- Get user limits
    SELECT monthly_limit, current_month_usage, is_active
    INTO v_user_limit, v_user_usage, v_user_is_active
    FROM enterprise_user_limits
    WHERE account_id = p_account_id;

    -- If user doesn't have a limit record, they get defaults
    IF NOT FOUND THEN
        v_user_limit := 100.00;
        v_user_usage := 0.00;
        v_user_is_active := true;
    END IF;

    -- Check if user is active
    IF NOT v_user_is_active THEN
        RETURN jsonb_build_object(
            'can_spend', false,
            'error', 'User account is deactivated',
            'error_code', 'USER_DEACTIVATED'
        );
    END IF;

    v_remaining := v_user_limit - v_user_usage;

    -- Check if user has remaining allowance
    IF v_remaining < p_estimated_cost THEN
        RETURN jsonb_build_object(
            'can_spend', false,
            'error', 'Monthly spending limit would be exceeded',
            'error_code', 'MONTHLY_LIMIT_EXCEEDED',
            'current_usage', v_user_usage,
            'monthly_limit', v_user_limit,
            'remaining', v_remaining
        );
    END IF;

    -- All checks passed
    RETURN jsonb_build_object(
        'can_spend', true,
        'pool_balance', v_pool_balance,
        'user_monthly_limit', v_user_limit,
        'user_current_usage', v_user_usage,
        'user_remaining', v_remaining
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 5e. reset_enterprise_monthly_usage - Reset all users' monthly usage
-- -----------------------------------------------------------------------------
-- Drop existing function first (V2 may have different return type)
DROP FUNCTION IF EXISTS reset_enterprise_monthly_usage();

CREATE OR REPLACE FUNCTION reset_enterprise_monthly_usage()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE enterprise_user_limits
    SET 
        current_month_usage = 0.00,
        last_reset_at = NOW(),
        updated_at = NOW();
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 5f. get_enterprise_pool_status - Get current pool status
-- -----------------------------------------------------------------------------
-- Drop existing function first (V2 may have different signature)
DROP FUNCTION IF EXISTS get_enterprise_pool_status();

CREATE OR REPLACE FUNCTION get_enterprise_pool_status()
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'credit_balance', credit_balance,
        'total_loaded', total_loaded,
        'total_used', total_used,
        'created_at', created_at,
        'updated_at', updated_at
    ) INTO v_result
    FROM enterprise_billing
    WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'credit_balance', 0,
            'total_loaded', 0,
            'total_used', 0,
            'error', 'Not initialized'
        );
    END IF;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 5g. get_enterprise_user_status - Get user's enterprise status
-- -----------------------------------------------------------------------------
-- Drop existing function first (V2 may have different signature)
DROP FUNCTION IF EXISTS get_enterprise_user_status(UUID);

CREATE OR REPLACE FUNCTION get_enterprise_user_status(p_account_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'monthly_limit', monthly_limit,
        'current_month_usage', current_month_usage,
        'remaining', monthly_limit - current_month_usage,
        'is_active', is_active,
        'last_reset_at', last_reset_at,
        'usage_percentage', ROUND((current_month_usage / NULLIF(monthly_limit, 0)) * 100, 2)
    ) INTO v_result
    FROM enterprise_user_limits
    WHERE account_id = p_account_id;

    IF NOT FOUND THEN
        -- Return defaults for new users
        RETURN jsonb_build_object(
            'monthly_limit', 100.00,
            'current_month_usage', 0.00,
            'remaining', 100.00,
            'is_active', true,
            'last_reset_at', NULL,
            'usage_percentage', 0,
            'is_new_user', true
        );
    END IF;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. Grant permissions to authenticated users
-- ============================================================================
GRANT EXECUTE ON FUNCTION load_enterprise_credits TO authenticated;
GRANT EXECUTE ON FUNCTION negate_enterprise_credits TO authenticated;
GRANT EXECUTE ON FUNCTION use_enterprise_credits_simple TO authenticated;
GRANT EXECUTE ON FUNCTION check_enterprise_billing_status TO authenticated;
GRANT EXECUTE ON FUNCTION reset_enterprise_monthly_usage TO authenticated;
GRANT EXECUTE ON FUNCTION get_enterprise_pool_status TO authenticated;
GRANT EXECUTE ON FUNCTION get_enterprise_user_status TO authenticated;

-- Grant table access (the functions use SECURITY DEFINER, but we also allow direct access)
GRANT SELECT ON enterprise_billing TO authenticated;
GRANT SELECT ON enterprise_user_limits TO authenticated;
GRANT SELECT ON enterprise_usage TO authenticated;
GRANT SELECT ON enterprise_credit_loads TO authenticated;

-- ============================================================================
-- 7. Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on tables (idempotent - safe to run multiple times)
ALTER TABLE enterprise_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_user_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_credit_loads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "enterprise_billing_read_all" ON enterprise_billing;
DROP POLICY IF EXISTS "enterprise_billing_service_all" ON enterprise_billing;
DROP POLICY IF EXISTS "enterprise_user_limits_read_own" ON enterprise_user_limits;
DROP POLICY IF EXISTS "enterprise_user_limits_service_all" ON enterprise_user_limits;
DROP POLICY IF EXISTS "enterprise_usage_read_own" ON enterprise_usage;
DROP POLICY IF EXISTS "enterprise_usage_service_all" ON enterprise_usage;
DROP POLICY IF EXISTS "enterprise_credit_loads_read_all" ON enterprise_credit_loads;
DROP POLICY IF EXISTS "enterprise_credit_loads_service_all" ON enterprise_credit_loads;

-- enterprise_billing: Everyone can read the single row (balance is visible to admins only via API)
CREATE POLICY "enterprise_billing_read_all" ON enterprise_billing
    FOR SELECT TO authenticated USING (true);

-- enterprise_user_limits: Users can only see their own limits
CREATE POLICY "enterprise_user_limits_read_own" ON enterprise_user_limits
    FOR SELECT TO authenticated USING (account_id = auth.uid());

-- enterprise_usage: Users can only see their own usage
CREATE POLICY "enterprise_usage_read_own" ON enterprise_usage
    FOR SELECT TO authenticated USING (account_id = auth.uid());

-- enterprise_credit_loads: Readable by all (admin-only API controls who calls this)
CREATE POLICY "enterprise_credit_loads_read_all" ON enterprise_credit_loads
    FOR SELECT TO authenticated USING (true);

-- Service role bypass for all tables (needed for admin operations)
CREATE POLICY "enterprise_billing_service_all" ON enterprise_billing
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "enterprise_user_limits_service_all" ON enterprise_user_limits
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "enterprise_usage_service_all" ON enterprise_usage
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "enterprise_credit_loads_service_all" ON enterprise_credit_loads
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 8. Trigger for updated_at timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_enterprise_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
DROP TRIGGER IF EXISTS enterprise_billing_updated_at ON enterprise_billing;
CREATE TRIGGER enterprise_billing_updated_at
    BEFORE UPDATE ON enterprise_billing
    FOR EACH ROW EXECUTE FUNCTION update_enterprise_updated_at();

DROP TRIGGER IF EXISTS enterprise_user_limits_updated_at ON enterprise_user_limits;
CREATE TRIGGER enterprise_user_limits_updated_at
    BEFORE UPDATE ON enterprise_user_limits
    FOR EACH ROW EXECUTE FUNCTION update_enterprise_updated_at();
