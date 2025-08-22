# Knowledge Search Tool Implementation

This document describes the implementation of the LlamaCloud knowledge search tool for AgentPress.

## Overview

The Knowledge Search Tool allows agents to search through configured LlamaCloud indices. Each knowledge base is exposed as a separate search function that the agent can call, making it easy for the agent to search the right knowledge base based on the context.

**Important Note**: This system handles **references** to existing LlamaCloud indices, not direct file uploads for knowledge bases. Users must upload and manage knowledge base content through LlamaCloud's interface separately. The system only stores configuration to connect to these pre-existing indices.

## Dependencies & Architecture

### Core Dependencies
- **LlamaCloud Package**: `llama-index-indices-managed-llama-cloud>=0.3.0`
- **Database**: PostgreSQL with JSONB support for configuration storage
- **Environment**: Python 3.11+

### Deployment Architecture
The system is designed for cloud deployment across multiple services:
- **Frontend**: Vercel (Next.js)
- **Backend**: Render (FastAPI)
- **Database**: Supabase (PostgreSQL)
- **API Pattern**: Uses `${API_URL}/endpoint` instead of `/api/endpoint` for backend requests

## Key Features

1. **Dynamic Function Generation**: Each knowledge base gets its own search function with custom names (e.g., `search_documentation`, `search_technical_docs`)
2. **Environment Variable Configuration**: API key and project name are configured via environment variables
3. **Clean UI Integration**: Knowledge bases are configured through a dedicated UI component in the agent builder
4. **Production-Grade**: Robust error handling, logging, and maintainable code structure
5. **Flexible Naming**: Tool names are separate from index names, allowing for clean function names while maintaining API compatibility

## Components

### Backend

#### 1. Knowledge Search Tool (`backend/agent/tools/knowledge_search_tool.py`)
- Extends the AgentPress `Tool` base class
- Dynamically creates search methods for each configured knowledge base
- Uses LlamaCloud Python SDK for index operations
- Provides a `list_available_knowledge_bases` method for discovery

#### 2. Agent Configuration Updates
- Database migration adds `knowledge_bases` JSONB column to agents table
- Tool registration in `run.py` when agent has knowledge bases configured
- Update agent tool supports knowledge base configuration

### Frontend

#### 1. Knowledge Configuration Component (`frontend/src/app/(dashboard)/agents/_components/agent-knowledge-configuration.tsx`)
- **Three-Field Interface** for each knowledge base:
  - **Name**: Tool function name (automatically formatted to lowercase with dashes only)
  - **Index Key**: Exact LlamaCloud index identifier for API calls
  - **Description**: What information the knowledge base contains
- **Real-time Name Formatting**: Automatically converts spaces to dashes, removes invalid characters
- **Clean UI Features**:
  - Visual cards for each configured knowledge base
  - Add/remove functionality with confirmation
  - Real-time validation and formatting
  - Integrated into agent builder workflow
- **Formatting Rules**: Names are automatically formatted using `formatKnowledgeBaseName()`:
  ```javascript
  // Converts "My Documentation" → "my-documentation"
  .toLowerCase()
  .replace(/\s+/g, '-')
  .replace(/[^a-z0-9-]/g, '')
  .replace(/-+/g, '-')
  .replace(/^-+/, '')
  ```

#### 2. Type Updates
- Agent interfaces updated to include `knowledge_bases` field
- Request/response types updated for API compatibility

## Configuration

### Environment Variables
```bash
LLAMA_CLOUD_API_KEY=llx-...  # Your LlamaCloud API key
LLAMA_CLOUD_PROJECT_NAME=Default  # Your project name (optional, defaults to "Default")
```

### Agent Configuration
```json
{
  "knowledge_bases": [
    {
      "name": "documentation",
      "index_name": "my-documentation",
      "description": "Product documentation and user guides"
    },
    {
      "name": "api_reference",
      "index_name": "api-reference-index", 
      "description": "API documentation and code examples"
    }
  ]
}
```

## Integration Details

### Tool Registration (`backend/agent/run.py`)
The knowledge search tool is automatically registered when agents have knowledge bases configured:

```python
# Lines 164-166 in run.py
if agent_config and agent_config.get('knowledge_bases'):
    logger.info(f"Registering knowledge search tool with {len(agent_config['knowledge_bases'])} knowledge bases")
    thread_manager.add_tool(KnowledgeSearchTool, thread_manager=thread_manager, knowledge_bases=agent_config['knowledge_bases'])
```

### Database Schema 

Create a seperate table, which should have the agent ID and the knowledge base as ajson shown here thats it.

agent_id: 164165d0-73ac-40f8-b9f2-6ce6879cb153
knowledge_bases: 
[{"name": "tims-service-quotation", "index_name": "Tims-planned-bovid-2025-06-24", "description": "This is a comprehensive repository of previous service contracts authored by Tim the service manager. This information needs to be referenced to understand the quoting process, identify the line items and understand how to write service quotation"}, {"name": "neca-manual-material-cost", "index_name": "neca-manual-material-cost", "description": "This knowledge base has two files, 1. Neca manual which has all the information on how much man hours a particular job takes and 2. The latest material cost of all the things needed for a service quotation. Reference these for whenever you need to know how many labour units are needed and when you need to know material t."}]


```

### Package Installation
Add to `requirements.txt`:
```
llama-index-indices-managed-llama-cloud>=0.3.0
```

Or install directly:
```bash
pip install llama-index-indices-managed-llama-cloud>=0.3.0
```

## Usage

### For Agent Builders

#### Step-by-Step UI Workflow

1. **Navigate to Knowledge Bases Section**
   - In the agent builder UI, find the "Knowledge Bases" section
   - See current count of configured knowledge bases

2. **Add New Knowledge Base**
   - Click "Add New Knowledge Base" in the dashed border section
   - Fill in three required fields:
     - **Name**: Tool function name (auto-formats to lowercase-with-dashes)
       - Example: "My Documentation" → "my-documentation"
       - Becomes the function name: `search_my_documentation()`
     - **Index Key**: Exact LlamaCloud index identifier for API calls
       - Must match your LlamaCloud index name exactly
     - **Description**: Clear description of what this knowledge base contains
       - Used for agent context and tool selection

3. **Real-time Validation**
   - Name field automatically formats as you type
   - All fields required before "Add" button activates
   - Visual feedback for validation states

4. **Manage Existing Knowledge Bases**
   - View configured knowledge bases as visual cards
   - Edit any field inline
   - Remove knowledge bases with trash icon
   - See book icon for easy visual identification

5. **Save Configuration**
   - Knowledge bases are saved as part of agent configuration
   - Changes take effect immediately for new agent instances

### For Agents

When an agent has knowledge bases configured, it automatically gets:

1. Individual search functions for each knowledge base:
   - `search_documentation(query: str)`
   - `search_api_reference(query: str)`

2. A listing function to see all available knowledge bases:
   - `list_available_knowledge_bases()`

### Example Agent Interaction

```xml
<function_calls>
<invoke name="list_available_knowledge_bases">
</invoke>
</function_calls>

<!-- Agent sees available knowledge bases with their tool names -->

<function_calls>
<invoke name="search_api_reference">
<parameter name="query">authentication endpoints</parameter>
</invoke>
</function_calls>

<!-- Agent receives search results from the API reference knowledge base -->
```

## Implementation Details

### Dynamic Method Creation

The tool creates methods dynamically in `_create_dynamic_methods()`:
1. Iterates through configured knowledge bases
2. Creates a safe method name from the tool name (not the index name)
3. Uses the index name for actual LlamaCloud API calls
4. Decorates the method with OpenAPI and XML schemas
5. Binds the method to the tool instance

This separation allows for clean, descriptive function names while maintaining the correct API connections to LlamaCloud indices.

### Search Configuration

The retriever is configured with balanced settings for optimal search quality:
```python
retriever = index.as_retriever(
    dense_similarity_top_k=3,        # Top 3 results from dense retrieval
    sparse_similarity_top_k=3,       # Top 3 results from sparse retrieval  
    alpha=0.5,                       # Equal weight between dense and sparse
    enable_reranking=True,           # Reranking enabled for better results
    rerank_top_n=3,                  # Number of results to rerank
    retrieval_mode="chunks"          # Retrieve in chunk mode
)
```

**Configuration Details**:
- **Hybrid Search**: Combines dense (semantic) and sparse (keyword) retrieval
- **Alpha Balance**: 0.5 gives equal weight to both retrieval methods
- **Reranking**: Enabled with top 3 results for improved relevance
- **Chunk Mode**: Retrieves document chunks for better context

### Error Handling

- Missing API key: Returns helpful error message
- Missing package: Suggests installation command
- Index connection errors: Logged and returned as tool failures
- Empty results: Returns structured "no results" response

## Troubleshooting

### Common Issues

1. **"LlamaCloud API key not configured"**
   - Ensure `LLAMA_CLOUD_API_KEY` environment variable is set
   - Check that the API key starts with `llx-`
   - Verify the key is valid in your LlamaCloud account

2. **"LlamaCloud client not installed"**
   - Install the required package: `pip install llama-index-indices-managed-llama-cloud>=0.3.0`
   - Check that the package version is compatible

3. **Index not found errors**
   - Verify the `index_name` matches exactly with your LlamaCloud index
   - Check that the index exists in the specified project
   - Ensure `LLAMA_CLOUD_PROJECT_NAME` is correct (defaults to "Default")

4. **Agent not getting knowledge search functions**
   - Confirm knowledge bases are saved in agent configuration
   - Check agent has at least one knowledge base configured
   - Verify the agent restart/reload after configuration changes

5. **Search returning no results**
   - Check that the LlamaCloud index has content
   - Try different search queries or terms
   - Verify the index is properly configured in LlamaCloud

### Debug Tips

- **Check Logs**: Search operations are logged with query details
- **Test Environment Variables**: Use the test script to verify configuration
- **Validate Index Names**: Double-check spelling and case sensitivity
- **Test Queries**: Start with simple, broad queries before getting specific

## Testing

Run the test script to verify the implementation:

```bash
cd backend
python test_knowledge_search.py
```

The test script:
1. Checks for required environment variables
2. Creates a sample knowledge search tool
3. Tests listing and searching functions
4. Shows all dynamically created methods

## Maintenance

### Adding Features

To add new features to the knowledge search:
1. Update the search configuration in `_search_index()`
2. Add new parameters to the tool schemas
3. Update the UI component if needed

### Updating Dependencies

The tool uses `llama-index-indices-managed-llama-cloud`. Keep this updated:
```bash
pip install --upgrade llama-index-indices-managed-llama-cloud
```

## Security Considerations

1. API keys are stored as environment variables, not in the database
2. Each agent only has access to its configured knowledge bases
3. Search queries and results are logged for debugging
4. No direct index manipulation - only search operations

## Future Enhancements

1. **Reranking**: Enable reranking for better search results
2. **Hybrid Search Tuning**: Allow configuration of alpha parameter
3. **Result Limits**: Make top_k configurable per knowledge base
4. **Caching**: Cache frequently searched queries
5. **Analytics**: Track which knowledge bases are most used


in run.py
# Register knowledge search tool if agent has knowledge bases configured
    if agent_config and agent_config.get('knowledge_bases'):
        logger.info(f"Registering knowledge search tool with {len(agent_config['knowledge_bases'])} knowledge bases")
        thread_manager.add_tool(KnowledgeSearchTool, thread_manager=thread_manager, knowledge_bases=agent_config['knowledge_bases'])

