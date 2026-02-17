/**
 * LlamaCloud Knowledge Base - Usage Examples
 * 
 * This file demonstrates various ways to use the LlamaCloud Knowledge Base
 * component and hooks in your application.
 */

import React from 'react';
import {
  LlamaCloudKnowledgeBaseManager,
} from '@/components/agents/llamacloud-knowledge-base';
import {
  useAgentLlamaCloudKnowledgeBases,
  useCreateLlamaCloudKnowledgeBase,
  useUpdateLlamaCloudKnowledgeBase,
  useDeleteLlamaCloudKnowledgeBase,
  useTestLlamaCloudSearch,
  type LlamaCloudKnowledgeBase,
  type CreateLlamaCloudKnowledgeBaseRequest,
} from '@/hooks/react-query/llamacloud-knowledge-base';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

// ============================================================================
// EXAMPLE 1: Basic Usage - Full Manager Component
// ============================================================================

export function Example1_BasicUsage({ agentId }: { agentId: string }) {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Agent Knowledge Bases</h2>
      <LlamaCloudKnowledgeBaseManager 
        agentId={agentId}
        agentName="My Agent"
      />
    </div>
  );
}

// ============================================================================
// EXAMPLE 2: Using Hooks Directly - Custom List
// ============================================================================

export function Example2_CustomList({ agentId }: { agentId: string }) {
  const { data, isLoading, error } = useAgentLlamaCloudKnowledgeBases(agentId);
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Knowledge Bases</h2>
      {data?.knowledge_bases.map(kb => (
        <Card key={kb.id}>
          <CardHeader>
            <CardTitle>{kb.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{kb.index_name}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// EXAMPLE 3: Create Knowledge Base Form
// ============================================================================

export function Example3_CreateForm({ agentId }: { agentId: string }) {
  const [formData, setFormData] = React.useState<CreateLlamaCloudKnowledgeBaseRequest>({
    name: '',
    index_name: '',
    description: '',
  });
  
  const createMutation = useCreateLlamaCloudKnowledgeBase();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await createMutation.mutateAsync({
        agentId,
        kbData: formData,
      });
      
      // Reset form
      setFormData({ name: '', index_name: '', description: '' });
    } catch (error) {
      console.error('Failed to create KB:', error);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        placeholder="Name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        required
      />
      <input
        placeholder="Index Name"
        value={formData.index_name}
        onChange={(e) => setFormData({ ...formData, index_name: e.target.value })}
        required
      />
      <textarea
        placeholder="Description"
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
      />
      <Button type="submit" disabled={createMutation.isPending}>
        {createMutation.isPending ? 'Creating...' : 'Create KB'}
      </Button>
    </form>
  );
}

// ============================================================================
// EXAMPLE 4: Update Knowledge Base
// ============================================================================

export function Example4_UpdateKB({ kb }: { kb: LlamaCloudKnowledgeBase }) {
  const updateMutation = useUpdateLlamaCloudKnowledgeBase();
  
  const handleToggleActive = async () => {
    await updateMutation.mutateAsync({
      kbId: kb.id,
      kbData: { is_active: !kb.is_active },
    });
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{kb.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm mb-4">Status: {kb.is_active ? 'Active' : 'Inactive'}</p>
        <Button 
          onClick={handleToggleActive}
          disabled={updateMutation.isPending}
        >
          {kb.is_active ? 'Deactivate' : 'Activate'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// EXAMPLE 5: Delete Knowledge Base
// ============================================================================

export function Example5_DeleteKB({ 
  kbId, 
  onDeleted 
}: { 
  kbId: string;
  onDeleted?: () => void;
}) {
  const deleteMutation = useDeleteLlamaCloudKnowledgeBase();
  
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this knowledge base?')) {
      return;
    }
    
    try {
      await deleteMutation.mutateAsync(kbId);
      onDeleted?.();
    } catch (error) {
      console.error('Failed to delete KB:', error);
    }
  };
  
  return (
    <Button 
      variant="destructive"
      onClick={handleDelete}
      disabled={deleteMutation.isPending}
    >
      {deleteMutation.isPending ? 'Deleting...' : 'Delete KB'}
    </Button>
  );
}

// ============================================================================
// EXAMPLE 6: Test Search
// ============================================================================

export function Example6_TestSearch({ agentId }: { agentId: string }) {
  const [query, setQuery] = React.useState('');
  const [indexName, setIndexName] = React.useState('');
  const testSearchMutation = useTestLlamaCloudSearch();
  
  const handleSearch = async () => {
    if (!query || !indexName) return;
    
    const result = await testSearchMutation.mutateAsync({
      agentId,
      searchData: {
        index_name: indexName,
        query,
      },
    });
    
    console.log('Search results:', result.results);
  };
  
  return (
    <div className="space-y-4">
      <input
        placeholder="Index Name"
        value={indexName}
        onChange={(e) => setIndexName(e.target.value)}
      />
      <input
        placeholder="Search Query"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Button 
        onClick={handleSearch}
        disabled={testSearchMutation.isPending}
      >
        {testSearchMutation.isPending ? 'Searching...' : 'Search'}
      </Button>
      
      {testSearchMutation.data && (
        <div className="space-y-2">
          <h3 className="font-bold">Results: {testSearchMutation.data.results.length}</h3>
          {testSearchMutation.data.results.map((result) => (
            <Card key={result.rank}>
              <CardContent className="p-4">
                <p className="text-sm font-medium">Rank: {result.rank}</p>
                <p className="text-sm text-muted-foreground">Score: {result.score}</p>
                <p className="text-sm mt-2">{result.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EXAMPLE 7: Filtering Knowledge Bases
// ============================================================================

export function Example7_FilteredList({ agentId }: { agentId: string }) {
  const [filter, setFilter] = React.useState('');
  const { data } = useAgentLlamaCloudKnowledgeBases(agentId);
  
  const filteredKBs = React.useMemo(() => {
    if (!data?.knowledge_bases) return [];
    
    return data.knowledge_bases.filter(kb =>
      kb.name.toLowerCase().includes(filter.toLowerCase()) ||
      kb.index_name.toLowerCase().includes(filter.toLowerCase())
    );
  }, [data, filter]);
  
  return (
    <div className="space-y-4">
      <input
        placeholder="Filter knowledge bases..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full p-2 border rounded"
      />
      
      <div className="space-y-2">
        {filteredKBs.map(kb => (
          <Card key={kb.id}>
            <CardHeader>
              <CardTitle>{kb.name}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      
      <p className="text-sm text-muted-foreground">
        Showing {filteredKBs.length} of {data?.knowledge_bases.length || 0} KBs
      </p>
    </div>
  );
}

// ============================================================================
// EXAMPLE 8: Active Knowledge Bases Only
// ============================================================================

export function Example8_ActiveOnly({ agentId }: { agentId: string }) {
  const { data } = useAgentLlamaCloudKnowledgeBases(agentId);
  
  const activeKBs = React.useMemo(() => {
    return data?.knowledge_bases.filter(kb => kb.is_active) || [];
  }, [data]);
  
  return (
    <div>
      <h3 className="text-lg font-bold mb-4">
        Active Knowledge Bases ({activeKBs.length})
      </h3>
      <div className="space-y-2">
        {activeKBs.map(kb => (
          <Card key={kb.id}>
            <CardHeader>
              <CardTitle>{kb.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">Index: {kb.index_name}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// EXAMPLE 9: Batch Operations (Multiple Updates)
// ============================================================================

export function Example9_BatchOperations({ 
  agentId 
}: { 
  agentId: string;
}) {
  const { data } = useAgentLlamaCloudKnowledgeBases(agentId);
  const updateMutation = useUpdateLlamaCloudKnowledgeBase();
  
  const activateAll = async () => {
    if (!data?.knowledge_bases) return;
    
    const promises = data.knowledge_bases.map(kb =>
      updateMutation.mutateAsync({
        kbId: kb.id,
        kbData: { is_active: true },
      })
    );
    
    await Promise.all(promises);
  };
  
  return (
    <div>
      <Button onClick={activateAll}>
        Activate All Knowledge Bases
      </Button>
    </div>
  );
}

// ============================================================================
// EXAMPLE 10: Integration with Agent Page
// ============================================================================

export function Example10_AgentIntegration({ agentId }: { agentId: string }) {
  const { data: kbs } = useAgentLlamaCloudKnowledgeBases(agentId);
  
  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total KBs</p>
            <p className="text-2xl font-bold">{kbs?.knowledge_bases.length || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Active</p>
            <p className="text-2xl font-bold">
              {kbs?.knowledge_bases.filter(kb => kb.is_active).length || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Inactive</p>
            <p className="text-2xl font-bold">
              {kbs?.knowledge_bases.filter(kb => !kb.is_active).length || 0}
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Full Manager */}
      <LlamaCloudKnowledgeBaseManager 
        agentId={agentId}
        agentName="My Agent"
      />
    </div>
  );
}

// ============================================================================
// TYPE-SAFE HELPER FUNCTIONS
// ============================================================================

/**
 * Format KB name for tool function
 */
export function formatKBName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Get tool function name for KB
 */
export function getToolFunctionName(kb: LlamaCloudKnowledgeBase): string {
  return `search_${formatKBName(kb.name)}`;
}

/**
 * Validate KB data before submission
 */
export function validateKBData(data: CreateLlamaCloudKnowledgeBaseRequest): boolean {
  return !!(data.name && data.index_name);
}

/**
 * Check if KB is ready for use
 */
export function isKBReady(kb: LlamaCloudKnowledgeBase): boolean {
  return kb.is_active && !!kb.index_name;
}

// ============================================================================
// USAGE NOTES
// ============================================================================

/*
 * Key Points:
 * 
 * 1. Always handle loading and error states
 * 2. Use React Query's built-in caching
 * 3. Mutations automatically invalidate cache
 * 4. Toast notifications are automatic
 * 5. All operations are type-safe
 * 
 * Performance Tips:
 * 
 * - Use useMemo for filtered/computed lists
 * - Avoid creating KBs in loops
 * - Let React Query handle caching
 * - Use optimistic updates for better UX
 * 
 * Best Practices:
 * 
 * - Validate data before submission
 * - Handle errors gracefully
 * - Show loading states
 * - Provide user feedback
 * - Use TypeScript types
 */
