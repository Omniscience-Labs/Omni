CREATE TABLE IF NOT EXISTS public.customer_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES basejump.accounts(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    user_email TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    request_type TEXT NOT NULL,
    priority TEXT NOT NULL,
    attachments TEXT[],
    environment TEXT,
    linear_issue_id TEXT,
    linear_issue_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (safe)
ALTER TABLE public.customer_requests ENABLE ROW LEVEL SECURITY;

-- 🔥 SAFE POLICY CREATION

DROP POLICY IF EXISTS "Users can view their own requests" ON public.customer_requests;
CREATE POLICY "Users can view their own requests"
    ON public.customer_requests
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create requests" ON public.customer_requests;
CREATE POLICY "Users can create requests"
    ON public.customer_requests
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Grants (safe to re-run)
GRANT SELECT, INSERT ON public.customer_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_requests TO service_role;