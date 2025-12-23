# 🚀 Cold Chain Automation Tool - Complete Usage Guide

## Overview
The Cold Chain Inbound Orders tool allows you to automate ERP operations (Arcadia) for order processing, data extraction, and pipeline runs.

---

## 📋 Prerequisites

1. **Admin Access**: You need admin privileges in the Omni workspace
2. **Nova ACT API Key**: Get your API key from Nova ACT dashboard
3. **SDK Folder**: Prepare the complete SDK folder structure (see below)
4. **Workspace**: Must be one of: `cold-chain-enterprise`, `operator`, `varnica`, `varnica.dev` (or local/staging for testing)

---

## 📁 Step 1: Prepare SDK Folder

### Folder Structure Required

Create a folder called `omni_inbound_mcp_sdk` with this structure:

```
omni_inbound_mcp_sdk/
├── inbound_mcp/              ← Python SDK
│   ├── sdk/
│   ├── core/
│   ├── __init__.py
│   └── ...
│
└── stagehand-test/           ← Scripts (SDK looks here)
    ├── run_arcadia_only.py
    ├── add_inventory_from_tonya_email.py
    └── contexts/            ← Browser profiles (scripts look here)
        ├── arcadia_profile/
        │   └── Default/     ← Chrome profile data
        └── gmail_profile/
            └── Default/      ← Chrome profile data
```

### Creating the Archive

**Option A: Zip File (Recommended)**
```bash
cd /path/to/parent/directory
zip -r omni_inbound_mcp_sdk.zip omni_inbound_mcp_sdk/
```

**Option B: Tar.gz File**
```bash
cd /path/to/parent/directory
tar -czf omni_inbound_mcp_sdk.tar.gz omni_inbound_mcp_sdk/
```

### Important Notes:
- ✅ The folder structure **must** be preserved
- ✅ Browser profiles should be in `stagehand-test/contexts/`
- ✅ SDK must be in `inbound_mcp/` folder
- ✅ Scripts must be in `stagehand-test/` folder

---

## 🔧 Step 2: Configure Credentials (Admin Panel)

### Method A: User-Specific Settings (Recommended)

1. **Navigate to Admin Panel**
   - Go to `/admin` in your Omni dashboard
   - Click on **Users** section
   - Find the user you want to configure
   - Click on the user to open details

2. **Open Automation Tab**
   - In the user details dialog, click the **"Automation"** tab
   - You'll see the Cold Chain Automation section

3. **Upload SDK Folder**
   - Click **"Choose File"** under "Complete SDK Folder"
   - Select your `omni_inbound_mcp_sdk.zip` (or `.tar.gz`) file
   - Click **"Upload"** button
   - Wait for upload to complete (check status indicators)

4. **Enter Credentials**
   - **Nova ACT API Key** (Required): Enter your API key
   - **Arcadia Link** (Optional): Enter your Arcadia profile URL
   - Click **"Save Credentials"**

5. **Verify Status**
   - ✅ API Key Set
   - ✅ SDK Folder: Complete (SDK ✓, Scripts ✓, Browser Profiles ✓)
   - ✅ Browser Profile Ready (after setup)

### Method B: Workspace Credentials (Alternative)

1. **Navigate to Admin Panel**
   - Go to `/admin` in your Omni dashboard
   - Scroll to **"Workspace Credentials"** section

2. **Follow same steps** as Method A for uploading SDK folder and credentials

---

## 🎯 Step 3: Initial Setup (One-Time Browser Authentication)

After credentials are configured, you need to authenticate with Arcadia:

1. **Start an Agent Conversation**
   - Create a new conversation or use an existing one
   - Make sure the **Cold Chain Inbound Orders** tool is enabled

2. **Run Setup Action**
   ```
   Run the cold chain inbound orders tool with action "setup"
   ```

   Or in natural language:
   ```
   Set up the Cold Chain automation tool
   ```

   Or directly:
   ```
   Use the cold_chain_inbound_orders tool with action=setup
   ```

3. **Complete Browser Authentication**
   - A browser window will open automatically
   - Log in to Arcadia using Google SSO
   - Complete any required authentication steps
   - The browser profile will be saved automatically

4. **Verify Setup**
   - The tool will return a success message
   - Browser profile path will be saved to `/app/data/browser_profiles/{user_id}/`
   - Session expires in 30 days (you'll need to re-run setup after expiration)

---

## 🚀 Step 4: Using the Tool

Once setup is complete, you can use the tool for various operations:

### Available Actions

#### 1. **Get Orders** (`action: "orders"`)
Retrieve inbound orders from the ERP system.

```
Get the inbound orders from Cold Chain
```

Or:
```
Use cold_chain_inbound_orders with action=orders
```

#### 2. **Extract Data** (`action: "extraction"`)
Extract order data from Gmail or other sources.

```
Extract order data from emails
```

Or:
```
Use cold_chain_inbound_orders with action=extraction
```

#### 3. **Run Pipeline** (`action: "pipeline"`)
Run the complete automation pipeline.

```
Run the Cold Chain automation pipeline
```

Or:
```
Use cold_chain_inbound_orders with action=pipeline
```

---

## 🔍 Step 5: Verify Everything Works

### Check Tool Availability

1. **Agent Tools Configuration**
   - Go to agent settings
   - Look for **"Cold Chain Inbound Orders"** tool
   - It should be visible and toggleable

2. **Check Credentials Status**
   - Go to Admin → Users → [Your User] → Automation tab
   - Verify:
     - ✅ API Key Set
     - ✅ SDK Folder: Complete
     - ✅ Browser Profile Ready (after setup)

### Test the Tool

Try a simple command:
```
What can the Cold Chain automation tool do?
```

Or:
```
Get the inbound orders
```

---

## 🛠️ Troubleshooting

### Issue: "Tool not visible"

**Solution:**
- Check workspace slug matches: `cold-chain-enterprise`, `operator`, `varnica`, `varnica.dev`
- Or ensure you're in `local`/`staging` environment
- Refresh the page

### Issue: "Credentials not found"

**Solution:**
- Go to Admin → Users → [Your User] → Automation tab
- Ensure API key is saved
- Check that credentials are saved for the correct user

### Issue: "SDK folder incomplete"

**Solution:**
- Re-upload the SDK folder archive
- Check that the archive contains:
  - `inbound_mcp/` folder with Python files
  - `stagehand-test/` folder with scripts
  - `stagehand-test/contexts/` with browser profiles
- Verify extraction path: `/workspace/omni_inbound_mcp_sdk/`

### Issue: "ERP session expired"

**Solution:**
- Re-run the setup action:
  ```
  Use cold_chain_inbound_orders with action=setup
  ```
- Complete browser authentication again
- Session expires after 30 days

### Issue: "Browser profile not found"

**Solution:**
- Ensure browser profiles are uploaded in the SDK folder
- Check that profiles are in `stagehand-test/contexts/arcadia_profile/` and `gmail_profile/`
- Re-upload SDK folder if needed

### Issue: "SDK import errors"

**Solution:**
- Verify SDK folder structure is correct
- Check that `inbound_mcp/` contains `__init__.py` files
- Ensure Python SDK is complete and not corrupted

---

## 📝 Quick Reference

### Tool Name
`cold_chain_inbound_orders`

### Actions
- `setup` - One-time browser authentication (admin-only)
- `orders` - Get inbound orders
- `extraction` - Extract order data
- `pipeline` - Run complete automation pipeline

### Required Credentials
- Nova ACT API Key (stored encrypted)
- Arcadia Link (optional)
- Browser profiles (uploaded in SDK folder)

### Storage Locations
- **Credentials**: Encrypted in `user_mcp_credential_profiles` table
- **SDK Folder**: `/workspace/omni_inbound_mcp_sdk/`
- **Browser Profiles**: `/app/data/browser_profiles/{user_id}/` (after setup)

### Environment Variables
- `NOVA_ACT_API_KEY` - Set automatically from stored credentials

---

## 🎓 Example Workflow

1. **Admin Setup** (One-time)
   ```
   Admin → Users → [User] → Automation Tab
   → Upload SDK folder
   → Enter API key
   → Save
   ```

2. **User Setup** (One-time per user)
   ```
   Agent Conversation
   → "Set up Cold Chain automation"
   → Complete browser login
   → Done!
   ```

3. **Daily Usage**
   ```
   Agent Conversation
   → "Get inbound orders"
   → Tool processes orders
   → Returns results
   ```

---

## 🔐 Security Notes

- ✅ All credentials are encrypted at rest
- ✅ API keys never appear in logs or tool outputs
- ✅ Browser profiles are per-user (not shared)
- ✅ Admin-only access for credential configuration
- ✅ Session expires after 30 days

---

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify all prerequisites are met
3. Check server logs for detailed error messages
4. Ensure SDK folder structure matches requirements

---

## 🎉 You're Ready!

Once you've completed these steps, you can start using the Cold Chain automation tool in your agent conversations!

