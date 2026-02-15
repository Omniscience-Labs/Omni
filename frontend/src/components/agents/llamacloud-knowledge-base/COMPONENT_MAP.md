# LlamaCloud Knowledge Base - Component Map

## Visual Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Agent Configuration Page                         │
│                    /agents/config/[agentId]                         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │   Knowledge Screen        │
                    │   (Knowledge Tab)         │
                    └─────────────┬─────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   LlamaCloud     │    │   Separator      │    │  File-based KB   │
│   KB Manager     │    │                  │    │   Manager        │
│   (NEW)          │    │                  │    │   (Existing)     │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

## Component Hierarchy

```
LlamaCloudKnowledgeBaseManager
├── Header Section
│   ├── Title + Icon
│   ├── Description
│   └── Add Button
│
├── Search Bar (conditional: if KBs exist)
│   └── Input with icon
│
├── Knowledge Base List
│   ├── Empty State (if no KBs)
│   │   ├── Icon
│   │   ├── Message
│   │   └── CTA Button
│   │
│   └── KB Cards (forEach KB)
│       ├── Card Header
│       │   ├── Name + Badge (active/inactive)
│       │   ├── Index Name
│       │   └── Action Buttons (Edit, Delete)
│       │
│       └── Card Content
│           ├── Description
│           ├── Function Name Preview
│           ├── Created Date
│           └── Test Search Button
│
├── Test Search Panel (Collapsible)
│   ├── Header
│   ├── Query Input
│   ├── Action Buttons
│   └── Results Display
│       └── Result Cards (forEach result)
│           ├── Rank + Score
│           ├── Text Preview
│           └── Metadata (expandable)
│
├── Add KB Dialog
│   ├── Dialog Header
│   ├── Form Fields
│   │   ├── Name Input (with preview)
│   │   ├── Index Key Input
│   │   └── Description Textarea
│   │
│   └── Dialog Footer
│       ├── Cancel Button
│       └── Create Button
│
├── Edit KB Dialog
│   ├── Dialog Header
│   ├── Edit Form
│   │   ├── Name Input (with preview)
│   │   ├── Index Key Input
│   │   ├── Description Textarea
│   │   └── Active Checkbox
│   │
│   └── Action Buttons
│       ├── Cancel Button
│       └── Save Button
│
└── Delete Confirmation Dialog
    ├── Warning Message
    └── Action Buttons
        ├── Cancel Button
        └── Delete Button (destructive)
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Actions                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    React Component Layer                         │
│              (LlamaCloudKnowledgeBaseManager)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    React Query Hooks                             │
│  - useAgentLlamaCloudKnowledgeBases (query)                    │
│  - useCreateLlamaCloudKnowledgeBase (mutation)                 │
│  - useUpdateLlamaCloudKnowledgeBase (mutation)                 │
│  - useDeleteLlamaCloudKnowledgeBase (mutation)                 │
│  - useTestLlamaCloudSearch (mutation)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Layer                                   │
│  - JWT Authentication (Supabase)                                │
│  - Fetch API                                                     │
│  - Error Handling                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Backend API Endpoints                          │
│  GET    /llamacloud-knowledge-base/agents/:agentId             │
│  POST   /llamacloud-knowledge-base/agents/:agentId             │
│  PUT    /llamacloud-knowledge-base/:kbId                       │
│  DELETE /llamacloud-knowledge-base/:kbId                       │
│  POST   /llamacloud-knowledge-base/agents/:agentId/test-search │
└─────────────────────────────────────────────────────────────────┘
```

## State Management Flow

```
┌──────────────────┐
│  User Interaction │
└──────────────────┘
        │
        ▼
┌──────────────────┐
│  Component State │ (Local React state)
│  - formData      │
│  - dialogs open  │
│  - search query  │
└──────────────────┘
        │
        ▼
┌──────────────────┐
│  React Query     │ (Server state)
│  - queries       │
│  - mutations     │
│  - cache         │
└──────────────────┘
        │
        ├─── onSuccess ───> Cache Invalidation
        │                       │
        │                       ▼
        │                   Re-fetch Data
        │
        ├─── onError ─────> Toast Notification
        │
        └─── Loading ────> UI Feedback
```

## Component Communication

```
┌─────────────────────────────────────────────────────────────────┐
│                         Props Down                               │
│                                                                   │
│  AgentConfigPage                                                 │
│       │                                                           │
│       ├── agentId ──────────────> KnowledgeScreen               │
│       │                                  │                        │
│       │                                  ├── agentId ────────>   │
│       │                                  │  LlamaCloudKBManager  │
│       │                                  │                        │
│       │                                  └── agentName ──────>   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Events Up (via Hooks)                       │
│                                                                   │
│  LlamaCloudKBManager                                             │
│       │                                                           │
│       ├── createMutation ──────> React Query                    │
│       ├── updateMutation ──────> React Query                    │
│       ├── deleteMutation ──────> React Query                    │
│       └── testSearchMutation ──> React Query                    │
│                                       │                           │
│                                       ├──> Cache Update          │
│                                       ├──> Toast Notification    │
│                                       └──> UI Re-render          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## File Dependencies

```
llamacloud-kb-manager.tsx
├── React (useState, useMemo)
├── Lucide Icons (Plus, Search, Pencil, etc.)
├── UI Components
│   ├── Button
│   ├── Input
│   ├── Label
│   ├── Textarea
│   ├── Card
│   ├── Dialog
│   ├── AlertDialog
│   ├── Badge
│   ├── Skeleton
│   ├── Checkbox
│   └── Collapsible
│
└── React Query Hooks
    ├── useAgentLlamaCloudKnowledgeBases
    ├── useCreateLlamaCloudKnowledgeBase
    ├── useUpdateLlamaCloudKnowledgeBase
    ├── useDeleteLlamaCloudKnowledgeBase
    └── useTestLlamaCloudSearch
```

## Hook Dependencies

```
use-llamacloud-knowledge-base-queries.ts
├── @tanstack/react-query
│   ├── useQuery
│   ├── useMutation
│   └── useQueryClient
│
├── sonner (toast)
├── Supabase Client (auth)
├── Types (from types.ts)
└── Query Keys (from keys.ts)
```

## Type System

```
types.ts
├── LlamaCloudKnowledgeBase (entity)
│   ├── id: string
│   ├── name: string
│   ├── index_name: string
│   ├── description?: string
│   ├── is_active: boolean
│   ├── created_at: string
│   └── updated_at: string
│
├── LlamaCloudKnowledgeBaseListResponse
│   ├── knowledge_bases: LlamaCloudKnowledgeBase[]
│   └── total_count: number
│
├── CreateLlamaCloudKnowledgeBaseRequest
│   ├── name: string
│   ├── index_name: string
│   └── description?: string
│
├── UpdateLlamaCloudKnowledgeBaseRequest
│   ├── name?: string
│   ├── index_name?: string
│   ├── description?: string
│   └── is_active?: boolean
│
├── TestSearchRequest
│   ├── index_name: string
│   └── query: string
│
└── TestSearchResponse
    ├── success: boolean
    ├── message: string
    ├── results: SearchResult[]
    ├── index_name: string
    └── query: string
```

## User Interaction Flow

```
1. User navigates to Agent Config
        ↓
2. Clicks "Knowledge" tab
        ↓
3. Sees LlamaCloud KB Manager
        ↓
4. OPTIONS:
   ├─→ View existing KBs
   │   ├─→ Search/Filter
   │   ├─→ Edit KB
   │   ├─→ Delete KB
   │   └─→ Test Search
   │
   └─→ Add New KB
       ├─→ Fill form (name, index, description)
       ├─→ See function name preview
       ├─→ Submit
       └─→ Success → KB appears in list
```

## Error Flow

```
Error Occurs
    ↓
React Query catches error
    ↓
┌─────────────────┐
│ onError handler │
└─────────────────┘
    ↓
Toast notification shows
    ↓
User sees friendly error message
    ↓
UI returns to stable state
```

## Success Flow

```
Action Triggered
    ↓
Loading state shown
    ↓
API call succeeds
    ↓
┌──────────────────┐
│ onSuccess handler│
└──────────────────┘
    ↓
Cache invalidation
    ↓
Data re-fetches
    ↓
Toast notification
    ↓
UI updates with new data
```

## Component Lifecycle

```
Mount
  ↓
Fetch KBs (useQuery)
  ↓
Display loading skeleton
  ↓
Data received
  ↓
Render KB cards
  ↓
User interactions
  ├─→ Create → Mutation → Cache invalidation
  ├─→ Update → Mutation → Cache invalidation
  ├─→ Delete → Mutation → Cache invalidation
  └─→ Search → Mutation → Display results
  ↓
Unmount (cleanup)
```

## Styling Architecture

```
Component
  ↓
shadcn/ui Components
  ↓
Radix UI Primitives
  ↓
Tailwind CSS Classes
  ↓
Custom Theme Variables
  ↓
CSS Output
```

## Performance Optimization Points

```
1. useMemo for filtered lists
2. React Query caching
3. Debounced search (ready)
4. Skeleton loading
5. Lazy dialog rendering
6. Efficient re-renders
7. Query stale time (5 min)
```

## Integration Points

```
┌──────────────────────────────────────────────┐
│          Frontend Application                 │
│                                               │
│  ┌─────────────────────────────────────┐    │
│  │  Agent Configuration Page            │    │
│  │  ┌──────────────────────────────┐   │    │
│  │  │  Knowledge Screen            │   │    │
│  │  │  ┌──────────────────────┐   │   │    │
│  │  │  │ LlamaCloud KB Mgr   │ ←─┼───┼────┤
│  │  │  └──────────────────────┘   │   │    │
│  │  └──────────────────────────────┘   │    │
│  └─────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌──────────────┐            ┌──────────────┐
│ Supabase     │            │ Backend API  │
│ Auth         │            │ Endpoints    │
└──────────────┘            └──────────────┘
                                   │
                                   ▼
                            ┌──────────────┐
                            │ LlamaCloud   │
                            │ Service      │
                            └──────────────┘
```

## Testing Strategy

```
Unit Tests
  ├── Component rendering
  ├── Hook functionality
  ├── Helper functions
  └── Type validation

Integration Tests
  ├── User flows (create, edit, delete)
  ├── Search functionality
  ├── Form validation
  └── Cache invalidation

E2E Tests
  ├── Full user journey
  ├── Multi-agent scenarios
  └── Error recovery
```

---

**This visual map helps understand:**
- Component structure
- Data flow
- State management
- User interactions
- Integration points
- Dependencies
- Testing strategy

For more details, see the comprehensive README.md
