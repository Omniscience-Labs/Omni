# Cold Chain Enterprise Setup Checklist

## Prerequisites Before Deployment

### 1. **Backend Environment Variables**

Ensure these environment variables are set:

```bash
# Required for credential encryption
MCP_CREDENTIAL_ENCRYPTION_KEY=<your-fernet-encryption-key>

# If not set, a new key will be generated (not recommended for production)
```

**How to generate encryption key:**
```python
from cryptography.fernet import Fernet
key = Fernet.generate_key()
print(key.decode())  # Use this as MCP_CREDENTIAL_ENCRYPTION_KEY
```

### 2. **Python SDK Installation**

The `nova_act.inbound_orders` Python SDK must be installed in the backend environment:

```bash
pip install nova-act-inbound-orders
# OR
pip install git+https://github.com/your-org/nova-act-inbound-orders.git
```

**Verify installation:**
```python
from nova_act.inbound_orders import InboundOrderClient
# Should not raise ImportError
```

### 3. **Node.js & Stagehand**

The SDK uses Stagehand (Node.js) for browser automation. Ensure:

- Node.js is installed and available in PATH
- Stagehand is installed (usually handled by SDK)
- Browser automation dependencies are available

### 4. **Directory Permissions**

Ensure the backend process can create and write to:

```bash
/app/data/browser_profiles/
```

**Create directory structure:**
```bash
mkdir -p /app/data/browser_profiles
chmod 755 /app/data/browser_profiles
```

### 5. **Database**

No migrations needed - uses existing `user_mcp_credentials` table.

**Verify table exists:**
```sql
SELECT * FROM user_mcp_credentials LIMIT 1;
```

---

## Post-Deployment Setup (Per User)

### Step 1: Deploy Code

1. Deploy `coldchain` branch to staging/production
2. Verify backend starts without errors
3. Check logs for tool registration:
   ```
   Registered inbound_order_tool for operator
   ```

### Step 2: User Credential Configuration

Each user must configure their own credentials:

#### Option A: Admin Panel (`/admin`)

1. Navigate to `/admin` in workspace (`cold-chain-enterprise` or `operator`)
2. Find **"Workspace Credentials"** section
3. Fill in:
   - **Nova ACT API Key** (required)
   - **Arcadia Link** (optional - user profile URL)
   - **ERP Login URL** (optional - defaults to `https://erp.coldchain.com/login`)
4. Click **"Save All Credentials"**

#### Option B: Tool Settings (Agent Configuration)

1. Go to Agent Configuration → Tools tab
2. Enable **"Cold Chain Inbound Orders"** tool
3. Settings card appears below the tool
4. Click **"Configure"** → **"Open Settings"**
5. Fill in credentials and save

### Step 3: Browser Profile Setup (One-Time Per User)

After saving credentials:

1. Open an agent conversation
2. Use the **"Cold Chain Inbound Orders"** tool with action `setup`
3. A browser will launch (headed mode)
4. Complete Google SSO authentication for ERP
5. Browser profile is saved to `/app/data/browser_profiles/{user_id}/`
6. Session expires in 30 days (configurable)

### Step 4: Use the Tool

Once credentials and browser profile are configured:

1. Enable **"Cold Chain Inbound Orders"** tool in agent configuration
2. Use the tool in conversations with actions:
   - `orders` - Get latest orders from ERP
   - `extraction` - Extract order data
   - `pipeline` - Run full automation pipeline

---

## Verification Checklist

### Backend Verification

- [ ] Backend starts without errors
- [ ] `nova_act.inbound_orders` SDK imports successfully
- [ ] Tool registration logs show: `Registered inbound_order_tool for {workspace_slug}`
- [ ] `/app/data/browser_profiles/` directory exists and is writable
- [ ] `MCP_CREDENTIAL_ENCRYPTION_KEY` environment variable is set

### Frontend Verification

- [ ] Admin panel shows "Workspace Credentials" section (for `cold-chain-enterprise` or `operator`)
- [ ] Tool configuration shows "Cold Chain Inbound Orders" tool
- [ ] Settings section appears when tool is enabled
- [ ] Credentials dialog opens and saves successfully

### User Flow Verification

- [ ] User can save credentials via admin panel or tool settings
- [ ] User can run `setup` action to authenticate browser profile
- [ ] Browser profile is created at `/app/data/browser_profiles/{user_id}/`
- [ ] User can run `orders`, `extraction`, or `pipeline` actions
- [ ] Each user's credentials are separate (not shared)

---

## Troubleshooting

### Tool Not Appearing

**Problem:** Don't see "Cold Chain Inbound Orders" tool

**Check:**
1. Verify workspace slug is `cold-chain-enterprise` or `operator`
2. Check backend logs for tool registration
3. Verify `account_id` is found for thread

### Credentials Not Saving

**Problem:** Can't save credentials in admin panel

**Check:**
1. Verify you're in correct workspace (`cold-chain-enterprise` or `operator`)
2. Check browser console for errors
3. Verify backend API endpoint `/secure-mcp/credentials` is accessible
4. Check `MCP_CREDENTIAL_ENCRYPTION_KEY` is set

### Browser Profile Not Creating

**Problem:** `setup` action fails or browser doesn't launch

**Check:**
1. Verify `nova_act.inbound_orders` SDK is installed
2. Check Node.js and Stagehand are available
3. Verify `/app/data/browser_profiles/` directory permissions
4. Check backend logs for SDK errors
5. Ensure credentials (API key) are saved first

### SDK Import Errors

**Problem:** `ImportError: cannot import name 'InboundOrderClient'`

**Solution:**
```bash
pip install nova-act-inbound-orders
# OR install from source
pip install git+https://github.com/your-org/nova-act-inbound-orders.git
```

### Credentials Not Found

**Problem:** Tool says "ERP credentials not found"

**Check:**
1. Verify credentials were saved (check admin panel or tool settings)
2. Ensure you're using the same user account that saved credentials
3. Check backend logs for credential retrieval errors
4. Verify `user_id` is being resolved correctly from context

---

## Required Information Per User

Each user needs to provide:

1. **Nova ACT API Key** (required)
   - Get from Nova ACT dashboard
   - Used for SDK authentication

2. **Arcadia Link** (optional)
   - User profile URL in Arcadia warehouse portal
   - Format: `https://arcadia.example.com/user/profile`

3. **ERP Login URL** (optional)
   - ERP login page URL
   - Defaults to: `https://erp.coldchain.com/login`
   - Used during browser profile setup

---

## Security Notes

- ✅ Credentials encrypted at rest using Fernet
- ✅ API keys never exposed in logs
- ✅ Browser profiles stored securely
- ✅ Per-user isolation (credentials not shared)
- ✅ Workspace-scoped tool registration
- ✅ Admin-only setup tool (enforced by workspace access)

---

## Support

If you encounter issues:

1. Check backend logs for tool registration and execution
2. Verify workspace slug matches allowed list
3. Ensure credentials are saved correctly
4. Check browser profile directory permissions
5. Verify SDK is installed and importable

