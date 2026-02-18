# V3 Implementation: enable_thinking and reasoning_effort

## ✅ Implementation Complete

I've added the full pipeline to V3 matching V2's architecture:

### Full Chain (Client → LLM)

```
┌─────────────────────────────────────────────────────────────────┐
│  1. API Layer (agent_runs.py)                                   │
│     unified_agent_start(enable_thinking, reasoning_effort)      │
└─────────────────────────────┬───────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. start_agent_run()                                            │
│     - Adds to metadata for auditing                              │
│     - Passes to _trigger_agent_background()                      │
└─────────────────────────────┬───────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. run_agent_background (Dramatiq worker)                       │
│     - Logs: "Using model X (thinking: Y, reasoning_effort: Z)"  │
│     - Passes to run_agent()                                      │
└─────────────────────────────┬───────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. run_agent() + AgentConfig                                    │
│     - Stores in config.enable_thinking, config.reasoning_effort │
│     - Passes to thread_manager.run_thread()                      │
└─────────────────────────────┬───────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. thread_manager.run_thread()                                  │
│     - Passes to _execute_run() and _auto_continue_generator()   │
│     - Both forward to make_llm_api_call()                        │
└─────────────────────────────┬───────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  6. llm.make_llm_api_call()                                      │
│     - Calls _configure_thinking(params, model, enable, effort)  │
└─────────────────────────────┬───────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  7. _configure_thinking()                                        │
│     IF enable_thinking is True:                                  │
│       - Anthropic/Bedrock: sets reasoning_effort + temp=1.0     │
│       - xAI: sets reasoning_effort                               │
│       - GPT-5: sets reasoning_effort                             │
│       - Qwen thinking: sets reasoning_effort                     │
│     IF enable_thinking is False:                                 │
│       - Returns immediately; reasoning_effort is NOT sent        │
└─────────────────────────────────────────────────────────────────┘
```

## 📋 API Defaults

Both V2 and V3 now use:
```python
enable_thinking: Optional[bool] = Form(False)     # Default: OFF
reasoning_effort: Optional[str] = Form("low")     # Default: "low"
```

**CRITICAL:** When `enable_thinking=False`, the `reasoning_effort` value is **ignored** and never sent to the LLM API. So the log line "(thinking: False, reasoning_effort: low)" means **no reasoning is enabled** — the "low" is just the default value that wasn't used.

## ❓ When is enable_thinking set to True?

### Current Behavior (V2 and V3)

**Never automatically.** In both codebases:

1. **User-initiated runs (normal chat):**
   - `enable_thinking` comes from the **client** (frontend/mobile)
   - Frontend default: `enable_thinking: false`
   - So normal chat runs with **NO** extended thinking unless the user explicitly enables it

2. **Trigger/workflow runs:**
   - Hardcoded in backend: `enable_thinking=False`
   - Even for "complex" workflows, thinking is off

3. **Custom agents:**
   - **NO special treatment**
   - Custom agents use the same client defaults (thinking: False)
   - The agent type (custom vs default) does NOT affect enable_thinking

### Why You Might Feel V3 is "Dumber"

Both V2 and V3 default to `enable_thinking: false`, so if extended reasoning isn't being used, the model behaves the same. Possible reasons for perceived difference:

1. **Different prompts** – V2 vs V3 might have different system prompts
2. **Context management** – Different history/caching strategies
3. **Model differences** – You updated V2 to Sonnet 4.5; maybe V3 was using a different model?
4. **Now fixed** – V3 didn't even have the pipeline; now it does, so you can enable it

## 💡 Recommendation: Smart Defaults

You could implement "smart" enable_thinking based on:

### Option 1: Model-based (Recommended)

Enable thinking for models that support it:

```python
# In unified_agent_start or start_agent_run
def should_enable_thinking(model_name: str) -> bool:
    """Auto-enable thinking for capable models."""
    model_lower = model_name.lower()
    # Sonnet 4.5 supports thinking; Haiku doesn't
    if "sonnet-4-5" in model_lower or "sonnet-4.5" in model_lower:
        return True
    if "gpt-5" in model_lower:
        return True
    if "grok" in model_lower and "thinking" in model_lower:
        return True
    return False

# Usage
if enable_thinking is None:  # Client didn't specify
    enable_thinking = should_enable_thinking(model_name)
```

### Option 2: Agent-based

Enable thinking for custom/complex agents:

```python
# In start_agent_run after loading agent_config
if agent_config and not agent_config.get('is_default'):
    # Custom agent → enable thinking for better quality
    enable_thinking = True
```

### Option 3: Frontend Toggle

Add a UI toggle in the chat interface:
- "🧠 Extended Thinking" checkbox
- Shows "The AI will think more deeply (slower, higher quality)"
- Saves user preference per agent/thread

## 🎯 Ideal Configuration

For production:

| Scenario | enable_thinking | reasoning_effort | Why |
|----------|----------------|------------------|-----|
| **Quick chat (Haiku)** | False | - | Fast responses |
| **Normal chat (Sonnet 4.5)** | True | low | Better reasoning without much slowdown |
| **Complex tasks** | True | medium | Deep analysis, multi-step planning |
| **Research/analysis** | True | high | Maximum quality (slower) |
| **Triggers/workflows** | False | - | Speed matters; pre-defined logic |

## 🔧 How to Enable in Frontend (V3)

Update your frontend to send `enable_thinking: true`:

```typescript
// For Sonnet 4.5 chat
const formData = new FormData();
formData.append('prompt', message);
formData.append('model_name', 'omni/power'); // Sonnet 4.5
formData.append('enable_thinking', 'true');   // ← Add this
formData.append('reasoning_effort', 'low');   // or 'medium'/'high'
```

## 📊 Monitoring

Check your logs for the new message:
```
🚀 Using model: claude-sonnet-4-5-20250929 (thinking: True, reasoning_effort: low)
```

And in LLM layer:
```
Anthropic thinking enabled with reasoning_effort='low'
```

## 🚨 Important Notes

1. **Temperature override**: When `enable_thinking=True` for Anthropic, we automatically set `temperature=1.0` (required by Anthropic API)
2. **Cost**: Extended thinking can increase token usage and latency
3. **Model support**: Only Anthropic (Claude), xAI (Grok), GPT-5, and Qwen thinking models support `reasoning_effort`
4. **V3 frontend**: Update your frontend to send these params (currently hero-section sends them but backend ignored them)

## ✨ Summary

- ✅ V3 now has the full pipeline (was missing entirely)
- ✅ Matches V2 architecture exactly
- ⚠️ Default is `enable_thinking: false` in both V2 and V3
- 💡 Consider smart defaults based on model (Sonnet 4.5 → True, Haiku → False)
- 📱 Update frontend to send `enable_thinking: true` for Sonnet 4.5 chats
- 🎯 Recommended: `enable_thinking: true, reasoning_effort: 'low'` for Sonnet 4.5
