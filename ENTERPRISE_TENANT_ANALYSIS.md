# Enterprise Plan & Tenant Identity Analysis Report

**Date:** 2025-01-13  
**Purpose:** Identify enterprise plan detection, tenant identity, JWT handling, and Bedrock routing points

---

## Executive Summary

This codebase uses a **multi-tenant account system** (Basejump) where:
- **Enterprise plans** are determined by subscription tier names (`tier_125_800`, `tier_200_1000`, `tier_150_1200`)
- **Tenant identity** is represented by `account_id` (UUID) from `basejump.accounts` table
- **JWT authentication** extracts `sub` claim as `user_id`, but does NOT contain tenant/org identifiers
- **Enterprise status** is tied to `account_id` (not individual users), stored in `credit_accounts.tier`
- **No explicit `tenant_id` field exists** - `account_id` serves as the canonical tenant identifier

---

## A) Enterprise Plan Detection

### Files & Functions Where Enterprise Plan is Checked

#### 1. **Tier Configuration** 
**File:** `Omni/backend/core/billing/shared/config.py`

**Enterprise Tiers Defined:**
- `tier_125_800`: "Legacy Enterprise" (lines 187-206)
- `tier_200_1000`: "Legacy Enterprise Plus" (lines 207-226)  
- `tier_150_1200`: "Legacy Enterprise Max" (lines 227-246)

**Key Function:** `get_tier_by_name(tier_name: str)` (line 270)
- Returns `Tier` object from `TIERS` dictionary
- No explicit `is_enterprise()` function - determined by tier name pattern

#### 2. **Tier Retrieval Handler**
**File:** `Omni/backend/core/billing/subscriptions/handlers/tier.py`

**Function:** `TierHandler.get_user_subscription_tier(account_id: str, skip_cache: bool = False)` (lines 9-54)

**Logic:**
1. Queries `credit_accounts` table: `SELECT tier, trial_status WHERE account_id = ?`
2. Retrieves `tier` column value (e.g., `'tier_125_800'`)
3. Maps tier name to `TIERS` dictionary
4. Returns tier info including `display_name`, `credits`, `models`, limits, etc.

**Enforcement Level:** Business logic (called at request-time, not middleware)

#### 3. **Billing Integration**
**File:** `Omni/backend/core/billing/credits/integration.py`

**Function:** `BillingIntegration.check_model_and_billing_access(account_id, model_name, client)` (lines 36-79)

**Logic:**
1. Calls `subscription_service.get_user_subscription_tier(account_id)` (line 51)
2. Checks `is_model_allowed(tier_name, model_name)` (line 54)
3. Enforces credit limits and model access

**Enforcement Level:** Request-time (before LLM API calls)

#### 4. **Frontend Middleware**
**File:** `Omni/frontend/src/middleware.ts`

**Function:** `middleware(request: NextRequest)` (lines 56-328)

**Logic:**
- Lines 254-273: Queries `basejump.accounts` and `credit_accounts` tables
- Line 295: Checks `hasPaidTier = creditAccount.tier && creditAccount.tier !== 'none' && creditAccount.tier !== 'free'`
- **Note:** Does NOT specifically check for enterprise tiers - only checks if tier is paid

**Enforcement Level:** Middleware (route protection)

### Enterprise Qualification Logic

**Current Implementation:**
- Enterprise status is **implicit** - determined by tier name matching patterns:
  - `tier_125_800` → "Legacy Enterprise"
  - `tier_200_1000` → "Legacy Enterprise Plus"  
  - `tier_150_1200` → "Legacy Enterprise Max"
- **No explicit `is_enterprise` flag or function exists**
- Enterprise tiers have higher limits (projects: 10K-25K, threads: 10K-25K, concurrent_runs: 50-100)

**Recommendation for Enterprise Detection:**
```python
def is_enterprise_tier(tier_name: str) -> bool:
    """Check if tier is an enterprise plan."""
    enterprise_tiers = ['tier_125_800', 'tier_200_1000', 'tier_150_1200']
    return tier_name in enterprise_tiers
```

---

## B) Supabase Auth + JWT Handling

### JWT Verification Location

**File:** `Omni/backend/core/utils/auth_utils.py`

#### 1. **JWT Decode Function**
**Function:** `_decode_jwt_with_verification(token: str) -> dict` (lines 43-138)

**Verification Method:**
- **Symmetric (HS256):** Uses `config.SUPABASE_JWT_SECRET` (line 49, 65-75)
- **Asymmetric (RS*/ES*):** Fetches JWKS from issuer (lines 77-110)
  - Constructs JWKS URL: `{iss}/.well-known/jwks.json`
  - Falls back to OpenID configuration if needed
  - Uses `jwt.PyJWKClient` to get signing key

**Verification Options:**
- `verify_signature: True` ✅
- `verify_exp: True` ✅
- `verify_aud: False` (disabled)
- `verify_iss: False` (disabled)

#### 2. **User ID Extraction**
**Function:** `verify_and_get_user_id_from_jwt(request: Request) -> str` (lines 200-297)

**Logic:**
1. Checks for `x-api-key` header first (lines 201-257) - API key authentication
2. Falls back to `Authorization: Bearer <token>` header (lines 259-268)
3. Extracts token from header (line 268)
4. Calls `_decode_jwt_with_verification(token)` (line 271)
5. Extracts `user_id = payload.get('sub')` (line 272)
6. Returns `user_id` (line 286)

**JWT Claims Currently Used:**
- `sub` - User ID (primary identifier)
- **NOT used:** `email`, `role`, `org_id`, `tenant_id`, `account_id`

#### 3. **Streaming Auth**
**Function:** `get_user_id_from_stream_auth(request, token)` (lines 307-355)

**Logic:**
- Supports JWT via `Authorization` header OR `token` query parameter
- Same verification flow as above

### JWT Claims Available vs. Used

**Available in Supabase JWT (typical):**
- `sub` - User UUID ✅ **USED**
- `email` - User email ❌ Not extracted
- `role` - User role ❌ Not extracted  
- `app_metadata` - Custom metadata ❌ Not extracted
- `user_metadata` - User metadata ❌ Not extracted

**Missing from JWT:**
- `account_id` - Not in JWT (must be queried from DB)
- `tenant_id` - Not in JWT (doesn't exist)
- `org_id` - Not in JWT (doesn't exist)

### Account ID Resolution

**Function:** `_get_user_id_from_account_cached(account_id: str)` (lines 164-198)

**Logic:**
1. Queries `basejump.accounts` table:
   ```sql
   SELECT primary_owner_user_id 
   FROM basejump.accounts 
   WHERE id = account_id
   ```
2. Caches result in Redis (TTL: 300s)
3. Returns `primary_owner_user_id`

**Note:** This is **reverse lookup** (account_id → user_id), not the typical flow.

**Typical Flow:**
1. JWT → `user_id` (from `sub` claim)
2. Query `basejump.accounts` WHERE `primary_owner_user_id = user_id` AND `personal_account = true`
3. Get `account_id` from result

**File:** `Omni/backend/core/services/api_keys_api.py` (lines 33-57) shows this pattern.

---

## C) Tenant / Organization Identity

### Current Tenant Identity System

#### 1. **Account-Based Multi-Tenancy (Basejump)**

**Schema:** `basejump.accounts` table

**Key Fields:**
- `id` (UUID) - **This is the `account_id` / tenant identifier**
- `primary_owner_user_id` (UUID) - References `auth.users.id`
- `personal_account` (boolean) - True for individual user accounts
- `name`, `slug` - Account display name
- `private_metadata`, `public_metadata` (JSONB) - Custom data

**File:** `Omni/backend/supabase/migrations/20240414161947_basejump-accounts.sql` (lines 46-64)

#### 2. **Account-User Relationship**

**Schema:** `basejump.account_user` (junction table)

**Purpose:** Many-to-many relationship between users and accounts

**Key Fields:**
- `account_id` (UUID) - References `basejump.accounts.id`
- `user_id` (UUID) - References `auth.users.id`
- `account_role` (ENUM) - `'owner'` or `'member'`

**Usage in Code:**
- `Omni/backend/core/utils/auth_utils.py` (lines 445, 648, 726)
- Checks membership: `SELECT account_role FROM basejump.account_user WHERE user_id = ? AND account_id = ?`

#### 3. **Where `account_id` is Stored**

**Tables with `account_id` column:**
1. **`threads`** - `account_id UUID REFERENCES basejump.accounts(id)`
   - File: `Omni/backend/supabase/migrations/20250416133920_agentpress_schema.sql` (line 17)
   
2. **`projects`** - `account_id UUID NOT NULL REFERENCES basejump.accounts(id)`
   - File: `Omni/backend/supabase/migrations/20250416133920_agentpress_schema.sql` (line 7)

3. **`credit_accounts`** - `account_id UUID` (billing/subscription)
   - Used for tier storage: `SELECT tier FROM credit_accounts WHERE account_id = ?`

4. **`agents`** - `account_id UUID` (agent ownership)

5. **`devices`**, **`recordings`** - Device/recording ownership

#### 4. **Account ID Resolution Flow**

**From JWT → Account ID:**

```python
# Step 1: Extract user_id from JWT
user_id = payload.get('sub')  # From auth_utils.py:272

# Step 2: Query personal account
result = await client.schema('basejump').table('accounts')
    .select('id')
    .eq('primary_owner_user_id', user_id)
    .eq('personal_account', True)
    .single()
    .execute()

account_id = result.data['id']  # This is the tenant identifier
```

**Example:** `Omni/frontend/src/middleware.ts` (lines 254-260)

#### 5. **No Explicit `tenant_id` Field**

**Finding:** The codebase does **NOT** have an explicit `tenant_id` column.

**Current Approach:**
- `account_id` from `basejump.accounts.id` **IS the tenant identifier**
- All resources are scoped by `account_id`
- Enterprise plans are tied to `account_id` (via `credit_accounts.account_id`)

**Recommendation:**
- **Use `account_id` as the canonical tenant identifier**
- For enterprise customers, `account_id` should map to AWS Bedrock IAM role
- Create mapping table: `enterprise_bedrock_routing`:
  ```sql
  CREATE TABLE enterprise_bedrock_routing (
    account_id UUID PRIMARY KEY REFERENCES basejump.accounts(id),
    bedrock_role_arn TEXT NOT NULL,
    bedrock_external_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

---

## D) Cross-Check: Enterprise vs Tenant

### Enterprise Plan Relationship

**Finding:** Enterprise plan is **tied to `account_id`**, not individual users.

**Evidence:**
1. `credit_accounts.tier` is stored per `account_id` (not `user_id`)
2. Multiple users can belong to same account via `basejump.account_user`
3. Tier limits apply to entire account (projects, threads, concurrent_runs)

**File:** `Omni/backend/core/billing/subscriptions/handlers/tier.py` (line 20-23)
```python
credit_result = await client.from_('credit_accounts')\
    .select('tier, trial_status')\
    .eq('account_id', account_id)\  # ← Tier is per account
    .execute()
```

### User-to-Tenant Relationship

**1-to-Many:** One user can belong to multiple accounts (via `account_user` table)

**Many-to-1:** Multiple users can belong to one account (team/organization)

**Personal Account:**
- Each user has exactly one `personal_account = true` account
- This is their default tenant for individual subscriptions

**Organization Account:**
- Users can be added to additional accounts (`personal_account = false`)
- These are team/org accounts that may have enterprise plans

### Enterprise Account Structure

**Typical Enterprise Setup:**
1. Organization creates account: `basejump.accounts` with `personal_account = false`
2. Account subscribes to enterprise tier: `credit_accounts.tier = 'tier_125_800'`
3. Multiple users added: `basejump.account_user` entries
4. All users share the enterprise plan limits

---

## E) Recommendations for Bedrock Routing

### Single Source of Truth for Tenant Identity

**Recommendation:** Use `account_id` from `basejump.accounts.id`

**Rationale:**
- Already used throughout codebase for resource scoping
- Enterprise plans are tied to `account_id`
- Server-side enforced (not client-provided)
- Guaranteed to exist for all authenticated users

### Where to Add Tenant-Based Bedrock Routing

#### 1. **LLM Service Layer** (Primary Integration Point)

**File:** `Omni/backend/core/services/llm.py`

**Function:** `make_llm_api_call(...)` (lines 205-329)

**Current Flow:**
- Line 317: `response = await provider_router.acompletion(**params)`
- No tenant context passed to provider

**Recommended Change:**
```python
async def make_llm_api_call(
    messages: List[Dict[str, Any]],
    model_name: str,
    account_id: Optional[str] = None,  # ← Add account_id parameter
    ...
):
    # Resolve Bedrock IAM role for enterprise accounts
    if account_id and 'bedrock' in model_name.lower():
        bedrock_config = await get_bedrock_config_for_account(account_id)
        if bedrock_config:
            # Configure boto3 session with AssumeRole
            params['aws_session'] = create_bedrock_session(bedrock_config)
```

#### 2. **Thread Manager** (Call Site)

**File:** `Omni/backend/core/agentpress/thread_manager.py`

**Function:** `run_thread(...)` (lines 278-293)

**Current Flow:**
- Line 618: `llm_response = await make_llm_api_call(...)`
- Has access to `self.account_id` (if available)

**Recommended Change:**
```python
llm_response = await make_llm_api_call(
    prepared_messages, llm_model,
    account_id=self.account_id,  # ← Pass account_id
    temperature=llm_temperature,
    ...
)
```

#### 3. **Run Agent** (Entry Point)

**File:** `Omni/backend/core/run.py`

**Class:** `AgentRun` (lines 42-1095)

**Current Flow:**
- Line 646: `self.account_id` is set from thread query or provided
- Line 934: Calls `thread_manager.run_thread(...)`

**Recommended Change:**
- Ensure `account_id` is always available in `AgentRun` context
- Pass to `thread_manager.run_thread()` if not already available

#### 4. **Bedrock Client Initialization**

**File:** `Omni/backend/core/agentpress/context_manager.py`

**Function:** `_get_bedrock_client_singleton()` (lines 39-48)

**Current Implementation:**
- Creates global singleton: `boto3.client('bedrock-runtime', region_name='us-west-2')`
- No tenant-specific configuration

**Recommended Change:**
```python
def get_bedrock_client_for_account(account_id: str):
    """Get Bedrock client with account-specific IAM role."""
    bedrock_config = await get_bedrock_config_for_account(account_id)
    if bedrock_config:
        # AssumeRole session
        session = boto3.Session()
        sts = session.client('sts')
        assumed_role = sts.assume_role(
            RoleArn=bedrock_config['role_arn'],
            RoleSessionName=f'bedrock-{account_id}',
            ExternalId=bedrock_config.get('external_id')
        )
        credentials = assumed_role['Credentials']
        return boto3.client(
            'bedrock-runtime',
            aws_access_key_id=credentials['AccessKeyId'],
            aws_secret_access_key=credentials['SecretAccessKey'],
            aws_session_token=credentials['SessionToken'],
            region_name='us-west-2'
        )
    # Fallback to default client
    return _get_bedrock_client_singleton()
```

### Implementation Steps

1. **Create Enterprise Bedrock Routing Table:**
   ```sql
   CREATE TABLE enterprise_bedrock_routing (
       account_id UUID PRIMARY KEY REFERENCES basejump.accounts(id),
       bedrock_role_arn TEXT NOT NULL,
       bedrock_external_id TEXT,
       enabled BOOLEAN DEFAULT TRUE,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. **Add Helper Function:**
   ```python
   # Omni/backend/core/billing/subscriptions/handlers/tier.py
   async def is_enterprise_account(account_id: str) -> bool:
       tier_info = await TierHandler.get_user_subscription_tier(account_id)
       tier_name = tier_info.get('name', 'none')
       return tier_name in ['tier_125_800', 'tier_200_1000', 'tier_150_1200']
   
   async def get_bedrock_config_for_account(account_id: str) -> Optional[Dict]:
       if not await is_enterprise_account(account_id):
           return None
       # Query enterprise_bedrock_routing table
       ...
   ```

3. **Modify LLM Service:**
   - Add `account_id` parameter to `make_llm_api_call()`
   - Check for enterprise account
   - Use tenant-specific Bedrock client if configured

4. **Update Call Sites:**
   - `thread_manager.run_thread()` - Pass `account_id`
   - `AgentRun.setup()` - Ensure `account_id` is available
   - Background workers - Extract `account_id` from thread/project

---

## Summary

### Key Findings

1. **Enterprise Plan Detection:**
   - ✅ Tier names: `tier_125_800`, `tier_200_1000`, `tier_150_1200`
   - ✅ Stored in: `credit_accounts.tier` (per `account_id`)
   - ✅ Retrieved via: `TierHandler.get_user_subscription_tier(account_id)`
   - ❌ No explicit `is_enterprise()` function

2. **JWT Handling:**
   - ✅ Verified via Supabase JWT secret (HS256) or JWKS (RS*/ES*)
   - ✅ Extracts `sub` claim as `user_id`
   - ❌ No `tenant_id` or `account_id` in JWT
   - ✅ Must query DB to get `account_id` from `user_id`

3. **Tenant Identity:**
   - ✅ **`account_id` from `basejump.accounts.id` IS the tenant identifier**
   - ✅ Used throughout: `threads`, `projects`, `credit_accounts`, `agents`
   - ✅ Server-side enforced (not client-provided)
   - ❌ No explicit `tenant_id` field (use `account_id`)

4. **Enterprise vs Tenant:**
   - ✅ Enterprise plan tied to `account_id` (not user)
   - ✅ Multiple users can belong to one account (team/org)
   - ✅ One user can belong to multiple accounts

5. **Bedrock Routing Points:**
   - 🎯 **Primary:** `core/services/llm.py::make_llm_api_call()`
   - 🎯 **Secondary:** `core/agentpress/thread_manager.py::run_thread()`
   - 🎯 **Client:** `core/agentpress/context_manager.py::_get_bedrock_client_singleton()`

### Recommended Implementation

1. Use `account_id` as tenant identifier (already canonical)
2. Create `enterprise_bedrock_routing` table for IAM role mapping
3. Add `is_enterprise_account(account_id)` helper function
4. Modify `make_llm_api_call()` to accept `account_id` and use tenant-specific Bedrock client
5. Ensure `account_id` flows through: JWT → user_id → account_id → Bedrock routing

---

**End of Report**
