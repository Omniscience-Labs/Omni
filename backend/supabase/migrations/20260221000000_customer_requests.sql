-- Create customer_requests table with Linear integration support
BEGIN;

-- Create customer requests table
CREATE TABLE IF NOT EXISTS customer_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email VARCHAR(255),
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('feature', 'bug', 'improvement', 'agent', 'other')),
    priority VARCHAR(50) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    attachments JSONB DEFAULT '[]'::jsonb,
    environment VARCHAR(255),
    linear_issue_id VARCHAR(255),
    linear_issue_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT customer_requests_title_not_empty CHECK (LENGTH(TRIM(title)) > 0),
    CONSTRAINT customer_requests_description_not_empty CHECK (LENGTH(TRIM(description)) > 0)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_customer_requests_account_id ON customer_requests(account_id);
CREATE INDEX IF NOT EXISTS idx_customer_requests_created_at ON customer_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_requests_request_type ON customer_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_customer_requests_priority ON customer_requests(priority);
CREATE INDEX IF NOT EXISTS idx_customer_requests_linear_issue_id ON customer_requests(linear_issue_id);

-- Enable RLS
ALTER TABLE customer_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users can view their own customer requests" ON customer_requests
    FOR SELECT USING (
        auth.uid() IN (
            SELECT user_id FROM basejump.account_user WHERE account_id = customer_requests.account_id
        )
    );

-- Users can create requests for their accounts
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

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_customer_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger
DROP TRIGGER IF EXISTS update_customer_requests_updated_at ON customer_requests;
CREATE TRIGGER update_customer_requests_updated_at
    BEFORE UPDATE ON customer_requests
    FOR EACH ROW EXECUTE FUNCTION update_customer_requests_updated_at();

-- Permissions
GRANT SELECT, INSERT, UPDATE ON customer_requests TO authenticated;

-- Storage bucket for customer request images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'customer-request-images',
    'customer-request-images',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: public read
DROP POLICY IF EXISTS "Public read access for customer request images" ON storage.objects;
CREATE POLICY "Public read access for customer request images"
ON storage.objects FOR SELECT
USING (bucket_id = 'customer-request-images');

-- Storage RLS: authenticated upload
DROP POLICY IF EXISTS "Authenticated users can upload customer request images" ON storage.objects;
CREATE POLICY "Authenticated users can upload customer request images"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'customer-request-images'
    AND auth.role() = 'authenticated'
);

COMMIT;
