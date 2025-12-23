# 🚀 Cold Chain Enterprise Deployment Guide

## Overview
This guide explains what you need to configure after deploying the inbound order automation tools for Cold Chain Enterprise.

---

## 📋 Post-Deployment Checklist

### 1. **Admin Panel Configuration** (Frontend)

**Location:** `/admin` page (only visible for `cold-chain-enterprise` and `operator` workspaces)

**What to Add:**

1. **Nova ACT API Key** (Required)
   - Go to Admin Panel → Workspace Credentials section
   - Enter your Nova ACT API key
   - Click "Save All Credentials"

2. **Arcadia Link** (Optional - User Profile)
   - Enter the Arcadia warehouse portal user profile link
   - Format: `https://arcadia.example.com/user/profile` or your actual Arcadia URL
   - This is used for user-specific data/profile access

3. **ERP Login URL** (Optional)
   - Enter the ERP login page URL
   - Format: `https://erp.coldchain.com/login` or your actual ERP URL
   - Defaults to `https://erp.coldchain.com/login` if not provided
   - Used during browser profile setup

**Where:** `frontend/src/components/admin/workspace-credentials-manager.tsx`

---

### 2. **Browser Profile Setup** (Via Tool)

**After saving credentials in admin panel:**

1. Open an agent conversation (in `cold-chain-enterprise` or `operator` workspace)
2. Use the **"Cold Chain Inbound Orders"** tool with action `setup`
3. The tool will:
   - Launch a headed browser
   - Navigate to ERP login page
   - Allow you to complete Google SSO authentication
   - Save the authenticated browser profile to `/app/data/browser_profiles/{user_id}/`
   - **Note:** Each user has their own browser profile (not shared)

**Note:** The tool now reads API key and config from stored credentials (no need to pass API key manually)

---

### 3. **Backend Configuration**

**No backend code changes needed** - everything is handled automatically:

- Credentials are stored encrypted via `CredentialService`
- Browser profiles persist at `/app/data/browser_profiles/{user_id}/` (per-user)
- SDK initialization uses stored credentials
- **Important:** Credentials are PER-USER (each user must configure their own)

**Files that handle this:**
- `backend/core/tools/inbound_order_tool.py` - Unified tool (setup + processing) using user-specific credentials

---

## 🔧 Configuration Flow

```
1. Admin Panel (Frontend)
   ↓
   Enter: Nova ACT API Key, Arcadia Link, ERP URL
   ↓
   Save → Stored in user_mcp_credentials table (encrypted)
   
2. Setup Tool (Backend)
   ↓
   Reads stored credentials
   ↓
   Launches browser → Google SSO → Saves profile
   ↓
   Updates credentials with browser_profile_path + expires_at
   
3. Inbound Order Tool (Backend)
   ↓
   Reads stored credentials (API key, Arcadia link, ERP URL, browser profile)
   ↓
   Initializes SDK with all config
   ↓
   Executes automation actions
```

---

## 📝 Credential Storage Structure

**Stored in:** `user_mcp_credentials` table  
**mcp_qualified_name:** `nova_act.inbound_orders`  
**Encrypted config contains:**

```json
{
  "nova_act_api_key": "<encrypted>",
  "arcadia_link": "https://arcadia.example.com/user/profile",
  "erp_url": "https://erp.coldchain.com/login",
  "erp_session": {
    "browser_profile_path": "/app/data/browser_profiles/{user_id}/",
    "expires_at": "2024-02-15T12:00:00Z"
  }
}
```

---

## 🎯 What You Need to Provide

### Required:
- ✅ **Nova ACT API Key** - Add via admin panel

### Optional (but recommended):
- ✅ **Arcadia Link** - User profile link in Arcadia warehouse portal
- ✅ **ERP Login URL** - If different from default

### Automatic:
- ✅ **Browser Profile** - Created automatically via setup tool
- ✅ **Session Expiration** - Set to 30 days (automatic)

---

## 🔍 Verification Steps

1. **Check Admin Panel:**
   - Navigate to `/admin` in `cold-chain-enterprise` or `operator` workspace
   - Verify "Workspace Credentials" card appears
   - Check that API key shows as "configured" after saving

2. **Test Setup Tool:**
   - Open agent conversation
   - Use "Cold Chain Inbound Orders" tool with action `setup`
   - Verify browser launches and you can complete SSO
   - Check that browser profile status shows "Configured" in admin panel

3. **Test Inbound Order Tool:**
   - Use "Cold Chain Inbound Orders" tool with actions: `orders`, `extraction`, or `pipeline`
   - Verify SDK initializes correctly
   - Check logs for successful execution

---

## 🛠️ Troubleshooting

### Issue: "Credentials not found"
**Solution:** Make sure you've saved credentials via admin panel first

### Issue: "SDK not available"
**Solution:** Install the `nova_act` SDK package:
```bash
pip install nova-act-inbound-orders
```

### Issue: "Browser profile not configured"
**Solution:** Run the "Cold Chain Inbound Orders" tool with action `setup` to create the browser profile

### Issue: "ERP session expired"
**Solution:** Re-run the setup tool to refresh the browser profile

---

## 📍 File Locations

### Frontend:
- Admin Panel Component: `frontend/src/components/admin/workspace-credentials-manager.tsx`
- Admin Page: `frontend/src/app/(dashboard)/admin/page.tsx`

### Backend:
- Unified Tool: `backend/core/tools/inbound_order_tool.py` (handles setup + processing)
- Tool Registration: `backend/core/run.py`

### Database:
- Credentials Table: `user_mcp_credentials` (per-user storage)
- Browser Profiles: `/app/data/browser_profiles/{user_id}/` (per-user)

---

## ✅ Summary

**After deployment, you only need to:**

1. **Go to Admin Panel** (`/admin` in `cold-chain-enterprise` or `operator`)
2. **Enter:**
   - Nova ACT API Key (required)
   - Arcadia Link (optional - user profile)
   - ERP Login URL (optional)
3. **Click "Save All Credentials"**
4. **Run Setup** - Use "Cold Chain Inbound Orders" tool with action `setup` in an agent conversation
5. **Done!** Tools are ready to use

**Note:** Each user must configure their own credentials (not shared across workspace)

All other configuration is handled automatically by the system.

