-- Create customer_requests table for storing user feature requests and bug reports
BEGIN;

-- Create customer requests table
CREATE TABLE IF NOT EXISTS customer_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('feature', 'bug', 'improvement', 'agent', 'other')),
    priority VARCHAR(50) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    linear_issue_id VARCHAR(255),
    linear_issue_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT customer_requests_title_not_empty CHECK (LENGTH(TRIM(title)) > 0),
    CONSTRAINT customer_requests_description_not_empty CHECK (LENGTH(TRIM(description)) > 0)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_customer_requests_account_id ON customer_requests(account_id);
CREATE INDEX IF NOT EXISTS idx_customer_requests_created_at ON customer_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_requests_request_type ON customer_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_customer_requests_priority ON customer_requests(priority);
CREATE INDEX IF NOT EXISTS idx_customer_requests_linear_issue_id ON customer_requests(linear_issue_id);

-- Enable RLS
ALTER TABLE customer_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own requests
CREATE POLICY "Users can view their own customer requests" ON customer_requests
    FOR SELECT USING (
        auth.uid() IN (
            SELECT user_id FROM basejump.account_user WHERE account_id = customer_requests.account_id
        )
    );

-- Users can create their own requests
CREATE POLICY "Users can create customer requests" ON customer_requests
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT user_id FROM basejump.account_user WHERE account_id = customer_requests.account_id
        )
    );

-- Users can update their own requests (only certain fields)
CREATE POLICY "Users can update their own customer requests" ON customer_requests
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT user_id FROM basejump.account_user WHERE account_id = customer_requests.account_id
        )
    );

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_customer_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_customer_requests_updated_at ON customer_requests;
CREATE TRIGGER update_customer_requests_updated_at
    BEFORE UPDATE ON customer_requests
    FOR EACH ROW EXECUTE FUNCTION update_customer_requests_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON customer_requests TO authenticated;

COMMIT;

