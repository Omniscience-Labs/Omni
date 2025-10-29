# Klaviyo MCP Server - Omni Integration Guide

## Current Status

Your Klaviyo MCP server is returning raw JSON from the API:

```typescript
// Current implementation (lines 70-100 in mcp-http-server.ts)
async function handleToolCall(name: string, args: any): Promise<string> {
  const response = await klaviyoClient.get("/lists");
  return JSON.stringify(response.data, null, 2);  // ⚠️ Raw API response
}
```

This works, but Omni can display it **much better** with proper formatting!

---

## Improvements You Can Make

### 1. Format Lists as Tables

**Before (current):**
```
{
  "data": [
    {
      "type": "list",
      "id": "XyZ123",
      "attributes": {
        "name": "Newsletter Subscribers",
        "created": "2024-01-15"
      }
    }
  ]
}
```

**After (improved):**

```typescript
// Add this formatter function
function formatListsAsTable(klaviyoResponse: any) {
  const lists = klaviyoResponse.data.map((item: any) => ({
    id: item.id,
    name: item.attributes.name,
    created: item.attributes.created,
    updated: item.attributes.updated,
    profile_count: item.attributes.profile_count || 0
  }));
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(lists, null, 2)
    }]
  };
}

// Update your handler
case "get_lists": {
  const response = await klaviyoClient.get("/lists", { params });
  return formatListsAsTable(response.data);  // ✅ Formatted as table!
}
```

**Result in Omni:** Beautiful sortable table with columns: ID, Name, Created, Updated, Profile Count

---

### 2. Format Profiles as Table

```typescript
function formatProfilesAsTable(klaviyoResponse: any) {
  const profiles = klaviyoResponse.data.map((item: any) => ({
    id: item.id,
    email: item.attributes.email,
    first_name: item.attributes.first_name || '',
    last_name: item.attributes.last_name || '',
    created: item.attributes.created,
    subscribed: item.attributes.subscriptions?.email?.marketing?.subscribed || false
  }));
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(profiles, null, 2)
    }]
  };
}
```

**Result in Omni:** Clean table of customer profiles

---

### 3. Format Campaigns with Rich Details

```typescript
function formatCampaignsAsTable(klaviyoResponse: any) {
  const campaigns = klaviyoResponse.data.map((item: any) => ({
    id: item.id,
    name: item.attributes.name,
    status: item.attributes.status,
    created: item.attributes.created_at,
    sent_at: item.attributes.send_time || 'Not sent',
    audience: item.attributes.audiences?.included?.[0]?.name || 'N/A'
  }));
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(campaigns, null, 2)
    }]
  };
}
```

---

### 4. Better Error Messages

**Before:**
```typescript
throw new Error(`Klaviyo API error: ${errorMessage}`);
```

**After:**
```typescript
function formatError(message: string, code?: string) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        error: message,
        code: code || 'KLAVIYO_ERROR',
        tip: 'Check your API key and permissions'
      }, null, 2)
    }]
  };
}

// In catch block
if (axios.isAxiosError(error)) {
  const errorMessage = error.response?.data?.errors?.[0]?.detail || error.message;
  return formatError(`Klaviyo API error: ${errorMessage}`, 'API_ERROR');
}
```

**Result in Omni:** Red error box with helpful context

---

## Complete Updated Implementation

Here's your improved `mcp-http-server.ts`:

```typescript
// Add these formatter functions after line 37

// ============================================================================
// RESPONSE FORMATTERS FOR OMNI
// ============================================================================

interface MCPResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

function formatListsAsTable(klaviyoResponse: any): MCPResponse {
  const lists = klaviyoResponse.data.map((item: any) => ({
    id: item.id,
    name: item.attributes.name,
    created: new Date(item.attributes.created).toLocaleDateString(),
    updated: new Date(item.attributes.updated).toLocaleDateString(),
    profiles: item.attributes.profile_count || 0
  }));
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(lists, null, 2)
    }]
  };
}

function formatProfilesAsTable(klaviyoResponse: any): MCPResponse {
  const profiles = klaviyoResponse.data.map((item: any) => {
    const attrs = item.attributes;
    return {
      id: item.id.substring(0, 8) + '...',  // Shorten ID for readability
      email: attrs.email,
      name: `${attrs.first_name || ''} ${attrs.last_name || ''}`.trim() || 'N/A',
      location: attrs.location?.city || attrs.location?.country || 'Unknown',
      created: new Date(attrs.created).toLocaleDateString(),
      subscribed: attrs.subscriptions?.email?.marketing?.subscribed ? '✅' : '❌'
    };
  });
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(profiles, null, 2)
    }]
  };
}

function formatCampaignsAsTable(klaviyoResponse: any): MCPResponse {
  const campaigns = klaviyoResponse.data.map((item: any) => {
    const attrs = item.attributes;
    return {
      id: item.id,
      name: attrs.name,
      status: attrs.status,
      subject: attrs.campaign_messages?.data?.[0]?.attributes?.subject || 'N/A',
      created: new Date(attrs.created_at).toLocaleDateString(),
      sent: attrs.send_time ? new Date(attrs.send_time).toLocaleDateString() : 'Not sent'
    };
  });
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(campaigns, null, 2)
    }]
  };
}

function formatError(message: string, code: string = 'ERROR'): MCPResponse {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        error: message,
        code: code,
        timestamp: new Date().toISOString()
      }, null, 2)
    }]
  };
}

function formatSuccess(data: any, message: string): MCPResponse {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        message: message,
        data: data
      }, null, 2)
    }]
  };
}

// ============================================================================
// UPDATED TOOL HANDLER
// ============================================================================

async function handleToolCall(name: string, args: any): Promise<MCPResponse> {
  try {
    switch (name) {
      case "get_lists": {
        const params: any = {};
        if (args.page_size) params["page[size]"] = Math.min(args.page_size, 100);
        
        const response = await klaviyoClient.get("/lists", { params });
        return formatListsAsTable(response.data);  // ✅ Formatted!
      }
      
      case "get_profiles": {
        const params: any = {};
        if (args.page_size) params["page[size]"] = Math.min(args.page_size, 100);
        if (args.filter) params.filter = args.filter;
        
        const response = await klaviyoClient.get("/profiles", { params });
        return formatProfilesAsTable(response.data);  // ✅ Formatted!
      }
      
      case "get_campaigns": {
        const response = await klaviyoClient.get("/campaigns", {
          params: {
            include: "campaign-messages"  // Include message details
          }
        });
        return formatCampaignsAsTable(response.data);  // ✅ Formatted!
      }
      
      default:
        return formatError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
    }
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const errorDetail = error.response?.data?.errors?.[0]?.detail || error.message;
      return formatError(`Klaviyo API error: ${errorDetail}`, 'KLAVIYO_API_ERROR');
    }
    return formatError(error.message, 'INTERNAL_ERROR');
  }
}
```

---

## Even More Advanced: Campaign Analytics

Add a new tool for campaign statistics:

```typescript
// Add to your tools array
{
  name: "get_campaign_analytics",
  description: "Get performance analytics for a campaign",
  inputSchema: {
    type: "object",
    properties: {
      campaign_id: { type: "string", description: "Campaign ID" }
    },
    required: ["campaign_id"]
  }
}

// Add to your handler
case "get_campaign_analytics": {
  const campaignId = args.campaign_id;
  
  // Fetch campaign details and metrics
  const [campaign, metrics] = await Promise.all([
    klaviyoClient.get(`/campaigns/${campaignId}`),
    klaviyoClient.get(`/campaign-recipient-estimations/${campaignId}`)
  ]);
  
  // Format as rich markdown report
  const attrs = campaign.data.data.attributes;
  const stats = metrics.data.data.attributes;
  
  const markdown = `
# 📊 Campaign Analytics: ${attrs.name}

## Overview
- **Status:** ${attrs.status}
- **Created:** ${new Date(attrs.created_at).toLocaleDateString()}
- **Subject:** ${attrs.campaign_messages?.data?.[0]?.attributes?.subject}

## Audience
- **Estimated Recipients:** ${stats.estimated_recipient_count || 'N/A'}
- **List:** ${attrs.audiences?.included?.[0]?.name || 'N/A'}

## Performance
${attrs.send_time ? `
- **Sent:** ${new Date(attrs.send_time).toLocaleDateString()}
- **Opens:** Coming soon
- **Clicks:** Coming soon
` : '- Status: Not yet sent'}

## Next Steps
${attrs.status === 'Draft' ? '✅ Campaign is ready to send' : ''}
${attrs.status === 'Scheduled' ? '⏰ Campaign is scheduled' : ''}
`;

  return {
    content: [{
      type: "text",
      text: markdown
    }]
  };
}
```

**Result in Omni:** Beautiful formatted markdown report with emojis and structure!

---

## Testing Your Changes

1. **Update your server:**
   ```bash
   cd mcp-servers/klaviyo
   # Copy the improved code above into mcp-http-server.ts
   ```

2. **Restart the server:**
   ```bash
   npm run dev
   ```

3. **Test in Omni:**
   - Open Omni
   - Run `get_lists` tool
   - See beautiful table instead of raw JSON! 🎉

---

## Response Format Cheat Sheet

| Data Type | Format As | Omni Renders |
|-----------|-----------|--------------|
| List of items | Array of objects with consistent keys | Sortable table |
| Single item details | Markdown with headings and lists | Formatted document |
| Success message | `{ success: true, message: "..." }` | Green success box |
| Error | `{ error: "...", code: "..." }` | Red error box |
| Analytics/Stats | Markdown with headers and bullets | Rich formatted report |

---

## Quick Wins

**5-Minute Improvement:**
Just change line 77 from:
```typescript
return JSON.stringify(response.data, null, 2);
```

To:
```typescript
return {
  content: [{
    type: "text",
    text: JSON.stringify(response.data, null, 2)
  }]
};
```

This alone will make responses work correctly with Omni!

**10-Minute Improvement:**
Add the `formatListsAsTable` function and use it. Instant beautiful tables!

**30-Minute Improvement:**
Add all formatters + new analytics tool. Professional-grade integration!

---

## Need Help?

See the other guides:
- `MCP_RESPONSE_QUICK_START.md` - Quick reference
- `MCP_RESPONSE_GUIDE.md` - Complete documentation
- `EXAMPLE_TEMPLATE.ts` - Full template with examples

Happy coding! 🚀



