# LlamaCloud Backend Integration - Implementation Guide

## Overview

This document provides a complete implementation guide for the LlamaCloud backend support in Omni. The implementation enables AI agents to search through external knowledge bases hosted on LlamaCloud, providing a powerful way to augment agent capabilities with domain-specific knowledge.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     FastAPI Backend                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Knowledge Base API (/knowledge-base/)              │   │
│  │  - Global LlamaCloud KB Endpoints                   │   │
│  │  - Agent Assignment Endpoints                       │   │
│  │  - Folder Management                                │   │
│  │  - Test Search Endpoint                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Knowledge Search Tool                              │   │
│  │  - Dynamic method creation                          │   │
│  │  - LlamaCloud SDK integration                       │   │
│  │  - Search execution                                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Configuration Helper                               │   │
│  │  - Agent config enrichment                          │   │
│  │  - KB retrieval and merging                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
                ┌──────────────────────┐
                │   LlamaCloud API     │
                │  (External Service)  │
                └──────────────────────┘
```

## Implementation Files

### 1. Database Migration
**File**: `backend/supabase/migrations/20260212000000_llamacloud_knowledge_base.sql`

Creates the following tables:
- `llamacloud_knowledge_bases`: Stores global LlamaCloud KB configurations
- `agent_llamacloud_kb_assignments`: Manages agent-to-KB assignments

Key features:
- RLS policies for multi-tenant security
- Database functions for efficient queries
- Support for folder organization
- Unified API for both files and cloud KBs

### 2. Knowledge Search Tool
**File**: `backend/core/tools/knowledge_search_tool.py`

A dynamic tool that creates search functions for each configured knowledge base:

```python
# Example: If KB named "product-docs" exists, creates method:
async def search_product_docs(query: str) -> ToolResult:
    # Searches the LlamaCloud index
    pass
```

Features:
- Hybrid search (dense + sparse retrieval)
- Automatic result reranking
- Configurable top-k results
- Error handling and logging

### 3. API Endpoints
**File**: `backend/core/knowledge_base/api.py`

New endpoints added:
- `GET /knowledge-base/llamacloud` - List all global LlamaCloud KBs
- `POST /knowledge-base/llamacloud` - Create new KB
- `PUT /knowledge-base/llamacloud/{kb_id}` - Update KB
- `DELETE /knowledge-base/llamacloud/{kb_id}` - Delete KB
- `PUT /knowledge-base/llamacloud/{kb_id}/move` - Move to folder
- `GET /knowledge-base/agents/{agent_id}/assignments/unified` - Get assignments
- `POST /knowledge-base/agents/{agent_id}/assignments/unified` - Update assignments
- `GET /knowledge-base/agents/{agent_id}/unified` - Get unified KB view
- `POST /knowledge-base/llamacloud/agents/{agent_id}/test-search` - Test search
- `GET /knowledge-base/llamacloud/root` - Get root level KBs

### 4. Configuration Helper
**File**: `backend/core/config_helper.py`

New functions:
- `get_agent_llamacloud_knowledge_bases(agent_id)` - Fetch agent's KBs
- `enrich_agent_config_with_llamacloud_kb(config)` - Add KBs to agent config

### 5. Tool Registration
**File**: `backend/core/run.py`

Updated `setup_tools()` method to:
1. Check for LlamaCloud KBs in agent config
2. Register Knowledge Search Tool if KBs exist
3. Create dynamic search methods for each KB

**File**: `backend/run_agent_background.py`

Added config enrichment before agent execution:
```python
agent_config = await load_agent_config(agent_id, account_id)
agent_config = await enrich_agent_config_with_llamacloud_kb(agent_config)
```

## Environment Configuration

### Required Environment Variables

Add to your `.env` file:

```bash
# LlamaCloud Integration (Optional)
LLAMA_CLOUD_API_KEY=llx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LLAMA_CLOUD_PROJECT_NAME=Default  # Must match your LlamaCloud project
```

### Getting Your API Key

1. Sign up at [LlamaCloud](https://cloud.llamaindex.ai/)
2. Create a project
3. Go to API Keys section
4. Generate a new API key (starts with `llx-`)
5. Set the `LLAMA_CLOUD_PROJECT_NAME` to match your project name

## Installation

### 1. Install Dependencies

The LlamaCloud SDK dependency is already added to `pyproject.toml`:

```bash
cd backend
pip install -e .
```

Or install specifically:

```bash
pip install llama-index-indices-managed-llama-cloud>=0.3.0
```

### 2. Run Database Migration

Apply the migration to create the necessary tables:

```bash
# Using Supabase CLI
supabase db push

# Or run the migration SQL directly in your database
```

### 3. Set Environment Variables

Copy the example and add your keys:

```bash
cp backend/.env.example backend/.env
# Edit .env and add your LLAMA_CLOUD_API_KEY
```

### 4. Restart Backend

```bash
cd backend
python -m uvicorn api:app --reload
```

## Usage Guide

### Creating a Knowledge Base

#### 1. Via API

```bash
curl -X POST "http://localhost:8000/knowledge-base/llamacloud" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "product-documentation",
    "index_name": "prod-docs-2024",
    "description": "Product documentation and user guides"
  }'
```

#### 2. Response

```json
{
  "kb_id": "uuid-here",
  "name": "product-documentation",
  "index_name": "prod-docs-2024",
  "description": "Product documentation and user guides",
  "is_active": true,
  "created_at": "2026-02-12T10:00:00Z",
  "updated_at": "2026-02-12T10:00:00Z"
}
```

### Assigning KB to Agent

```bash
curl -X POST "http://localhost:8000/knowledge-base/agents/{agent_id}/assignments/unified" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "regular_entry_ids": [],
    "llamacloud_kb_ids": ["kb-uuid-here"]
  }'
```

### Testing Search

```bash
curl -X POST "http://localhost:8000/knowledge-base/llamacloud/agents/{agent_id}/test-search" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "index_name": "prod-docs-2024",
    "query": "How do I reset my password?"
  }'
```

### Agent Usage

Once configured, agents automatically get search functions for each KB:

**Agent Conversation Example:**

```
User: "Search our product documentation for password reset instructions"

Agent: [Calls search_product_documentation("password reset")]

Agent: "Based on the documentation, here are the password reset steps:
1. Click 'Forgot Password' on the login page
2. Enter your email address
3. Check your email for the reset link
4. Follow the link and create a new password"
```

## Database Schema

### llamacloud_knowledge_bases Table

| Column | Type | Description |
|--------|------|-------------|
| kb_id | UUID | Primary key |
| account_id | UUID | Foreign key to accounts |
| folder_id | UUID | Optional folder reference |
| name | VARCHAR(255) | Display name (kebab-case) |
| index_name | VARCHAR(255) | LlamaCloud index identifier |
| description | TEXT | Optional description |
| is_active | BOOLEAN | Enable/disable KB |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last update timestamp |

### agent_llamacloud_kb_assignments Table

| Column | Type | Description |
|--------|------|-------------|
| assignment_id | UUID | Primary key |
| agent_id | UUID | Foreign key to agents |
| kb_id | UUID | Foreign key to llamacloud_knowledge_bases |
| account_id | UUID | Foreign key to accounts |
| enabled | BOOLEAN | Enable/disable for this agent |
| assigned_at | TIMESTAMPTZ | Assignment timestamp |

## API Reference

### Create Knowledge Base

```http
POST /knowledge-base/llamacloud
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "string",           // Required, converted to kebab-case
  "index_name": "string",     // Required, must match LlamaCloud
  "description": "string"     // Optional
}
```

### List Knowledge Bases

```http
GET /knowledge-base/llamacloud?include_inactive=false
Authorization: Bearer {token}
```

### Update Knowledge Base

```http
PUT /knowledge-base/llamacloud/{kb_id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "string",           // Optional
  "index_name": "string",     // Optional
  "description": "string",    // Optional
  "is_active": boolean        // Optional
}
```

### Delete Knowledge Base

```http
DELETE /knowledge-base/llamacloud/{kb_id}
Authorization: Bearer {token}
```

### Get Unified Assignments

```http
GET /knowledge-base/agents/{agent_id}/assignments/unified
Authorization: Bearer {token}
```

### Update Unified Assignments

```http
POST /knowledge-base/agents/{agent_id}/assignments/unified
Authorization: Bearer {token}
Content-Type: application/json

{
  "regular_entry_ids": ["uuid1", "uuid2"],
  "llamacloud_kb_ids": ["uuid3", "uuid4"]
}
```

## Search Configuration

The Knowledge Search Tool uses these LlamaCloud retriever settings:

```python
retriever = index.as_retriever(
    dense_similarity_top_k=3,      # Semantic search results
    sparse_similarity_top_k=3,     # Keyword search results
    alpha=0.5,                      # Balance: 0.5 = equal weight
    enable_reranking=True,          # Rerank for quality
    rerank_top_n=3,                 # Results to rerank
    retrieval_mode="chunks"         # Return document chunks
)
```

### Customizing Search Parameters

To modify search behavior, edit `backend/core/tools/knowledge_search_tool.py`:

```python
# Change top-k results
dense_similarity_top_k=5,  # Get more semantic results

# Adjust alpha for search balance
alpha=0.7,  # Favor semantic over keyword (0-1 range)

# Increase reranking
rerank_top_n=5,  # Rerank more results
```

## Error Handling

### Common Errors

#### 1. API Key Not Configured

```json
{
  "detail": "LlamaCloud API key not configured. Set LLAMA_CLOUD_API_KEY environment variable."
}
```

**Solution**: Add `LLAMA_CLOUD_API_KEY` to your `.env` file.

#### 2. Index Not Found

```json
{
  "detail": "Failed to connect to knowledge base 'name'. Please verify the index name 'index-name' exists in your LlamaCloud project."
}
```

**Solution**: 
- Check index name matches exactly (case-sensitive)
- Verify project name is correct
- Ensure index exists in LlamaCloud

#### 3. SDK Not Installed

```json
{
  "detail": "LlamaCloud client not installed. Please install: pip install llama-index-indices-managed-llama-cloud>=0.3.0"
}
```

**Solution**: Run `pip install llama-index-indices-managed-llama-cloud>=0.3.0`

## Testing

### Manual Testing with cURL

```bash
# 1. Create a KB
KB_ID=$(curl -X POST "http://localhost:8000/knowledge-base/llamacloud" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-docs",
    "index_name": "test-index",
    "description": "Test documentation"
  }' | jq -r '.kb_id')

# 2. Assign to agent
curl -X POST "http://localhost:8000/knowledge-base/agents/$AGENT_ID/assignments/unified" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"regular_entry_ids\": [],
    \"llamacloud_kb_ids\": [\"$KB_ID\"]
  }"

# 3. Test search
curl -X POST "http://localhost:8000/knowledge-base/llamacloud/agents/$AGENT_ID/test-search" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "index_name": "test-index",
    "query": "how to authenticate"
  }'
```

### Python Testing

```python
import asyncio
import os
from core.tools.knowledge_search_tool import KnowledgeSearchTool

async def test_search():
    os.environ["LLAMA_CLOUD_API_KEY"] = "llx-your-key"
    os.environ["LLAMA_CLOUD_PROJECT_NAME"] = "Default"
    
    knowledge_bases = [
        {
            "name": "documentation",
            "index_name": "my-docs-index",
            "description": "Product documentation"
        }
    ]
    
    tool = KnowledgeSearchTool(
        thread_manager=None,
        knowledge_bases=knowledge_bases
    )
    
    result = await tool.search_documentation("authentication")
    print(result)

asyncio.run(test_search())
```

## Monitoring and Logging

The implementation includes comprehensive logging:

```python
# Tool registration
logger.info(f"📚 Registered search method: search_{name} -> {index_name}")

# Search execution
logger.info(f"🔍 Searching LlamaCloud index '{index_name}' with query: {query}")
logger.info(f"✅ Found {len(results)} results in '{index_name}'")

# Config enrichment
logger.info(f"📚 Loaded {len(knowledge_bases)} LlamaCloud KBs for agent {agent_id}")
logger.info(f"✅ Enriched agent config with {len(llamacloud_kbs)} LlamaCloud KBs")
```

Monitor logs for:
- Tool registration success
- Search queries and results
- Configuration loading
- API errors

## Security Considerations

1. **API Key Storage**: Never commit API keys to version control
2. **RLS Policies**: All tables have Row Level Security enabled
3. **Account Isolation**: KBs are scoped to accounts
4. **JWT Authentication**: All endpoints require valid JWT tokens
5. **Input Validation**: Names are sanitized and validated

## Performance Optimization

### Caching

The system uses runtime caching for:
- Agent configurations
- MCP configurations
- Project metadata

### Database Queries

- Uses RPC functions for efficient joins
- Indexes on foreign keys
- Pagination support (future enhancement)

### Search Performance

- Hybrid search balances speed and quality
- Configurable result limits
- Chunk-based retrieval

## Troubleshooting

### Issue: Tool not appearing for agent

**Check:**
1. KB is assigned to agent
2. KB is active (`is_active = true`)
3. Agent config is refreshed (cache invalidated)
4. Backend restarted after migration

**Solution:**
```bash
# Invalidate cache via API or restart backend
curl -X POST "http://localhost:8000/api/cache/invalidate/agent/{agent_id}"
```

### Issue: Search returns no results

**Check:**
1. Index name matches exactly
2. Index contains data in LlamaCloud
3. Project name is correct
4. API key has access to project

**Solution:**
- Verify in LlamaCloud dashboard
- Use test search endpoint to debug
- Check logs for error details

### Issue: Slow search performance

**Check:**
1. Network latency to LlamaCloud
2. Index size and complexity
3. Number of results requested

**Solution:**
- Reduce `top_k` parameters
- Consider caching frequent queries
- Use more specific queries

## Future Enhancements

Planned features:
1. **Caching Layer**: Redis caching for frequent queries
2. **Advanced Configuration**: Per-KB search parameters
3. **Multi-Index Search**: Search across multiple KBs simultaneously
4. **Analytics**: Track search usage and quality metrics
5. **Query Rewriting**: Automatic query optimization

## Support

For issues or questions:
1. Check logs in `backend/logs/`
2. Review environment configuration
3. Test with simplified setup
4. Contact support with error details

## License

This implementation is part of the Omni project and follows the same license.

---

**Last Updated**: February 12, 2026  
**Version**: 1.0.0  
**Author**: Backend Development Team
