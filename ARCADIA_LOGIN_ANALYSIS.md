# Arcadia Login Analysis: What Omni Currently Has vs. What's Needed

## Current Status

### ✅ What Omni Currently Has:
1. **Nova ACT API Key** - Stored encrypted in credentials ✓
2. **Arcadia Link** - Stored in credentials (optional) ✓
3. **Browser Profile Path** - Per-user at `/app/data/browser_profiles/{user_id}/` ✓
4. **SDK Integration** - Uses `nova_act.inbound_orders.InboundOrderClient` ✓

### ❌ What's Missing for Arcadia Login:

1. **Gmail Profile Data** - Required for Arcadia authentication
   - **Status**: Frontend has field, but backend doesn't use it yet
   - **Needed**: Gmail OAuth token JSON or cached authentication data
   - **Current**: Backend still references `erp_url` instead of `gmail_profile_data`

2. **Scripts Path Configuration** - SDK needs to know where Stagehand scripts are
   - **Status**: Not configured
   - **Needed**: Path to `stagehand-test/` directory where scripts live
   - **Example**: `/Users/varnikachabria/Downloads/omni x stagehand/stagehand-test`

3. **Browser Contexts Path** - SDK needs to know where browser profiles/contexts are stored
   - **Status**: Partially configured (we use `/app/data/browser_profiles/{user_id}/`)
   - **Needed**: SDK might expect a different structure (e.g., `contexts/arcadia_profile/`)
   - **Example**: `/Users/varnikachabria/Downloads/omni x stagehand/stagehand-test/contexts/`

4. **SDK Path** - If SDK is not installed as package
   - **Status**: Assumes SDK is installed as `nova_act.inbound_orders` package
   - **Needed**: If using local SDK, need to add to Python path
   - **Example**: `/Users/varnikachabria/Downloads/omni x stagehand/inbound_mcp`

5. **Python Environment** - If using specific Python environment
   - **Status**: Uses system Python
   - **Needed**: Path to virtual environment if required
   - **Example**: `/Users/varnikachabria/Downloads/omni x stagehand/stagehand-test/nova-act-env/bin/python`

---

## What Needs to Be Fixed

### 1. Backend: Use Gmail Profile Data Instead of ERP URL

**Current Code (Line 199-223):**
```python
nova_act_api_key = credential.config.get("nova_act_api_key")
erp_session = credential.config.get("erp_session", {})
browser_profile_path = erp_session.get("browser_profile_path")
arcadia_link = credential.config.get("arcadia_link")
stored_erp_url = credential.config.get("erp_url")  # ❌ Still using erp_url

sdk_kwargs = {
    "api_key": nova_act_api_key,
    "browser_profile_path": browser_profile_path,
}
if stored_erp_url:
    sdk_kwargs["erp_url"] = stored_erp_url  # ❌ Wrong parameter
```

**Should Be:**
```python
nova_act_api_key = credential.config.get("nova_act_api_key")
erp_session = credential.config.get("erp_session", {})
browser_profile_path = erp_session.get("browser_profile_path")
arcadia_link = credential.config.get("arcadia_link")
gmail_profile_data = credential.config.get("gmail_profile_data")  # ✅ Use Gmail data

if not gmail_profile_data:
    return self.fail_response("Gmail profile data required for Arcadia login")

sdk_kwargs = {
    "api_key": nova_act_api_key,
    "browser_profile_path": browser_profile_path,
    "arcadia_link": arcadia_link,
    "gmail_profile_data": gmail_profile_data,  # ✅ Pass Gmail data
}
```

### 2. Add Scripts Path Configuration

**Option A: Add to Credentials (Recommended)**
- Store `scripts_path` in credentials config
- User provides path via admin panel
- Backend passes to SDK

**Option B: Environment Variable**
- Set `INBOUND_MCP_SCRIPTS_PATH` environment variable
- SDK reads from environment

**Option C: Default Path**
- Use a standard path like `/app/data/inbound_scripts/`
- Copy scripts there during deployment

### 3. Add Browser Contexts Path Configuration

The SDK might expect browser profiles in a specific structure:
```
stagehand-test/
  contexts/
    arcadia_profile/
      Default/
        History
        Cookies
        Login Data
```

**Current Structure:**
```
/app/data/browser_profiles/{user_id}/
  Default/
    History
    Cookies
```

**Solution:** Either:
- Map our structure to SDK's expected structure
- Configure SDK to use our structure
- Add `contexts_path` to credentials

### 4. SDK Path Configuration

If SDK is not installed as package, need to add to Python path:

```python
import sys
from pathlib import Path

sdk_path = Path("/path/to/inbound_mcp")
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))
```

---

## Recommended Implementation

### Step 1: Update Backend to Use Gmail Profile Data

```python
# In inbound_order_tool.py

# Extract Gmail profile data
gmail_profile_data = credential.config.get("gmail_profile_data")
if not gmail_profile_data:
    return self.fail_response("Gmail profile data required. Configure via admin panel.")

# Initialize SDK with Gmail data
sdk_client = InboundOrderClient(
    api_key=nova_act_api_key,
    browser_profile_path=browser_profile_path,
    arcadia_link=arcadia_link,
    gmail_profile_data=gmail_profile_data  # ✅ For Arcadia login
)
```

### Step 2: Add Scripts Path to Credentials

**Frontend:** Add field for scripts path (optional, with default)
**Backend:** Use scripts path if provided, otherwise use default

```python
scripts_path = credential.config.get("scripts_path") or "/app/data/inbound_scripts"
```

### Step 3: Handle SDK Path (if needed)

If SDK is not installed as package, add path configuration:

```python
sdk_path = credential.config.get("sdk_path")
if sdk_path:
    import sys
    if sdk_path not in sys.path:
        sys.path.insert(0, sdk_path)
```

---

## What the SDK Actually Needs (Based on Your Documentation)

Based on your documentation, the SDK needs:

1. **Gmail Profile Data** (JSON) - For Arcadia authentication ✅ (frontend has it)
2. **Arcadia Link** - URL to Arcadia portal ✅ (we have it)
3. **Scripts Directory** - Where Stagehand scripts are ❌ (missing)
4. **Browser Contexts** - Where saved login sessions are ⚠️ (partially configured)
5. **API Key** - Nova ACT API key ✅ (we have it)

---

## Next Steps

1. ✅ Frontend already has Gmail profile data field
2. ❌ Backend needs to use `gmail_profile_data` instead of `erp_url`
3. ❌ Add scripts path configuration (optional field)
4. ❌ Ensure browser profile structure matches SDK expectations
5. ❌ Test Arcadia login flow with Gmail profile data

---

## Questions to Answer

1. **Does the SDK accept `gmail_profile_data` as a parameter?** Or does it need to be written to a file?
2. **Where should scripts be located?** Should they be copied to `/app/data/` or referenced from user's local path?
3. **Does the SDK handle browser profile paths automatically, or do we need to configure contexts path separately?**
4. **Is the SDK installed as a package (`nova_act.inbound_orders`) or do we need to add it to Python path?**

