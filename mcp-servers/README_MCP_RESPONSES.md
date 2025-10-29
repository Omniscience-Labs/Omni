# MCP Response Processing Guide for Omni

**Complete documentation for making your MCP servers work beautifully with Omni.**

---

## 📚 Documentation Index

Choose the guide that fits your needs:

### Quick Start (5 minutes)
👉 **[MCP_RESPONSE_QUICK_START.md](../MCP_RESPONSE_QUICK_START.md)**
- Minimal working examples
- Copy-paste templates
- Common mistakes to avoid

### Complete Guide (30 minutes)
👉 **[MCP_RESPONSE_GUIDE.md](../MCP_RESPONSE_GUIDE.md)**
- Full explanation of response flow
- All supported formats
- Frontend rendering details
- Troubleshooting guide

### Code Templates
👉 **[EXAMPLE_TEMPLATE.py](./EXAMPLE_TEMPLATE.py)** - Python implementation  
👉 **[EXAMPLE_TEMPLATE.ts](./EXAMPLE_TEMPLATE.ts)** - TypeScript implementation

### Klaviyo Integration
👉 **[klaviyo/OMNI_INTEGRATION_GUIDE.md](./klaviyo/OMNI_INTEGRATION_GUIDE.md)**
- Specific improvements for Klaviyo MCP server
- Before/after comparisons
- Copy-paste improvements

---

## 🎯 What You Need to Know

### The One Rule

Your MCP server must return:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Your response here (string)"
    }
  ]
}
```

That's it! The `text` field can contain:
- ✅ JSON string → Omni auto-detects format
- ✅ Markdown → Omni renders it beautifully
- ✅ Plain text → Omni displays it cleanly
- ✅ Error messages → Omni shows them in red

---

## 🎨 Auto-Detected Formats

Omni's frontend automatically detects and formats:

| Your Response | Omni Displays |
|--------------|---------------|
| `{"results": [{"title": "...", "url": "..."}]}` | 🎯 Search result cards |
| `[{"id": 1, "name": "John"}, {"id": 2, "name": "Jane"}]` | 📊 Sortable table |
| `{"key": "value", "nested": {...}}` | 📋 Collapsible JSON tree |
| `# Heading\n**bold** text` | 📝 Formatted markdown |
| `Error: Something failed` | ⚠️ Red error box |
| `name,age\nJohn,30` | 📈 CSV table |

**You don't configure this - it just works!**

---

## 🚀 Quick Implementation Path

### Level 1: Basic (5 minutes)
Just wrap your current response:

```typescript
// Before
return JSON.stringify(data);

// After
return {
  content: [{ type: "text", text: JSON.stringify(data) }]
};
```

### Level 2: Formatted (15 minutes)
Transform your data for better display:

```typescript
// Instead of raw API response
const rawData = await api.get('/items');

// Format it
const formattedData = rawData.map(item => ({
  id: item.id,
  name: item.attributes.name,
  status: item.attributes.status,
  created: new Date(item.attributes.created).toLocaleDateString()
}));

return {
  content: [{
    type: "text",
    text: JSON.stringify(formattedData, null, 2)
  }]
};
```

### Level 3: Rich (30 minutes)
Use markdown for beautiful reports:

```typescript
const markdown = `
# ✅ Success!

Your operation completed successfully.

## Results
- **Items Created:** ${count}
- **Status:** Active
- **Next Steps:** Review in dashboard

## Details
\`\`\`json
${JSON.stringify(details, null, 2)}
\`\`\`
`;

return {
  content: [{ type: "text", text: markdown }]
};
```

---

## 🔍 How Omni Processes Your Response

```
┌─────────────────────────────────────────────────┐
│ 1. Your MCP Server Returns                     │
│    { content: [{ type: "text", text: "..." }]} │
└───────────────┬─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────┐
│ 2. MCP Client Extracts                         │
│    result.content[0].text → string             │
└───────────────┬─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────┐
│ 3. Backend Creates ToolResult                   │
│    { success: true, output: "..." }            │
└───────────────┬─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────┐
│ 4. Frontend Detects Format                     │
│    Is it JSON? Table? Markdown? Error?         │
└───────────────┬─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────┐
│ 5. Frontend Renders Beautifully                │
│    Cards, tables, JSON trees, markdown, etc.   │
└─────────────────────────────────────────────────┘
```

---

## 💡 Best Practices

### ✅ DO

1. **Return structured data when possible**
   ```json
   {"results": [...], "total": 100, "page": 1}
   ```

2. **Format dates nicely**
   ```javascript
   created: new Date(timestamp).toLocaleDateString()
   ```

3. **Use markdown for reports**
   ```markdown
   # Report\n## Section\n- Item 1\n- Item 2
   ```

4. **Include helpful error context**
   ```json
   {"error": "...", "code": "...", "tip": "Check your API key"}
   ```

5. **Keep arrays consistent**
   ```json
   [{"a": 1, "b": 2}, {"a": 3, "b": 4}]  ✅
   ```

### ❌ DON'T

1. **Don't return raw objects**
   ```javascript
   return {data: myObject}  // ❌ Won't work
   ```

2. **Don't forget to stringify**
   ```javascript
   text: myObject  // ❌ Wrong
   text: JSON.stringify(myObject)  // ✅ Right
   ```

3. **Don't return binary data**
   ```javascript
   text: Buffer.from(...)  // ❌ Won't work
   text: "https://url-to-file"  // ✅ Use URLs
   ```

4. **Don't mix formats**
   ```javascript
   text: "JSON: " + JSON.stringify(obj)  // ❌ Confusing
   ```

---

## 🧪 Testing Your Responses

### Test Discovery
```bash
curl -X POST http://localhost:8000/api/mcp/discover-custom-tools \
  -H "Content-Type: application/json" \
  -d '{
    "type": "http",
    "config": {"url": "http://localhost:3010"}
  }'
```

### Test Tool Execution
Connect your MCP server in Omni and:
1. Run a tool
2. Check the output format
3. Open browser console for errors
4. Iterate and improve!

---

## 🐛 Common Issues & Fixes

### Issue: "Tool result is empty"
**Fix:** Ensure you return `{content: [{type: "text", text: "..."}]}`

### Issue: "Shows [object Object]"
**Fix:** Use `JSON.stringify()` on your data

### Issue: "Table not rendering"
**Fix:** Ensure all array items have the same keys

### Issue: "Format detection wrong"
**Fix:** Check your JSON structure matches expected patterns

### Issue: "Error: Invalid response"
**Fix:** Response must be a string, not an object

---

## 📖 Examples by Use Case

### API Data → Table
```typescript
const data = await api.get('/items');
const formatted = data.map(item => ({
  id: item.id,
  name: item.name,
  status: item.status
}));
return { content: [{ type: "text", text: JSON.stringify(formatted) }] };
```

### Search Results → Cards
```typescript
const results = { results: [...] };  // With title, url, description
return { content: [{ type: "text", text: JSON.stringify(results) }] };
```

### Status Update → Markdown
```typescript
const md = `# Status\n✅ Complete\n- Time: 2.5s\n- Items: 100`;
return { content: [{ type: "text", text: md }] };
```

### Error → Error Box
```typescript
const error = { error: "Failed to connect", code: "CONNECTION_ERROR" };
return { content: [{ type: "text", text: JSON.stringify(error) }] };
```

---

## 🎓 Next Steps

1. **Start Simple:** Get basic format working (5 min)
2. **Add Formatting:** Transform data for better display (15 min)
3. **Go Advanced:** Add markdown reports and rich formatting (30 min)
4. **Test Everything:** Verify in Omni UI
5. **Iterate:** Improve based on how it looks

---

## 🤝 Support

- **Full Documentation:** [MCP_RESPONSE_GUIDE.md](../MCP_RESPONSE_GUIDE.md)
- **Quick Reference:** [MCP_RESPONSE_QUICK_START.md](../MCP_RESPONSE_QUICK_START.md)
- **Templates:** [EXAMPLE_TEMPLATE.ts](./EXAMPLE_TEMPLATE.ts) / [EXAMPLE_TEMPLATE.py](./EXAMPLE_TEMPLATE.py)
- **Klaviyo Specific:** [klaviyo/OMNI_INTEGRATION_GUIDE.md](./klaviyo/OMNI_INTEGRATION_GUIDE.md)

---

## ✨ Remember

**The key insight:** Omni's frontend is incredibly smart. You just need to return your data in a reasonable format, and it will automatically detect and render it beautifully!

You don't need to specify how to render - just return good data structure. 🎉

---

Happy building! 🚀



