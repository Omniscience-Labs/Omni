# LlamaCloud Knowledge Base - Quick Start Guide

## 🚀 Quick Start

### For Developers

The LlamaCloud Knowledge Base integration is fully implemented and ready to use!

### 📍 Where to Find It

**Agent Configuration Page**
1. Navigate to `/agents/config/[agentId]`
2. Click on the "Knowledge" tab
3. The LlamaCloud Knowledge Base Manager is at the top of the page

### 🎯 Key Features

✅ **Create Knowledge Bases** - Connect to LlamaCloud indices  
✅ **Test Search** - Test search functionality before deployment  
✅ **Manage KBs** - Edit, delete, activate/deactivate  
✅ **Real-time Updates** - Automatic cache invalidation  
✅ **Type-safe** - Full TypeScript support  

### 📦 Implementation Files

```
frontend/src/
├── hooks/react-query/llamacloud-knowledge-base/
│   ├── types.ts                    # Type definitions
│   ├── keys.ts                     # Query keys
│   ├── use-llamacloud-knowledge-base-queries.ts
│   └── index.ts
└── components/agents/llamacloud-knowledge-base/
    ├── llamacloud-kb-manager.tsx   # Main component
    ├── index.ts
    └── README.md                   # Full documentation
```

### 🔌 Integration Point

The component is integrated in:
```
frontend/src/app/(dashboard)/agents/config/[agentId]/screens/knowledge-screen.tsx
```

### 💻 Usage Examples

#### 1. Using the Component

```typescript
import { LlamaCloudKnowledgeBaseManager } from '@/components/agents/llamacloud-knowledge-base';

<LlamaCloudKnowledgeBaseManager 
  agentId={agentId}
  agentName="My Agent"
/>
```

#### 2. Using Hooks Directly

```typescript
import { 
  useAgentLlamaCloudKnowledgeBases,
  useCreateLlamaCloudKnowledgeBase 
} from '@/hooks/react-query/llamacloud-knowledge-base';

const { data, isLoading } = useAgentLlamaCloudKnowledgeBases(agentId);
const createMutation = useCreateLlamaCloudKnowledgeBase();
```

### 🔗 Required Backend Endpoints

Your backend needs to implement these endpoints:

```
GET    /llamacloud-knowledge-base/agents/:agentId
POST   /llamacloud-knowledge-base/agents/:agentId
PUT    /llamacloud-knowledge-base/:kbId
DELETE /llamacloud-knowledge-base/:kbId
POST   /llamacloud-knowledge-base/agents/:agentId/test-search
```

See `README.md` for full API specification.

### 🧪 Testing

1. Go to any agent configuration page
2. Click "Knowledge" tab
3. Click "Add Knowledge Base"
4. Fill in:
   - Name: "Documentation"
   - Index Key: "my-docs-index"
   - Description: "Product docs"
5. Click "Create Knowledge Base"
6. Test search functionality with "Test Search" button

### 🎨 Component Features

- ✅ Responsive design (mobile + desktop)
- ✅ Dark mode support
- ✅ Loading states with skeletons
- ✅ Error handling with toasts
- ✅ Search and filter
- ✅ Real-time validation
- ✅ Collapsible test search panel
- ✅ Delete confirmation dialog

### 📚 Documentation

For detailed documentation, see:
- `frontend/src/components/agents/llamacloud-knowledge-base/README.md`

### 🐛 Troubleshooting

**Component not showing?**
- Check that agentId is valid
- Verify Supabase authentication
- Check browser console for errors

**API errors?**
- Verify backend endpoints are implemented
- Check API_URL environment variable
- Verify authentication token

**Types not found?**
- Import from: `@/hooks/react-query/llamacloud-knowledge-base`
- Re-run TypeScript compiler if needed

### 🔄 State Management

Uses React Query with:
- Automatic cache invalidation
- Optimistic updates ready
- 5-minute stale time
- Single retry on failure

### 🎯 Next Steps

1. ✅ Frontend implementation complete
2. ⏳ Implement backend endpoints
3. ⏳ Connect to LlamaCloud API
4. ⏳ Test end-to-end flow

### 📝 Notes

- All UI components use shadcn/ui
- Follows project design patterns
- TypeScript strict mode compatible
- Accessible (ARIA labels, keyboard nav)
- Mobile-first responsive design

### 🤝 Support

Need help? Check:
1. Full README in component folder
2. Type definitions in `types.ts`
3. React Query hooks documentation
4. Component source code

---

**Status**: ✅ Frontend Complete - Ready for Backend Integration
