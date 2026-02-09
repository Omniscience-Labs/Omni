
-- Create customer_requests table
CREATE TABLE IF NOT EXISTS public.customer_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES basejump.accounts(id),
    user_id UUID REFERENCES auth.users(id),
    user_email TEXT,
    title TEXT NOT NULL,
    description TEXT,
    request_type TEXT NOT NULL,
    priority TEXT,
    attachments TEXT[],
    linear_issue_id TEXT,
    linear_issue_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.customer_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to insert their own requests
CREATE POLICY "Users can insert their own requests" 
ON public.customer_requests 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- Policy: Allow users to view their own requests
CREATE POLICY "Users can view their own requests" 
ON public.customer_requests 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON public.customer_requests TO postgres;
GRANT ALL ON public.customer_requests TO service_role;
GRANT SELECT, INSERT ON public.customer_requests TO authenticated;
