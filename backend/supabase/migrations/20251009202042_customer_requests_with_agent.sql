-- Drop and recreate customer_requests table with agent request type
BEGIN;

-- Drop the table if it exists (this will cascade to drop policies, triggers, and indexes)
DROP TABLE IF EXISTS customer_requests CASCADE;

-- Drop the trigger function if it still exists
DROP FUNCTION IF EXISTS update_customer_requests_updated_at() CASCADE;

-- Create customer requests table with agent type included
CREATE TABLE customer_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email VARCHAR(255),
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('feature', 'bug', 'improvement', 'agent', 'other')),
    priority VARCHAR(50) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    attachments JSONB DEFAULT '[]'::jsonb,
    environment VARCHAR(50),
    linear_issue_id VARCHAR(255),
    linear_issue_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT customer_requests_title_not_empty CHECK (LENGTH(TRIM(title)) > 0),
    CONSTRAINT customer_requests_description_not_empty CHECK (LENGTH(TRIM(description)) > 0)
);

-- Create indexes for better query performance
CREATE INDEX idx_customer_requests_account_id ON customer_requests(account_id);
CREATE INDEX idx_customer_requests_created_at ON customer_requests(created_at DESC);
CREATE INDEX idx_customer_requests_request_type ON customer_requests(request_type);
CREATE INDEX idx_customer_requests_priority ON customer_requests(priority);
CREATE INDEX idx_customer_requests_linear_issue_id ON customer_requests(linear_issue_id);

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

-- Users can update their own requests
CREATE POLICY "Users can update their own customer requests" ON customer_requests
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT user_id FROM basejump.account_user WHERE account_id = customer_requests.account_id
        )
    );

-- Create trigger function for updated_at
CREATE FUNCTION update_customer_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger
CREATE TRIGGER update_customer_requests_updated_at
    BEFORE UPDATE ON customer_requests
    FOR EACH ROW EXECUTE FUNCTION update_customer_requests_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON customer_requests TO authenticated;

COMMIT;

