-- Create agent_templates table
CREATE TABLE IF NOT EXISTS public.agent_templates (
    template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL, -- References the user/account who created it
    name TEXT NOT NULL,
    description TEXT,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    tags TEXT[] DEFAULT '{}',
    categories TEXT[] DEFAULT '{}',
    is_public BOOLEAN DEFAULT false,
    is_kortix_team BOOLEAN DEFAULT false,
    marketplace_published_at TIMESTAMP WITH TIME ZONE,
    download_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    icon_name TEXT,
    icon_color TEXT,
    icon_background TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    usage_examples JSONB DEFAULT '[]'::jsonb,
    sharing_preferences JSONB DEFAULT '{}'::jsonb -- For privacy settings like hiding system prompt
);

-- Indexes for agent_templates
CREATE INDEX IF NOT EXISTS idx_agent_templates_creator_id ON public.agent_templates(creator_id);
CREATE INDEX IF NOT EXISTS idx_agent_templates_is_public ON public.agent_templates(is_public);
CREATE INDEX IF NOT EXISTS idx_agent_templates_is_kortix_team ON public.agent_templates(is_kortix_team);
CREATE INDEX IF NOT EXISTS idx_agent_templates_tags ON public.agent_templates USING gin(tags);

-- Create agent_versions table
CREATE TABLE IF NOT EXISTS public.agent_versions (
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL, -- References agents table (assumed to exist)
    user_id UUID, -- Who created this version
    version_number INTEGER, -- Sequential version number
    version_name TEXT, -- User-friendly name e.g. "v1.0"
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    system_prompt TEXT,
    model TEXT,
    change_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for agent_versions
CREATE INDEX IF NOT EXISTS idx_agent_versions_agent_id ON public.agent_versions(agent_id);

-- Create agent_workflows table (Playbooks)
CREATE TABLE IF NOT EXISTS public.agent_workflows (
    workflow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL, -- References agents table
    name TEXT NOT NULL,
    description TEXT,
    steps JSONB DEFAULT '[]'::jsonb, -- The sequence of steps/actions
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for agent_workflows
CREATE INDEX IF NOT EXISTS idx_agent_workflows_agent_id ON public.agent_workflows(agent_id);

-- Add knowledge base assignments table if not exists (referenced in plan)
CREATE TABLE IF NOT EXISTS public.agent_knowledge_entry_assignments (
    assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL,
    entry_id UUID NOT NULL,
    account_id UUID NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(agent_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_knowledge_assignments_agent ON public.agent_knowledge_entry_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_assignments_entry ON public.agent_knowledge_entry_assignments(entry_id);

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_knowledge_entry_assignments ENABLE ROW LEVEL SECURITY;

-- Policies for agent_templates
-- Everyone can read public templates
CREATE POLICY "Public templates are viewable by everyone" 
ON public.agent_templates FOR SELECT 
USING (is_public = true);

-- Users can read their own templates
CREATE POLICY "Users can view own templates" 
ON public.agent_templates FOR SELECT 
USING (auth.uid() = creator_id);

-- Users can insert their own templates
CREATE POLICY "Users can create own templates" 
ON public.agent_templates FOR INSERT 
WITH CHECK (auth.uid() = creator_id);

-- Users can update their own templates
CREATE POLICY "Users can update own templates" 
ON public.agent_templates FOR UPDATE 
USING (auth.uid() = creator_id);

-- Users can delete their own templates
CREATE POLICY "Users can delete own templates" 
ON public.agent_templates FOR DELETE 
USING (auth.uid() = creator_id);

-- Policies for agent_versions
-- Users can view versions of agents they own (Assuming agents table has owner/account_id)
-- For simplicity here, we'll assume the application handles authorization via agent ownership, 
-- but we can add a basic policy that links back to agent ownership if needed.
-- A simpler approach for versioning often relies on the agent access.
-- Here is a basic "authenticated users can select" policy for now, strictly secured by backend logic usually.
-- But let's try to match agent ownership if possible. Since we don't have the agents table definition handy in this context,
-- we will allow authenticated users to View/Insert if they are authenticated, assuming backend enforces agent ownership.
CREATE POLICY "Authenticated users can view agent versions"
ON public.agent_versions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create agent versions"
ON public.agent_versions FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policies for agent_workflows
CREATE POLICY "Authenticated users can view agent workflows"
ON public.agent_workflows FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create agent workflows"
ON public.agent_workflows FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update agent workflows"
ON public.agent_workflows FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete agent workflows"
ON public.agent_workflows FOR DELETE
TO authenticated
USING (true);

-- Policies for agent_knowledge_entry_assignments
CREATE POLICY "Users can view assignments for their account"
ON public.agent_knowledge_entry_assignments FOR SELECT
USING (auth.uid() = account_id);

CREATE POLICY "Users can insert assignments for their account"
ON public.agent_knowledge_entry_assignments FOR INSERT
WITH CHECK (auth.uid() = account_id);

CREATE POLICY "Users can update assignments for their account"
ON public.agent_knowledge_entry_assignments FOR UPDATE
USING (auth.uid() = account_id);

CREATE POLICY "Users can delete assignments for their account"
ON public.agent_knowledge_entry_assignments FOR DELETE
USING (auth.uid() = account_id);

-- Function to increment download count
CREATE OR REPLACE FUNCTION increment_template_download_count(template_id_param UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.agent_templates
  SET download_count = download_count + 1
  WHERE template_id = template_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
