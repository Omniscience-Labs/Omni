# Admin Usage Logs Access Fix

## Problem Summary

You were unable to view usage logs for users in the admin panel (Admin > View User Details > Usage tab) even though you are both an Omni admin and an enterprise admin.

### Root Cause

The codebase has **two separate admin authentication systems** that were not synchronized:

#### 1. **Enterprise Admin System** (Environment Variable-based)
- **Used by**: Enterprise admin endpoints (`/enterprise/*`)
- **Validation method**: Checks if user email is in `ADMIN_EMAILS` or `OMNI_ADMIN` environment variables
- **Functions**: `verify_simple_admin()` and `verify_omni_admin()`
- **Location**: `core/services/enterprise_admin_api.py`
- **Requirements**: 
  - `ENTERPRISE_MODE=true`
  - User email in `ADMIN_EMAILS` or `OMNI_ADMIN` env vars

#### 2. **Standard Admin System** (Database-based)
- **Used by**: Admin user management endpoints (`/admin/users/*`)
- **Validation method**: Checks if user has 'admin' or 'super_admin' role in the `user_roles` table
- **Functions**: `require_admin()` and `require_super_admin()`
- **Location**: `core/auth.py`
- **Requirements**: User must have a role entry in the `user_roles` database table

### The Mismatch

- **Frontend**: Uses `useAdminCheck()` → calls `/enterprise/check-admin` → checks environment variables ✅
- **Backend Usage Logs Endpoint**: `/admin/users/{user_id}/usage-logs` → uses `require_admin` → checks `user_roles` table ❌

**Result**: You were an enterprise admin (email in env vars) but didn't have a role in the `user_roles` table, so the usage logs endpoint rejected your requests with a 403 Forbidden error.

## Solution Implemented

Created a **unified admin check** that works with both authentication systems:

### New Function: `require_any_admin()`

Located in: `/Users/varnikachabria/work/omni/Omni/backend/core/admin/users_admin.py`

This function:
1. **First** checks if you're an enterprise admin (if `ENTERPRISE_MODE` is enabled):
   - Gets user email from Supabase auth
   - Checks if email is in `ADMIN_EMAILS` or `OMNI_ADMIN` env vars
   - If yes, grants access ✅

2. **Falls back** to standard admin check:
   - Queries `user_roles` table for user's role
   - Checks if role is 'admin' or 'super_admin'
   - If yes, grants access ✅

3. **Rejects** if neither check passes ❌

### Endpoints Updated

All admin user management endpoints now use `require_any_admin`:
- ✅ `/admin/users/{user_id}/usage-logs` - **View user usage logs**
- ✅ `/admin/users/{user_id}` - View user details
- ✅ `/admin/users/list` - List all users
- ✅ `/admin/users/search/advanced` - Advanced user search
- ✅ `/admin/users/search/email` - Search by email
- ✅ `/admin/users/stats/overview` - User statistics
- ✅ `/admin/users/activity/summary` - Activity summary

## Testing

### Prerequisites
1. Ensure you're logged in with an email that's in `ADMIN_EMAILS` or `OMNI_ADMIN` environment variables
2. Ensure `ENTERPRISE_MODE=true` in your environment

### Test Steps

1. **Restart the backend server** (required for code changes to take effect):
   ```bash
   cd /Users/varnikachabria/work/omni/Omni/backend
   # Stop the current server (Ctrl+C if running)
   # Restart it (however you normally start it)
   ```

2. **Navigate to the admin panel**:
   - Go to the Admin page
   - Click on any user to view their details

3. **Click on the "Usage" tab**:
   - You should now see the usage logs
   - No more "Admin Access Required" error
   - You should see hierarchical usage data grouped by date

4. **Verify the logs display**:
   - Date groupings
   - Thread information
   - Token usage
   - Cost information
   - Model names

### Expected Behavior

**Before Fix:**
```
❌ Admin Access Required
   You need admin privileges to view user usage logs.
```

**After Fix:**
```
✅ Confidential - Admin Access Only
   [Refresh Data button]
   Detailed usage logs showing tokens, costs, and models used...
   
   [Usage logs table with data]
```

## Environment Variables to Check

Make sure these are set in your backend environment:

```bash
# Required for enterprise admin access
ENTERPRISE_MODE=true

# At least one of these must contain your email:
ADMIN_EMAILS=your-email@example.com,other-admin@example.com
OMNI_ADMIN=omni-admin@example.com,super-admin@example.com
```

## Additional Notes

### Backward Compatibility
- ✅ Standard admin system still works (users with roles in `user_roles` table)
- ✅ Enterprise admin system still works (users with emails in env vars)
- ✅ Users who are in **both** systems will work without issues
- ✅ Non-enterprise mode installations still work with standard admin system

### Security Considerations
- The unified check tries enterprise admin first (when enabled) for better performance
- Falls back to database check if enterprise check fails or is not configured
- Logs all admin access attempts for audit purposes
- Uses appropriate HTTP status codes (403 for forbidden, 401 for unauthorized)

### Logging
The fix includes comprehensive logging:
- `Enterprise admin access granted for {email}` - When enterprise admin check succeeds
- `Standard admin access granted for user {user_id} with role {role}` - When database check succeeds
- `Enterprise admin check failed: {error}` - When enterprise check encounters an error (as warning)
- `Standard admin check failed: {error}` - When database check encounters an error

## Alternative Solutions (Not Implemented)

### Option 1: Add User to `user_roles` Table
You could manually add your user to the `user_roles` table:
```sql
INSERT INTO user_roles (user_id, role) 
VALUES ('your-user-id', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
```

**Pros**: Works without code changes
**Cons**: Requires manual database updates, doesn't solve the fundamental mismatch

### Option 2: Update All Admin Endpoints to Use Enterprise System
Replace all `require_admin` with `verify_simple_admin` throughout the codebase.

**Pros**: Single source of truth
**Cons**: Breaking change, requires `ENTERPRISE_MODE`, loses flexibility

### Option 3: Sync Systems Automatically
Create a background job that syncs env var admins to `user_roles` table.

**Pros**: Both systems stay in sync automatically
**Cons**: More complex, requires ongoing maintenance, duplicate data

## Chosen Solution: Unified Check (Implemented)

**Why this is the best approach**:
- ✅ No breaking changes
- ✅ Works with both systems
- ✅ No database modifications required
- ✅ Backward compatible
- ✅ Easy to understand and maintain
- ✅ Flexible for different deployment scenarios

## Files Modified

1. `/Users/varnikachabria/work/omni/Omni/backend/core/admin/users_admin.py`
   - Added imports: `config`, `verify_and_get_user_id_from_jwt`
   - Added new function: `require_any_admin()`
   - Updated 7 endpoint dependencies from `require_admin` to `require_any_admin`

## Next Steps

1. **Restart your backend server** to apply the changes
2. **Test the admin panel** to verify usage logs are now visible
3. **Monitor logs** to ensure admin checks are working correctly
4. **Consider documenting** your admin email configuration for your team

## Questions or Issues?

If you still can't see usage logs after restarting:

1. **Check logs** for admin access attempts
2. **Verify environment variables** are loaded correctly
3. **Confirm your email** matches exactly (case-insensitive, but no typos)
4. **Check ENTERPRISE_MODE** is enabled
5. **Verify you're logged in** with the correct account

---

**Status**: ✅ **FIXED** - Ready to test after backend restart
**Impact**: Fixes usage logs access for enterprise admins without breaking existing functionality
**Priority**: High - Enables critical admin monitoring functionality

