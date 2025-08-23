-- Tool Credit System
-- Adds credit tracking for individual tool calls without modifying existing tables/functions

BEGIN;

-- Create tool_costs table to define credit costs per tool
CREATE TABLE IF NOT EXISTS tool_costs (
    tool_name VARCHAR(255) PRIMARY KEY,
    cost_dollars DECIMAL(10, 4) NOT NULL DEFAULT 0 CHECK (cost_dollars >= 0),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance on active tools
CREATE INDEX IF NOT EXISTS idx_tool_costs_active ON tool_costs(is_active) WHERE is_active = true;

-- Initial tool costs (adjust these based on your actual costs)
INSERT INTO tool_costs (tool_name, cost_dollars, description) VALUES 
    -- Browser tools
    ('browser_screenshot', 0.05, 'Take screenshot of webpage'),
    ('navigate_to_url', 0.02, 'Navigate browser to URL'),
    ('click_element', 0.01, 'Click element on page'),
    ('type_text', 0.01, 'Type text in browser'),
    
    -- File operations
    ('upload_file', 0.02, 'Upload file to storage'),
    ('read_file', 0.01, 'Read file contents'),
    ('write_file', 0.02, 'Write file to storage'),
    
    -- API/Search tools
    ('web_search', 0.03, 'Web search query'),
    ('send_email', 0.01, 'Send email via API'),
    ('api_request', 0.10, 'External API request'),
    
    -- Data processing
    ('data_analysis', 0.05, 'Analyze data'),
    ('generate_chart', 0.05, 'Generate visualization'),
    
    -- Default to 0 for tools not in this list
    ON CONFLICT (tool_name) DO NOTHING;

-- Function to check if user can afford a tool
CREATE OR REPLACE FUNCTION public.can_use_tool(
    p_user_id UUID,
    p_tool_name VARCHAR(255)
)
RETURNS TABLE(can_use BOOLEAN, required_cost DECIMAL, current_balance DECIMAL)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    tool_cost DECIMAL;
    user_balance DECIMAL;
BEGIN
    -- Get tool cost
    SELECT cost_dollars INTO tool_cost
    FROM tool_costs
    WHERE tool_name = p_tool_name AND is_active = true;
    
    -- If no cost found or tool is free, allow usage
    IF tool_cost IS NULL OR tool_cost = 0 THEN
        -- Get balance anyway for informational purposes
        SELECT public.get_credit_balance(p_user_id) INTO user_balance;
        RETURN QUERY SELECT true, COALESCE(tool_cost, 0::DECIMAL), user_balance;
        RETURN;
    END IF;
    
    -- Get user balance using existing function
    SELECT public.get_credit_balance(p_user_id) INTO user_balance;
    
    RETURN QUERY SELECT 
        (user_balance >= tool_cost),
        tool_cost,
        user_balance;
END;
$$;

-- Function to charge for tool usage (wraps existing use_credits)
CREATE OR REPLACE FUNCTION public.use_tool_credits(
    p_user_id UUID,
    p_tool_name VARCHAR(255),
    p_thread_id UUID DEFAULT NULL,
    p_message_id UUID DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, cost_charged DECIMAL, new_balance DECIMAL)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    tool_cost DECIMAL;
    credit_success BOOLEAN;
    balance_after DECIMAL;
BEGIN
    -- Get tool cost
    SELECT cost_dollars INTO tool_cost
    FROM tool_costs
    WHERE tool_name = p_tool_name AND is_active = true;
    
    -- If no cost found or free tool, return success
    IF tool_cost IS NULL OR tool_cost = 0 THEN
        SELECT public.get_credit_balance(p_user_id) INTO balance_after;
        RETURN QUERY SELECT true, 0::DECIMAL, balance_after;
        RETURN;
    END IF;
    
    -- Use existing use_credits function
    -- The description format "Tool: {name}" allows us to track tool usage in existing reports
    SELECT public.use_credits(
        p_user_id,
        tool_cost,
        'Tool: ' || p_tool_name,
        p_thread_id,
        p_message_id
    ) INTO credit_success;
    
    -- Get new balance
    SELECT public.get_credit_balance(p_user_id) INTO balance_after;
    
    RETURN QUERY SELECT 
        credit_success, 
        CASE WHEN credit_success THEN tool_cost ELSE 0::DECIMAL END,
        balance_after;
END;
$$;

-- View for tool usage analytics (queries existing credit_usage table)
CREATE OR REPLACE VIEW tool_usage_analytics AS
SELECT 
    cu.user_id,
    cu.thread_id,
    cu.message_id,
    SUBSTRING(cu.description FROM 'Tool: (.+)') as tool_name,
    cu.amount_dollars as cost,
    cu.created_at,
    DATE_TRUNC('day', cu.created_at) as usage_date,
    DATE_TRUNC('hour', cu.created_at) as usage_hour
FROM credit_usage cu
WHERE cu.description LIKE 'Tool: %'
ORDER BY cu.created_at DESC;

-- Grant permissions
GRANT SELECT ON tool_costs TO authenticated, service_role;
GRANT INSERT, UPDATE ON tool_costs TO service_role;
GRANT SELECT ON tool_usage_analytics TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_use_tool TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.use_tool_credits TO service_role;

-- Enable RLS on tool_costs
ALTER TABLE tool_costs ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read tool costs
CREATE POLICY "Anyone can view tool costs" ON tool_costs
    FOR SELECT USING (true);

-- Policy: Only service role can modify tool costs
CREATE POLICY "Service role can manage tool costs" ON tool_costs
    FOR ALL USING (auth.role() = 'service_role');

COMMIT;
