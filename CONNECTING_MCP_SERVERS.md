# Connecting Your MCP Server to Omni - Form Guide

**A complete guide on what information you need to connect your custom MCP server to Omni.**

---

## Required Information

To connect your MCP server to Omni, you'll need to fill in the following fields in the connection form:

### 1. **Server Type** (Required)

Choose the transport protocol your MCP server uses:

| Option | When to Use | Description |
|--------|-------------|-------------|
| **HTTP** | Most common | Standard HTTP/HTTPS connections. Use this for REST-style MCP servers or servers hosted on platforms like Render, Vercel, etc. |
| **SSE** | Real-time | Server-Sent Events. Use this if your MCP server supports streaming responses. |

**Default choice:** `http` (recommended for most use cases)

**Example:**
```
Server Type: HTTP ✓
```

---

### 2. **MCP Server Name** (Required)

A friendly, memorable name to identify this MCP server in your Omni workspace.

**Guidelines:**
- Use a descriptive name that indicates what the server does
- Keep it short but meaningful
- Examples: "Klaviyo Integration", "Gmail MCP Server", "Custom File Tools"

**Examples:**
```
✓ "Klaviyo Marketing Tools"
✓ "Slack Workspace Integration"
✓ "Company Database MCP"
✓ "Personal Gmail Assistant"

✗ "server1" (too generic)
✗ "my-mcp-server-for-handling-emails-and-calendar" (too long)
```

---

### 3. **MCP Server URL** (Required)

The complete URL endpoint where your MCP server is hosted.

**Format Requirements:**
- Must be a valid URL
- Must include the protocol (`http://` or `https://`)
- Should point to your MCP server's root endpoint

**Common Deployment Platforms:**

#### Render
```
https://your-service-name.onrender.com
```

#### Vercel
```
https://your-project.vercel.app
```

#### Railway
```
https://your-service.railway.app
```

#### Local Development
```
http://localhost:3010
```

#### Custom Domain
```
https://mcp.yourdomain.com
```

**Examples:**
```
✓ https://klaviyo-mcp.onrender.com
✓ http://localhost:3000
✓ https://mcp-server.mycompany.com
✓ https://my-mcp-service.vercel.app

✗ klaviyo-mcp.onrender.com (missing protocol)
✗ https://example.com/api (should be root URL, not path)
```

---

### 4. **Custom Headers** (Optional)

Additional HTTP headers to send with every request to your MCP server. This is commonly used for authentication or custom configuration.

**When to Use:**
- Your MCP server requires authentication via headers
- Your MCP server needs custom metadata
- Your service requires an API key in headers

**Common Header Examples:**

#### API Key Authentication
```
Header Name:  Authorization
Header Value: Bearer your_api_key_here
```

#### Custom API Key Header
```
Header Name:  X-API-Key
Header Value: your_api_key_here
```

#### Basic Authentication
```
Header Name:  Authorization
Header Value: Basic base64_encoded_credentials
```

#### Custom Tenant/Workspace Header
```
Header Name:  X-Workspace-ID
Header Value: workspace_123
```

#### Multiple Headers Example
```
Header 1:
  Name:  Authorization
  Value: Bearer sk_live_abc123

Header 2:
  Name:  X-Custom-Header
  Value: custom_value
```

**Security Features:**
- Omni automatically detects sensitive headers (containing "authorization", "bearer", "token", "key", "secret", "password")
- Sensitive values are masked with a password field (👁️ icon to toggle visibility)
- Headers are securely stored in the database

**Pro Tips:**
- Only add headers that your MCP server actually requires
- Don't include `Content-Type` or `Accept` headers (Omni handles these automatically)
- Keep API keys and secrets secure

---

## Step-by-Step: Filling Out the Form

### Step 1: Choose Server Type
1. Open the "Connect Custom MCP Server" dialog in Omni
2. Select between **HTTP** or **SSE**
   - Choose **HTTP** if unsure (works for 99% of cases)

### Step 2: Enter Server Details
1. **Server Name:** Enter a descriptive name
   ```
   Example: "Klaviyo Marketing Tools"
   ```

2. **Server URL:** Enter your complete MCP server URL
   ```
   Example: https://klaviyo-mcp.onrender.com
   ```

### Step 3: Add Custom Headers (If Needed)
1. Click **"+ Add Header"** button
2. Enter the header name and value
3. For sensitive headers like API keys:
   - The value field will automatically become a password field
   - Use the 👁️ icon to show/hide the value
4. Add more headers if needed
5. Remove unwanted headers with the **×** button

### Step 4: Test Connection
1. Click **"Connect & Discover Tools"**
2. Omni will:
   - Validate your URL
   - Connect to your MCP server
   - Discover available tools
   - Show you a list of tools to select

### Step 5: Select Tools
1. Review the discovered tools from your MCP server
2. Select which tools you want to enable
3. Click **"Save MCP Server"**

---

## Complete Examples

### Example 1: Simple Local Development Server

```yaml
Server Type:    HTTP
Server Name:    My Local MCP Server
Server URL:     http://localhost:3010
Custom Headers: (none)
```

---

### Example 2: Production Server with API Key

```yaml
Server Type:    HTTP
Server Name:    Klaviyo Marketing Platform
Server URL:     https://klaviyo-mcp.onrender.com
Custom Headers:
  - Name:  Authorization
    Value: Bearer sk_live_abc123def456
```

---

### Example 3: Enterprise Server with Multiple Headers

```yaml
Server Type:    HTTP
Server Name:    Company CRM Integration
Server URL:     https://crm-mcp.company.com
Custom Headers:
  - Name:  Authorization
    Value: Bearer company_api_key_xyz
  - Name:  X-Tenant-ID
    Value: tenant_prod_001
  - Name:  X-Environment
    Value: production
```

---

### Example 4: SSE Server for Real-time Updates

```yaml
Server Type:    SSE
Server Name:    Real-time Analytics Dashboard
Server URL:     https://analytics-mcp.service.com
Custom Headers:
  - Name:  X-API-Key
    Value: analytics_key_123
```

---

## Testing Your Connection

### Before You Connect
Make sure your MCP server is:
- ✅ Running and accessible at the URL you provided
- ✅ Responding to health checks or discovery requests
- ✅ Implementing the MCP protocol correctly
- ✅ Returning tools in the expected format

### Testing Locally
If developing locally, test your server first:

```bash
# Test if your server is running
curl http://localhost:3010/health

# Test MCP discovery (if your server supports it)
curl -X POST http://localhost:3010/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list", "params": {}}'
```

### Common Connection Errors

#### Error: "Failed to connect to the MCP server"
**Causes:**
- URL is incorrect or server is down
- Server is not accessible from Omni's network
- CORS issues (for HTTP servers)

**Solutions:**
- Verify the URL is correct
- Check that your server is running
- For local development, ensure your machine is accessible
- Check server logs for errors

#### Error: "No tools found"
**Causes:**
- Server connected but returned no tools
- Server doesn't implement MCP tool discovery correctly

**Solutions:**
- Check your MCP server's tool registration
- Review server logs to see what was returned
- Ensure tools are properly exported

#### Error: "Unauthorized" or "403 Forbidden"
**Causes:**
- Missing or incorrect authentication headers
- Invalid API key

**Solutions:**
- Add the required authentication header
- Verify your API key is correct and active
- Check header name matches what server expects

---

## After Connecting

Once connected successfully:

1. ✅ Your MCP server appears in the "Custom MCP Servers" section
2. ✅ Selected tools are available to your agents
3. ✅ You can enable/disable individual tools
4. ✅ You can edit or remove the connection anytime

### Managing Your Connection

**To edit:** Click the settings icon next to your MCP server
**To disconnect:** Remove the server from your agent's configuration
**To reconnect:** Use the same form to update URL or headers

---

## Security Best Practices

### Protecting API Keys
- ✅ Always use environment variables in your MCP server code
- ✅ Never commit API keys to version control
- ✅ Use Omni's credential profiles for shared configurations
- ✅ Rotate API keys regularly

### Using HTTPS
- ✅ Use `https://` URLs for production servers
- ✅ Only use `http://` for local development
- ✅ Ensure your SSL certificates are valid

### Header Security
- ✅ Only add headers that are necessary
- ✅ Use strong, unique API keys
- ✅ Don't share header values publicly
- ✅ Review Omni's audit logs for suspicious activity

---

## Platform-Specific Guides

### Deploying on Render

1. Deploy your MCP server to Render
2. Copy the service URL from Render dashboard
   ```
   https://your-service-name.onrender.com
   ```
3. If you set environment variables in Render, add corresponding headers:
   ```
   Header: Authorization
   Value: Bearer ${YOUR_RENDER_ENV_VAR}
   ```

### Deploying on Vercel

1. Deploy your MCP server as a Vercel function
2. Copy the deployment URL
   ```
   https://your-project.vercel.app
   ```
3. Add Vercel environment variables as headers if needed

### Using with Podcastfy

Example for the Podcastfy service mentioned in memories:
```yaml
Server Type:    HTTP
Server Name:    Podcastfy Service
Server URL:     https://varnica-dev-podcastfy.onrender.com
Custom Headers: (if API key required)
  - Name:  Authorization
    Value: Bearer your_podcastfy_api_key
```

---

## Troubleshooting Checklist

Before asking for help, verify:

- [ ] Server Type is correct (HTTP vs SSE)
- [ ] Server Name is filled in
- [ ] Server URL is complete and valid (includes `https://`)
- [ ] Server is accessible from your browser
- [ ] Custom headers are formatted correctly
- [ ] API keys in headers are valid and not expired
- [ ] Server implements MCP protocol correctly
- [ ] Server returns tools in the expected format
- [ ] No CORS issues (check browser console)
- [ ] Server logs show successful connections

---

## Quick Reference

### Minimum Required Fields
```yaml
Server Type:  http
Server Name:  <your-server-name>
Server URL:   https://your-server.com
```

### With Authentication
```yaml
Server Type:  http
Server Name:  <your-server-name>
Server URL:   https://your-server.com
Headers:
  - Authorization: Bearer <api-key>
```

### Local Development
```yaml
Server Type:  http
Server Name:  Local Dev Server
Server URL:   http://localhost:3010
```

---

## Related Documentation

- **[MCP Response Format Guide →](./MCP_RESPONSE_QUICK_START.md)** - How to format your server's responses
- **[MCP Response Processing →](./MCP_RESPONSE_GUIDE.md)** - Deep dive into response handling
- **[Example MCP Server →](./mcp-servers/EXAMPLE_TEMPLATE.py)** - Template to build your own server

---

## Need Help?

### Common Questions

**Q: Do I need custom headers?**
A: Only if your server requires authentication or custom configuration.

**Q: Can I connect to localhost from Omni?**
A: Yes, but only in local development mode.

**Q: How do I know if my server uses HTTP or SSE?**
A: If you built it with standard REST APIs, use HTTP. SSE is for streaming.

**Q: Can I change the URL after connecting?**
A: Yes, edit the connection and update the URL.

**Q: Are my API keys secure in Omni?**
A: Yes, sensitive headers are encrypted and stored securely.

---

**Summary:** You need 3 things minimum to connect your MCP server:
1. **Server Type** (HTTP or SSE)
2. **Server Name** (friendly name)
3. **Server URL** (complete endpoint)

Plus optional **Custom Headers** if your server needs authentication! 🚀

---

**Happy connecting!**

