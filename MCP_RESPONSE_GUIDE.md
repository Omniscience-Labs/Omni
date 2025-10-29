# Complete Guide: How Omni Processes MCP Responses

This guide explains how Omni processes responses from MCP (Model Context Protocol) servers, so you can ensure your custom MCP server returns data in the expected format.

## Table of Contents
1. [MCP Response Flow Overview](#mcp-response-flow-overview)
2. [Expected Response Format](#expected-response-format)
3. [Content Extraction Process](#content-extraction-process)
4. [Tool Result Format](#tool-result-format)
5. [Frontend Rendering](#frontend-rendering)
6. [Best Practices](#best-practices)
7. [Examples](#examples)

---

## MCP Response Flow Overview

```
┌─────────────────┐
│  Your MCP       │
│  Server         │
└────────┬────────┘
         │ Returns response
         ▼
┌─────────────────┐
│ MCP Client      │
│ (streamablehttp,│
│  sse, or stdio) │
└────────┬────────┘
         │ session.call_tool()
         ▼
┌─────────────────┐
│ MCPToolExecutor │
│ _extract_content│
└────────┬────────┘
         │ Extracts text/content
         ▼
┌─────────────────┐
│ ToolResult      │
│ success: bool   │
│ output: string  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Frontend UI     │
│ (Smart content  │
│  detection &    │
│  rendering)     │
└─────────────────┘
```

---

## Expected Response Format

### Standard MCP Tool Response

Your MCP server should return a response that follows the MCP protocol spec. The key structure Omni looks for:

```typescript
// Standard MCP response format
{
  content: [
    {
      type: "text",
      text: "Your actual content here"
    }
  ]
}
```

Or simpler:

```typescript
{
  content: {
    text: "Your actual content here"
  }
}
```

### What Omni Extracts

Omni's `_extract_content()` method processes your response like this:

```python
def _extract_content(self, result) -> str:
    """Extract text content from MCP tool result"""
    
    if hasattr(result, 'content'):
        content = result.content
        
        # Case 1: Content is a list of items
        if isinstance(content, list):
            text_parts = []
            for item in content:
                if hasattr(item, 'text'):
                    text_parts.append(item.text)
                else:
                    text_parts.append(str(item))
            return "\n".join(text_parts)
        
        # Case 2: Content is a single object with text
        elif hasattr(content, 'text'):
            return content.text
        
        # Case 3: Content is something else
        else:
            return str(content)
    else:
        # Fallback: stringify the whole result
        return str(result)
```

**Key Points:**
- Omni looks for `result.content` first
- If `content` is a list, it extracts `.text` from each item
- Multiple items are joined with newlines
- Everything eventually becomes a string

---

## Tool Result Format

After extraction, Omni wraps the content in a `ToolResult`:

```python
@dataclass
class ToolResult:
    success: bool    # Whether execution succeeded
    output: str      # The extracted content as a string
```

### Success Response

```python
ToolResult(
    success=True,
    output="<your extracted content as string>"
)
```

### Error Response

```python
ToolResult(
    success=False,
    output="Error message describing what went wrong"
)
```

---

## Frontend Rendering

The frontend has **intelligent content detection** that automatically formats your response based on what it contains!

### Supported Formats

The frontend detects and renders these formats:

#### 1. **Search Results** (automatically detected)
```json
{
  "results": [
    {
      "title": "Result Title",
      "url": "https://example.com",
      "description": "Description text",
      "image": "https://example.com/image.jpg",
      "author": "Author Name",
      "date": "2024-01-01"
    }
  ]
}
```

Renders as: Beautiful card-based search results with images, badges, and metadata

#### 2. **Tables** (automatically detected)
```json
[
  {"name": "John", "age": 30, "city": "NYC"},
  {"name": "Jane", "age": 25, "city": "LA"}
]
```

Renders as: Clean data table with sortable columns

#### 3. **JSON** (automatically detected)
```json
{
  "key": "value",
  "nested": {
    "data": "here"
  }
}
```

Renders as: Collapsible JSON tree with syntax highlighting

#### 4. **Markdown**
```markdown
# Heading

This is **bold** and this is *italic*

- List item 1
- List item 2
```

Renders as: Formatted markdown with proper styling

#### 5. **CSV**
```csv
name,age,city
John,30,NYC
Jane,25,LA
```

Renders as: Table parsed from CSV

#### 6. **Key-Value Pairs**
```
Name: John Doe
Email: john@example.com
Status: Active
```

Renders as: Formatted key-value display

#### 7. **URL Lists**
```
https://example.com
https://another-example.com
```

Renders as: Clickable link list

#### 8. **Errors**
```
Error: Something went wrong
Failed to process request
```

Renders as: Red error box with error icon

#### 9. **Plain Text**
```
Just plain text content here
```

Renders as: Readable text with proper spacing

---

## Best Practices

### ✅ DO

1. **Return structured data when possible**
   ```json
   {
     "status": "success",
     "data": {
       "results": [...],
       "count": 10
     }
   }
   ```

2. **Use clear success/error indicators**
   ```json
   {
     "success": true,
     "message": "Operation completed successfully",
     "data": {...}
   }
   ```

3. **Format dates properly**
   ```json
   {
     "date": "2024-01-01T12:00:00Z"  // ISO 8601
   }
   ```

4. **Include helpful metadata**
   ```json
   {
     "results": [...],
     "total": 100,
     "page": 1,
     "per_page": 10
   }
   ```

5. **Return meaningful error messages**
   ```json
   {
     "error": "API key invalid",
     "code": "AUTH_ERROR",
     "details": "The provided API key does not exist"
   }
   ```

### ❌ DON'T

1. **Don't return binary data directly**
   - Instead, return URLs or base64 with clear indication

2. **Don't use overly nested structures**
   - Keep it simple; frontend can handle 2-3 levels easily

3. **Don't return huge strings without structure**
   - Break into array of items or use proper formatting

4. **Don't mix formats**
   - Pick JSON, Markdown, or plain text - not a weird mix

---

## Examples

### Example 1: Search Tool Response

**Your MCP Server Returns:**
```python
# In your MCP server
return {
    "content": [
        {
            "type": "text",
            "text": json.dumps({
                "results": [
                    {
                        "title": "Klaviyo Email Marketing",
                        "url": "https://klaviyo.com",
                        "description": "Email marketing platform",
                        "image": "https://example.com/logo.png"
                    },
                    {
                        "title": "Klaviyo Docs",
                        "url": "https://developers.klaviyo.com",
                        "description": "Developer documentation"
                    }
                ],
                "total": 2
            })
        }
    ]
}
```

**Omni Processes:**
1. Extracts: `content[0].text`
2. Creates: `ToolResult(success=True, output="<json string>")`
3. Frontend detects: "This is search results JSON!"
4. Renders: Beautiful search result cards with images and links

---

### Example 2: Simple Status Response

**Your MCP Server Returns:**
```python
return {
    "content": [
        {
            "type": "text",
            "text": "✅ Campaign created successfully! Campaign ID: camp_123"
        }
    ]
}
```

**Omni Processes:**
1. Extracts: `content[0].text`
2. Creates: `ToolResult(success=True, output="✅ Campaign created...")`
3. Frontend detects: "Plain text with success indicator"
4. Renders: Clean text display with green success styling

---

### Example 3: Data Table Response

**Your MCP Server Returns:**
```python
return {
    "content": [
        {
            "type": "text",
            "text": json.dumps([
                {"email": "user1@example.com", "status": "subscribed", "tags": 2},
                {"email": "user2@example.com", "status": "unsubscribed", "tags": 0},
                {"email": "user3@example.com", "status": "subscribed", "tags": 5}
            ])
        }
    ]
}
```

**Omni Processes:**
1. Extracts: `content[0].text`
2. Creates: `ToolResult(success=True, output="<json array>")`
3. Frontend detects: "This is a JSON array of objects - it's tabular data!"
4. Renders: Sortable data table with proper formatting

---

### Example 4: Error Response

**Your MCP Server Returns:**
```python
return {
    "content": [
        {
            "type": "text",
            "text": "Error: Invalid API key. Please check your Klaviyo API credentials."
        }
    ]
}
```

**Omni Processes:**
1. Extracts: `content[0].text`
2. Creates: `ToolResult(success=False, output="Error: Invalid...")`
3. Frontend detects: "This contains 'Error:' - it's an error message!"
4. Renders: Red error box with warning icon

---

### Example 5: Markdown Response

**Your MCP Server Returns:**
```python
markdown_content = """
# Campaign Summary

## Metrics
- **Sent:** 1,000 emails
- **Opens:** 450 (45%)
- **Clicks:** 123 (12.3%)

## Top Links
1. Product Page - 45 clicks
2. Blog Post - 32 clicks
3. Contact Us - 20 clicks
"""

return {
    "content": [
        {
            "type": "text",
            "text": markdown_content
        }
    ]
}
```

**Omni Processes:**
1. Extracts: `content[0].text`
2. Creates: `ToolResult(success=True, output=markdown_content)`
3. Frontend detects: "This has markdown headers and formatting!"
4. Renders: Beautiful formatted markdown with headings, bold, lists

---

## Quick Reference

### Minimal Working Response
```python
{
    "content": [{"type": "text", "text": "Your response here"}]
}
```

### Recommended JSON Response
```python
{
    "content": [{
        "type": "text",
        "text": json.dumps({
            "success": True,
            "message": "Operation completed",
            "data": {
                # Your actual data here
            }
        })
    }]
}
```

### Error Response
```python
{
    "content": [{
        "type": "text",
        "text": "Error: Clear description of what went wrong"
    }]
}
```

---

## Testing Your Response

### Step 1: Check Basic Format
```bash
# Test your MCP server returns the right structure
curl -X POST http://localhost:3010/mcp/call-tool \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "your_tool_name",
      "arguments": {}
    }
  }'
```

### Step 2: Verify Content Extraction
The response should have:
- ✅ A `content` field
- ✅ Either an array or object with `text`
- ✅ No binary data in the text field
- ✅ Proper JSON if returning structured data

### Step 3: Test in Omni
1. Connect your MCP server in Omni
2. Run a tool
3. Check the UI - does it render nicely?
4. Open browser console - any errors?

---

## Common Issues

### Issue: "Tool result is empty"
**Cause:** Response doesn't have `content` field
**Fix:** Wrap your response in MCP format:
```python
return {"content": [{"type": "text", "text": your_data}]}
```

### Issue: "UI shows [object Object]"
**Cause:** Returning JavaScript object instead of string
**Fix:** JSON.stringify() your data before putting in text field

### Issue: "JSON not formatting nicely"
**Cause:** Invalid JSON string
**Fix:** Use `json.dumps()` (Python) or `JSON.stringify()` (JS) properly

### Issue: "Table not rendering from array"
**Cause:** Array items aren't consistent objects
**Fix:** Ensure all array items have the same keys:
```python
# Good
[{"a": 1, "b": 2}, {"a": 3, "b": 4}]

# Bad (missing keys)
[{"a": 1}, {"b": 2}]
```

---

## Summary

**For your MCP server:**
1. Return standard MCP format with `content` field
2. Put your actual data in `text` field
3. Use JSON for structured data, Markdown for rich text, plain text for simple messages
4. Include success/error indicators
5. Keep it simple - the frontend will make it beautiful!

**Omni will:**
1. Extract the text from your response
2. Detect the format automatically
3. Render it beautifully in the UI
4. Handle errors gracefully

That's it! Your MCP server just needs to return data in one of these formats, and Omni handles the rest. 🚀



