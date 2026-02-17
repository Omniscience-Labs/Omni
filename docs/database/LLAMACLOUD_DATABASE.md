# LlamaCloud Database Documentation

## Table of Contents
- [Overview](#overview)
- [Database Schema](#database-schema)
- [Tables](#tables)
- [Database Functions](#database-functions)
- [Migrations](#migrations)
- [Row Level Security (RLS)](#row-level-security-rls)
- [Indexes](#indexes)
- [Relationships](#relationships)
- [Query Examples](#query-examples)
- [Best Practices](#best-practices)

---

## Overview

The LlamaCloud database integration uses PostgreSQL via Supabase, providing a robust, scalable foundation for managing knowledge base references and agent assignments.

### Architecture Principles

1. **Global-First Design**: Knowledge bases are account-scoped, not agent-specific
2. **Assignment System**: Explicit many-to-many relationships between agents and KBs
3. **Folder Organization**: Hierarchical organization with nullable folder references
4. **RLS Security**: All tables use Row Level Security for multi-tenant isolation
5. **Idempotent Migrations**: All migrations can be run multiple times safely

### Key Features

- **Dual KB Support**: Both regular file entries and cloud KBs in unified system
- **Legacy Compatibility**: Supports migration from agent-specific KBs
- **Audit Trail**: Created/updated timestamps on all records
- **Soft Deletes**: Is_active flags for logical deletion
- **Referential Integrity**: Foreign key constraints with cascade behaviors

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Basejump Schema                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────┐              ┌──────────────────┐            │
│  │    accounts      │              │   account_user   │            │
│  │  (basejump)      │──────────────│   (basejump)     │            │
│  │                  │              │                  │            │
│  │  - id (PK)       │              │  - user_id       │            │
│  │  - ...           │              │  - account_id    │            │
│  └──────────────────┘              └──────────────────┘            │
│           │                                                          │
│           │ (account_id FK)                                         │
│           │                                                          │
└───────────┼──────────────────────────────────────────────────────────┘
            │
            │
┌───────────┼──────────────────────────────────────────────────────────┐
│           │              Public Schema                                │
├───────────┼──────────────────────────────────────────────────────────┤
│           │                                                            │
│           ▼                                                            │
│  ┌─────────────────────────┐                                         │
│  │   agents                │                                         │
│  │                         │                                         │
│  │   - agent_id (PK)       │◄──────────┐                            │
│  │   - account_id (FK)     │           │                            │
│  │   - name                │           │                            │
│  │   - ...                 │           │ (agent_id FK)              │
│  └─────────────────────────┘           │                            │
│           │                              │                            │
│           │                              │                            │
│           ▼                              │                            │
│  ┌────────────────────────────────┐    │                            │
│  │ knowledge_base_folders         │    │                            │
│  │                                │    │                            │
│  │ - folder_id (PK)               │    │                            │
│  │ - account_id (FK)              │    │                            │
│  │ - name                         │    │                            │
│  │ - description                  │    │                            │
│  │ - created_at                   │    │                            │
│  └────────────────────────────────┘    │                            │
│           │                              │                            │
│           │ (folder_id FK, nullable)    │                            │
│           │                              │                            │
│           ├──────────────┬───────────────┤                            │
│           ▼              ▼               ▼                            │
│  ┌────────────────┐  ┌────────────────────────────────┐             │
│  │ knowledge_base_│  │ llamacloud_knowledge_bases     │             │
│  │ entries        │  │                                │             │
│  │                │  │ - kb_id (PK)                   │             │
│  │ - entry_id (PK)│  │ - account_id (FK)              │             │
│  │ - account_id   │  │ - folder_id (FK, nullable)     │             │
│  │ - folder_id    │  │ - name                         │             │
│  │ - filename     │  │ - index_name                   │             │
│  │ - summary      │  │ - description                  │             │
│  │ - ...          │  │ - summary                      │             │
│  └────────────────┘  │ - usage_context                │             │
│           │           │ - is_active                    │             │
│           │           │ - created_at / updated_at      │             │
│           │           └────────────────────────────────┘             │
│           │                        │                                  │
│           │                        │ (kb_id FK)                       │
│           │                        ▼                                  │
│           │           ┌────────────────────────────────┐             │
│           │           │ agent_llamacloud_kb_assignments│             │
│           │           │                                │             │
│           │           │ - assignment_id (PK)           │             │
│           │           │ - agent_id (FK) ───────────────┘             │
│           │           │ - kb_id (FK)                   │             │
│           │           │ - account_id (FK)              │             │
│           │           │ - enabled                      │             │
│           │           │ - assigned_at                  │             │
│           │           │ UNIQUE(agent_id, kb_id)        │             │
│           │           └────────────────────────────────┘             │
│           │                                                            │
│           │ (entry_id FK)                                             │
│           ▼                                                            │
│  ┌────────────────────────────────┐                                  │
│  │ agent_knowledge_entry_         │                                  │
│  │ assignments                    │                                  │
│  │                                │                                  │
│  │ - assignment_id (PK)           │                                  │
│  │ - agent_id (FK)                │                                  │
│  │ - entry_id (FK)                │                                  │
│  │ - account_id (FK)              │                                  │
│  │ - enabled                      │                                  │
│  │ - assigned_at                  │                                  │
│  │ UNIQUE(agent_id, entry_id)     │                                  │
│  └────────────────────────────────┘                                  │
│                                                                        │
│  ┌────────────────────────────────┐                                  │
│  │ agent_llamacloud_knowledge_    │ (Legacy Support)                │
│  │ bases                          │                                  │
│  │                                │                                  │
│  │ - kb_id (PK)                   │                                  │
│  │ - agent_id (FK)                │                                  │
│  │ - account_id (FK)              │                                  │
│  │ - name                         │                                  │
│  │ - index_name                   │                                  │
│  │ - description                  │                                  │
│  │ - is_active                    │                                  │
│  └────────────────────────────────┘                                  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Tables

### 1. llamacloud_knowledge_bases

**Description:** Global LlamaCloud knowledge base references shared across agents within an account.

**Schema:**
```sql
CREATE TABLE llamacloud_knowledge_bases (
    kb_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES knowledge_base_folders(folder_id) ON DELETE SET NULL,
    
    -- LlamaCloud Configuration
    name VARCHAR(255) NOT NULL,
    index_name VARCHAR(255) NOT NULL,
    description TEXT,
    summary TEXT,
    usage_context VARCHAR(100) DEFAULT 'always',
    
    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT llamacloud_kb_name_not_empty CHECK (
        LENGTH(TRIM(name)) > 0
    ),
    CONSTRAINT llamacloud_kb_index_not_empty CHECK (
        LENGTH(TRIM(index_name)) > 0
    ),
    CONSTRAINT llamacloud_kb_unique_index_per_account 
        UNIQUE (account_id, index_name),
    CONSTRAINT llamacloud_kb_usage_context_check 
        CHECK (usage_context IN ('always', 'on_request', 'contextual'))
);
```

**Columns:**
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| kb_id | UUID | No | Primary key (auto-generated) |
| account_id | UUID | No | Owner account reference |
| folder_id | UUID | Yes | Optional folder organization |
| name | VARCHAR(255) | No | Display name (kebab-case) |
| index_name | VARCHAR(255) | No | LlamaCloud index identifier |
| description | TEXT | Yes | What the KB contains |
| summary | TEXT | Yes | Short summary for display |
| usage_context | VARCHAR(100) | No | When to use (always/on_request/contextual) |
| is_active | BOOLEAN | No | Active status (default: true) |
| created_at | TIMESTAMPTZ | No | Creation timestamp |
| updated_at | TIMESTAMPTZ | No | Last update timestamp (auto-updated) |

**Indexes:**
```sql
CREATE INDEX idx_llamacloud_kb_account_id ON llamacloud_knowledge_bases(account_id);
CREATE INDEX idx_llamacloud_kb_folder_id ON llamacloud_knowledge_bases(folder_id);
CREATE INDEX idx_llamacloud_kb_is_active ON llamacloud_knowledge_bases(is_active);
CREATE INDEX idx_llamacloud_kb_created_at ON llamacloud_knowledge_bases(created_at);
CREATE INDEX idx_llamacloud_kb_usage_context ON llamacloud_knowledge_bases(usage_context);
```

**Unique Constraints:**
- `(account_id, index_name)`: Prevents duplicate index references per account

---

### 2. agent_llamacloud_kb_assignments

**Description:** Many-to-many relationship between agents and LlamaCloud knowledge bases.

**Schema:**
```sql
CREATE TABLE agent_llamacloud_kb_assignments (
    assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    kb_id UUID NOT NULL REFERENCES llamacloud_knowledge_bases(kb_id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    
    enabled BOOLEAN DEFAULT TRUE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(agent_id, kb_id)
);
```

**Columns:**
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| assignment_id | UUID | No | Primary key (auto-generated) |
| agent_id | UUID | No | Agent reference |
| kb_id | UUID | No | Knowledge base reference |
| account_id | UUID | No | Account reference (for RLS) |
| enabled | BOOLEAN | No | Assignment status (default: true) |
| assigned_at | TIMESTAMPTZ | No | Assignment timestamp |

**Indexes:**
```sql
CREATE INDEX idx_agent_llamacloud_assignments_agent_id 
    ON agent_llamacloud_kb_assignments(agent_id);
CREATE INDEX idx_agent_llamacloud_assignments_kb_id 
    ON agent_llamacloud_kb_assignments(kb_id);
CREATE INDEX idx_agent_llamacloud_assignments_account_id 
    ON agent_llamacloud_kb_assignments(account_id);
CREATE INDEX idx_agent_llamacloud_assignments_enabled 
    ON agent_llamacloud_kb_assignments(enabled);
```

**Unique Constraints:**
- `(agent_id, kb_id)`: One assignment per agent-KB pair

**Cascade Behaviors:**
- Delete agent → Delete all assignments
- Delete KB → Delete all assignments
- Delete account → Delete all assignments

---

### 3. knowledge_base_folders

**Description:** Folder structure for organizing knowledge bases (both files and cloud KBs).

**Schema:**
```sql
CREATE TABLE knowledge_base_folders (
    folder_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT folder_name_not_empty CHECK (
        LENGTH(TRIM(name)) > 0
    )
);
```

**Columns:**
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| folder_id | UUID | No | Primary key (auto-generated) |
| account_id | UUID | No | Owner account reference |
| name | VARCHAR(255) | No | Folder name |
| description | TEXT | Yes | Folder description |
| created_at | TIMESTAMPTZ | No | Creation timestamp |
| updated_at | TIMESTAMPTZ | No | Last update timestamp |

---

### 4. agent_llamacloud_knowledge_bases (Legacy)

**Description:** Legacy table for agent-specific LlamaCloud KBs. Maintained for backward compatibility.

**Schema:**
```sql
CREATE TABLE agent_llamacloud_knowledge_bases (
    kb_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    index_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT agent_llamacloud_kb_name_not_empty 
        CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT agent_llamacloud_kb_index_not_empty 
        CHECK (LENGTH(TRIM(index_name)) > 0)
);
```

**Note:** This table is maintained for backward compatibility but new implementations should use the global knowledge base system with assignments.

---

## Database Functions

### 1. get_account_llamacloud_kbs

**Description:** Retrieves all LlamaCloud knowledge bases for an account.

**Signature:**
```sql
FUNCTION get_account_llamacloud_kbs(
    p_account_id UUID,
    p_include_inactive BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    kb_id UUID,
    name VARCHAR(255),
    index_name VARCHAR(255),
    description TEXT,
    summary TEXT,
    usage_context VARCHAR(100),
    folder_id UUID,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
```

**Example Usage:**
```sql
-- Get all active KBs for account
SELECT * FROM get_account_llamacloud_kbs(
    'account-uuid',
    FALSE
);

-- Get all KBs including inactive
SELECT * FROM get_account_llamacloud_kbs(
    'account-uuid',
    TRUE
);
```

---

### 2. get_agent_assigned_llamacloud_kbs

**Description:** Retrieves LlamaCloud knowledge bases assigned to a specific agent.

**Signature:**
```sql
FUNCTION get_agent_assigned_llamacloud_kbs(
    p_agent_id UUID,
    p_include_inactive BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    kb_id UUID,
    name VARCHAR(255),
    index_name VARCHAR(255),
    description TEXT,
    summary TEXT,
    usage_context VARCHAR(100),
    is_active BOOLEAN,
    enabled BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    assigned_at TIMESTAMPTZ
)
```

**Example Usage:**
```sql
-- Get active assigned KBs for agent
SELECT * FROM get_agent_assigned_llamacloud_kbs(
    'agent-uuid',
    FALSE
);

-- Get all assigned KBs including disabled
SELECT * FROM get_agent_assigned_llamacloud_kbs(
    'agent-uuid',
    TRUE
);
```

---

### 3. get_agent_llamacloud_knowledge_bases (Legacy)

**Description:** Retrieves agent-specific LlamaCloud KBs from the legacy table.

**Signature:**
```sql
FUNCTION get_agent_llamacloud_knowledge_bases(
    p_agent_id UUID,
    p_include_inactive BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    kb_id UUID,
    name VARCHAR(255),
    index_name VARCHAR(255),
    description TEXT,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
```

---

### 4. get_unified_folder_entries

**Description:** Retrieves all entries (files + cloud KBs) in a specific folder.

**Signature:**
```sql
FUNCTION get_unified_folder_entries(
    p_folder_id UUID,
    p_account_id UUID,
    p_include_inactive BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    entry_id UUID,
    entry_type VARCHAR(20),
    name VARCHAR(255),
    summary TEXT,
    description TEXT,
    usage_context VARCHAR(100),
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    filename VARCHAR(255),
    file_size BIGINT,
    mime_type VARCHAR(255),
    index_name VARCHAR(255)
)
```

**Example Usage:**
```sql
-- Get all active entries in a folder
SELECT * FROM get_unified_folder_entries(
    'folder-uuid',
    'account-uuid',
    FALSE
);
```

---

### 5. get_unified_root_entries

**Description:** Retrieves all LlamaCloud KB entries at root level (not in any folder).

**Signature:**
```sql
FUNCTION get_unified_root_entries(
    p_account_id UUID,
    p_include_inactive BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    entry_id UUID,
    entry_type VARCHAR(20),
    name VARCHAR(255),
    summary TEXT,
    description TEXT,
    usage_context VARCHAR(100),
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    filename VARCHAR(255),
    file_size BIGINT,
    mime_type VARCHAR(255),
    index_name VARCHAR(255)
)
```

---

### 6. get_folder_entry_count

**Description:** Returns total count of entries (files + cloud KBs) in a folder.

**Signature:**
```sql
FUNCTION get_folder_entry_count(
    p_folder_id UUID,
    p_account_id UUID
)
RETURNS INTEGER
```

**Example Usage:**
```sql
SELECT get_folder_entry_count('folder-uuid', 'account-uuid');
-- Returns: 15
```

---

### 7. get_agent_knowledge_base (Unified View)

**Description:** Retrieves all knowledge base entries assigned to an agent (both file-based and LlamaCloud KBs).

**Signature:**
```sql
FUNCTION get_agent_knowledge_base(
    p_agent_id UUID,
    p_include_inactive BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    entry_id UUID,
    entry_type VARCHAR(20),
    name VARCHAR(255),
    summary TEXT,
    description TEXT,
    filename VARCHAR(255),
    file_size BIGINT,
    mime_type VARCHAR(255),
    index_name VARCHAR(255),
    folder_id UUID,
    folder_name VARCHAR(255),
    usage_context VARCHAR(100),
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
```

**Example Usage:**
```sql
-- Get all knowledge bases for an agent
SELECT * FROM get_agent_knowledge_base('agent-uuid', FALSE);
```

---

## Migrations

### Migration Timeline

1. `20250916000000_new_knowledge_base.sql` - Creates file-based KB tables and folder structure
2. `20260211075001_remote_schema.sql` - Creates LlamaCloud KB tables, assignments, and functions

### Key Migration: LlamaCloud System

**File:** `20260211075001_remote_schema.sql`

**Key Operations:**

1. **Create Global KB Table**
   - Primary table for account-level LlamaCloud KBs
   - Includes folder support for organization
   - Usage context for controlling when KBs are used

2. **Create Assignment Table**
   - Many-to-many relationships between agents and KBs
   - Enabled flag for toggling without deleting
   - Unique constraint prevents duplicate assignments

3. **Create Legacy Table**
   - Maintains agent-specific KBs for backward compatibility
   - Will be deprecated in future versions

4. **Create Database Functions**
   - All query functions for KBs and assignments
   - Unified views combining file and cloud KBs
   - Folder management functions

5. **Enable RLS**
   - Row-level security for all tables
   - Account-based access control using Basejump

6. **Create Indexes**
   - Performance indexes on all foreign keys
   - Filtering indexes on active status
   - Usage context indexes for query optimization

---

## Row Level Security (RLS)

### Purpose
RLS provides multi-tenant data isolation at the database level, ensuring users can only access data belonging to their account.

### Implementation Pattern

All LlamaCloud tables use the same RLS pattern:

```sql
-- Enable RLS on table
ALTER TABLE llamacloud_knowledge_bases ENABLE ROW LEVEL SECURITY;

-- Create policy using Basejump helper
CREATE POLICY llamacloud_kb_account_access ON llamacloud_knowledge_bases
    FOR ALL USING (basejump.has_role_on_account(account_id) = true);
```

### RLS Policies

#### 1. llamacloud_knowledge_bases
```sql
CREATE POLICY llamacloud_kb_account_access ON llamacloud_knowledge_bases
    FOR ALL 
    USING (basejump.has_role_on_account(account_id) = true);
```
**Effect:** Users can only see/modify KBs belonging to their account

#### 2. agent_llamacloud_kb_assignments
```sql
CREATE POLICY llamacloud_kb_assignments_account_access 
    ON agent_llamacloud_kb_assignments
    FOR ALL 
    USING (basejump.has_role_on_account(account_id) = true);
```
**Effect:** Users can only see/modify assignments for their account's agents

#### 3. agent_llamacloud_knowledge_bases (Legacy)
```sql
CREATE POLICY agent_llamacloud_kb_account_access 
    ON agent_llamacloud_knowledge_bases
    FOR ALL 
    USING (basejump.has_role_on_account(account_id) = true);
```
**Effect:** Users can only see/modify their account's legacy KBs

---

## Indexes

### Performance Indexes

```sql
-- Primary lookups
CREATE INDEX idx_llamacloud_kb_account_id 
    ON llamacloud_knowledge_bases(account_id);
CREATE INDEX idx_llamacloud_kb_folder_id 
    ON llamacloud_knowledge_bases(folder_id);

-- Filtering
CREATE INDEX idx_llamacloud_kb_is_active 
    ON llamacloud_knowledge_bases(is_active);
CREATE INDEX idx_llamacloud_kb_usage_context 
    ON llamacloud_knowledge_bases(usage_context);
    
-- Sorting
CREATE INDEX idx_llamacloud_kb_created_at 
    ON llamacloud_knowledge_bases(created_at);

-- Assignment lookups
CREATE INDEX idx_agent_llamacloud_assignments_agent_id 
    ON agent_llamacloud_kb_assignments(agent_id);
CREATE INDEX idx_agent_llamacloud_assignments_kb_id 
    ON agent_llamacloud_kb_assignments(kb_id);
CREATE INDEX idx_agent_llamacloud_assignments_account_id 
    ON agent_llamacloud_kb_assignments(account_id);
CREATE INDEX idx_agent_llamacloud_assignments_enabled 
    ON agent_llamacloud_kb_assignments(enabled);

-- Legacy table
CREATE INDEX idx_agent_llamacloud_kb_agent_id 
    ON agent_llamacloud_knowledge_bases(agent_id);
```

### Index Usage Patterns

```sql
-- Fast lookup by account (uses idx_llamacloud_kb_account_id)
EXPLAIN ANALYZE
SELECT * FROM llamacloud_knowledge_bases 
WHERE account_id = 'uuid';

-- Fast lookup by folder (uses idx_llamacloud_kb_folder_id)
EXPLAIN ANALYZE
SELECT * FROM llamacloud_knowledge_bases 
WHERE folder_id = 'uuid';

-- Fast filtering by active status (uses idx_llamacloud_kb_is_active)
EXPLAIN ANALYZE
SELECT * FROM llamacloud_knowledge_bases 
WHERE is_active = TRUE;
```

---

## Relationships

### Foreign Key Constraints

```sql
-- llamacloud_knowledge_bases
FOREIGN KEY (account_id) REFERENCES basejump.accounts(id) ON DELETE CASCADE
FOREIGN KEY (folder_id) REFERENCES knowledge_base_folders(folder_id) ON DELETE SET NULL

-- agent_llamacloud_kb_assignments
FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE
FOREIGN KEY (kb_id) REFERENCES llamacloud_knowledge_bases(kb_id) ON DELETE CASCADE
FOREIGN KEY (account_id) REFERENCES basejump.accounts(id) ON DELETE CASCADE

-- agent_llamacloud_knowledge_bases (Legacy)
FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE
FOREIGN KEY (account_id) REFERENCES basejump.accounts(id) ON DELETE CASCADE
```

### Cascade Behaviors

**ON DELETE CASCADE:**
- Deleting an account → Deletes all its KBs and assignments
- Deleting an agent → Deletes all its KB assignments
- Deleting a KB → Deletes all its assignments

**ON DELETE SET NULL:**
- Deleting a folder → Sets folder_id to NULL in KBs (moves to root)

### Referential Integrity

```sql
-- Cannot create KB without valid account
INSERT INTO llamacloud_knowledge_bases (account_id, name, index_name)
VALUES ('invalid-uuid', 'test', 'test-index');
-- Error: violates foreign key constraint

-- Cannot assign non-existent KB to agent
INSERT INTO agent_llamacloud_kb_assignments (agent_id, kb_id, account_id)
VALUES ('agent-uuid', 'invalid-kb-uuid', 'account-uuid');
-- Error: violates foreign key constraint

-- Cannot create duplicate assignments
INSERT INTO agent_llamacloud_kb_assignments (agent_id, kb_id, account_id)
VALUES ('agent-uuid', 'kb-uuid', 'account-uuid');
-- If already exists: Error: violates unique constraint
```

---

## Query Examples

### Common Queries

#### 1. Get All KBs for an Account

```sql
SELECT 
    kb_id,
    name,
    index_name,
    description,
    folder_id,
    is_active,
    created_at
FROM llamacloud_knowledge_bases
WHERE account_id = 'account-uuid'
AND is_active = TRUE
ORDER BY created_at DESC;
```

#### 2. Get Agent's Assigned KBs with Details

```sql
SELECT 
    lkb.kb_id,
    lkb.name,
    lkb.index_name,
    lkb.description,
    ala.enabled,
    ala.assigned_at,
    CASE WHEN lkb.folder_id IS NULL THEN 'Root' ELSE kbf.name END as folder_name
FROM agent_llamacloud_kb_assignments ala
JOIN llamacloud_knowledge_bases lkb ON ala.kb_id = lkb.kb_id
LEFT JOIN knowledge_base_folders kbf ON lkb.folder_id = kbf.folder_id
WHERE ala.agent_id = 'agent-uuid'
AND ala.enabled = TRUE
AND lkb.is_active = TRUE
ORDER BY ala.assigned_at DESC;
```

#### 3. Get Folder Structure with Entry Counts

```sql
SELECT 
    kbf.folder_id,
    kbf.name,
    kbf.description,
    get_folder_entry_count(kbf.folder_id, kbf.account_id) as entry_count,
    kbf.created_at
FROM knowledge_base_folders kbf
WHERE kbf.account_id = 'account-uuid'
ORDER BY kbf.name;
```

#### 4. Find KBs by Index Name

```sql
SELECT 
    kb_id,
    name,
    index_name,
    account_id,
    created_at
FROM llamacloud_knowledge_bases
WHERE index_name = 'my-docs-index'
AND is_active = TRUE;
```

#### 5. Get Unassigned KBs for an Agent

```sql
SELECT 
    lkb.kb_id,
    lkb.name,
    lkb.index_name,
    lkb.description
FROM llamacloud_knowledge_bases lkb
WHERE lkb.account_id = 'account-uuid'
AND lkb.is_active = TRUE
AND NOT EXISTS (
    SELECT 1 
    FROM agent_llamacloud_kb_assignments ala
    WHERE ala.kb_id = lkb.kb_id
    AND ala.agent_id = 'agent-uuid'
);
```

#### 6. Count KBs by Folder

```sql
SELECT 
    COALESCE(kbf.name, 'Root') as folder_name,
    COUNT(*) as kb_count
FROM llamacloud_knowledge_bases lkb
LEFT JOIN knowledge_base_folders kbf ON lkb.folder_id = kbf.folder_id
WHERE lkb.account_id = 'account-uuid'
AND lkb.is_active = TRUE
GROUP BY kbf.name
ORDER BY kb_count DESC;
```

#### 7. Get Recently Created KBs

```sql
SELECT 
    kb_id,
    name,
    index_name,
    description,
    created_at,
    AGE(NOW(), created_at) as age
FROM llamacloud_knowledge_bases
WHERE account_id = 'account-uuid'
AND is_active = TRUE
ORDER BY created_at DESC
LIMIT 10;
```

#### 8. Find Agents Using a Specific KB

```sql
SELECT 
    a.agent_id,
    a.name as agent_name,
    ala.enabled,
    ala.assigned_at
FROM agent_llamacloud_kb_assignments ala
JOIN agents a ON ala.agent_id = a.agent_id
WHERE ala.kb_id = 'kb-uuid'
ORDER BY ala.assigned_at DESC;
```

#### 9. Get Unified Knowledge Base View for Agent

```sql
-- Use the unified function
SELECT * FROM get_agent_knowledge_base('agent-uuid', FALSE);

-- Or query directly
SELECT 
    entry_type,
    name,
    COALESCE(summary, description) as description,
    usage_context,
    folder_name
FROM get_agent_knowledge_base('agent-uuid', FALSE)
WHERE is_active = TRUE
ORDER BY created_at DESC;
```

#### 10. Search KBs by Name or Description

```sql
SELECT 
    kb_id,
    name,
    index_name,
    description,
    summary
FROM llamacloud_knowledge_bases
WHERE account_id = 'account-uuid'
AND is_active = TRUE
AND (
    name ILIKE '%search-term%' 
    OR description ILIKE '%search-term%'
    OR summary ILIKE '%search-term%'
)
ORDER BY created_at DESC;
```

---

## Best Practices

### 1. Query Optimization

**DO:**
```sql
-- Use indexes effectively
SELECT * FROM llamacloud_knowledge_bases 
WHERE account_id = 'uuid' AND is_active = TRUE;

-- Use EXPLAIN ANALYZE to verify performance
EXPLAIN ANALYZE
SELECT * FROM llamacloud_knowledge_bases 
WHERE account_id = 'uuid';

-- Use prepared functions for common queries
SELECT * FROM get_account_llamacloud_kbs('account-uuid', FALSE);
```

**DON'T:**
```sql
-- Avoid full table scans
SELECT * FROM llamacloud_knowledge_bases 
WHERE LOWER(name) LIKE '%docs%';

-- Avoid OR conditions that prevent index usage
SELECT * FROM llamacloud_knowledge_bases 
WHERE account_id = 'uuid1' OR account_id = 'uuid2';
```

### 2. Transaction Management

```sql
-- Use transactions for related operations
BEGIN;

-- Create KB
INSERT INTO llamacloud_knowledge_bases (account_id, name, index_name)
VALUES ('account-uuid', 'docs', 'docs-index')
RETURNING kb_id;

-- Assign to agent
INSERT INTO agent_llamacloud_kb_assignments (agent_id, kb_id, account_id)
VALUES ('agent-uuid', 'returned-kb-id', 'account-uuid');

COMMIT;
```

### 3. Error Handling

```sql
-- Handle constraint violations gracefully
DO $$
BEGIN
    INSERT INTO llamacloud_knowledge_bases (account_id, name, index_name)
    VALUES ('account-uuid', 'docs', 'docs-index');
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE 'KB with this index already exists';
    WHEN foreign_key_violation THEN
        RAISE NOTICE 'Invalid account_id';
END $$;
```

### 4. Cleanup Operations

```sql
-- Soft delete (preferred)
UPDATE llamacloud_knowledge_bases 
SET is_active = FALSE, updated_at = NOW()
WHERE kb_id = 'uuid';

-- Hard delete (use with caution)
DELETE FROM llamacloud_knowledge_bases 
WHERE kb_id = 'uuid';
-- This will CASCADE delete all assignments
```

### 5. Assignment Management

```sql
-- Create assignment (use ON CONFLICT for idempotency)
INSERT INTO agent_llamacloud_kb_assignments (agent_id, kb_id, account_id)
VALUES ('agent-uuid', 'kb-uuid', 'account-uuid')
ON CONFLICT (agent_id, kb_id) DO UPDATE
SET enabled = TRUE, assigned_at = NOW();

-- Disable assignment (soft delete)
UPDATE agent_llamacloud_kb_assignments
SET enabled = FALSE
WHERE agent_id = 'agent-uuid' AND kb_id = 'kb-uuid';

-- Re-enable assignment
UPDATE agent_llamacloud_kb_assignments
SET enabled = TRUE, assigned_at = NOW()
WHERE agent_id = 'agent-uuid' AND kb_id = 'kb-uuid';
```

### 6. Folder Management

```sql
-- Move KB to folder
UPDATE llamacloud_knowledge_bases
SET folder_id = 'folder-uuid', updated_at = NOW()
WHERE kb_id = 'kb-uuid';

-- Move KB to root
UPDATE llamacloud_knowledge_bases
SET folder_id = NULL, updated_at = NOW()
WHERE kb_id = 'kb-uuid';

-- Delete folder (KBs move to root)
DELETE FROM knowledge_base_folders
WHERE folder_id = 'folder-uuid';
-- folder_id in llamacloud_knowledge_bases will be set to NULL
```

---

## Maintenance

### Regular Tasks

#### 1. Monitor Index Usage

```sql
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND tablename LIKE '%llamacloud%'
ORDER BY idx_scan DESC;
```

#### 2. Check Table Sizes

```sql
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - 
                   pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
AND tablename LIKE '%llamacloud%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

#### 3. Vacuum and Analyze

```sql
-- Vacuum to reclaim space
VACUUM llamacloud_knowledge_bases;
VACUUM agent_llamacloud_kb_assignments;

-- Analyze to update statistics
ANALYZE llamacloud_knowledge_bases;
ANALYZE agent_llamacloud_kb_assignments;

-- Full vacuum (requires exclusive lock)
VACUUM FULL llamacloud_knowledge_bases;
```

#### 4. Clean Up Orphaned Data

```sql
-- Find KBs without assignments
SELECT 
    lkb.kb_id,
    lkb.name,
    lkb.index_name,
    lkb.created_at
FROM llamacloud_knowledge_bases lkb
WHERE NOT EXISTS (
    SELECT 1 
    FROM agent_llamacloud_kb_assignments ala
    WHERE ala.kb_id = lkb.kb_id
)
AND lkb.is_active = TRUE
AND AGE(NOW(), lkb.created_at) > INTERVAL '30 days';
```

---

## Troubleshooting

### Common Issues

#### 1. Constraint Violations

**Problem:** `ERROR: duplicate key value violates unique constraint`

**Solution:**
```sql
-- Check for existing record
SELECT * FROM llamacloud_knowledge_bases 
WHERE account_id = 'uuid' AND index_name = 'my-index';

-- Update existing instead of insert
UPDATE llamacloud_knowledge_bases 
SET description = 'Updated description', updated_at = NOW()
WHERE account_id = 'uuid' AND index_name = 'my-index';

-- Or use upsert
INSERT INTO llamacloud_knowledge_bases (account_id, name, index_name, description)
VALUES ('uuid', 'My KB', 'my-index', 'Description')
ON CONFLICT (account_id, index_name) DO UPDATE
SET description = EXCLUDED.description, updated_at = NOW();
```

#### 2. RLS Policy Blocks Access

**Problem:** Query returns no results despite data existing

**Solution:**
```sql
-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'llamacloud_knowledge_bases';

-- Check user's account access (run as that user)
SELECT basejump.has_role_on_account('account-uuid');

-- Verify correct account_id is set
SELECT * FROM llamacloud_knowledge_bases 
WHERE kb_id = 'kb-uuid';
```

#### 3. Slow Queries

**Problem:** Queries taking too long

**Solution:**
```sql
-- Analyze query plan
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM llamacloud_knowledge_bases WHERE account_id = 'uuid';

-- Check for missing indexes
SELECT * FROM pg_stat_user_indexes 
WHERE idx_scan = 0 AND tablename LIKE '%llamacloud%';

-- Rebuild statistics
ANALYZE llamacloud_knowledge_bases;

-- Consider adding composite indexes for common query patterns
CREATE INDEX idx_llamacloud_kb_account_active 
    ON llamacloud_knowledge_bases(account_id, is_active);
```

#### 4. Assignment Issues

**Problem:** Cannot delete assignment

**Solution:**
```sql
-- Check for foreign key dependencies
SELECT 
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    confrelid::regclass AS referenced_table
FROM pg_constraint
WHERE confrelid = 'agent_llamacloud_kb_assignments'::regclass;

-- Verify assignment exists
SELECT * FROM agent_llamacloud_kb_assignments
WHERE agent_id = 'agent-uuid' AND kb_id = 'kb-uuid';

-- Use soft delete instead
UPDATE agent_llamacloud_kb_assignments
SET enabled = FALSE
WHERE agent_id = 'agent-uuid' AND kb_id = 'kb-uuid';
```

---

## Migration Guide

### Migrating from Agent-Specific to Global KBs

If you have data in the legacy `agent_llamacloud_knowledge_bases` table:

```sql
-- 1. Identify unique KBs across all agents
SELECT DISTINCT ON (account_id, index_name)
    account_id, name, index_name, description, created_at
FROM agent_llamacloud_knowledge_bases
ORDER BY account_id, index_name, created_at;

-- 2. Create global KBs (if not already migrated)
INSERT INTO llamacloud_knowledge_bases (
    account_id, name, index_name, description, created_at
)
SELECT DISTINCT ON (account_id, index_name)
    account_id, name, index_name, description, created_at
FROM agent_llamacloud_knowledge_bases
ON CONFLICT (account_id, index_name) DO NOTHING;

-- 3. Create assignments for each agent
INSERT INTO agent_llamacloud_kb_assignments (
    agent_id, kb_id, account_id, enabled, assigned_at
)
SELECT 
    alkb.agent_id,
    gkb.kb_id,
    alkb.account_id,
    alkb.is_active,
    alkb.created_at
FROM agent_llamacloud_knowledge_bases alkb
JOIN llamacloud_knowledge_bases gkb ON (
    gkb.account_id = alkb.account_id 
    AND gkb.index_name = alkb.index_name
)
ON CONFLICT (agent_id, kb_id) DO NOTHING;

-- 4. Verify migration
SELECT 
    COUNT(*) as legacy_count,
    (SELECT COUNT(*) FROM llamacloud_knowledge_bases) as global_count,
    (SELECT COUNT(*) FROM agent_llamacloud_kb_assignments) as assignment_count
FROM agent_llamacloud_knowledge_bases;
```

---

## API Integration Examples

### TypeScript/JavaScript (Supabase Client)

```typescript
// Get all KBs for account
const { data: kbs, error } = await supabase
  .rpc('get_account_llamacloud_kbs', {
    p_account_id: accountId,
    p_include_inactive: false
  });

// Get agent's assigned KBs
const { data: agentKbs, error } = await supabase
  .rpc('get_agent_assigned_llamacloud_kbs', {
    p_agent_id: agentId,
    p_include_inactive: false
  });

// Create new KB
const { data: newKb, error } = await supabase
  .from('llamacloud_knowledge_bases')
  .insert({
    account_id: accountId,
    name: 'my-kb',
    index_name: 'my-index',
    description: 'Description',
    usage_context: 'always'
  })
  .select()
  .single();

// Assign KB to agent
const { data: assignment, error } = await supabase
  .from('agent_llamacloud_kb_assignments')
  .insert({
    agent_id: agentId,
    kb_id: kbId,
    account_id: accountId
  })
  .select()
  .single();

// Update KB
const { data: updated, error } = await supabase
  .from('llamacloud_knowledge_bases')
  .update({
    description: 'Updated description',
    updated_at: new Date().toISOString()
  })
  .eq('kb_id', kbId)
  .select()
  .single();

// Soft delete KB
const { data, error } = await supabase
  .from('llamacloud_knowledge_bases')
  .update({
    is_active: false,
    updated_at: new Date().toISOString()
  })
  .eq('kb_id', kbId);
```

---

## Resources

### Documentation
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Supabase Database Docs](https://supabase.com/docs/guides/database)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Basejump Documentation](https://usebasejump.com/docs)

### Tools
- [Supabase Studio](https://supabase.com/docs/guides/platform/studio)
- [pgAdmin](https://www.pgadmin.org/)
- psql: Command-line interface

### Related Files in Project
- Migrations: `backend/supabase/migrations/`
- Configuration: `backend/supabase/config.toml`
- Frontend KB hooks: `frontend/src/hooks/react-query/llamacloud-knowledge-base/`
- Backend config: `backend/core/utils/config.py`

---

**Last Updated:** February 12, 2026  
**Version:** 1.0  
**Maintainer:** Database Team
