# Workflow System Migration Guide

## Overview

This guide explains how to apply the database migrations for the new workflow system.

## Prerequisites

- Supabase CLI installed
- Access to your Supabase project
- Database backup (recommended)

## Migration Files

1. **`20250115000000_workflow_system.sql`** - Main migration that creates all workflow tables
2. **`20250115000001_workflow_system_rollback.sql`** - Rollback migration (if needed)

## Tables Created

The migration creates the following tables:

### Core Tables
- `workflows` - Workflow definitions and configurations
- `workflow_executions` - Execution history and status
- `triggers` - Trigger configurations
- `webhook_registrations` - Webhook endpoints
- `scheduled_jobs` - Cron-based schedules
- `workflow_templates` - Pre-built templates
- `workflow_execution_logs` - Detailed execution logs
- `workflow_variables` - Workflow-specific variables

### Enum Types
- `workflow_status` - draft, active, paused, disabled, archived
- `execution_status` - pending, running, completed, failed, cancelled, timeout
- `trigger_type` - webhook, schedule, event, polling, manual, workflow
- `node_type` - trigger, agent, tool, condition, loop, parallel, etc.
- `connection_type` - data, tool, processed_data, action, condition

## Applying the Migration

### Local Development

```bash
# Navigate to your backend directory
cd backend

# Apply the migration locally
supabase migration up

# Or apply specific migration
supabase db push --file supabase/migrations/20250115000000_workflow_system.sql
```

### Production

```bash
# Link to your production project
supabase link --project-ref your-project-ref

# Apply migrations to production
supabase db push
```

## Verification

After applying the migration, verify the tables were created:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'workflow%';

-- Check enum types
SELECT typname 
FROM pg_type 
WHERE typname IN ('workflow_status', 'execution_status', 'trigger_type', 'node_type', 'connection_type');
```

## Row Level Security (RLS)

The migration includes RLS policies that ensure:

1. Users can only access workflows in their projects
2. Service role has full access for system operations
3. Workflow templates are publicly viewable
4. Execution logs are project-scoped

## Post-Migration Steps

### 1. Update Environment Variables

Add these to your `.env` file:

```env
# Workflow system configuration
WORKFLOW_EXECUTION_TIMEOUT=3600
WORKFLOW_MAX_RETRIES=3
WEBHOOK_BASE_URL=https://api.yourdomain.com
```

### 2. Initialize Workflow Engine

The workflow engine needs to be initialized on API startup:

```python
# In your api.py
from workflow_engine.api import initialize as init_workflow_engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ... existing initialization
    
    # Initialize workflow engine
    await init_workflow_engine()
    
    yield
    # ... cleanup
```

### 3. Add API Routes

Include the workflow API routes:

```python
# In your api.py
from workflow_engine import api as workflow_api

app.include_router(workflow_api.router, prefix="/api")
```

### 4. Update Docker Compose

Add workflow worker service:

```yaml
# In docker-compose.yml
workflow-worker:
  build: .
  command: python -m workflow_engine.worker
  environment:
    - DATABASE_URL=${DATABASE_URL}
    - REDIS_URL=${REDIS_URL}
  depends_on:
    - postgres
    - redis
    - rabbitmq
```

## Rollback Instructions

If you need to rollback the migration:

```bash
# Apply the rollback migration
supabase db push --file supabase/migrations/20250115000001_workflow_system_rollback.sql
```

**Warning**: This will delete all workflow data. Make sure to backup any important data first.

## Troubleshooting

### Common Issues

1. **Foreign key constraints fail**
   - Ensure the `projects` and `project_members` tables exist
   - Check that `auth.users` is accessible

2. **Enum type already exists**
   - Drop the existing type: `DROP TYPE IF EXISTS workflow_status CASCADE;`

3. **Permission denied**
   - Ensure you're using the service role key for migrations

### Checking Migration Status

```sql
-- View applied migrations
SELECT * FROM supabase_migrations.schema_migrations;

-- Check for any failed migrations
SELECT * FROM supabase_migrations.schema_migrations WHERE success = false;
```

## Performance Considerations

The migration includes several indexes for optimal performance:

- Workflow lookups by project_id
- Execution queries by status and time
- Webhook path lookups
- Scheduled job next run times

Monitor query performance and add additional indexes as needed.

## Security Notes

1. All tables have RLS enabled
2. Webhook secrets are stored encrypted
3. Workflow variables can be marked as secrets
4. API authentication required for all operations

## Next Steps

After successful migration:

1. Test workflow creation via API
2. Verify webhook endpoints are accessible
3. Test scheduled job creation
4. Monitor execution performance
5. Set up cleanup jobs for old execution logs 