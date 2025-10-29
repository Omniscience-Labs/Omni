# Debug MCP Connection Issue

The MCP server is running and working (tested with Inspector), but Omni can't discover tools.

## Quick Debug Steps:

### 1. Check Omni Backend Logs

Look at your Omni backend terminal for error messages. You should see something like:

```
Failed to connect to klaviyo: [error message]
```

or

```
MCP connection timeout...
```

### 2. Check if Omni Backend Can Reach the Server

From the machine running Omni backend:

```bash
curl http://localhost:3010/health
```

Should return: `{"status":"healthy","service":"klaviyo-mcp-server"}`

### 3. Test Discovery Manually

Try the discovery endpoint that Omni uses:

```bash
curl -X POST http://localhost:8000/api/mcp/discover-custom-tools \
  -H "Content-Type: application/json" \
  -d '{
    "type": "sse",
    "config": {
      "url": "http://localhost:3010/sse"
    }
  }'
```

This simulates what the UI does. You should get back a list of tools.

### 4. Common Issues:

**Issue A: Omni backend in Docker**
- If backend is in Docker, it can't reach `localhost:3010`
- Check: `docker ps | grep omni`
- Solution: Use `http://host.docker.internal:3010/sse` (Mac/Windows)

**Issue B: CORS or Network**
- MCP server might need CORS headers
- Check browser console for CORS errors

**Issue C: Timeout**
- Connection might be timing out
- Check backend logs for timeout errors

### 5. Verify Both Services Are Running

```bash
# Check MCP server
curl http://localhost:3010/health

# Check Omni backend
curl http://localhost:8000/health
# or whatever your backend health endpoint is
```

## Next Steps:

1. Check Omni backend logs - what error do you see?
2. Run the discovery test command above
3. Let me know what errors you get

