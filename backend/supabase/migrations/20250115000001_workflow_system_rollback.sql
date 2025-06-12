-- -- Rollback migration for workflow system
-- -- This migration removes all workflow system tables and types

-- -- Drop all policies first
-- DROP POLICY IF EXISTS "Users can view workflows in their accounts" ON workflows;
-- DROP POLICY IF EXISTS "Users can create workflows in their accounts" ON workflows;
-- DROP POLICY IF EXISTS "Users can update workflows in their accounts" ON workflows;
-- DROP POLICY IF EXISTS "Users can delete workflows in their accounts" ON workflows;

-- DROP POLICY IF EXISTS "Users can view executions in their accounts" ON workflow_executions;
-- DROP POLICY IF EXISTS "Service role can insert executions" ON workflow_executions;
-- DROP POLICY IF EXISTS "Service role can update executions" ON workflow_executions;

-- DROP POLICY IF EXISTS "Users can view triggers in their workflows" ON triggers;
-- DROP POLICY IF EXISTS "Service role full access to webhook_registrations" ON webhook_registrations;
-- DROP POLICY IF EXISTS "Service role full access to scheduled_jobs" ON scheduled_jobs;

-- DROP POLICY IF EXISTS "Public can view workflow templates" ON workflow_templates;
-- DROP POLICY IF EXISTS "Service role can manage workflow templates" ON workflow_templates;

-- DROP POLICY IF EXISTS "Users can view execution logs in their accounts" ON workflow_execution_logs;
-- DROP POLICY IF EXISTS "Service role can insert execution logs" ON workflow_execution_logs;

-- DROP POLICY IF EXISTS "Users can manage variables for their workflows" ON workflow_variables;

-- -- Drop triggers
-- DROP TRIGGER IF EXISTS update_workflows_updated_at ON workflows;
-- DROP TRIGGER IF EXISTS update_triggers_updated_at ON triggers;
-- DROP TRIGGER IF EXISTS update_scheduled_jobs_updated_at ON scheduled_jobs;
-- DROP TRIGGER IF EXISTS update_workflow_templates_updated_at ON workflow_templates;
-- DROP TRIGGER IF EXISTS update_workflow_variables_updated_at ON workflow_variables;

-- -- Drop functions
-- DROP FUNCTION IF EXISTS cleanup_old_execution_logs(INTEGER);
-- DROP FUNCTION IF EXISTS get_workflow_statistics(UUID);
-- -- Note: Not dropping update_updated_at_column as it's used by other tables

-- -- Drop tables (in reverse order of dependencies)
-- DROP TABLE IF EXISTS workflow_variables CASCADE;
-- DROP TABLE IF EXISTS workflow_execution_logs CASCADE;
-- DROP TABLE IF EXISTS workflow_templates CASCADE;
-- DROP TABLE IF EXISTS scheduled_jobs CASCADE;
-- DROP TABLE IF EXISTS webhook_registrations CASCADE;
-- DROP TABLE IF EXISTS triggers CASCADE;
-- DROP TABLE IF EXISTS workflow_executions CASCADE;
-- DROP TABLE IF EXISTS workflows CASCADE;

-- -- Drop enum types
-- DROP TYPE IF EXISTS connection_type CASCADE;
-- DROP TYPE IF EXISTS node_type CASCADE;
-- DROP TYPE IF EXISTS trigger_type CASCADE;
-- DROP TYPE IF EXISTS execution_status CASCADE;
-- DROP TYPE IF EXISTS workflow_status CASCADE; 