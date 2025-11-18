-- Migration: Add remove_enterprise_credits function
-- This function allows admins to remove credits from the enterprise credit pool

-- Function to remove credits
CREATE OR REPLACE FUNCTION public.remove_enterprise_credits(
    p_amount DECIMAL,
    p_description TEXT DEFAULT NULL,
    p_performed_by UUID DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance DECIMAL, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_balance DECIMAL;
    v_current_balance DECIMAL;
BEGIN
    -- Get current balance
    SELECT credit_balance INTO v_current_balance
    FROM enterprise_billing
    WHERE id = '00000000-0000-0000-0000-000000000000';
    
    -- Check if sufficient balance exists
    IF v_current_balance < p_amount THEN
        RETURN QUERY SELECT FALSE, v_current_balance, 'Insufficient credits. Current balance is less than amount to remove.'::TEXT;
        RETURN;
    END IF;
    
    -- Remove credits from enterprise account
    UPDATE enterprise_billing
    SET credit_balance = credit_balance - p_amount,
        updated_at = NOW()
    WHERE id = '00000000-0000-0000-0000-000000000000'
    RETURNING credit_balance INTO v_new_balance;
    
    -- Log transaction with negative amount
    INSERT INTO enterprise_credit_loads (amount, description, performed_by)
    VALUES (-p_amount, p_description, p_performed_by);
    
    RETURN QUERY SELECT TRUE, v_new_balance, NULL::TEXT;
END;
$$;

