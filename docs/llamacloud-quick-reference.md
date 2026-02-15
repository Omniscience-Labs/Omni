# LlamaCloud Backend - Quick Reference

## Setup (5 minutes)

### 1. Get LlamaCloud Credentials
1. Sign up at https://cloud.llamaindex.ai/
2. Create a project (e.g., "Default")
3. Create an index and upload documents
4. Get API key from dashboard (starts with `llx-`)

### 2. Configure Backend
```bash
# Add to backend/.env
LLAMA_CLOUD_API_KEY=llx-your-api-key-here
LLAMA_CLOUD_PROJECT_NAME=Default
```

### 3. Install & Migrate
```bash
cd backend
pip install llama-index-indices-managed-llama-cloud>=0.3.0
supabase db push
```

### 4. Restart Backend
```bash
python -m uvicorn api:app --reload
```

## Quick API Examples

### Create Knowledge Base
```bash
curl -X POST http://localhost:8000/knowledge-base/llamacloud \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "docs",
    "index_name": "my-index",
    "description": "Documentation"
  }'
```

### Assign to Agent
```bash
curl -X POST http://localhost:8000/knowledge-base/agents/$AGENT_ID/assignments/unified \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "llamacloud_kb_ids": ["$KB_ID"]
  }'
```

### Test Search
```bash
curl -X POST http://localhost:8000/knowledge-base/llamacloud/agents/$AGENT_ID/test-search \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "index_name": "my-index",
    "query": "how to authenticate"
  }'
```

## Code Examples

### Using in Agent
```python
# Agent automatically gets search function
result = await agent.search_docs("authentication")
```

### Custom Tool Usage
```python
from core.tools.knowledge_search_tool import KnowledgeSearchTool

tool = KnowledgeSearchTool(
    thread_manager=tm,
    knowledge_bases=[{
        "name": "docs",
        "index_name": "my-index",
        "description": "Documentation"
    }]
)

result = await tool.search_docs("password reset")
```

## Troubleshooting

### Error: "API key not configured"
**Fix**: Add `LLAMA_CLOUD_API_KEY` to `.env`

### Error: "Index not found"
**Fix**: Check index name matches LlamaCloud exactly (case-sensitive)

### Error: "SDK not installed"
**Fix**: `pip install llama-index-indices-managed-llama-cloud>=0.3.0`

### No results returned
**Fix**: Verify index has data in LlamaCloud dashboard

## Key Files

| File | Purpose |
|------|---------|
| `knowledge_search_tool.py` | Search tool implementation |
| `knowledge_base/api.py` | REST API endpoints |
| `config_helper.py` | Config enrichment |
| `run.py` | Tool registration |
| `20260212000000_llamacloud_knowledge_base.sql` | Database schema |

## Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/knowledge-base/llamacloud` | List KBs |
| POST | `/knowledge-base/llamacloud` | Create KB |
| PUT | `/knowledge-base/llamacloud/{id}` | Update KB |
| DELETE | `/knowledge-base/llamacloud/{id}` | Delete KB |
| POST | `/knowledge-base/agents/{id}/assignments/unified` | Assign KB |
| POST | `/knowledge-base/llamacloud/agents/{id}/test-search` | Test search |

## Configuration Options

### Search Parameters
Edit `knowledge_search_tool.py`:
```python
retriever = index.as_retriever(
    dense_similarity_top_k=3,    # Change for more results
    sparse_similarity_top_k=3,
    alpha=0.5,                    # 0=keyword, 1=semantic
    enable_reranking=True,
    rerank_top_n=3
)
```

### Environment Variables
```bash
# Required
LLAMA_CLOUD_API_KEY=llx-xxx

# Optional (defaults to "Default")
LLAMA_CLOUD_PROJECT_NAME=MyProject
```

## Database Schema

### Tables
- `llamacloud_knowledge_bases` - KB configs
- `agent_llamacloud_kb_assignments` - Agent assignments

### Key Columns
- `name` - Display name (kebab-case)
- `index_name` - LlamaCloud index identifier
- `is_active` - Enable/disable KB
- `enabled` - Enable/disable for agent

## Common Patterns

### Create and Assign KB
```python
# 1. Create KB
kb = await create_kb("docs", "my-index", "Documentation")

# 2. Assign to agent
await assign_kb_to_agent(agent_id, kb['kb_id'])

# 3. Agent automatically gets search_docs() method
```

### List Agent's KBs
```python
from core.config_helper import get_agent_llamacloud_knowledge_bases

kbs = await get_agent_llamacloud_knowledge_bases(agent_id)
for kb in kbs:
    print(f"{kb['name']}: {kb['index_name']}")
```

### Search from Code
```python
result = await tool.search_documentation("query")
if result.success:
    for item in result.output['results']:
        print(f"Score: {item['score']}")
        print(f"Text: {item['text']}")
```

## Best Practices

1. **Naming**: Use kebab-case for KB names (auto-converted)
2. **Index Names**: Must match LlamaCloud exactly
3. **Descriptions**: Be specific - agents use this for context
4. **Testing**: Use test endpoint before production
5. **Monitoring**: Check logs for search performance
6. **Security**: Never commit API keys

## Performance Tips

1. **Reduce top_k** for faster searches
2. **Use specific queries** for better results
3. **Cache frequent queries** (future enhancement)
4. **Monitor index size** in LlamaCloud

## Next Steps

1. ✅ Setup complete
2. 🔨 Create your first KB
3. 🤖 Assign to an agent
4. 🧪 Test search
5. 🚀 Use in production

## Support

- **Docs**: `docs/llamacloud-backend-implementation.md`
- **Logs**: `backend/logs/`
- **Issues**: Check error messages and logs
- **LlamaCloud**: https://docs.llamaindex.ai/

---

**Version**: 1.0.0  
**Last Updated**: February 12, 2026
