# MCP Response Quick Start - Omni Integration Q&A

**Quick answers to common questions about making your MCP server work with Omni.**

---

## Core Questions

### Q1: What response format does Omni expect from my MCP server?

**A:** Omni expects the standard MCP protocol format:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Your response as a string"
    }
  ]
}
```

The `text` field must be a **string**. It can contain:
- JSON (as a string) → `JSON.stringify(data)`
- Markdown text
- Plain text
- Error messages

---

### Q2: How does Omni process my response internally?

**A:** Omni follows this flow:

1. **Your MCP server returns:** `{ content: [{ type: "text", text: "..." }] }`
2. **Omni extracts content:** Looks for `result.content[0].text`
3. **Creates ToolResult:** `{ success: true, output: "extracted string" }`
4. **Frontend detects format:** Automatically identifies if it's JSON, markdown, table data, etc.
5. **Frontend renders:** Displays as cards, tables, formatted text, or error boxes

**Key insight:** The extraction happens in `backend/core/tools/mcp_tool.py` via `_extract_content()` method.

---

### Q3: What data formats does Omni auto-detect and render beautifully?

**A:** Omni's frontend automatically detects these formats (no configuration needed):

| Format | Example Structure | Renders As |
|--------|------------------|------------|
| **Search Results** | `{"results": [{"title": "...", "url": "...", "description": "..."}]}` | 🎯 Search result cards with images |
| **Tables** | `[{"name": "John", "age": 30}, {"name": "Jane", "age": 25}]` | 📊 Sortable data table |
| **JSON Objects** | `{"key": "value", "nested": {...}}` | 📋 Collapsible JSON tree |
| **Markdown** | `# Heading\n**bold** text\n- list` | 📝 Formatted markdown |
| **CSV** | `name,age\nJohn,30\nJane,25` | 📈 Parsed table |
| **Key-Value** | `Name: John\nEmail: john@email.com` | 📄 Formatted key-value display |
| **URLs** | `https://example.com\nhttps://another.com` | 🔗 Clickable link list |
| **Errors** | `Error: Something failed` or `{"error": "..."}` | ⚠️ Red error box |
| **Plain Text** | Any other text | 📝 Clean text display |

**You don't configure this—it just works!**

---

### Q4: How do I return tabular data (like a list of items)?

**A:** Return an array of objects with consistent keys:

```python
# Python example
data = [
    {"id": 1, "name": "Campaign A", "status": "active", "opens": 1250},
    {"id": 2, "name": "Campaign B", "status": "draft", "opens": 0},
    {"id": 3, "name": "Campaign C", "status": "sent", "opens": 3400}
]

return {
    "content": [{
        "type": "text",
        "text": json.dumps(data, indent=2)
    }]
}
```

**Result:** Omni displays a sortable table with columns: id, name, status, opens

**Important:** All objects must have the same keys for table detection to work.

---

### Q5: How do I return search results with images?

**A:** Use the search results format:

```python
results = {
    "results": [
        {
            "title": "Result Title",
            "url": "https://example.com",
            "description": "Description of the result",
            "image": "https://example.com/image.jpg",  # Optional
            "author": "Author Name",  # Optional
            "date": "2024-01-01"  # Optional
        }
    ],
    "total": 10  # Optional
}

return {
    "content": [{
        "type": "text",
        "text": json.dumps(results)
    }]
}
```

**Result:** Omni displays beautiful search result cards with images, badges, and metadata.

---

### Q6: How do I format success messages nicely?

**A:** Use markdown for rich formatting:

```python
markdown_response = """
# ✅ Campaign Created Successfully!

Your email campaign has been created and is ready to send.

## Details
- **Campaign ID:** camp_123456
- **Recipients:** 5,000 subscribers
- **Scheduled:** Tomorrow at 9:00 AM

## Next Steps
1. Review the campaign preview
2. Send a test email
3. Confirm and schedule

[View Campaign →](https://example.com/campaigns/123456)
"""

return {
    "content": [{
        "type": "text",
        "text": markdown_response
    }]
}
```

**Result:** Omni renders formatted markdown with headings, bold text, lists, and links.

---

### Q7: How do I handle errors properly?

**A:** You have two options:

**Option 1: Simple error text**
```python
return {
    "content": [{
        "type": "text",
        "text": "Error: Invalid API key. Please check your Klaviyo credentials."
    }]
}
```

**Option 2: Structured error JSON**
```python
error_data = {
    "error": "Invalid API key",
    "code": "AUTH_ERROR",
    "details": "The provided API key does not exist or has been revoked",
    "tip": "Check your API key in Settings > Integrations"
}

return {
    "content": [{
        "type": "text",
        "text": json.dumps(error_data, indent=2)
    }]
}
```

**Result:** Both display as red error boxes in the Omni UI. The structured version shows better details.

---

### Q8: Can I return complex nested data?

**A:** Yes, but keep it reasonable (2-3 levels deep):

```python
data = {
    "campaign": {
        "id": "camp_123",
        "name": "Summer Sale",
        "status": "sent",
        "metrics": {
            "sent": 10000,
            "opens": 4500,
            "clicks": 1230,
            "conversions": 89
        },
        "top_links": [
            {"url": "/products", "clicks": 450},
            {"url": "/blog", "clicks": 320}
        ]
    }
}

return {
    "content": [{
        "type": "text",
        "text": json.dumps(data, indent=2)
    }]
}
```

**Result:** Omni displays a collapsible JSON tree that users can explore.

---

### Q9: How do I test my MCP server's responses?

**A:** Three-step testing process:

**Step 1: Test basic connectivity**
```bash
# Test tool discovery
curl -X POST http://localhost:8000/api/mcp/discover-custom-tools \
  -H "Content-Type: application/json" \
  -d '{
    "type": "http",
    "config": {"url": "http://localhost:3010"}
  }'
```

**Step 2: Test tool execution**
```bash
# Call a specific tool
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

**Step 3: Verify in Omni UI**
1. Connect your MCP server in Omni
2. Run the tool through the chat interface
3. Check if rendering looks correct
4. Open browser console for any errors

---

### Q10: What are the most common mistakes?

**A:** Avoid these pitfalls:

❌ **Mistake 1: Returning object instead of string**
```python
# WRONG
return {"content": [{"type": "text", "text": my_data_object}]}

# RIGHT
return {"content": [{"type": "text", "text": json.dumps(my_data_object)}]}
```

❌ **Mistake 2: Missing content wrapper**
```python
# WRONG
return "my response"

# RIGHT
return {"content": [{"type": "text", "text": "my response"}]}
```

❌ **Mistake 3: Inconsistent table data**
```python
# WRONG - Won't render as table
data = [
    {"name": "John", "age": 30},
    {"name": "Jane", "email": "jane@example.com"}  # Different keys!
]

# RIGHT - All objects have same keys
data = [
    {"name": "John", "age": 30, "email": "john@example.com"},
    {"name": "Jane", "age": 25, "email": "jane@example.com"}
]
```

❌ **Mistake 4: Binary data in text field**
```python
# WRONG
return {"content": [{"type": "text", "text": file_buffer}]}

# RIGHT - Use URLs or base64 with indication
return {"content": [{"type": "text", "text": "https://url-to-file.com/file.pdf"}]}
```

❌ **Mistake 5: Mixing formats**
```python
# WRONG - Confusing mix
text = "Here's the data: " + json.dumps(data)

# RIGHT - Choose one format
text = json.dumps(data)  # or just markdown, or just plain text
```

---

## Quick Reference Templates

### Template 1: Simple Success Message
```python
return {
    "content": [{
        "type": "text",
        "text": "✅ Operation completed successfully!"
    }]
}
```

### Template 2: Data Table
```python
data = [{"col1": "val1", "col2": "val2"}]
return {
    "content": [{
        "type": "text",
        "text": json.dumps(data, indent=2)
    }]
}
```

### Template 3: Search Results
```python
results = {"results": [{"title": "...", "url": "...", "description": "..."}]}
return {
    "content": [{
        "type": "text",
        "text": json.dumps(results, indent=2)
    }]
}
```

### Template 4: Markdown Report
```python
markdown = """
# Heading
## Section
- Point 1
- Point 2
"""
return {
    "content": [{
        "type": "text",
        "text": markdown
    }]
}
```

### Template 5: Error Response
```python
return {
    "content": [{
        "type": "text",
        "text": "Error: Something went wrong. Please try again."
    }]
}
```

---

## Troubleshooting

### Issue: "Tool result is empty"
**Cause:** Missing or incorrect `content` structure  
**Fix:** Ensure response has `{content: [{type: "text", text: "..."}]}`

### Issue: "UI shows [object Object]"
**Cause:** Forgot to stringify data  
**Fix:** Use `JSON.stringify(data)` or `json.dumps(data)`

### Issue: "Table not rendering from array"
**Cause:** Array objects have inconsistent keys  
**Fix:** Ensure all objects have the exact same keys

### Issue: "JSON not formatting nicely"
**Cause:** Invalid JSON string  
**Fix:** Use proper JSON methods: `JSON.stringify()` or `json.dumps()`

### Issue: "Search results not showing as cards"
**Cause:** Missing `results` key or incorrect structure  
**Fix:** Structure must be `{"results": [{"title": ..., "url": ..., "description": ...}]}`

---

## Platform-Specific Examples

### Python (FastAPI/Flask)
```python
import json

@app.post("/tool")
async def my_tool(params: dict):
    # Your logic here
    data = {"result": "success", "count": 42}
    
    return {
        "content": [{
            "type": "text",
            "text": json.dumps(data, indent=2)
        }]
    }
```

### TypeScript (Express/Node)
```typescript
app.post('/tool', async (req, res) => {
  // Your logic here
  const data = { result: "success", count: 42 };
  
  res.json({
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  });
});
```

---

## Advanced Tips

### Tip 1: Format dates nicely
```python
# Instead of ISO timestamp
"created": "2024-01-15T10:30:00Z"

# Use readable format
"created": datetime.strptime(timestamp, "%Y-%m-%d").strftime("%B %d, %Y")
# Result: "January 15, 2024"
```

### Tip 2: Include metadata for pagination
```python
{
    "results": [...],
    "total": 1000,
    "page": 1,
    "per_page": 25,
    "has_more": true
}
```

### Tip 3: Use emojis for visual feedback
```python
"✅ Success", "⚠️ Warning", "❌ Error", "🔄 Processing", "📊 Results"
```

### Tip 4: Provide actionable error messages
```python
# Instead of generic
"Error: Failed"

# Be specific and helpful
"Error: API rate limit exceeded. Please wait 60 seconds and try again. Current limit: 100 requests/minute."
```

### Tip 5: Add helpful links in markdown
```markdown
# Success!

Your campaign was created.

[View Campaign Dashboard →](https://app.example.com/campaigns/123)
[Edit Campaign Settings →](https://app.example.com/campaigns/123/edit)
```

---

## Implementation Checklist

Before deploying your MCP server, verify:

- [ ] All responses have `{content: [{type: "text", text: "..."}]}` structure
- [ ] Data objects are converted to strings with `JSON.stringify()` or `json.dumps()`
- [ ] Table data uses consistent keys across all array items
- [ ] Dates are formatted in human-readable format
- [ ] Error messages are clear and actionable
- [ ] Success messages include relevant details
- [ ] Search results include `title`, `url`, and `description` fields
- [ ] Markdown doesn't mix with JSON (choose one format per response)
- [ ] Tested responses in Omni UI and verified correct rendering
- [ ] Checked browser console for any frontend errors

---

## Next Steps

1. ✅ **Start Simple:** Copy Template 1 or 2 and get basic responses working
2. 📊 **Add Structure:** Format your data as tables or search results
3. 🎨 **Make it Pretty:** Add markdown formatting for better UX
4. 🧪 **Test Everything:** Verify in Omni UI that rendering looks perfect
5. 🚀 **Deploy:** Ship your MCP server!

---

## Additional Resources

- **[Complete Guide →](./MCP_RESPONSE_GUIDE.md)** - Deep dive with all details
- **[Implementation Guide →](./mcp-servers/README_MCP_RESPONSES.md)** - Full documentation
- **[Example Templates →](./mcp-servers/EXAMPLE_TEMPLATE.py)** - Copy-paste code

---

## Summary: The Golden Rule

**Your MCP server must return this structure:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "<STRING containing your data>"
    }
  ]
}
```

**The text field can be:**
- JSON string → Auto-rendered as tables, cards, or JSON tree
- Markdown → Auto-rendered with formatting
- Plain text → Clean display
- Error message → Red error box

**Omni's frontend does the rest automatically!** 🎉

---

**Happy building! 🚀**

For questions or issues, refer to the [complete MCP Response Guide](./MCP_RESPONSE_GUIDE.md).


