'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Search,
  Loader2,
  BookOpen,
  X,
  ExternalLink,
  TestTube
} from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  useAgentLlamaCloudKnowledgeBases,
  useCreateLlamaCloudKnowledgeBase,
  useUpdateLlamaCloudKnowledgeBase,
  useDeleteLlamaCloudKnowledgeBase,
  useTestLlamaCloudSearch
} from '@/hooks/react-query/llamacloud-knowledge-base/use-llamacloud-knowledge-base-queries';
import { cn, truncateString } from '@/lib/utils';
import { CreateLlamaCloudKnowledgeBaseRequest, LlamaCloudKnowledgeBase, UpdateLlamaCloudKnowledgeBaseRequest } from '@/hooks/react-query/llamacloud-knowledge-base/types';
import { toast } from 'sonner';

interface LlamaCloudKnowledgeBaseManagerProps {
  agentId: string;
  agentName: string;
}

interface EditDialogData {
  kb?: LlamaCloudKnowledgeBase;
  isOpen: boolean;
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

const LlamaCloudKnowledgeBaseSkeleton = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-9 w-32" />
    </div>
    {[...Array(3)].map((_, i) => (
      <Card key={i}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-5" />
              <div>
                <Skeleton className="h-5 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        </CardHeader>
      </Card>
    ))}
  </div>
);

export const LlamaCloudKnowledgeBaseManager = ({ agentId, agentName }: LlamaCloudKnowledgeBaseManagerProps) => {
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

  const { data: knowledgeBases, isLoading, error } = useAgentLlamaCloudKnowledgeBases(agentId);
  const createMutation = useCreateLlamaCloudKnowledgeBase();
  const updateMutation = useUpdateLlamaCloudKnowledgeBase();
  const deleteMutation = useDeleteLlamaCloudKnowledgeBase();
  const testSearchMutation = useTestLlamaCloudSearch();

  const handleOpenAddDialog = () => {
    setFormData({ name: '', index_name: '', description: '' });
    setAddDialogOpen(true);
  };

  const handleCreateKnowledgeBase = async () => {
    if (!formData.name || !formData.index_name) return;
    
    try {
      await createMutation.mutateAsync({
        agentId,
        kbData: formData
      });
      
      setAddDialogOpen(false);
      setFormData({ name: '', index_name: '', description: '' });
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleEditKnowledgeBase = (kb: LlamaCloudKnowledgeBase) => {
    setEditDialog({
      kb,
      isOpen: true
    });
  };

  const handleUpdateKnowledgeBase = async (kbId: string, updates: UpdateLlamaCloudKnowledgeBaseRequest) => {
    try {
      await updateMutation.mutateAsync({ kbId, kbData: updates });
      setEditDialog({ isOpen: false });
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleDeleteKnowledgeBase = async (kbId: string) => {
    try {
      await deleteMutation.mutateAsync(kbId);
      setDeleteKbId(null);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleTestSearch = async () => {
    if (!testSearchData.index_name || !testSearchData.query) {
      toast.error('Please provide both index name and search query');
      return;
    }

    try {
      await testSearchMutation.mutateAsync({
        agentId,
        searchData: testSearchData
      });
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const filteredKnowledgeBases = knowledgeBases?.knowledge_bases.filter(kb =>
    kb.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    kb.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    kb.index_name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleNameChange = (value: string) => {
    setFormData(prev => ({ 
      ...prev, 
      name: formatKnowledgeBaseName(value)
    }));
  };

  if (isLoading) {
    return <LlamaCloudKnowledgeBaseSkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Failed to load LlamaCloud knowledge bases: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Knowledge Base - LlamaCloud
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Connect to existing LlamaCloud indices for dynamic search capabilities
          </p>
        </div>
        <Button onClick={handleOpenAddDialog} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Knowledge Base
        </Button>
      </div>

      {/* Search bar */}
      {knowledgeBases && knowledgeBases.knowledge_bases.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search knowledge bases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Stats */}
      {knowledgeBases && knowledgeBases.knowledge_bases.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
          <span>{knowledgeBases.total_count} total knowledge bases</span>
          {searchQuery && (
            <span>{filteredKnowledgeBases.length} matching search</span>
          )}
        </div>
      )}

      {/* Knowledge bases list */}
      <div className="space-y-4">
        {filteredKnowledgeBases.length === 0 && !searchQuery ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
            <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No LlamaCloud Knowledge Bases
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Connect to your existing LlamaCloud indices to enable dynamic search capabilities for your agent.
            </p>
            <Button onClick={handleOpenAddDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Your First Knowledge Base
            </Button>
          </div>
        ) : filteredKnowledgeBases.length === 0 && searchQuery ? (
          <div className="text-center py-8">
            <Search className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-600 dark:text-gray-400">No knowledge bases match your search.</p>
          </div>
        ) : (
          filteredKnowledgeBases.map((kb) => (
            <Card key={kb.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-5 w-5 text-blue-600" />
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{kb.name}</CardTitle>
                        <Badge variant="outline" className="text-xs">
                          search_{kb.name.replace(/-/g, '_')}()
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Index: {kb.index_name}
                        </p>
                        <ExternalLink className="h-3 w-3 text-gray-400" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setTestSearchData(prev => ({ ...prev, index_name: kb.index_name }));
                      }}
                      className="gap-1"
                    >
                      <TestTube className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditKnowledgeBase(kb)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setDeleteKbId(kb.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {kb.description && (
                  <CardContent className="pt-0">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {truncateString(kb.description, 200)}
                    </p>
                  </CardContent>
                )}
              </CardHeader>
            </Card>
          ))
        )}
      </div>

      {/* Test Search Section */}
      {testSearchData.index_name && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/10">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TestTube className="h-4 w-4" />
              Test Search - {testSearchData.index_name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Search Query</Label>
              <Input
                placeholder="Enter your test query..."
                value={testSearchData.query}
                onChange={(e) => setTestSearchData(prev => ({ ...prev, query: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleTestSearch}
                disabled={testSearchMutation.isPending}
                size="sm"
              >
                {testSearchMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Test Search
              </Button>
              <Button 
                variant="outline"
                size="sm"
                onClick={() => setTestSearchData({ index_name: '', query: '' })}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Knowledge Base Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add LlamaCloud Knowledge Base</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                placeholder="e.g., documentation"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Tool function name (auto-formatted): search_{formatKnowledgeBaseName(formData.name || 'name')}()
              </p>
            </div>
            <div>
              <Label>Index Key</Label>
              <Input
                placeholder="LlamaCloud index identifier"
                value={formData.index_name}
                onChange={(e) => setFormData(prev => ({ ...prev, index_name: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1">
                Must match your LlamaCloud index name exactly
              </p>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                placeholder="What information does this knowledge base contain?"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateKnowledgeBase}
              disabled={!formData.name || !formData.index_name || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add Knowledge Base
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Knowledge Base Dialog */}
      <Dialog open={editDialog.isOpen} onOpenChange={(open) => setEditDialog({ isOpen: open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit LlamaCloud Knowledge Base</DialogTitle>
          </DialogHeader>
          {editDialog.kb && (
            <EditKnowledgeBaseForm 
              kb={editDialog.kb}
              onSave={handleUpdateKnowledgeBase}
              onCancel={() => setEditDialog({ isOpen: false })}
              isLoading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteKbId} onOpenChange={() => setDeleteKbId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Knowledge Base</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this LlamaCloud knowledge base? This will remove the search capability from your agent but won't affect your LlamaCloud index.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteKbId && handleDeleteKnowledgeBase(deleteKbId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// Edit form component
interface EditKnowledgeBaseFormProps {
  kb: LlamaCloudKnowledgeBase;
  onSave: (kbId: string, updates: UpdateLlamaCloudKnowledgeBaseRequest) => void;
  onCancel: () => void;
  isLoading: boolean;
}

const EditKnowledgeBaseForm = ({ kb, onSave, onCancel, isLoading }: EditKnowledgeBaseFormProps) => {
  const [formData, setFormData] = useState({
    name: kb.name,
    index_name: kb.index_name,
    description: kb.description || '',
  });

  const handleSave = () => {
    onSave(kb.id, formData);
  };

  const handleNameChange = (value: string) => {
    setFormData(prev => ({ 
      ...prev, 
      name: formatKnowledgeBaseName(value)
    }));
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Name</Label>
        <Input
          value={formData.name}
          onChange={(e) => handleNameChange(e.target.value)}
        />
        <p className="text-xs text-gray-500 mt-1">
          Tool function name: search_{formatKnowledgeBaseName(formData.name)}()
        </p>
      </div>
      <div>
        <Label>Index Key</Label>
        <Input
          value={formData.index_name}
          onChange={(e) => setFormData(prev => ({ ...prev, index_name: e.target.value }))}
        />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          rows={3}
        />
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
};
