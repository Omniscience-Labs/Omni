'use client';

import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Pencil, 
  Trash2, 
  Loader2, 
  Database,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  useAgentLlamaCloudKnowledgeBases,
  useCreateLlamaCloudKnowledgeBase,
  useUpdateLlamaCloudKnowledgeBase,
  useDeleteLlamaCloudKnowledgeBase,
  useTestLlamaCloudSearch,
  type LlamaCloudKnowledgeBase,
  type CreateLlamaCloudKnowledgeBaseRequest,
  type UpdateLlamaCloudKnowledgeBaseRequest,
} from '@/hooks/react-query/llamacloud-knowledge-base';

interface LlamaCloudKnowledgeBaseManagerProps {
  agentId: string;
  agentName: string;
}

interface EditDialogData {
  isOpen: boolean;
  kb?: LlamaCloudKnowledgeBase;
}

// Format knowledge base name for tool function generation
const formatKnowledgeBaseName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const LlamaCloudKnowledgeBaseManager = ({ 
  agentId, 
  agentName 
}: LlamaCloudKnowledgeBaseManagerProps) => {
  // State management
  const [editDialog, setEditDialog] = useState<EditDialogData>({ isOpen: false });
  const [deleteKbId, setDeleteKbId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [formData, setFormData] = useState<CreateLlamaCloudKnowledgeBaseRequest>({
    name: '',
    index_name: '',
    description: '',
  });
  const [testSearchData, setTestSearchData] = useState({
    index_name: '',
    query: '',
  });
  const [testSearchOpen, setTestSearchOpen] = useState(false);
  
  // React Query hooks
  const { data: response, isLoading, error } = useAgentLlamaCloudKnowledgeBases(agentId);
  const createMutation = useCreateLlamaCloudKnowledgeBase();
  const updateMutation = useUpdateLlamaCloudKnowledgeBase();
  const deleteMutation = useDeleteLlamaCloudKnowledgeBase();
  const testSearchMutation = useTestLlamaCloudSearch();
  
  const knowledgeBases = response?.knowledge_bases || [];

  // Filter knowledge bases by search query
  const filteredKnowledgeBases = useMemo(() => {
    if (!searchQuery.trim()) return knowledgeBases;
    
    const query = searchQuery.toLowerCase();
    return knowledgeBases.filter(kb => 
      kb.name.toLowerCase().includes(query) ||
      kb.index_name.toLowerCase().includes(query) ||
      kb.description?.toLowerCase().includes(query)
    );
  }, [knowledgeBases, searchQuery]);

  // Handler functions
  const handleCreateKnowledgeBase = async () => {
    if (!formData.name || !formData.index_name) return;
    
    await createMutation.mutateAsync({
      agentId,
      kbData: formData,
    });
    
    // Reset form and close dialog
    setFormData({ name: '', index_name: '', description: '' });
    setAddDialogOpen(false);
  };

  const handleUpdateKnowledgeBase = async (kbId: string, updates: UpdateLlamaCloudKnowledgeBaseRequest) => {
    await updateMutation.mutateAsync({ kbId, kbData: updates });
    setEditDialog({ isOpen: false });
  };

  const handleDeleteKnowledgeBase = async (kbId: string) => {
    await deleteMutation.mutateAsync(kbId);
    setDeleteKbId(null);
  };

  const handleTestSearch = async () => {
    if (!testSearchData.index_name || !testSearchData.query) return;
    
    await testSearchMutation.mutateAsync({
      agentId,
      searchData: testSearchData,
    });
  };

  const handleOpenAddDialog = () => {
    setFormData({ name: '', index_name: '', description: '' });
    setAddDialogOpen(true);
  };

  const handleOpenEditDialog = (kb: LlamaCloudKnowledgeBase) => {
    setEditDialog({ isOpen: true, kb });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        
        <Skeleton className="h-11 w-full" />
        
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
          <CardDescription>
            Failed to load LlamaCloud knowledge bases: {error.message}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Database className="size-5" />
            Knowledge Base - LlamaCloud
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Connect to existing LlamaCloud indices for {agentName}
          </p>
        </div>
        <Button onClick={handleOpenAddDialog}>
          <Plus />
          Add Knowledge Base
        </Button>
      </div>

      {/* Search bar */}
      {knowledgeBases.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search knowledge bases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Knowledge Base List */}
      {filteredKnowledgeBases.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Database className="size-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">
              {searchQuery ? 'No knowledge bases found' : 'No knowledge bases yet'}
            </p>
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
              {searchQuery 
                ? 'Try adjusting your search query'
                : 'Create your first LlamaCloud knowledge base to get started'
              }
            </p>
            {!searchQuery && (
              <Button onClick={handleOpenAddDialog}>
                <Plus />
                Add Knowledge Base
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredKnowledgeBases.map(kb => (
            <Card key={kb.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <CardTitle className="truncate">{kb.name}</CardTitle>
                      <Badge variant={kb.is_active ? 'highlight' : 'secondary'}>
                        {kb.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <CardDescription className="truncate">
                      Index: {kb.index_name}
                    </CardDescription>
                  </div>
                  <CardAction>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEditDialog(kb)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteKbId(kb.id)}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </CardAction>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-3">
                {kb.description && (
                  <p className="text-sm text-muted-foreground">{kb.description}</p>
                )}
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <code className="px-2 py-1 bg-muted rounded-lg">
                    search_{formatKnowledgeBaseName(kb.name)}()
                  </code>
                  <span>•</span>
                  <span>Created {new Date(kb.created_at).toLocaleDateString()}</span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTestSearchData({ index_name: kb.index_name, query: '' });
                    setTestSearchOpen(true);
                  }}
                >
                  <Search />
                  Test Search
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Result count */}
      {knowledgeBases.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          Showing {filteredKnowledgeBases.length} of {knowledgeBases.length} knowledge base{knowledgeBases.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Test Search Panel */}
      <Collapsible open={testSearchOpen} onOpenChange={setTestSearchOpen}>
        <CollapsibleContent>
          {testSearchOpen && (
            <Card>
              <CardHeader>
                <CardTitle>Test Search</CardTitle>
                <CardDescription>
                  Test search functionality for index: {testSearchData.index_name}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Search Query</Label>
                  <Input
                    placeholder="Enter search query..."
                    value={testSearchData.query}
                    onChange={(e) => setTestSearchData({ ...testSearchData, query: e.target.value })}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleTestSearch}
                    disabled={!testSearchData.query || testSearchMutation.isPending}
                  >
                    {testSearchMutation.isPending && <Loader2 className="animate-spin" />}
                    Run Search
                  </Button>
                  <Button variant="outline" onClick={() => setTestSearchOpen(false)}>
                    Close
                  </Button>
                </div>

                {/* Search Results */}
                {testSearchMutation.data && (
                  <div className="space-y-3 pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Search Results</h4>
                      <Badge variant="outline">
                        {testSearchMutation.data.results.length} result{testSearchMutation.data.results.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    
                    {testSearchMutation.data.results.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        No results found for your query
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {testSearchMutation.data.results.map((result) => (
                          <Card key={result.rank} className="bg-muted/30">
                            <CardContent className="p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <Badge variant="secondary">Rank {result.rank}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  Score: {result.score.toFixed(4)}
                                </span>
                              </div>
                              <p className="text-sm line-clamp-3">{result.text}</p>
                              {Object.keys(result.metadata).length > 0 && (
                                <details className="text-xs">
                                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                    Metadata
                                  </summary>
                                  <pre className="mt-2 p-2 bg-background rounded-lg overflow-auto">
                                    {JSON.stringify(result.metadata, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Add Knowledge Base Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add LlamaCloud Knowledge Base</DialogTitle>
            <DialogDescription>
              Connect an existing LlamaCloud index to this agent
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Documentation"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              {formData.name && (
                <p className="text-xs text-muted-foreground">
                  Tool function: <code className="px-1 py-0.5 bg-muted rounded">search_{formatKnowledgeBaseName(formData.name)}()</code>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="index_name">Index Key *</Label>
              <Input
                id="index_name"
                placeholder="e.g., my-docs-index"
                value={formData.index_name}
                onChange={(e) => setFormData({ ...formData, index_name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                The LlamaCloud index name/key
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what this knowledge base contains..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateKnowledgeBase}
              disabled={!formData.name || !formData.index_name || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="animate-spin" />}
              Create Knowledge Base
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Knowledge Base Dialog */}
      {editDialog.kb && (
        <Dialog open={editDialog.isOpen} onOpenChange={(open) => setEditDialog({ isOpen: open })}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Edit Knowledge Base</DialogTitle>
              <DialogDescription>
                Update the knowledge base configuration
              </DialogDescription>
            </DialogHeader>

            <EditKnowledgeBaseForm
              kb={editDialog.kb}
              onSave={handleUpdateKnowledgeBase}
              onCancel={() => setEditDialog({ isOpen: false })}
              isLoading={updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteKbId} onOpenChange={(open) => !open && setDeleteKbId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Knowledge Base?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the knowledge base from this agent. The LlamaCloud index itself will not be affected.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteKbId && handleDeleteKnowledgeBase(deleteKbId)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// Edit Knowledge Base Form Component
interface EditKnowledgeBaseFormProps {
  kb: LlamaCloudKnowledgeBase;
  onSave: (kbId: string, updates: UpdateLlamaCloudKnowledgeBaseRequest) => void;
  onCancel: () => void;
  isLoading: boolean;
}

const EditKnowledgeBaseForm = ({ 
  kb, 
  onSave, 
  onCancel, 
  isLoading 
}: EditKnowledgeBaseFormProps) => {
  const [formData, setFormData] = useState<UpdateLlamaCloudKnowledgeBaseRequest>({
    name: kb.name,
    index_name: kb.index_name,
    description: kb.description || '',
    is_active: kb.is_active,
  });
  
  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="edit-name">Name</Label>
        <Input
          id="edit-name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
        {formData.name && (
          <p className="text-xs text-muted-foreground">
            Tool function: <code className="px-1 py-0.5 bg-muted rounded">search_{formatKnowledgeBaseName(formData.name)}()</code>
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-index-name">Index Key</Label>
        <Input
          id="edit-index-name"
          value={formData.index_name}
          onChange={(e) => setFormData({ ...formData, index_name: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-description">Description</Label>
        <Textarea
          id="edit-description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="edit-is-active"
          checked={formData.is_active}
          onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked === true })}
        />
        <Label htmlFor="edit-is-active" className="cursor-pointer">
          Active
        </Label>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => onSave(kb.id, formData)}
          disabled={isLoading || !formData.name || !formData.index_name}
        >
          {isLoading && <Loader2 className="animate-spin" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
};
