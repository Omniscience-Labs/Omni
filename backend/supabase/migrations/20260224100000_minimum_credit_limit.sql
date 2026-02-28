-- Update minimum credit limit from $0.01 to $0.03 for enterprise billing check
-- This aligns with MINIMUM_CREDIT_FOR_RUN in backend config

DROP FUNCTION IF EXISTS check_enterprise_billing_status(UUID, NUMERIC);
DROP FUNCTION IF EXISTS check_enterprise_billing_status(UUID, NUMERIC(10,4));
DROP FUNCTION IF EXISTS check_enterprise_billing_status(UUID);

CREATE OR REPLACE FUNCTION check_enterprise_billing_status(
    p_account_id UUID,
    p_estimated_cost NUMERIC(10, 4) DEFAULT 0.03
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
