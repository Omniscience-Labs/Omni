# LlamaCloud Knowledge Base Integration

## Overview

The LlamaCloud Knowledge Base integration allows agents to connect to existing LlamaCloud indices for enhanced search and retrieval capabilities. This frontend implementation provides a complete UI for managing LlamaCloud knowledge bases for agents.

## Features

- **Knowledge Base Management**: Create, update, delete, and organize LlamaCloud knowledge bases
- **Test Search Interface**: Test search functionality before deploying to agents
- **Real-time Validation**: Automatic name formatting and validation
- **Responsive Design**: Mobile-first design with shadcn/ui components
- **Type-safe**: Full TypeScript support with comprehensive type definitions

## Project Structure

```
frontend/src/
├── hooks/react-query/llamacloud-knowledge-base/
│   ├── types.ts                                    # Type definitions
│   ├── keys.ts                                     # React Query keys
│   ├── use-llamacloud-knowledge-base-queries.ts   # React Query hooks
│   └── index.ts                                    # Barrel export
├── components/agents/llamacloud-knowledge-base/
│   ├── llamacloud-kb-manager.tsx                  # Main manager component
│   └── index.ts                                    # Barrel export
└── app/(dashboard)/agents/config/[agentId]/screens/
    └── knowledge-screen.tsx                        # Integrated in agent config
```

## Installation

All dependencies are already included in the project:
- `@tanstack/react-query` - State management
- `sonner` - Toast notifications
- `shadcn/ui` components - UI components
- `lucide-react` - Icons

## Usage

### 1. Basic Usage

The component is already integrated into the agent configuration page under the "Knowledge" section:

```typescript
import { LlamaCloudKnowledgeBaseManager } from '@/components/agents/llamacloud-knowledge-base';

function MyPage({ agentId }: { agentId: string }) {
  return (
    <LlamaCloudKnowledgeBaseManager 
      agentId={agentId}
      agentName="My Agent"
    />
  );
}
```

### 2. Using React Query Hooks

You can use the hooks directly in your components:

```typescript
import { 
  useAgentLlamaCloudKnowledgeBases,
  useCreateLlamaCloudKnowledgeBase,
  useUpdateLlamaCloudKnowledgeBase,
  useDeleteLlamaCloudKnowledgeBase,
  useTestLlamaCloudSearch 
} from '@/hooks/react-query/llamacloud-knowledge-base';

function MyComponent({ agentId }: { agentId: string }) {
  // Fetch knowledge bases
  const { data, isLoading } = useAgentLlamaCloudKnowledgeBases(agentId);
  
  // Create mutation
  const createMutation = useCreateLlamaCloudKnowledgeBase();
  
  const handleCreate = async () => {
    await createMutation.mutateAsync({
      agentId,
      kbData: {
        name: 'documentation',
        index_name: 'my-docs-index',
        description: 'Product documentation'
      }
    });
  };
  
  return (
    <div>
      {data?.knowledge_bases.map(kb => (
        <div key={kb.id}>{kb.name}</div>
      ))}
    </div>
  );
}
```

## API Endpoints

The frontend expects the following backend API endpoints:

### GET `/llamacloud-knowledge-base/agents/:agentId`
Fetch all knowledge bases for an agent.

**Query Parameters:**
- `include_inactive` (boolean, optional): Include inactive knowledge bases

**Response:**
```json
{
  "knowledge_bases": [
    {
      "id": "uuid",
      "name": "documentation",
      "index_name": "my-docs-index",
      "description": "Product documentation",
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total_count": 1
}
```

### POST `/llamacloud-knowledge-base/agents/:agentId`
Create a new knowledge base.

**Request Body:**
```json
{
  "name": "documentation",
  "index_name": "my-docs-index",
  "description": "Product documentation"
}
```

### PUT `/llamacloud-knowledge-base/:kbId`
Update an existing knowledge base.

**Request Body:**
```json
{
  "name": "updated-name",
  "index_name": "updated-index",
  "description": "Updated description",
  "is_active": false
}
```

### DELETE `/llamacloud-knowledge-base/:kbId`
Delete a knowledge base.

### POST `/llamacloud-knowledge-base/agents/:agentId/test-search`
Test search functionality.

**Request Body:**
```json
{
  "index_name": "my-docs-index",
  "query": "search query"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Search completed successfully",
  "results": [
    {
      "rank": 1,
      "score": 0.95,
      "text": "Result text...",
      "metadata": {}
    }
  ],
  "index_name": "my-docs-index",
  "query": "search query"
}
```

## Type Definitions

### Core Types

```typescript
// Knowledge Base Entity
interface LlamaCloudKnowledgeBase {
  id: string;
  name: string;
  index_name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// List Response
interface LlamaCloudKnowledgeBaseListResponse {
  knowledge_bases: LlamaCloudKnowledgeBase[];
  total_count: number;
}

// Create Request
interface CreateLlamaCloudKnowledgeBaseRequest {
  name: string;
  index_name: string;
  description?: string;
}

// Update Request
interface UpdateLlamaCloudKnowledgeBaseRequest {
  name?: string;
  index_name?: string;
  description?: string;
  is_active?: boolean;
}

// Test Search
interface TestSearchRequest {
  index_name: string;
  query: string;
}

interface TestSearchResponse {
  success: boolean;
  message: string;
  results: SearchResult[];
  index_name: string;
  query: string;
}

interface SearchResult {
  rank: number;
  score: number;
  text: string;
  metadata: Record<string, any>;
}
```

## Component Props

### LlamaCloudKnowledgeBaseManager

```typescript
interface LlamaCloudKnowledgeBaseManagerProps {
  agentId: string;      // Agent UUID
  agentName: string;    // Agent display name
}
```

## Features

### 1. Knowledge Base List
- Visual cards for each knowledge base
- Shows name, index, description, status
- Displays tool function name
- Edit and delete actions

### 2. Add New KB Dialog
- Three-field form (name, index, description)
- Real-time name formatting
- Validation feedback
- Auto-generated function name preview

### 3. Edit KB Dialog
- Inline editing
- Same validation as creation
- Active/inactive toggle
- Preserves data on cancel

### 4. Delete Confirmation
- Alert dialog with warning
- Explains impact (local only, not LlamaCloud)
- Confirmation required

### 5. Test Search Interface
- Collapsible test panel
- Query input
- Real-time results display
- Shows rank, score, text, metadata
- Error handling

### 6. Search and Filter
- Search across name, index, description
- Real-time filtering
- Result count display

## Helper Functions

### formatKnowledgeBaseName

Formats a knowledge base name for tool function generation:

```typescript
const formatKnowledgeBaseName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
};
```

**Example:**
- Input: "My Documentation"
- Output: "my-documentation"
- Function: `search_my_documentation()`

## State Management

### React Query Configuration

The hooks use React Query for state management with the following configuration:

- **Stale Time**: 5 minutes
- **Retry**: 1 attempt
- **Refetch on Window Focus**: Disabled

### Cache Invalidation

```typescript
// After create
queryClient.invalidateQueries({ 
  queryKey: llamacloudKnowledgeBaseKeys.agent(agentId) 
});

// After update/delete
queryClient.invalidateQueries({ 
  queryKey: llamacloudKnowledgeBaseKeys.all 
});
```

## Error Handling

All mutations include automatic error handling:

- **Success**: Toast notification
- **Error**: Toast notification with error message
- **Loading**: UI disabled state with loading indicator

## Authentication

All API requests include JWT authentication via Supabase:

```typescript
const headers = {
  'Authorization': `Bearer ${session.access_token}`,
  'Content-Type': 'application/json',
};
```

## Styling

The component uses shadcn/ui components with Tailwind CSS:

- Consistent with project design system
- Responsive mobile-first design
- Dark mode support
- Accessible components

## Best Practices

1. **Always validate input**: The component validates name and index_name before submission
2. **Use optimistic updates**: Consider implementing optimistic updates for better UX
3. **Handle loading states**: All loading states are properly handled with skeletons and spinners
4. **Error recovery**: All errors show user-friendly messages
5. **Accessibility**: Proper ARIA labels and keyboard navigation

## Troubleshooting

### Query Not Updating After Mutation

Check that cache invalidation is working:

```typescript
queryClient.invalidateQueries({ 
  queryKey: llamacloudKnowledgeBaseKeys.agent(agentId) 
});
```

### Authentication Errors

Ensure Supabase session is valid:

```typescript
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  // Redirect to login
}
```

### Type Errors

Import types correctly:

```typescript
import type { 
  LlamaCloudKnowledgeBase,
  CreateLlamaCloudKnowledgeBaseRequest 
} from '@/hooks/react-query/llamacloud-knowledge-base';
```

## Testing

To test the component:

1. Navigate to agent configuration: `/agents/config/[agentId]`
2. Click on "Knowledge" tab
3. Use "Add Knowledge Base" button to create a new KB
4. Test search functionality with "Test Search" button
5. Edit and delete operations should work seamlessly

## Future Enhancements

Potential improvements for the future:

1. **Bulk Operations**: Multi-select and bulk delete
2. **Advanced Filtering**: Filter by status, sort by date
3. **Search History**: Recent searches and suggestions
4. **Analytics**: Usage statistics and performance metrics
5. **Import/Export**: KB configuration import/export

## Support

For issues or questions:
1. Check the type definitions in `types.ts`
2. Review the React Query hooks in `use-llamacloud-knowledge-base-queries.ts`
3. Check the main component in `llamacloud-kb-manager.tsx`

## License

This component is part of the Omni project and follows the project's license terms.
