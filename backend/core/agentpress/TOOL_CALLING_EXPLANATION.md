# Tool Calling Process Explanation

## How Sonnet 4.5 (and Haiku 4.5) Calls Tools

### Overview
Both Claude Sonnet 4.5 and Claude Haiku 4.5 use the same tool calling mechanism, which supports two formats:
1. **Native Tool Calling** (OpenAI-style function calling) - Direct API support
2. **XML Tool Calling** (`<tool>...</tool>` format) - Fallback/alternative format

### The Tool Calling Process

#### 1. **Model Capability Detection**
- Models with `FUNCTION_CALLING` capability (like Sonnet 4.5 and Haiku 4.5) automatically get native tool calling enabled
- The system checks the model registry to determine capabilities
- If a model has `FUNCTION_CALLING`, `native_tool_calling` is auto-enabled in `ProcessorConfig`

#### 2. **Tool Schema Preparation**
- Tools are registered in the `ToolRegistry`
- OpenAPI schemas are generated for each tool (name, description, parameters)
- These schemas are passed to the LLM API call via the `tools` parameter

#### 3. **LLM API Call**
```python
llm_response = await make_llm_api_call(
    messages=prepared_messages,
    model=llm_model,
    tools=openapi_tool_schemas,  # Tool schemas passed here
    tool_choice="auto",  # LLM decides when to call tools
    ...
)
```

#### 4. **Response Processing**
The `ResponseProcessor` handles two types of tool calls:

**Native Tool Calls:**
- Detected via `response.tool_calls` attribute
- Structured format: `{id, type, function: {name, arguments}}`
- Parsed directly from the API response

**XML Tool Calls:**
- Detected via `<tool>` tags in text content
- Parsed using `XMLToolParser`
- Fallback format for models without native support

#### 5. **Tool Execution**
- Tools are executed based on `tool_execution_strategy`:
  - **Sequential**: One at a time
  - **Parallel**: Multiple tools simultaneously
- Results are formatted and added back to the conversation
- The LLM receives tool results and can make follow-up calls

### What Helps Tool Calling Work

1. **Model Capabilities** (`ModelCapability.FUNCTION_CALLING`)
   - Registered in `registry.py` for each model
   - Determines if native tool calling should be enabled

2. **Tool Registry** (`ToolRegistry`)
   - Central registry of all available tools
   - Generates OpenAPI schemas for LLM consumption
   - Maps tool names to executable functions

3. **Response Processor** (`ResponseProcessor`)
   - Detects and parses tool calls from LLM responses
   - Executes tools and formats results
   - Handles both native and XML formats

4. **Prompt Caching** (for Anthropic models)
   - Reduces costs by caching system prompts and early messages
   - Works automatically for all Anthropic models (Sonnet, Haiku, Opus)
   - Uses dynamic token-based thresholds

### Prompt Caching with Tool Calling

#### How Caching Works
1. **Detection**: `is_anthropic_model()` checks if model supports caching
   - Includes: 'anthropic', 'claude', 'sonnet', 'haiku', 'opus'
   - **Haiku 4.5 is automatically included**

2. **Cache Strategy**:
   - System prompt cached if ≥1024 tokens
   - Conversation messages cached based on dynamic thresholds
   - Tool schemas and results are included in cached blocks

3. **Benefits**:
   - 70-90% cost savings in long conversations
   - Faster responses (cached content doesn't need re-processing)
   - Works seamlessly with tool calling

#### Cache Thresholds for Haiku 4.5
- Context window: 200k tokens
- Early (≤20 msgs): ~1.5k tokens threshold
- Growing (≤100 msgs): ~3k tokens threshold  
- Mature (≤500 msgs): ~5k tokens threshold
- Very long (500+ msgs): ~9k tokens threshold

### Ensuring Haiku 4.5 Uses Same Mechanism

#### ✅ Already Configured:
1. **Function Calling Capability**: Haiku 4.5 has `ModelCapability.FUNCTION_CALLING` in registry
2. **Prompt Caching**: `is_anthropic_model()` includes 'haiku' check
3. **Auto-Enable Native Tools**: Added logic in `thread_manager.py` to auto-enable native tool calling for models with FUNCTION_CALLING capability

#### Code Changes Made:
1. **`thread_manager.py`**: Added auto-detection to enable `native_tool_calling=True` for models with FUNCTION_CALLING capability
2. **`registry.py`**: Haiku 4.5 already has FUNCTION_CALLING capability
3. **`prompt_caching.py`**: Already includes 'haiku' in Anthropic model detection

### Example Flow for Haiku 4.5

```
1. User sends message: "Search for Python tutorials"
2. System checks model capabilities → Haiku 4.5 has FUNCTION_CALLING
3. Auto-enables native_tool_calling=True
4. Tool schemas prepared (web_search_tool, etc.)
5. LLM API call made with tools parameter
6. Haiku responds with tool call: {function: "web_search", arguments: {...}}
7. Tool executed, results returned
8. Haiku processes results and responds to user
9. Prompt caching applied to reduce costs on subsequent calls
```

### Key Files

- **`core/ai_models/registry.py`**: Model capability definitions
- **`core/agentpress/thread_manager.py`**: Main execution flow, auto-enables native tools
- **`core/agentpress/response_processor.py`**: Tool call detection and execution
- **`core/agentpress/prompt_caching.py`**: Caching logic for Anthropic models
- **`core/agentpress/tool_registry.py`**: Tool registration and schema generation

### Summary

**Haiku 4.5 now works exactly like Sonnet 4.5:**
- ✅ Native tool calling auto-enabled (via capability detection)
- ✅ XML tool calling available as fallback
- ✅ Prompt caching enabled (70-90% cost savings)
- ✅ Same tool execution strategies (sequential/parallel)
- ✅ Same response processing pipeline

The system automatically detects that Haiku 4.5 has FUNCTION_CALLING capability and enables all the same optimizations and features that Sonnet 4.5 uses.

