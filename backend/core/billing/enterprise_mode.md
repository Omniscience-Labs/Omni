
# Project Specification: Porting "Enterprise Mode" from V2 to V3

## **0. Context & History (READ THIS FIRST)**

**To the AI Developer:**
We are currently working on **Version 3 (V3)** of an AI Agent platform.

* **The History (V2):** The previous version (V2) was a fork of an open-source project that we added a custom "Enterprise Mode" to. This mode replaced individual Stripe subscriptions with a **shared corporate credit pool** (manual billing) and **per-user monthly spending limits**.
* **The Current State (V3):** V3 is a rewrite that currently **only** supports standard SaaS billing (individual Stripe subscriptions, tracked in tables `credit_ledger` and `credit_accounts`). It is completely missing the "Enterprise Mode" features.
* **The Goal:** We need to re-implement "Enterprise Mode" into V3.
* **Critical Constraint:** We must use the **exact same database schema and table names** for the enterprise features as we did in V2. This is because we will eventually migrate existing V2 clients to V3, and their data needs to fit seamlessly.

**Architectural Strategy:**
We are creating a "Parallel Billing System".

* If `ENTERPRISE_MODE=true` (env var in Render/Vercel, default is `false`), the app uses the legacy V2-style tables (`enterprise_billing`, `enterprise_usage`).
* If `ENTERPRISE_MODE=false`, the app uses the current V3 SaaS tables (`credit_ledger`, `credit_accounts`, `subscriptions`).

**Single-Tenant Model:**
Each enterprise deployment is a **single-tenant instance** — one codebase, one database, one company. Users are added manually to the database. There is no multi-tenant enterprise logic needed.

---

## **Phase 1: Database Foundation & Schema**

**Goal:** Re-create the V2 Enterprise tables in the V3 database.

**Action Required:**
Create a Supabase/Postgres migration file (e.g., `supabase/migrations/xxxx_add_enterprise_tables.sql`) that checks if these tables exist, and creates them if they don't.

**1. `enterprise_billing` (The Shared Pool)**

* **Concept:** A single row holding the company's total money.
* **Schema:**
  * `id`: UUID (Primary Key, default `00000000-0000-0000-0000-000000000000`)
  * `credit_balance`: Numeric (The available funds)
  * `total_loaded`: Numeric (Lifetime total added)
  * `total_used`: Numeric (Lifetime total spent)
  * `created_at`, `updated_at`: Timestamps

**2. `enterprise_user_limits` (Per-User Control)**

* **Concept:** Limits how much a specific user can spend per month from the shared pool.
* **Schema:**
  * `account_id`: FK to `auth.users` (uses `account_id` to match V3's naming convention, renamed from `user_id`)
  * `monthly_limit`: Numeric (Default 100.00)
  * `current_month_usage`: Numeric (Resets monthly)
  * `last_reset_at`: Timestamp
  * `is_active`: Boolean

**3. `enterprise_usage` (The Audit Log)**

* **Concept:** Strict logging of every cent spent in Enterprise Mode.
* **Schema:**
  * `account_id`: FK
  * `thread_id`, `message_id`: Text (Context)
  * `cost`: Numeric
  * `model_name`: Text
  * `tokens_used`: Integer
  * `created_at`: Timestamp

**4. `enterprise_credit_loads` (Transaction History)**

* **Concept:** Audit trail of when Admins added money to the pool.
* **Schema:**
  * `id`: Serial/UUID
  * `amount`: Numeric
  * `type`: Text ('load' or 'negate')
  * `description`: Text
  * `performed_by`: Text (Email or ID of admin)
  * `created_at`: Timestamp

**5. Database Functions**

* Create `load_enterprise_credits(...)` to safely update the balance and log the transaction.
* Create `use_enterprise_credits_simple(...)` which performs the transaction **atomically**:
  1. Check if `enterprise_billing.credit_balance` > cost.
  2. Check if `enterprise_user_limits` allows the spend.
  3. Deduct from global balance, increment user usage, and insert into `enterprise_usage`.

**6. V3 Tables Handling (credit_accounts)**

* Even in Enterprise Mode, ensure every user has a row in `credit_accounts` with balance set to `0`.
* This prevents errors in V3 code that expects this row to exist.
* **Do NOT** write actual credit transactions to `credit_accounts` or `credit_ledger` in Enterprise Mode — they remain at 0.

---

## **Phase 2: The Logic Fork (Backend)**

**Goal:** Teach V3 to switch between SaaS and Enterprise logic based on configuration.

**1. Configuration Setup**

Add `ENTERPRISE_MODE` to the backend configuration:
* **File:** `backend/core/utils/config.py` in the `Configuration` class
* **Default:** `False`
* **Source:** Environment variable from Render/Vercel

```python
# In Configuration class
ENTERPRISE_MODE: bool = False
```

**2. The Enterprise Service**

Create the enterprise billing service at: `backend/core/billing/enterprise/service.py`

* Implement `check_billing_status(account_id)`: Returns `True` if the global pool has funds AND the user hasn't hit their monthly limit.
* Implement `deduct_credits(...)`: Calls the SQL function `use_enterprise_credits_simple`.
* Implement `get_user_usage(account_id)`: Returns the user's current month usage and limit.

**3. The "Enterprise Tier" (Virtual)**

* V3 uses Tiers (Free, Plus, Pro, Ultra) to control limits.
* **File:** `backend/core/billing/shared/config.py`
* If `ENTERPRISE_MODE=true`, **force** the user's tier capabilities to match the **ULTRA** tier with ALL its limits:
  * `project_limit`: 2500
  * `thread_limit`: 2500
  * `concurrent_runs`: 20
  * `custom_workers_limit`: 100
  * `scheduled_triggers_limit`: 50
  * `app_triggers_limit`: 100
  * `models`: `['all']` (access to all models)
  * `can_purchase_credits`: `False` (disabled — no Stripe purchases)
* *Note:* Do not create a database tier entry for this; handle it at the application configuration level.

**4. Disable Daily Credits for Enterprise**

V3 has a daily credits feature (users get $2.00/day refresh). This must be **completely bypassed** in Enterprise Mode:

* **File:** `backend/core/billing/credits/integration.py`
* In `check_and_reserve_credits()`, skip the daily credits refresh call when `ENTERPRISE_MODE=true`.

```python
# In check_and_reserve_credits():
if config.ENTERPRISE_MODE:
    # Skip daily credits - Enterprise uses shared pool
    pass
else:
    await credit_service.check_and_refresh_daily_credits(account_id)
```

**5. The Billing Integration Points (The Switch)**

Modify the billing integration at `backend/core/billing/credits/integration.py`:

**5a. Credit Check (`check_and_reserve_credits`):**
```python
async def check_and_reserve_credits(account_id: str, estimated_tokens: int = 10000):
    if config.ENV_MODE == EnvMode.LOCAL:
        return True, "Local mode", None
    
    if config.ENTERPRISE_MODE:
        # ENTERPRISE: Check enterprise tables only
        from core.billing.enterprise.service import enterprise_billing
        return await enterprise_billing.check_billing_status(account_id)
    
    # Standard V3 SaaS logic (existing code)
    # ... daily credits refresh, balance check, etc.
```

**5b. Credit Deduction (`deduct_usage`):**
```python
async def deduct_usage(account_id, prompt_tokens, completion_tokens, model, ...):
    if config.ENV_MODE == EnvMode.LOCAL:
        return {'success': True, 'cost': 0, 'new_balance': 999999}
    
    if config.ENTERPRISE_MODE:
        # ENTERPRISE: Deduct from enterprise pool, log to enterprise_usage
        from core.billing.enterprise.service import enterprise_billing
        return await enterprise_billing.deduct_credits(
            account_id=account_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            model=model,
            message_id=message_id,
            thread_id=thread_id
        )
    
    # Standard V3 SaaS deduction logic (existing code)
    # ... calculate cost, deduct from credit_accounts, log to credit_ledger
```

---

## **Phase 3: Admin Configuration & API**

**Goal:** Re-implement the V2 Admin access controls using V3's API structure.

**1. Auth Strategy (Dual System)**

V3 uses database-based roles (`user_roles` table with `admin` and `super_admin` roles). For Enterprise Mode, we ADD environment variable-based checks **alongside** the existing system:

* **Keep:** Existing `user_roles` table and `require_admin`/`require_super_admin` decorators in `backend/core/auth.py`
* **Add:** Environment variable checks for enterprise-specific admin features
  * `ADMIN_EMAILS`: Comma-separated list of read/write admins (can view users, edit limits)
  * `OMNI_ADMIN`: Comma-separated list of Super Admins (can load/negate credits)

**Important:** This is a backend-frontend agreement only. Supabase/database does not know about these env vars. The email checks happen in Python code.

**2. Admin Email Helper**

Create a helper in `backend/core/billing/enterprise/auth.py`:

```python
def get_admin_emails() -> List[str]:
    """Get list of admin emails from env var."""
    emails = os.getenv('ADMIN_EMAILS', '')
    return [e.strip().lower() for e in emails.split(',') if e.strip()]

def get_omni_admin_emails() -> List[str]:
    """Get list of omni admin emails from env var."""
    emails = os.getenv('OMNI_ADMIN', '')
    return [e.strip().lower() for e in emails.split(',') if e.strip()]

def is_enterprise_admin(user_email: str) -> bool:
    """Check if user is an enterprise admin."""
    return user_email.lower() in get_admin_emails() or is_omni_admin(user_email)

def is_omni_admin(user_email: str) -> bool:
    """Check if user is an omni admin (can load credits)."""
    return user_email.lower() in get_omni_admin_emails()
```

**3. Admin Endpoints**

Create endpoints at `backend/core/billing/enterprise/api.py`, registered under `/admin/enterprise/`:

* `GET /admin/enterprise/check-admin`: Returns `{ is_admin: bool, is_omni: bool }` based on the user's email vs env vars.
* `POST /admin/enterprise/load-credits`: (Omni-Admin only) Calls `load_enterprise_credits`. Amount and description in body.
* `POST /admin/enterprise/negate-credits`: (Omni-Admin only) Removes credits from pool.
* `GET /admin/enterprise/pool-status`: Returns current `enterprise_billing` balance and totals.
* `GET /admin/enterprise/users`: Returns list of users joined with `enterprise_user_limits`.
* `POST /admin/enterprise/users/{account_id}/limit`: Update a specific user's `monthly_limit`.
* `GET /admin/enterprise/users/{account_id}/usage`: Get detailed usage history for a user.

**4. Router Registration**

In `backend/api.py`, conditionally register the enterprise router:

```python
if config.ENTERPRISE_MODE:
    from core.billing.enterprise.api import enterprise_admin_router
    api_router.include_router(enterprise_admin_router)
```

---

## **Phase 4: Frontend Admin Dashboard**

**Goal:** Build a management interface using V3's current design system (Shadcn/Tailwind).

**1. Configuration Setup**

Add to frontend config at `frontend/src/lib/config.ts`:

```typescript
export const isEnterpriseMode = (): boolean => {
  return process.env.NEXT_PUBLIC_ENTERPRISE_MODE === 'true';
};
```

**2. Route:** `/admin/enterprise`

* Protect this route using a `useEnterpriseAdminCheck` hook that validates against `/admin/enterprise/check-admin`.
* Only render if `isEnterpriseMode()` returns `true`.

**3. Components:**

* **Status Card:** Big bold numbers showing "Enterprise Credit Balance" (from `/admin/enterprise/pool-status`).
* **Load Credits Dialog:** A clean modal to add funds (Only visible if `is_omni` is true).
* **Negate Credits Dialog:** Modal to remove funds with reason (Only visible if `is_omni`).
* **User Management Table:**
  * List all users from `/admin/enterprise/users`.
  * Show "Month Usage / Limit" (e.g., "$45.00 / $100.00").
  * "Edit Limit" button to change the monthly cap.
  * Usage percentage bar for visual feedback.

---

## **Phase 5: Frontend User Experience**

**Goal:** Hide ALL SaaS billing clutter for Enterprise users. No Stripe, no purchases, no subscription UI.

**1. Global Visibility Toggle**

In the frontend code, check `NEXT_PUBLIC_ENTERPRISE_MODE`:

**If Enterprise Mode is TRUE, HIDE:**
* "Subscription" page/link
* "Upgrade Plan" buttons
* "Billing" settings
* SaaS "Credit Balance" chip in the header
* "Buy Credits" / "Top Up" buttons
* Any Stripe-related UI (payment methods, invoices)
* Daily credits indicators
* Pricing page / tier comparison

**If Enterprise Mode is TRUE, SHOW:**
* "Enterprise Usage" link in sidebar/header
* Enterprise usage card on dashboard

**2. Enterprise Usage View (Regular User)**

Create a simple view for the regular user showing:
* "Your Monthly Limit: $100.00"
* "Used This Month: $XX.XX"
* "Remaining: $XX.XX"
* Progress bar showing usage percentage
* Days until reset (calculated from `last_reset_at`)

**Do NOT** show the global company pool balance to regular users — only admins see that.

**3. Conditional Component Wrapper**

Create a utility component for easy conditional rendering:

```tsx
// components/enterprise/EnterpriseGuard.tsx
export const HideInEnterprise: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (isEnterpriseMode()) return null;
  return <>{children}</>;
};

export const ShowInEnterprise: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!isEnterpriseMode()) return null;
  return <>{children}</>;
};
```

---

## **Phase 6: Automation & Migration (The Final Step)**

**Goal:** Ensure the system runs autonomously and handles legacy data.

**1. Automated Monthly Reset**

* We need to reset every user's `current_month_usage` to 0 on the 1st of the month.
* **Implementation:** Write a SQL migration that adds a `pg_cron` job (if the extension exists on the DB).
  * Schedule: `0 0 1 * *` (Monthly at midnight on the 1st).
  * Command: `SELECT reset_enterprise_monthly_usage();`

* Create the reset function:
```sql
CREATE OR REPLACE FUNCTION reset_enterprise_monthly_usage()
RETURNS void AS $$
BEGIN
    UPDATE enterprise_user_limits
    SET current_month_usage = 0,
        last_reset_at = NOW();
END;
$$ LANGUAGE plpgsql;
```

* *Note:* If `pg_cron` is not installed on the specific Postgres instance, the migration should fail silently or just log a warning, and we will rely on an external cron (Render cron job or similar) calling a reset API endpoint.

**2. Migration Logic**

* The SQL migration from Phase 1 should be idempotent.
* It must essentially say: "IF `enterprise_billing` table exists (Legacy Client), DO NOTHING (keep their money intact). IF NOT EXISTS (New Client), CREATE IT with initial zero balance."

**3. User Provisioning**

* Users are added **manually** to the database by enterprise admins.
* When a new user signs up (via Supabase Auth), ensure:
  1. A row is created in `credit_accounts` with balance = 0 (to prevent V3 errors)
  2. If `ENTERPRISE_MODE=true`, a row is created in `enterprise_user_limits` with default monthly limit

---

## **File Summary: What Gets Created/Modified**

### New Files to Create:
```
backend/core/billing/enterprise/
├── __init__.py
├── service.py          # Enterprise billing logic
├── auth.py             # Email-based admin checks
└── api.py              # FastAPI router for /admin/enterprise/*

supabase/migrations/
└── xxxx_add_enterprise_tables.sql
```

### Existing Files to Modify:
```
backend/core/utils/config.py          # Add ENTERPRISE_MODE
backend/core/billing/shared/config.py # Add enterprise tier override logic
backend/core/billing/credits/integration.py  # Add enterprise billing fork
backend/api.py                         # Register enterprise router

frontend/src/lib/config.ts            # Add isEnterpriseMode()
frontend/src/components/...           # Hide SaaS UI in enterprise mode
```

---

## **Environment Variables Summary**

| Variable | Location | Purpose |
|----------|----------|---------|
| `ENTERPRISE_MODE` | Render (backend) | Enable enterprise billing system |
| `ADMIN_EMAILS` | Render (backend) | Comma-separated admin emails |
| `OMNI_ADMIN` | Render (backend) | Comma-separated super admin emails |
| `NEXT_PUBLIC_ENTERPRISE_MODE` | Vercel (frontend) | Enable enterprise UI mode |
