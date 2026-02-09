-- Create agents table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.agents (
    agent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,
    current_version_id UUID,
    name TEXT NOT NULL,
    description TEXT,
    icon_name TEXT DEFAULT 'bot',
    icon_color TEXT DEFAULT '#000000',
    icon_background TEXT DEFAULT '#F3F4F6',
    is_default BOOLEAN DEFAULT false,
    version_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add index on account_id
CREATE INDEX IF NOT EXISTS idx_agents_account_id ON public.agents(account_id);

-- Fix agent_versions table schema
-- We add columns if they don't exist to match the backend code expectations
DO $$
BEGIN
    -- configured_mcps
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_versions' AND column_name = 'configured_mcps') THEN
        ALTER TABLE public.agent_versions ADD COLUMN configured_mcps JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- custom_mcps
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_versions' AND column_name = 'custom_mcps') THEN
        ALTER TABLE public.agent_versions ADD COLUMN custom_mcps JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- agentpress_tools
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_versions' AND column_name = 'agentpress_tools') THEN
        ALTER TABLE public.agent_versions ADD COLUMN agentpress_tools JSONB DEFAULT '{}'::jsonb;
    END IF;

    -- is_active
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_versions' AND column_name = 'is_active') THEN
        ALTER TABLE public.agent_versions ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
    
     -- created_by
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_versions' AND column_name = 'created_by') THEN
        ALTER TABLE public.agent_versions ADD COLUMN created_by UUID;
    END IF;
    
     -- updated_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_versions' AND column_name = 'updated_at') THEN
         ALTER TABLE public.agent_versions ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
    END IF;

END $$;

-- Enable RLS on agents
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Agents Policies
CREATE POLICY "Users can view own agents" 
ON public.agents FOR SELECT 
USING (auth.uid() = account_id);

CREATE POLICY "Users can insert own agents" 
ON public.agents FOR INSERT 
WITH CHECK (auth.uid() = account_id);

CREATE POLICY "Users can update own agents" 
ON public.agents FOR UPDATE 
USING (auth.uid() = account_id);

CREATE POLICY "Users can delete own agents" 
ON public.agents FOR DELETE 
USING (auth.uid() = account_id);
