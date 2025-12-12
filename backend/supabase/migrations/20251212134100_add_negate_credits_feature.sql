-- Add Negative Credit Adjustment Feature
-- Allows enterprise credits to go negative (accounting only)
-- Adds negate/adjust credits functionality for OMNI admins
BEGIN;

-- =====================================================
-- 1. MODIFY ENTERPRISE_BILLING TABLE
-- =====================================================

-- Remove CHECK constraint preventing negative balances
ALTER TABLE public.enterprise_billing
    DROP CONSTRAINT IF EXISTS enterprise_billing_credit_balance_check;

-- Add total_adjusted column to track negated credits
ALTER TABLE public.enterprise_billing
    ADD COLUMN IF NOT EXISTS total_adjusted DECIMAL(12, 4) NOT NULL DEFAULT 0;

-- =====================================================
-- 2. MODIFY ENTERPRISE_CREDIT_LOADS TABLE
-- =====================================================

-- Add type column to distinguish between 'load' and 'negate' transactions
ALTER TABLE public.enterprise_credit_loads
    ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'load' CHECK (type IN ('load', 'negate'));

-- Update existing records to have type 'load'
UPDATE public.enterprise_credit_loads
SET type = 'load'
WHERE type IS NULL;

-- =====================================================
-- 3. CREATE NEGATE ENTERPRISE CREDITS FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION public.negate_enterprise_credits(
    p_amount DECIMAL,
    p_description TEXT DEFAULT NULL,
    p_performed_by UUID DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance DECIMAL)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_balance DECIMAL;
BEGIN
    -- Subtract credits from enterprise account (allows negative)
    UPDATE enterprise_billing
    SET credit_balance = credit_balance - p_amount,
        total_adjusted = total_adjusted + p_amount,
        updated_at = NOW()
    WHERE id = '00000000-0000-0000-0000-000000000000'
    RETURNING credit_balance INTO v_new_balance;
    
    -- Log transaction with type 'negate'
    INSERT INTO enterprise_credit_loads (amount, description, performed_by, type)
    VALUES (p_amount, p_description, p_performed_by, 'negate');
    
    RETURN QUERY SELECT TRUE, v_new_balance;
END;
$$;

-- =====================================================
-- 4. UPDATE USE_ENTERPRISE_CREDITS_SIMPLE FUNCTION
-- =====================================================

-- Remove balance check that blocks usage when balance is insufficient
-- Enterprise credits are accounting only - usage is controlled by per-user limits
CREATE OR REPLACE FUNCTION public.use_enterprise_credits_simple(
    p_account_id UUID,
    p_amount DECIMAL,
    p_thread_id UUID DEFAULT NULL,
    p_message_id UUID DEFAULT NULL,
    p_model_name VARCHAR DEFAULT NULL,
    p_tokens_used INTEGER DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance DECIMAL, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_balance DECIMAL;
    v_monthly_limit DECIMAL;
    v_current_usage DECIMAL;
BEGIN
    -- Get user's monthly limit and usage
    SELECT monthly_limit, current_month_usage
    INTO v_monthly_limit, v_current_usage
    FROM enterprise_user_limits
    WHERE account_id = p_account_id AND is_active = TRUE;
    
    -- If no limit set, create default
    IF v_monthly_limit IS NULL THEN
        INSERT INTO enterprise_user_limits (account_id)
        VALUES (p_account_id)
        ON CONFLICT (account_id) DO UPDATE SET is_active = TRUE;
        
        v_monthly_limit := 100.00;
        v_current_usage := 0;
    END IF;
    
    -- Check monthly limit (ONLY enforcement - enterprise balance is accounting only)
    IF v_current_usage + p_amount > v_monthly_limit THEN
        RETURN QUERY SELECT FALSE, 0::DECIMAL, 'Monthly spend limit exceeded'::TEXT;
        RETURN;
    END IF;
    
    -- Get enterprise balance (for accounting only, not blocking)
    SELECT credit_balance INTO v_current_balance
    FROM enterprise_billing
    WHERE id = '00000000-0000-0000-0000-000000000000';
    
    -- Deduct from enterprise balance (allows negative - accounting only)
    UPDATE enterprise_billing
    SET credit_balance = credit_balance - p_amount,
        total_used = total_used + p_amount,
        updated_at = NOW()
    WHERE id = '00000000-0000-0000-0000-000000000000';
    
    -- Update user's monthly usage
    UPDATE enterprise_user_limits
    SET current_month_usage = current_month_usage + p_amount,
        updated_at = NOW()
    WHERE account_id = p_account_id;
    
    -- Log usage
    INSERT INTO enterprise_usage (
        account_id, thread_id, message_id, cost, model_name, tokens_used
    ) VALUES (
        p_account_id, p_thread_id, p_message_id, p_amount, p_model_name, p_tokens_used
    );
    
    -- Return success with new balance (may be negative)
    SELECT credit_balance INTO v_current_balance
    FROM enterprise_billing
    WHERE id = '00000000-0000-0000-0000-000000000000';
    
    RETURN QUERY SELECT TRUE, v_current_balance, 'Success'::TEXT;
END;
$$;

COMMIT;

