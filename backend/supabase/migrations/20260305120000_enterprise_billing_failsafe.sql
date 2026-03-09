-- Enterprise billing failsafe
-- Pool threshold: $5 (reject if pool < max(cost, 5))
-- Monthly user threshold: $0.5 (reject if remaining < max(cost, 0.5))
-- -----------------------------------------------------------------------------

-- Seed credit thresholds (used by get_user_monthly_usage_threshold / get_credit_pool_threshold)
INSERT INTO public.enterprise_global_settings (setting_key, setting_value, description)
VALUES (
    'credit_threshold',
    '{"user_monthly_usage_threshold": 0.5, "credit_pool_threshold": 5}',
    'Minimum thresholds: pool balance and user remaining must be >= these values to allow spend'
) ON CONFLICT (setting_key) DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description;

-- -----------------------------------------------------------------------------
-- get_user_monthly_usage_threshold - Min remaining user allowance before reject
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_user_monthly_usage_threshold();
CREATE OR REPLACE FUNCTION public.get_user_monthly_usage_threshold()
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result DECIMAL;
    v_setting_value JSONB;
BEGIN
    SELECT get_enterprise_setting('credit_threshold') INTO v_setting_value;

    IF v_setting_value IS NULL THEN
        RETURN 0.5;
    END IF;

    v_result := (v_setting_value->>'user_monthly_usage_threshold')::DECIMAL;

    IF v_result IS NULL OR v_result < 0 THEN
        RETURN 0.5;
    END IF;

    RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION get_user_monthly_usage_threshold() TO authenticated;

-- -----------------------------------------------------------------------------
-- get_credit_pool_threshold - Min pool balance before reject
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_credit_pool_threshold();
CREATE OR REPLACE FUNCTION public.get_credit_pool_threshold()
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result DECIMAL;
    v_setting_value JSONB;
BEGIN
    SELECT get_enterprise_setting('credit_threshold') INTO v_setting_value;

    IF v_setting_value IS NULL THEN
        RETURN 5.0;
    END IF;

    v_result := (v_setting_value->>'credit_pool_threshold')::DECIMAL;

    IF v_result IS NULL OR v_result < 0 THEN
        RETURN 5.0;
    END IF;

    RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION get_credit_pool_threshold() TO authenticated;

-- -----------------------------------------------------------------------------

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
    v_new_pool NUMERIC(12, 2);
    v_new_user NUMERIC(10, 2);
    v_usage_id UUID;
    v_pool_ok BOOLEAN;
    v_monthly_ok BOOLEAN;
    v_pass BOOLEAN;
    v_pool_threshold NUMERIC(10, 2);
    v_monthly_threshold NUMERIC(10, 2);
BEGIN
    SELECT get_credit_pool_threshold() INTO v_pool_threshold;
    SELECT get_user_monthly_usage_threshold() INTO v_monthly_threshold;

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

    SELECT monthly_limit, current_month_usage, is_active
    INTO v_user_limit, v_user_usage, v_user_is_active
    FROM enterprise_user_limits
    WHERE account_id = p_account_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO enterprise_user_limits (account_id, monthly_limit, current_month_usage, is_active)
        VALUES (p_account_id, 100.00, 0.00, true)
        RETURNING monthly_limit, current_month_usage, is_active
        INTO v_user_limit, v_user_usage, v_user_is_active;
    END IF;

    IF NOT v_user_is_active THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User account is deactivated',
            'error_code', 'USER_DEACTIVATED'
        );
    END IF;

    -- Determine pass/fail and target values (always update both tables)
    v_pool_ok := v_pool_balance >= GREATEST(p_cost, v_pool_threshold);
    v_monthly_ok := (v_user_limit - v_user_usage) >= GREATEST(p_cost, v_monthly_threshold);
    v_pass := v_pool_ok AND v_monthly_ok;

    v_new_pool := CASE
        WHEN v_pass THEN v_pool_balance - p_cost
        WHEN NOT v_pool_ok THEN 0
        ELSE v_pool_balance
    END;
    v_new_user := CASE WHEN v_pass THEN v_user_usage + p_cost ELSE v_user_limit END;

    -- Always update both tables
    UPDATE enterprise_billing
    SET
        credit_balance = v_new_pool,
        total_used = total_used + CASE WHEN v_pass THEN p_cost ELSE 0 END,
        updated_at = NOW()
    WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;

    UPDATE enterprise_user_limits
    SET current_month_usage = v_new_user, updated_at = NOW()
    WHERE account_id = p_account_id;

    -- Always log usage
    INSERT INTO enterprise_usage (
        account_id, thread_id, message_id, cost, model_name,
        tokens_used, prompt_tokens, completion_tokens
    ) VALUES (
        p_account_id, p_thread_id, p_message_id, p_cost, p_model_name,
        p_tokens_used, p_prompt_tokens, p_completion_tokens
    )
    RETURNING id INTO v_usage_id;

    -- Return based on outcome (standard keys)
    IF v_pass THEN
        RETURN jsonb_build_object(
            'success', true,
            'cost', p_cost,
            'usage_id', v_usage_id,
            'pool_balance', v_new_pool,
            'user_monthly_limit', v_user_limit,
            'user_current_usage', v_new_user,
            'user_remaining', v_user_limit - v_new_user
        );
    ELSIF NOT v_pool_ok THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient enterprise credits',
            'error_code', 'INSUFFICIENT_POOL_BALANCE',
            'cost', p_cost,
            'usage_id', v_usage_id,
            'pool_balance', v_pool_balance
        );
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Monthly spending limit exceeded',
            'error_code', 'MONTHLY_LIMIT_EXCEEDED',
            'cost', p_cost,
            'usage_id', v_usage_id,
            'user_monthly_limit', v_user_limit,
            'user_current_usage', v_user_limit,
            'user_remaining', 0
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION use_enterprise_credits_simple(UUID, NUMERIC(10,4), TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- check_enterprise_billing_status - Same thresholds
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS check_enterprise_billing_status(UUID, NUMERIC);
DROP FUNCTION IF EXISTS check_enterprise_billing_status(UUID, NUMERIC(10,4));
DROP FUNCTION IF EXISTS check_enterprise_billing_status(UUID);

CREATE OR REPLACE FUNCTION check_enterprise_billing_status(
    p_account_id UUID,
    p_estimated_cost NUMERIC(10, 4) DEFAULT 0.5
) RETURNS JSONB AS $$
DECLARE
    v_pool_balance NUMERIC(12, 2);
    v_user_limit NUMERIC(10, 2);
    v_user_usage NUMERIC(10, 2);
    v_user_is_active BOOLEAN;
    v_remaining NUMERIC(10, 2);
    v_pool_threshold NUMERIC(10, 2);
    v_monthly_threshold NUMERIC(10, 2);
BEGIN
    SELECT get_credit_pool_threshold() INTO v_pool_threshold;
    SELECT get_user_monthly_usage_threshold() INTO v_monthly_threshold;

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

    IF v_pool_balance < GREATEST(p_estimated_cost, v_pool_threshold) THEN
        RETURN jsonb_build_object(
            'can_spend', false,
            'error', 'Insufficient enterprise credits',
            'error_code', 'INSUFFICIENT_POOL_BALANCE',
            'pool_balance', v_pool_balance
        );
    END IF;

    SELECT monthly_limit, current_month_usage, is_active
    INTO v_user_limit, v_user_usage, v_user_is_active
    FROM enterprise_user_limits
    WHERE account_id = p_account_id;

    IF NOT FOUND THEN
        v_user_limit := 100.00;
        v_user_usage := 0.00;
        v_user_is_active := true;
    END IF;

    IF NOT v_user_is_active THEN
        RETURN jsonb_build_object(
            'can_spend', false,
            'error', 'User account is deactivated',
            'error_code', 'USER_DEACTIVATED'
        );
    END IF;

    v_remaining := v_user_limit - v_user_usage;

    IF v_remaining < GREATEST(p_estimated_cost, v_monthly_threshold) THEN
        RETURN jsonb_build_object(
            'can_spend', false,
            'error', 'Monthly spending limit would be exceeded',
            'error_code', 'MONTHLY_LIMIT_EXCEEDED',
            'user_monthly_limit', v_user_limit,
            'user_current_usage', v_user_usage,
            'user_remaining', v_remaining
        );
    END IF;

    RETURN jsonb_build_object(
        'can_spend', true,
        'pool_balance', v_pool_balance,
        'user_monthly_limit', v_user_limit,
        'user_current_usage', v_user_usage,
        'user_remaining', v_remaining
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_enterprise_billing_status(UUID, NUMERIC(10,4)) TO authenticated;

-- -----------------------------------------------------------------------------
-- Enterprise tool functions - Same thresholds ($5 pool, $0.5 monthly), JSONB return
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS enterprise_can_use_tool(UUID, VARCHAR);

CREATE OR REPLACE FUNCTION public.enterprise_can_use_tool(
    p_account_id UUID,
    p_tool_name VARCHAR(255)
) RETURNS JSONB AS $$
DECLARE
    v_tool_cost DECIMAL;
    v_enterprise_balance DECIMAL;
    v_monthly_limit DECIMAL;
    v_current_usage DECIMAL;
    v_user_remaining DECIMAL;
    v_default_limit DECIMAL;
    v_pool_threshold DECIMAL;
    v_monthly_threshold DECIMAL;
BEGIN
    SELECT get_default_monthly_limit() INTO v_default_limit;
    SELECT get_credit_pool_threshold() INTO v_pool_threshold;
    SELECT get_user_monthly_usage_threshold() INTO v_monthly_threshold;

    SELECT tc.cost INTO v_tool_cost
    FROM tool_costs tc
    WHERE tc.tool_name = p_tool_name AND tc.is_active = TRUE;

    SELECT eb.credit_balance INTO v_enterprise_balance
    FROM enterprise_billing eb
    WHERE eb.id = '00000000-0000-0000-0000-000000000000';

    SELECT eul.monthly_limit, eul.current_month_usage
    INTO v_monthly_limit, v_current_usage
    FROM enterprise_user_limits eul
    WHERE eul.account_id = p_account_id AND eul.is_active = TRUE;

    IF v_monthly_limit IS NULL THEN
        v_monthly_limit := v_default_limit;
        v_current_usage := 0;
    END IF;

    v_user_remaining := v_monthly_limit - v_current_usage;

    IF v_tool_cost IS NULL OR v_tool_cost = 0 THEN
        RETURN jsonb_build_object(
            'can_spend', true,
            'total_cost', COALESCE(v_tool_cost, 0),
            'pool_balance', v_enterprise_balance,
            'user_monthly_limit', v_monthly_limit,
            'user_current_usage', v_current_usage,
            'user_remaining', v_user_remaining
        );
    END IF;

    IF v_user_remaining < GREATEST(v_tool_cost, v_monthly_threshold) THEN
        RETURN jsonb_build_object(
            'can_spend', false,
            'error', 'Monthly spending limit exceeded',
            'error_code', 'MONTHLY_LIMIT_EXCEEDED',
            'total_cost', v_tool_cost,
            'user_monthly_limit', v_monthly_limit,
            'user_current_usage', v_current_usage,
            'user_remaining', v_user_remaining
        );
    END IF;

    IF v_enterprise_balance < GREATEST(v_tool_cost, v_pool_threshold) THEN
        RETURN jsonb_build_object(
            'can_spend', false,
            'error', 'Insufficient enterprise credits',
            'error_code', 'INSUFFICIENT_POOL_BALANCE',
            'total_cost', v_tool_cost,
            'pool_balance', v_enterprise_balance
        );
    END IF;

    RETURN jsonb_build_object(
        'can_spend', true,
        'total_cost', v_tool_cost,
        'pool_balance', v_enterprise_balance,
        'user_monthly_limit', v_monthly_limit,
        'user_current_usage', v_current_usage,
        'user_remaining', v_user_remaining
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION enterprise_can_use_tool(UUID, VARCHAR) TO authenticated;

DROP FUNCTION IF EXISTS enterprise_use_tool_credits(UUID, VARCHAR, TEXT, TEXT);
DROP FUNCTION IF EXISTS enterprise_use_tool_credits(UUID, VARCHAR, UUID, UUID);

CREATE OR REPLACE FUNCTION public.enterprise_use_tool_credits(
    p_account_id UUID,
    p_tool_name VARCHAR(255),
    p_thread_id TEXT DEFAULT NULL,
    p_message_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_tool_cost DECIMAL;
    v_current_balance DECIMAL;
    v_monthly_limit DECIMAL;
    v_current_usage DECIMAL;
    v_new_pool DECIMAL;
    v_new_user DECIMAL;
    v_usage_id UUID;
    v_user_remaining DECIMAL;
    v_default_limit DECIMAL;
    v_pool_threshold DECIMAL;
    v_monthly_threshold DECIMAL;
    v_pool_ok BOOLEAN;
    v_monthly_ok BOOLEAN;
    v_pass BOOLEAN;
BEGIN
    SELECT get_default_monthly_limit() INTO v_default_limit;
    SELECT get_credit_pool_threshold() INTO v_pool_threshold;
    SELECT get_user_monthly_usage_threshold() INTO v_monthly_threshold;

    SELECT tc.cost INTO v_tool_cost
    FROM tool_costs tc
    WHERE tc.tool_name = p_tool_name AND tc.is_active = TRUE;

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

        RETURN jsonb_build_object(
            'success', true,
            'total_cost', 0,
            'pool_balance', v_current_balance,
            'user_monthly_limit', v_monthly_limit,
            'user_current_usage', v_current_usage,
            'user_remaining', v_user_remaining
        );
    END IF;

    SELECT eb.credit_balance INTO v_current_balance
    FROM enterprise_billing eb
    WHERE eb.id = '00000000-0000-0000-0000-000000000000'
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Enterprise billing not initialized',
            'error_code', 'ENTERPRISE_NOT_INITIALIZED'
        );
    END IF;

    SELECT eul.monthly_limit, eul.current_month_usage
    INTO v_monthly_limit, v_current_usage
    FROM enterprise_user_limits eul
    WHERE eul.account_id = p_account_id AND eul.is_active = TRUE
    FOR UPDATE;

    IF v_monthly_limit IS NULL THEN
        INSERT INTO enterprise_user_limits (account_id)
        VALUES (p_account_id)
        ON CONFLICT (account_id) DO UPDATE SET is_active = TRUE;

        v_monthly_limit := v_default_limit;
        v_current_usage := 0;
    END IF;

    v_user_remaining := v_monthly_limit - v_current_usage;

    -- Determine pass/fail and target values (always update both tables)
    v_pool_ok := v_current_balance >= GREATEST(v_tool_cost, v_pool_threshold);
    v_monthly_ok := v_user_remaining >= GREATEST(v_tool_cost, v_monthly_threshold);
    v_pass := v_pool_ok AND v_monthly_ok;

    v_new_pool := CASE
        WHEN v_pass THEN v_current_balance - v_tool_cost
        WHEN NOT v_pool_ok THEN 0
        ELSE v_current_balance
    END;
    v_new_user := CASE WHEN v_pass THEN v_current_usage + v_tool_cost ELSE v_monthly_limit END;

    UPDATE enterprise_billing
    SET
        credit_balance = v_new_pool,
        total_used = total_used + CASE WHEN v_pass THEN v_tool_cost ELSE 0 END,
        updated_at = NOW()
    WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;

    UPDATE enterprise_user_limits
    SET current_month_usage = v_new_user, updated_at = NOW()
    WHERE account_id = p_account_id;

    -- Log usage
    INSERT INTO enterprise_usage (
        account_id, thread_id, message_id, cost, tool_name, tool_cost, usage_type, model_name
    ) VALUES (
        p_account_id, p_thread_id, p_message_id, v_tool_cost, p_tool_name, v_tool_cost, 'tool', NULL
    ) RETURNING id INTO v_usage_id;

    -- Return based on outcome (standard keys)
    IF v_pass THEN
        RETURN jsonb_build_object(
            'success', true,
            'total_cost', v_tool_cost,
            'usage_id', v_usage_id,
            'pool_balance', v_new_pool,
            'user_monthly_limit', v_monthly_limit,
            'user_current_usage', v_new_user,
            'user_remaining', v_monthly_limit - v_new_user
        );
    ELSIF NOT v_pool_ok THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient enterprise credits',
            'error_code', 'INSUFFICIENT_POOL_BALANCE',
            'total_cost', v_tool_cost,
            'usage_id', v_usage_id,
            'pool_balance', v_current_balance
        );
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Monthly spending limit exceeded',
            'error_code', 'MONTHLY_LIMIT_EXCEEDED',
            'total_cost', v_tool_cost,
            'usage_id', v_usage_id,
            'user_monthly_limit', v_monthly_limit,
            'user_current_usage', v_monthly_limit,
            'user_remaining', 0
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION enterprise_use_tool_credits(UUID, VARCHAR, TEXT, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS enterprise_can_use_tools_batch(UUID, VARCHAR[]);

CREATE OR REPLACE FUNCTION public.enterprise_can_use_tools_batch(
    p_account_id UUID,
    p_tool_names VARCHAR[]
) RETURNS JSONB AS $$
DECLARE
    v_total_cost DECIMAL := 0;
    v_enterprise_balance DECIMAL;
    v_monthly_limit DECIMAL;
    v_current_usage DECIMAL;
    v_user_remaining DECIMAL;
    v_default_limit DECIMAL;
    v_pool_threshold DECIMAL;
    v_monthly_threshold DECIMAL;
BEGIN
    SELECT get_default_monthly_limit() INTO v_default_limit;
    SELECT get_credit_pool_threshold() INTO v_pool_threshold;
    SELECT get_user_monthly_usage_threshold() INTO v_monthly_threshold;

    SELECT COALESCE(SUM(tc.cost), 0)
    INTO v_total_cost
    FROM unnest(p_tool_names) AS requested(name)
    JOIN tool_costs tc ON tc.tool_name = requested.name AND tc.is_active = TRUE;

    SELECT eul.monthly_limit, eul.current_month_usage
    INTO v_monthly_limit, v_current_usage
    FROM enterprise_user_limits eul
    WHERE eul.account_id = p_account_id AND eul.is_active = TRUE;

    IF v_monthly_limit IS NULL THEN
        v_monthly_limit := v_default_limit;
        v_current_usage := 0;
    END IF;

    v_user_remaining := v_monthly_limit - v_current_usage;

    SELECT eb.credit_balance INTO v_enterprise_balance
    FROM enterprise_billing eb
    WHERE eb.id = '00000000-0000-0000-0000-000000000000';

    IF v_total_cost = 0 THEN
        RETURN jsonb_build_object(
            'can_spend', true,
            'total_cost', v_total_cost,
            'pool_balance', v_enterprise_balance,
            'user_monthly_limit', v_monthly_limit,
            'user_current_usage', v_current_usage,
            'user_remaining', v_user_remaining
        );
    END IF;

    IF v_user_remaining < GREATEST(v_total_cost, v_monthly_threshold) THEN
        RETURN jsonb_build_object(
            'can_spend', false,
            'error', 'Monthly spending limit exceeded',
            'error_code', 'MONTHLY_LIMIT_EXCEEDED',
            'total_cost', v_total_cost,
            'user_monthly_limit', v_monthly_limit,
            'user_current_usage', v_current_usage,
            'user_remaining', v_user_remaining
        );
    END IF;

    IF v_enterprise_balance < GREATEST(v_total_cost, v_pool_threshold) THEN
        RETURN jsonb_build_object(
            'can_spend', false,
            'error', 'Insufficient enterprise credits',
            'error_code', 'INSUFFICIENT_POOL_BALANCE',
            'total_cost', v_total_cost,
            'pool_balance', v_enterprise_balance
        );
    END IF;

    RETURN jsonb_build_object(
        'can_spend', true,
        'total_cost', v_total_cost,
        'pool_balance', v_enterprise_balance,
        'user_monthly_limit', v_monthly_limit,
        'user_current_usage', v_current_usage,
        'user_remaining', v_user_remaining
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION enterprise_can_use_tools_batch(UUID, VARCHAR[]) TO authenticated;
