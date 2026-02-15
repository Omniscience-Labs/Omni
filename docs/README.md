# Omni Documentation

This directory contains technical documentation for the Omni platform.

## Database Documentation

### [LlamaCloud Database](./database/LLAMACLOUD_DATABASE.md)
Comprehensive documentation for the LlamaCloud knowledge base database schema, including:
- Database schema and ERD
- Table definitions and constraints
- Database functions and stored procedures
- Row Level Security (RLS) policies
- Migration guide
- Query examples and best practices
- API integration examples

## Quick Links

### Database
- **Tables**: Global knowledge bases, agent assignments, folder structure
- **Functions**: Query helpers for KBs, assignments, and unified views
- **Security**: RLS policies for multi-tenant isolation
- **Performance**: Indexes and optimization strategies

## Getting Started

1. Review the [LlamaCloud Database Documentation](./database/LLAMACLOUD_DATABASE.md)
2. Check the migrations in `backend/supabase/migrations/`
3. Explore the database functions for querying data
4. Follow best practices for query optimization

## Related Resources

- Migrations: `backend/supabase/migrations/`
- Configuration: `backend/supabase/config.toml`
- Frontend KB hooks: `frontend/src/hooks/react-query/llamacloud-knowledge-base/`
- Backend config: `backend/core/utils/config.py`
