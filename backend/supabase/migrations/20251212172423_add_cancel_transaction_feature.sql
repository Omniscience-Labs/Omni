-- Add Cancel Transaction Feature
-- Allows OMNI admins to cancel/delete credit transactions and reverse their effects
BEGIN;

-- =====================================================
-- CREATE CANCEL TRANSACTION FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION public.cancel_enterprise_credit_transaction(
    p_transaction_id UUID
)
RETURNS TABLE(success BOOLEAN, new_balance DECIMAL, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transaction RECORD;
    v_new_balance DECIMAL;
BEGIN
    -- Get the transaction details
    SELECT id, amount, type, created_at
    INTO v_transaction
    FROM enterprise_credit_loads
    WHERE id = p_transaction_id;
    
    -- Check if transaction exists
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0::DECIMAL, 'Transaction not found'::TEXT;
        RETURN;
    END IF;
    
    -- Reverse the transaction based on type
    IF v_transaction.type = 'load' THEN
        -- Reverse a load: subtract from balance and total_loaded
        UPDATE enterprise_billing
        SET credit_balance = credit_balance - v_transaction.amount,
            total_loaded = total_loaded - v_transaction.amount,
            updated_at = NOW()
        WHERE id = '00000000-0000-0000-0000-000000000000'
        RETURNING credit_balance INTO v_new_balance;
        
    ELSIF v_transaction.type = 'negate' THEN
        -- Reverse a negate: add back to balance and subtract from total_adjusted
        UPDATE enterprise_billing
        SET credit_balance = credit_balance + v_transaction.amount,
            total_adjusted = total_adjusted - v_transaction.amount,
            updated_at = NOW()
        WHERE id = '00000000-0000-0000-0000-000000000000'
        RETURNING credit_balance INTO v_new_balance;
    ELSE
        RETURN QUERY SELECT FALSE, 0::DECIMAL, 'Unknown transaction type'::TEXT;
        RETURN;
    END IF;
    
    -- Delete the transaction record
    DELETE FROM enterprise_credit_loads
    WHERE id = p_transaction_id;
    
    RETURN QUERY SELECT TRUE, v_new_balance, 'Transaction cancelled successfully'::TEXT;
END;
$$;

COMMIT;

