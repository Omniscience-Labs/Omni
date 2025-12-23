# Cold Chain Enterprise Setup Guide

## Overview

This guide explains how the Cold Chain Enterprise automation works, where to configure credentials, and answers common questions.

## How It Works

### Architecture

1. **Workspace-Scoped Tools**: The inbound order tools are only registered for specific workspaces:
   - `cold-chain-enterprise` (production)
   - `varnica.dev` (staging)
   - `varnica` (staging alternative)

2. **Credential Storage**: Uses the existing `user_mcp_credentials` database table via `CredentialService`
   - **No migrations needed** - uses existing infrastructure
   - Credentials are encrypted using Fernet encryption
   - Stored with `mcp_qualified_name = "nova_act.inbound_orders"`

3. **Browser Profile Persistence**: Authenticated browser profiles are stored at:
   - `/app/data/browser_profiles/{account_id}/`
   - Survives server restarts
   - Shared across all users in the workspace

4. **SDK Integration**: The backend calls the `nova_act.inbound_orders` Python SDK which:
   - Handles browser automation via Stagehand (Node.js)
   - Manages Chrome profile lifecycle
   - Performs ERP operations

## Where to Add Credentials

### Option 1: Admin Panel (`/admin`)

1. Navigate to `/admin` in your workspace
2. Look for the **"Workspace Credentials"** card section
3. Fill in:
   - **Nova ACT API Key** (required)
   - **Arcadia Link** (optional - user profile URL)
   - **ERP Login URL** (optional)
4. Click **"Save All Credentials"**

**Note**: This section only appears for workspaces: `cold-chain-enterprise`, `varnica.dev`, or `varnica`

### Option 2: Tool Configuration UI (NEW)

1. Go to Agent Configuration → Tools tab
2. Find the **"Inbound Order Processor"** or **"Setup Inbound Order Credentials"** tool
3. Click the **⚙️ Settings** button next to the tool toggle
4. A dialog will open to configure credentials
5. Fill in the same fields as above and save

## Database & Migrations

### ✅ No Migrations Required

The implementation uses existing infrastructure:

- **Table**: `user_mcp_credentials` (already exists)
- **Service**: `CredentialService` (already exists)
- **Encryption**: Uses existing Fernet encryption key from `MCP_CREDENTIAL_ENCRYPTION_KEY` env var

### Database Schema (Reference)

The `user_mcp_credentials` table structure:
```sql
- credential_id (UUID, primary key)
- account_id (UUID, foreign key to accounts)
- mcp_qualified_name (text) - set to "nova_act.inbound_orders"
- display_name (text) - "Nova ACT Inbound Orders"
- encrypted_config (bytea) - encrypted JSON config
- config_hash (text) - SHA256 hash for integrity
- is_active (boolean)
- created_at, updated_at, last_used_at (timestamps)
```

### Config Structure

The encrypted config JSON contains:
```json
{
  "nova_act_api_key": "<encrypted>",
  "arcadia_link": "<optional URL>",
  "erp_url": "<optional URL>",
  "erp_session": {
    "browser_profile_path": "/app/data/browser_profiles/{account_id}/",
    "expires_at": "<ISO8601 timestamp>"
  }
}
```

## Setup Flow

### Step 1: Add Credentials

1. Use either Admin Panel or Tool Settings button
2. Enter Nova ACT API Key (required)
3. Optionally add Arcadia Link and ERP URL
4. Save credentials

### Step 2: Setup Browser Profile (One-Time)

1. Open an agent conversation
2. Use the **"Setup Inbound Order Credentials"** tool
3. A browser will launch (headed mode)
4. Complete Google SSO authentication
5. Browser profile is saved to `/app/data/browser_profiles/{account_id}/`
6. Session expires in 30 days (configurable)

### Step 3: Use Inbound Order Tool

1. Enable the **"Inbound Order Processor"** tool in agent configuration
2. Use the tool in agent conversations with actions:
   - `get_orders` - Retrieve orders from ERP
   - `extract_orders` - Extract order data
   - `run_pipeline` - Run full automation pipeline

## Troubleshooting

### Credentials Section Not Showing

**Problem**: Don't see "Workspace Credentials" in `/admin`

**Solutions**:
1. Check your workspace slug matches: `cold-chain-enterprise`, `varnica.dev`, or `varnica`
2. Verify you're an admin user
3. Check browser console for errors

### Settings Button Not Showing

**Problem**: Don't see settings button (⚙️) next to inbound order tools

**Solutions**:
1. Verify workspace slug is in allowed list
2. Check that `currentAccount?.account_id` is available
3. Ensure tools are registered (check backend logs)

### Browser Profile Issues

**Problem**: Browser profile not persisting or expired

**Solutions**:
1. Re-run "Setup Inbound Order Credentials" tool
2. Check `/app/data/browser_profiles/{account_id}/` directory exists
3. Verify file permissions (should be readable by backend process)
4. Check session expiration date in stored config

## Security Notes

- ✅ Credentials are encrypted at rest
- ✅ API keys never exposed in logs
- ✅ Browser profiles stored securely
- ✅ Workspace-scoped access control
- ✅ Admin-only setup tool

## Environment Variables

Required environment variables (already configured):
- `MCP_CREDENTIAL_ENCRYPTION_KEY` - Fernet encryption key for credentials

Optional (for SDK):
- SDK-specific environment variables handled by `nova_act.inbound_orders` SDK

## Files Modified

### Backend
- `backend/core/tools/setup_inbound_order_credentials_tool.py` - Setup tool
- `backend/core/tools/inbound_order_tool.py` - Inbound order processor
- `backend/core/run.py` - Tool registration logic

### Frontend
- `frontend/src/components/admin/workspace-credentials-manager.tsx` - Admin panel component
- `frontend/src/components/admin/workspace-credentials-dialog.tsx` - Compact dialog component
- `frontend/src/components/agents/agent-tools-configuration.tsx` - Tool settings button
- `frontend/src/components/agents/tools.ts` - Tool definitions
- `frontend/src/app/(dashboard)/admin/page.tsx` - Admin page integration

## Support

For issues or questions:
1. Check backend logs for tool registration
2. Verify workspace slug matches allowed list
3. Ensure credentials are saved correctly
4. Check browser profile directory permissions

