# Double Escaping Fix - Summary of Changes

## Overview
Fixed the double escaping issue where JSON content was being stored as escaped strings in JSONB columns in the database.

## Root Cause
- The `add_message` method in `thread_manager.py` was using `json.dumps()` on content before inserting into JSONB columns
- JSONB columns automatically handle JSON serialization, so this caused double escaping
- Other parts of the code expected JSON strings and were using `json.loads()` on data that was now properly stored as objects

## Changes Made

### 1. Backend - thread_manager.py
**File**: `backend/agentpress/thread_manager.py`
- Removed `json.dumps()` calls in the `add_message` method
- Now passes content and metadata directly to the database

```python
# Before:
'content': json.dumps(content) if isinstance(content, (dict, list)) else content,
'metadata': json.dumps(metadata or {}),

# After:
'content': content,
'metadata': metadata or {},
```

### 2. Backend - JSON Helper Utilities
**File**: `backend/agentpress/utils/json_helpers.py` (new)
- Created helper functions to handle both old (JSON string) and new (dict/list) formats
- Key functions:
  - `ensure_dict()` - Ensures a value is a dict, handling both formats
  - `safe_json_parse()` - Safely parses JSON that might already be parsed
  - `format_for_yield()` - Formats messages for yielding with JSON string content/metadata

### 3. Backend - response_processor.py
**File**: `backend/agentpress/response_processor.py`
- Updated to use the new JSON helper functions
- Replaced all `json.loads()` calls with `safe_json_parse()`
- Replaced all `json.dumps()` calls with `to_json_string()`
- All yielded messages are now formatted using `format_for_yield()` to ensure backward compatibility

Key changes:
- Line 403: Fixed metadata parsing
- Lines 190, 252: Fixed chunk content/metadata formatting
- Lines 265, 274, 384, 676, 1114: Fixed function arguments parsing
- All yield statements: Wrapped with `format_for_yield()`

### 4. Frontend - Backward Compatibility
**File**: `frontend/src/components/thread/utils.ts`
- Updated `safeJsonParse` function to handle double-escaped JSON
- Automatically detects and handles both old and new formats
- Tries a second parse if the first parse returns a JSON-like string

## Migration Guide

### For New Deployments
No action needed - the code will work correctly out of the box.

### For Existing Deployments with Old Data

1. **Option 1: Run Database Migration (Recommended)**
   ```sql
   -- Creates a backup table and fixes all messages
   -- See backend/migrations/fix_double_escaped_json.sql
   ```

2. **Option 2: Leave Old Data As-Is**
   - The frontend will automatically handle both formats
   - New messages will be stored correctly
   - Old messages will continue to work

## Testing

### Backend Test
```python
# Run: python backend/tests/test_double_escape_fix.py
# Verifies that:
# - Dict content is stored as dict (not string)
# - List content is stored as list (not string)
# - String content remains string
```

### Frontend Compatibility
The updated `safeJsonParse` function handles:
- New format: `{"key": "value"}` (proper object)
- Old format: `"{\"key\": \"value\"}"` (double-escaped string)
- Mixed environments during migration

## Benefits
1. **Proper Data Storage**: JSON data is stored correctly in JSONB columns
2. **Better Performance**: Database can index and query JSON fields
3. **Cleaner Code**: No unnecessary JSON serialization/deserialization
4. **Backward Compatible**: Works with both old and new data formats 