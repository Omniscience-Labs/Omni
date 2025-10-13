-- Apollo Webhooks Migration
-- This migration creates the table for tracking Apollo.io phone number reveal webhooks

BEGIN;

-- Create apollo_webhook_requests table
CREATE TABLE IF NOT EXISTS apollo_webhook_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES threads(thread_id) ON DELETE CASCADE,
    agent_id UUID,
    person_id VARCHAR(255),
    webhook_secret VARCHAR(255) NOT NULL UNIQUE,
    person_data JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    phone_numbers JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    CONSTRAINT apollo_webhook_status_check CHECK (status IN ('pending', 'completed', 'failed', 'timeout'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_apollo_webhooks_thread_id ON apollo_webhook_requests(thread_id);
CREATE INDEX IF NOT EXISTS idx_apollo_webhooks_status ON apollo_webhook_requests(status);
CREATE INDEX IF NOT EXISTS idx_apollo_webhooks_secret ON apollo_webhook_requests(webhook_secret);
CREATE INDEX IF NOT EXISTS idx_apollo_webhooks_created_at ON apollo_webhook_requests(created_at);

-- Add comments for documentation
COMMENT ON TABLE apollo_webhook_requests IS 'Tracks Apollo.io phone number reveal webhook requests';
COMMENT ON COLUMN apollo_webhook_requests.webhook_secret IS 'Unique secret used in webhook URL for security';
COMMENT ON COLUMN apollo_webhook_requests.person_data IS 'Original request data (first_name, last_name, etc.)';
COMMENT ON COLUMN apollo_webhook_requests.phone_numbers IS 'Phone numbers received from Apollo webhook';
COMMENT ON COLUMN apollo_webhook_requests.status IS 'Request status: pending, completed, failed, or timeout';

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.completed_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for completed_at timestamp
DROP TRIGGER IF EXISTS update_apollo_webhook_completed_at ON apollo_webhook_requests;
CREATE TRIGGER update_apollo_webhook_completed_at
    BEFORE UPDATE OF status ON apollo_webhook_requests
    FOR EACH ROW
    WHEN (NEW.status IN ('completed', 'failed', 'timeout') AND OLD.status = 'pending')
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;

