To address your Sonnet 4 Auto-Continue issue, I have performed a deep dive into the kortix-ai/suna backend. Below is the explanation of how 
suna
 handles this correctly and the specific implementation details you need to fix in your codebase.

The Root Cause
The behavior you are seeing (Tool executes -> Conversation stops) happens because Sonnet 4 (and 3.5) is extremely strict about Conversation History integrity.

If you execute a tool but fail to persist the 
tool_calls
 block in the preceding Assistant message within your database/message history, the next request to Sonnet 4 will look like this:

User: "Check weather"
Assistant
: "Sure, checking..." (Missing 
tool_calls
 block)
Tool
: "25°C" (Orphaned result)
Sonnet 4 throws a validation error (or silently sends a generic stop) when it sees a 
tool
 role message without a matching tool_call_id in the previous assistant message. Haiku is sometimes more lenient or hallucinates the context, which is why it appeared to work.

How 
suna
 Solves This (The 3-Part Mechanism)
Here is exactly how kortix-ai/suna implements the flow to satisfy Sonnet 4:

1. The "Late Yield" of Finish Reason (Auto-Continue Trigger)
Even when execute_on_stream=False, the system relies on the finish_reason identifying as 'tool_calls'.

In 
response_processor.py
: The processor waits for the stream to finish (finish_reason detected as 
tool_calls
). It holds this status. It then executes the tools. Crucially, only after tools are processed does it yield the final status message to the 
ThreadManager
:
python
# response_processor.py lines 1217-1227
if finish_reason:
    # It ensures finish_reason is still 'tool_calls'
    finish_content = {"status_type": "finish", "finish_reason": finish_reason}
    if finish_reason == 'tool_calls':
        finish_content["tools_executed"] = True
    
    # This yielded message is what triggers the ThreadManager loop
    yield format_for_yield(finish_msg_obj)
In 
thread_manager.py
: The 
_check_auto_continue_trigger
 listens for this specific yielded chunk. If it sees finish_reason: 'tool_calls', it sets auto_continue_state['active'] = True, triggering the next turn.
2. Reconstructing the Assistant Message
Since you are streaming, the 
tool_calls
 arrive in chunks. You cannot just save the text content. You must aggregate the chunks and save the full 
tool_calls
 array to the Assistant Message.

In 
response_processor.py
 (lines 1027-1035): Before yielding the final assistant message, 
suna
 explicitly reconstructs the native tool calls from the buffer and saves them:
python
# Suna implementation pattern
message_data = {"role": "assistant", "content": final_content}
# CRITICAL: Re-attaching the aggregated tool calls to the permanent message record
if config.native_tool_calling and complete_native_tool_calls:
    # Convert to the format expected by the LLM provider (id, type, function)
    message_data["tool_calls"] = complete_native_tool_calls 
await self._add_message_with_agent_info(..., content=message_data, ...)
3. Strict Tool Result Parsing
The tool result message must be formatted exactly as OpenAI/Anthropic expects.

In 
response_processor.py
 (
_add_tool_result
, lines 2352-2357):
python
tool_message = {
    "role": "tool",
    "tool_call_id": tool_call["id"],  # MUST match the ID from step 2
    "name": function_name,
    "content": content_string         # MUST be a string (JSON dumped if dict)
}
Solution for Your Codebase
To fix the issue specifically for Sonnet 4, apply these three changes to your backend:

Step 1: Fix 
process_streaming_response
 to Save Tool Calls
Ensure that when the stream completes, you are updating the Assistant's message history to include the 
tool_calls
 list. If you only save the text content, the chain is broken.

python
# Inside your process_streaming_stream method, correctly finalize the assistant message:
# 1. Aggregate your tool_call chunks into a list of complete objects:
#    [{'id': 'call_123', 'type': 'function', 'function': {'name': 'foo', 'arguments': '{}'}}]
complete_tool_calls = self._aggregate_tool_chunks(native_tool_buffer)
# 2. When saving the final assistant message to your DB:
assistant_msg_content = {
    "role": "assistant",
    "content": accumulated_text_content,
    "tool_calls": complete_tool_calls  # <--- THIS IS LIKELY MISSING
}
await self.db.save_message(assistant_msg_content)
Step 2: Yield the Finish Reason After Tools
Ensure your generator doesn't exit early. It must yield the status that tells your loop to continue.

python
# In process_streaming_response, after tool execution logic:
if finish_reason == "tool_calls":
    # Signal the loop to continue
    yield {
        "type": "status",
        "content": {
            "status_type": "finish",
            "finish_reason": "tool_calls", # This string triggers the loop
            "tools_executed": True
        }
    }
Step 3: Validate Tool Result Format
Ensure your tool result formatting matches this exactly:

python
# When saving the tool execution result:
tool_result_message = {
    "role": "tool",
    "tool_call_id": original_tool_call_id, # From the assistant's tool_calls list
    "name": tool_name,
    "content": str(tool_output) # Ensure this is a string
}
Why Haiku Worked
Haiku 4.5 is a smaller, faster model that is often more "eager" to continue. It may have been Hallucinating the connection or treating the 
tool
 role message as a generic User message even without the proper tool_call_id linkage. Use Sonnet 4's strictness as the standard for your implementation.

 To fully fix the "not seen" issue for Haiku 4.5 (and Sonnet), you need both the backend fixes I just gave you AND the frontend logic update to 
ThreadContent.tsx
 that we discussed earlier.

Here is the breakdown of which fix solves what:

1. The Backend Fix (Backend/Database)
What it fixes: "The tool calls disappear after I refresh the page." Why:

Step 1 of my recommendation (message_data["tool_calls"] = ...) ensures the tool call data is actually written to your database.
Without this, Haiku 4.5 might execute the tool successfully, but since you didn't save the 
tool_calls
 block to the DB, the UI has nothing to render when it loads the history.
2. The Frontend Fix (ThreadContent.tsx)
What it fixes: "I don't see the tool call bubble while the bot is thinking." Why:

The original 
suna
 code was looking for XML tags (<tool>) to decide when to render.
Native tool calls come in as a separate metadata event (streamingToolCall).
The changes to 
ThreadContent.tsx
 (handling streamingToolCall independently of text content) are required to make the UI "see" the incoming tool event live.
Summary
If Haiku executes tools but you see nothing in the UI: You need the 
ThreadContent.tsx
 fix.
If Haiku executes tools and you see them live, but they vanish later: You need the Backend fix (Step 1).
If Sonnet stops after one tool: You need the Backend fix (Step 1 & 2).
Recommendation: Apply the backend fixes I provided to ensure robust saving, then verify your 
ThreadContent.tsx
 has the logic to render streamingToolCall (which it seems you were just editing). This covers all bases.
 Native Tool Call Rendering Architecture
This document explains how the kortix-ai/suna codebase correctly renders native tool calls (specifically from Claude Haiku 4.5) without relying on XML parsing in the text stream.

Core Concept: The Side-Channel Approach
Unlike legacy implementations that scrape streamingTextContent for <function_calls> or <ask> XML tags, this implementation treats tool calls as a separate data channel.

Text Channel: streamingTextContent (for normal text).
Tool Channel: streamingToolCall (for native tool execution metadata).
Because these are handled separately, the UI can render a tool call even if the text stream is completely empty.

1. The Hook Listener (
useAgentStream.ts
)
The process begins in the 
useAgentStream
 hook. It listens for specific tool_call_chunk status messages from the backend which contain the metadata of the tool being called, not text content.

// Inside handleStreamMessage
if (parsedMetadata.stream_status === 'tool_call_chunk') {
  const toolCalls = parsedMetadata.tool_calls || [];
  if (toolCalls.length > 0) {
    // 1. Update the dedicated toolCall state
    React.startTransition(() => {
      setToolCall(message); 
    });
    // 2. Trigger callback for the parent component
    callbacksRef.current.onToolCallChunk?.(message);
  }
}
Key Takeaway: The toolCall state is updated independently of textContent.

2. The Renderer Logic (
ThreadContent.tsx
)
This is where the actual integration happens. There are two critical logic blocks that make this work.

A. The "Phantom Group" Creation
When a native tool call starts, there is often no text content yet. Usually, 
ThreadContent
 only creates a new message group when streamingTextContent exists. To prevent the tool call from being "orphaned" (having nowhere to render), the code explicitly creates a placeholder group.

// Around line 426
if (streamingToolCall && !streamingTextContent) {
    const lastGroup = finalGroupedMessages.at(-1);
    
    // If there is no active group, OR the last group is a user message...
    if (!lastGroup || lastGroup.type !== 'assistant_group') {
        // ...FORCE the creation of a new assistant group
        assistantGroupCounter++;
        finalGroupedMessages.push({
            type: 'assistant_group',
            messages: [], // Empty messages array, but the group exists!
            key: `assistant-group-${assistantGroupCounter}-streaming-tool`
        });
    }
}
Why this is crucial: Without this, the render loop (which maps over finalGroupedMessages) would never execute the iteration where the tool call UI lives.

B. The Metadata Renderer
Inside the render loop, there is a dedicated block that renders streamingToolCall based purely on its existence and metadata, behaving completely independently of the text parsing logic.

// Around line 732, inside the group mapping
{groupIndex === finalGroupedMessages.length - 1 && 
    !readOnly && 
    streamingToolCall && 
    (() => {
         // Extract metadata directly
        const parsedMetadata = safeJsonParse(streamingToolCall.metadata, {});
        const toolCalls = parsedMetadata.tool_calls || [];
        // ... logic to distinguish between ask/complete and regular tools ...
        // Render the Tool UI Button
        return (
            <div className="mt-1.5">
                <button onClick={...}>
                    {/* Icons, Tool Name, Arguments derived from metadata */}
                    <AppIcon toolCall={firstToolCall} ... />
                    <span>{getUserFriendlyToolName(toolName)}</span>
                    <CircleDashed className="animate-spin ..." />
                </button>
            </div>
        );
    })()
}
Summary for Implementation
To replicate this in your codebase:

Backend: Ensure your backend sends tool_call_chunk status messages with the full tool definition in metadata.
Hook: Create a dedicated streamingToolCall state variable that catches these chunks.
UI Component:
Pass streamingToolCall as a prop separate from streamingText.
Crucial: Ensure your message grouping logic creates a "container" (group) if streamingToolCall is present, even if streamingText is null/empty.
Render: Add a conditional block at the end of your message list that checks if (streamingToolCall) and renders from its metadata directly.