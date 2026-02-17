-- Enterprise Mode: Ensure credit_accounts row exists for all enterprise users
-- This prevents V3 code errors that expect credit_accounts row to exist
-- The balance remains at 0 for enterprise users (all billing goes through enterprise tables)

-- ============================================================================
-- 1. Function to ensure credit_accounts row exists for enterprise user
-- ============================================================================
-- Drop existing function first (V2 may have different signature)
DROP FUNCTION IF EXISTS ensure_enterprise_user_credit_account(UUID);

CREATE OR REPLACE FUNCTION ensure_enterprise_user_credit_account(p_account_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    -- Check if credit_accounts row exists
    SELECT EXISTS(
        SELECT 1 FROM credit_accounts WHERE account_id = p_account_id
    ) INTO v_exists;

    IF NOT v_exists THEN
        -- Create credit_accounts row with zero balance for enterprise user
        INSERT INTO credit_accounts (
            account_id,
            balance,
            expiring_credits,
            non_expiring_credits,
            daily_credits_balance,
            lifetime_granted,
            lifetime_purchased,
            lifetime_used,
            tier
        ) VALUES (
            p_account_id,
            0.00,
            0.00,
            0.00,
            0.00,
            0.00,
            0.00,
            0.00,
            'enterprise'  -- Special tier marker for enterprise users
        )
        ON CONFLICT (account_id) DO NOTHING;

        RETURN jsonb_build_object(
            'success', true,
            'created', true,
            'account_id', p_account_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'created', false,
        'account_id', p_account_id,
        'message', 'Account already exists'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. Trigger: Auto-create credit_accounts when enterprise_user_limits is inserted
-- ============================================================================
-- Drop existing function first (V2 may have different signature)
DROP FUNCTION IF EXISTS trigger_ensure_enterprise_credit_account() CASCADE;

CREATE OR REPLACE FUNCTION trigger_ensure_enterprise_credit_account()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure credit_accounts row exists for this user
    PERFORM ensure_enterprise_user_credit_account(NEW.account_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger to enterprise_user_limits
DROP TRIGGER IF EXISTS enterprise_user_ensure_credit_account ON enterprise_user_limits;
CREATE TRIGGER enterprise_user_ensure_credit_account
    AFTER INSERT ON enterprise_user_limits
    FOR EACH ROW EXECUTE FUNCTION trigger_ensure_enterprise_credit_account();

-- ============================================================================
-- 3. Function to provision a new enterprise user (convenience function)
-- ============================================================================
-- This is the main function to call when adding a new user to the enterprise
-- Drop existing function first (V2 may have different signature)
DROP FUNCTION IF EXISTS provision_enterprise_user(UUID, NUMERIC, BOOLEAN);
DROP FUNCTION IF EXISTS provision_enterprise_user(UUID, NUMERIC(10,2), BOOLEAN);

CREATE OR REPLACE FUNCTION provision_enterprise_user(
    p_account_id UUID,
    p_monthly_limit NUMERIC(10, 2) DEFAULT 100.00,
    p_is_active BOOLEAN DEFAULT true
) RETURNS JSONB AS $$
DECLARE
    v_credit_result JSONB;
    v_limit_created BOOLEAN := false;
BEGIN
    -- First, ensure credit_accounts row exists
    SELECT ensure_enterprise_user_credit_account(p_account_id) INTO v_credit_result;

    -- Then, create or update enterprise_user_limits
    INSERT INTO enterprise_user_limits (
        account_id,
        monthly_limit,
        current_month_usage,
        is_active,
        last_reset_at
    ) VALUES (
        p_account_id,
        p_monthly_limit,
        0.00,
        p_is_active,
        NOW()
    )
    ON CONFLICT (account_id) DO UPDATE SET
        monthly_limit = EXCLUDED.monthly_limit,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    RETURNING true INTO v_limit_created;

    RETURN jsonb_build_object(
        'success', true,
        'account_id', p_account_id,
        'monthly_limit', p_monthly_limit,
        'is_active', p_is_active,
        'credit_account', v_credit_result
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. Function to deactivate an enterprise user
-- ============================================================================
-- Drop existing function first (V2 may have different signature)
DROP FUNCTION IF EXISTS deactivate_enterprise_user(UUID);

CREATE OR REPLACE FUNCTION deactivate_enterprise_user(p_account_id UUID)
RETURNS JSONB AS $$
BEGIN
    UPDATE enterprise_user_limits
    SET is_active = false, updated_at = NOW()
    WHERE account_id = p_account_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found in enterprise_user_limits'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'account_id', p_account_id,
        'is_active', false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. Function to reactivate an enterprise user
-- ============================================================================
-- Drop existing function first (V2 may have different signature)
DROP FUNCTION IF EXISTS reactivate_enterprise_user(UUID);

CREATE OR REPLACE FUNCTION reactivate_enterprise_user(p_account_id UUID)
RETURNS JSONB AS $$
BEGIN
    UPDATE enterprise_user_limits
    SET is_active = true, updated_at = NOW()
    WHERE account_id = p_account_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found in enterprise_user_limits'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'account_id', p_account_id,
        'is_active', true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. Function to update user's monthly limit
-- ============================================================================
-- Drop existing function first (V2 may have different signature)
DROP FUNCTION IF EXISTS update_enterprise_user_limit(UUID, NUMERIC);
DROP FUNCTION IF EXISTS update_enterprise_user_limit(UUID, NUMERIC(10,2));

CREATE OR REPLACE FUNCTION update_enterprise_user_limit(
    p_account_id UUID,
    p_new_limit NUMERIC(10, 2)
) RETURNS JSONB AS $$
DECLARE
    v_old_limit NUMERIC(10, 2);
    v_current_usage NUMERIC(10, 2);
BEGIN
    -- Validate
    IF p_new_limit < 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Limit cannot be negative'
        );
    END IF;

    -- Get current values and update
    UPDATE enterprise_user_limits
    SET monthly_limit = p_new_limit, updated_at = NOW()
    WHERE account_id = p_account_id
    RETURNING monthly_limit, current_month_usage INTO v_old_limit, v_current_usage;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found in enterprise_user_limits'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'account_id', p_account_id,
        'old_limit', v_old_limit,
        'new_limit', p_new_limit,
        'current_usage', v_current_usage,
        'remaining', p_new_limit - v_current_usage
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION ensure_enterprise_user_credit_account(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION provision_enterprise_user(UUID, NUMERIC(10,2), BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION deactivate_enterprise_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reactivate_enterprise_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_enterprise_user_limit(UUID, NUMERIC(10,2)) TO authenticated;
