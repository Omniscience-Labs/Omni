# Cold Chain Inbound Orders vs Custom Automation Tool

## Overview

Both tools enable browser automation, but they serve different purposes and have different capabilities.

---

## 🔵 Cold Chain Inbound Orders (`inbound_order_tool`)

### Purpose
**Workspace-specific automation** for Cold Chain Enterprise ERP order processing.

### Key Features
- ✅ **Workspace-scoped**: Only available for `cold-chain-enterprise` and `operator` workspaces
- ✅ **Integrated SDK**: Uses `nova_act.inbound_orders` Python SDK for automation
- ✅ **Built-in Credential Management**: Settings button appears when tool is enabled
- ✅ **Per-User Credentials**: Each user has their own API keys and browser profiles
- ✅ **Persistent Browser Profiles**: Automatically saves authenticated Chrome profiles
- ✅ **Browser History Support**: Can import history from existing Chrome profiles
- ✅ **Automated Setup**: SDK handles browser launch, SSO authentication, and profile persistence

### Use Cases
- Processing inbound orders from ERP system
- Extracting order data from Gmail
- Running automated order pipelines
- Cold Chain Enterprise-specific workflows

### Configuration
1. **Enable the tool** in Agent Tools Configuration
2. **Click "Configure"** button that appears below the tool (only visible when enabled)
3. **Enter credentials**:
   - Nova ACT API Key (required)
   - Arcadia Link (optional)
   - ERP URL (optional)
4. **Run setup action** in agent conversation to authenticate and save browser profile

### Storage
- **Credentials**: Encrypted in `user_mcp_credentials` table (per-user)
- **Browser Profiles**: `/app/data/browser_profiles/{user_id}/` (per-user)
- **Browser History**: Automatically preserved in `Default/History`

---

## ⚡ Custom Automation Tool (`sb_custom_automation_tool`)

### Purpose
**General-purpose browser automation** for any custom workflow using Playwright scripts.

### Key Features
- ✅ **Universal**: Available for all workspaces
- ✅ **Manual Upload**: Requires uploading Chrome profile ZIP files
- ✅ **Custom Scripts**: Write your own JavaScript/Playwright automation scripts
- ✅ **Flexible**: Can automate any website or workflow
- ✅ **VNC-Compatible**: Scripts run in visible browser sessions

### Use Cases
- Custom website automation
- One-off automation tasks
- Complex multi-step workflows
- Testing and development

### Configuration
1. **Enable the tool** in Agent Tools Configuration
2. **Prepare Chrome profile**:
   - Export your Chrome profile as a ZIP file
   - Include all necessary cookies, sessions, and preferences
3. **Write automation script**:
   - JavaScript using Playwright syntax
   - Must handle browser launch with profile path
4. **Upload via tool**:
   - Base64 encode the Chrome profile ZIP
   - Provide the automation script
   - Configure the automation

### Storage
- **Profiles**: `/workspace/custom_automation/profiles/{config_name}/`
- **Scripts**: `/workspace/custom_automation/scripts/{config_name}.js`
- **Database**: Stored in `custom_automation_configs` table

---

## 📊 Comparison Table

| Feature | Cold Chain Tool | Custom Automation Tool |
|---------|----------------|----------------------|
| **Workspace Scope** | `cold-chain-enterprise`, `operator` only | All workspaces |
| **Setup Complexity** | Low (built-in UI) | Medium (manual upload) |
| **Credential Management** | Built-in settings UI | Manual via tool calls |
| **Browser Profile** | Auto-saved after SSO | Must upload ZIP manually |
| **Browser History** | Auto-preserved | Included in uploaded profile |
| **Automation Scripts** | SDK handles it | You write JavaScript |
| **Use Case** | ERP order processing | General automation |
| **Per-User Isolation** | Yes (credentials & profiles) | Yes (configs per account) |
| **SDK Integration** | Uses `nova_act.inbound_orders` | Uses Playwright directly |

---

## 🎯 Which Tool Should You Use?

### Use **Cold Chain Inbound Orders** if:
- ✅ You're working with Cold Chain Enterprise ERP
- ✅ You need automated order processing
- ✅ You want built-in credential management
- ✅ You prefer automated browser profile setup
- ✅ You're in the `cold-chain-enterprise` or `operator` workspace

### Use **Custom Automation Tool** if:
- ✅ You need to automate a different website/system
- ✅ You want full control over automation scripts
- ✅ You have existing Chrome profiles to upload
- ✅ You're building a one-off automation
- ✅ You're comfortable writing Playwright scripts

---

## 🔧 Troubleshooting

### Settings Button Not Showing?

**For Cold Chain Tool:**
1. ✅ Make sure you're in `cold-chain-enterprise` or `operator` workspace
2. ✅ **Enable the tool toggle** (switch must be ON)
3. ✅ Check browser console for workspace slug debug info
4. ✅ Refresh the page after enabling

**For Custom Automation Tool:**
- This tool doesn't have a settings button - configuration is done via tool calls

### Tool Not Available?

**Cold Chain Tool:**
- Only registered for specific workspaces
- Check `backend/core/run.py` for registration logic
- Verify workspace slug matches `cold-chain-enterprise` or `operator`

**Custom Automation Tool:**
- Available for all workspaces
- Check if tool is enabled in agent configuration

---

## 📝 Quick Reference

### Cold Chain Tool Setup Flow:
```
1. Enable tool toggle → Settings card appears
2. Click "Configure" → Expand settings section
3. Click "Open Settings" → Credentials dialog opens
4. Enter API key, Arcadia link, ERP URL → Save
5. Use agent conversation → Call "setup" action
6. Complete Google SSO → Browser profile saved
7. Use "orders", "extraction", or "pipeline" actions
```

### Custom Automation Tool Setup Flow:
```
1. Enable tool toggle
2. Export Chrome profile as ZIP
3. Base64 encode the ZIP
4. Write Playwright automation script
5. Call tool with config_name, chrome_profile_base64, automation_script
6. Tool extracts profile and saves script
7. Run automation via script execution
```

