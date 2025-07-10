-- Fix Agent Workflows Migration Issues
-- This migration fixes foreign key references and RLS policies

-- Drop existing foreign key constraints that reference the wrong column
ALTER TABLE agent_workflows DROP CONSTRAINT IF EXISTS agent_workflows_agent_id_fkey;
ALTER TABLE workflow_executions DROP CONSTRAINT IF EXISTS workflow_executions_agent_id_fkey;

-- Add correct foreign key constraints
ALTER TABLE agent_workflows 
ADD CONSTRAINT agent_workflows_agent_id_fkey 
FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE;

ALTER TABLE workflow_executions 
ADD CONSTRAINT workflow_executions_agent_id_fkey 
FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE;

-- Drop existing RLS policies
DROP POLICY IF EXISTS "Users can view workflows for their agents" ON agent_workflows;
DROP POLICY IF EXISTS "Users can create workflows for their agents" ON agent_workflows;
DROP POLICY IF EXISTS "Users can update workflows for their agents" ON agent_workflows;
DROP POLICY IF EXISTS "Users can delete workflows for their agents" ON agent_workflows;
DROP POLICY IF EXISTS "Users can view steps for their workflows" ON workflow_steps;
DROP POLICY IF EXISTS "Users can manage steps for their workflows" ON workflow_steps;
DROP POLICY IF EXISTS "Users can view executions for their workflows" ON workflow_executions;
DROP POLICY IF EXISTS "Users can view step executions for their workflows" ON workflow_step_executions;

-- Create correct RLS policies
CREATE POLICY "Users can view workflows for their agents" ON agent_workflows
    FOR SELECT USING (
        agent_id IN (
            SELECT agent_id FROM agents 
            WHERE basejump.has_role_on_account(account_id)
        )
    );

CREATE POLICY "Users can create workflows for their agents" ON agent_workflows
    FOR INSERT WITH CHECK (
        agent_id IN (
            SELECT agent_id FROM agents 
            WHERE basejump.has_role_on_account(account_id)
        )
    );

CREATE POLICY "Users can update workflows for their agents" ON agent_workflows
    FOR UPDATE USING (
        agent_id IN (
            SELECT agent_id FROM agents 
            WHERE basejump.has_role_on_account(account_id)
        )
    );

CREATE POLICY "Users can delete workflows for their agents" ON agent_workflows
    FOR DELETE USING (
        agent_id IN (
            SELECT agent_id FROM agents 
            WHERE basejump.has_role_on_account(account_id)
        )
    );

CREATE POLICY "Users can view steps for their workflows" ON workflow_steps
    FOR SELECT USING (
        workflow_id IN (
            SELECT id FROM agent_workflows 
            WHERE agent_id IN (
                SELECT agent_id FROM agents 
                WHERE basejump.has_role_on_account(account_id)
            )
        )
    );

CREATE POLICY "Users can manage steps for their workflows" ON workflow_steps
    FOR ALL USING (
        workflow_id IN (
            SELECT id FROM agent_workflows 
            WHERE agent_id IN (
                SELECT agent_id FROM agents 
                WHERE basejump.has_role_on_account(account_id)
            )
        )
    );

CREATE POLICY "Users can view executions for their workflows" ON workflow_executions
    FOR SELECT USING (
        workflow_id IN (
            SELECT id FROM agent_workflows 
            WHERE agent_id IN (
                SELECT agent_id FROM agents 
                WHERE basejump.has_role_on_account(account_id)
            )
        )
    );

CREATE POLICY "Users can view step executions for their workflows" ON workflow_step_executions
    FOR SELECT USING (
        execution_id IN (
            SELECT id FROM workflow_executions
            WHERE workflow_id IN (
                SELECT id FROM agent_workflows 
                WHERE agent_id IN (
                    SELECT agent_id FROM agents 
                    WHERE basejump.has_role_on_account(account_id)
                )
            )
        )
    );

-- Create missing function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add missing triggers if they don't exist
DROP TRIGGER IF EXISTS update_agent_workflows_updated_at ON agent_workflows;
CREATE TRIGGER update_agent_workflows_updated_at 
    BEFORE UPDATE ON agent_workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_steps_updated_at ON workflow_steps;
CREATE TRIGGER update_workflow_steps_updated_at 
    BEFORE UPDATE ON workflow_steps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 