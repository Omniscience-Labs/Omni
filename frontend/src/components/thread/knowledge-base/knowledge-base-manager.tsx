'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Clock, 
  MoreVertical,
  AlertCircle,
  FileText,
  Eye,
  EyeOff,
  Globe,
  Search,
} from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  useKnowledgeBaseEntries,
  useCreateKnowledgeBaseEntry,
  useUpdateKnowledgeBaseEntry,
  useDeleteKnowledgeBaseEntry,
  type KnowledgeBaseEntry,
  type CreateKnowledgeBaseEntryRequest,
  type UpdateKnowledgeBaseEntryRequest
} from '@/hooks/react-query/knowledge-base/use-knowledge-base-queries';
import { cn } from '@/lib/utils';

interface KnowledgeBaseManagerProps {
  threadId: string;
}

interface EditDialogData {
  entry?: KnowledgeBaseEntry;
  isOpen: boolean;
}

const USAGE_CONTEXT_OPTIONS = [
  { 
    value: 'always', 
    label: 'Always Active', 
    icon: Globe,
    color: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
  },
//   { 
//     value: 'contextual', 
//     label: 'Smart Context', 
//     description: 'Included when contextually relevant',
//     icon: Target,
//     color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
//   },
//   { 
//     value: 'on_request', 
//     label: 'On Demand', 
//     description: 'Only when explicitly requested',
//     icon: Zap,
//     color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
//   },
] as const;

const KnowledgeBaseSkeleton = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="relative w-full">
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-10 w-32 ml-4" />
      </div>

      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <Skeleton className="h-4 w-64" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

export const KnowledgeBaseManager = ({ threadId }: KnowledgeBaseManagerProps) => {
  const [editDialog, setEditDialog] = useState<EditDialogData>({ isOpen: false });
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState<CreateKnowledgeBaseEntryRequest>({
    name: '',
    description: '',
    content: '',
    usage_context: 'always',
  });

  const { data: knowledgeBase, isLoading, error } = useKnowledgeBaseEntries(threadId);
  const createMutation = useCreateKnowledgeBaseEntry();
  const updateMutation = useUpdateKnowledgeBaseEntry();
  const deleteMutation = useDeleteKnowledgeBaseEntry();

  const handleOpenCreateDialog = () => {
    setFormData({
      name: '',
      description: '',
      content: '',
      usage_context: 'always',
    });
    setEditDialog({ isOpen: true });
  };

  const handleOpenEditDialog = (entry: KnowledgeBaseEntry) => {
    setFormData({
      name: entry.name,
      description: entry.description || '',
      content: entry.content,
      usage_context: entry.usage_context,
    });
    setEditDialog({ entry, isOpen: true });
  };

  const handleCloseDialog = () => {
    setEditDialog({ isOpen: false });
    setFormData({
      name: '',
      description: '',
      content: '',
      usage_context: 'always',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.content.trim()) {
      return;
    }

    try {
      if (editDialog.entry) {
        const updateData: UpdateKnowledgeBaseEntryRequest = {
          name: formData.name !== editDialog.entry.name ? formData.name : undefined,
          description: formData.description !== editDialog.entry.description ? formData.description : undefined,
          content: formData.content !== editDialog.entry.content ? formData.content : undefined,
          usage_context: formData.usage_context !== editDialog.entry.usage_context ? formData.usage_context : undefined,
        };
        const hasChanges = Object.values(updateData).some(value => value !== undefined);
        if (hasChanges) {
          await updateMutation.mutateAsync({ entryId: editDialog.entry.entry_id, data: updateData });
        }
      } else {
        await createMutation.mutateAsync({ threadId, data: formData });
      }
      
      handleCloseDialog();
    } catch (error) {
      console.error('Error saving knowledge base entry:', error);
    }
  };

  const handleDelete = async (entryId: string) => {
    try {
      await deleteMutation.mutateAsync(entryId);
      setDeleteEntryId(null);
    } catch (error) {
      console.error('Error deleting knowledge base entry:', error);
    }
  };

  const handleToggleActive = async (entry: KnowledgeBaseEntry) => {
    try {
      await updateMutation.mutateAsync({
        entryId: entry.entry_id,
        data: { is_active: !entry.is_active }
      });
    } catch (error) {
      console.error('Error toggling entry status:', error);
    }
  };

  const getUsageContextConfig = (context: string) => {
    return USAGE_CONTEXT_OPTIONS.find(option => option.value === context) || USAGE_CONTEXT_OPTIONS[0];
  };

  if (isLoading) {
    return <KnowledgeBaseSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <p className="text-sm text-red-600 dark:text-red-400">Failed to load knowledge base</p>
        </div>
      </div>
    );
  }

  const entries = knowledgeBase?.entries || [];
  const filteredEntries = entries.filter(entry => 
    entry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (entry.description && entry.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {entries.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search knowledge entries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={handleOpenCreateDialog} className="gap-2 ml-4">
              <Plus className="h-4 w-4" />
              Add Knowledge
            </Button>
          </div>
          <div className="space-y-3">
            {filteredEntries.length === 0 ? (
              <div className="text-center py-8">
                <Search className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No entries match your search</p>
              </div>
            ) : (
              filteredEntries.map((entry) => {
                const contextConfig = getUsageContextConfig(entry.usage_context);
                const ContextIcon = contextConfig.icon;
                
                return (
                  <div
                    key={entry.entry_id}
                    className={cn(
                      "group border rounded-lg p-4 transition-all hover:shadow-sm",
                      entry.is_active 
                        ? "border-border bg-card hover:border-border/80" 
                        : "border-border/50 bg-muted/30 opacity-70"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <h3 className="font-medium truncate">{entry.name}</h3>
                          {!entry.is_active && (
                            <Badge variant="secondary" className="text-xs">
                              <EyeOff className="h-3 w-3 mr-1" />
                              Disabled
                            </Badge>
                          )}
                        </div>
                        {entry.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {entry.description}
                          </p>
                        )}
                        <p className="text-sm text-foreground/80 line-clamp-2 leading-relaxed">
                          {entry.content}
                        </p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className={cn("text-xs gap-1", contextConfig.color)}>
                              <ContextIcon className="h-3 w-3" />
                              {contextConfig.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(entry.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          {entry.content_tokens && (
                            <span className="text-xs text-muted-foreground">
                              ~{entry.content_tokens.toLocaleString()} tokens
                            </span>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem onClick={() => handleOpenEditDialog(entry)}>
                            <Edit2 className="h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleActive(entry)}>
                            {entry.is_active ? (
                              <>
                                <EyeOff className="h-4 w-4" />
                                Disable
                              </>
                            ) : (
                              <>
                                <Eye className="h-4 w-4" />
                                Enable
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => setDeleteEntryId(entry.entry_id)}
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {entries.length === 0 && (
        <div className="text-center py-12">
          <div className="mx-auto w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No Knowledge Entries</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Add knowledge entries to provide your agent with context, guidelines, and information it should always remember.
          </p>
          <Button onClick={handleOpenCreateDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Your First Entry
          </Button>
        </div>
      )}

      <Dialog open={editDialog.isOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {editDialog.entry ? 'Edit Knowledge Entry' : 'Add Knowledge Entry'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto">
            <form onSubmit={handleSubmit} className="space-y-6 p-1">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Company Guidelines, API Documentation"
                  required
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="usage_context" className="text-sm font-medium">Usage Context</Label>
                <Select
                  value={formData.usage_context}
                  onValueChange={(value: 'always' | 'on_request' | 'contextual') => 
                    setFormData(prev => ({ ...prev, usage_context: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USAGE_CONTEXT_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      return (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            <div>
                              <div className="font-medium">{option.label}</div>
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of this knowledge (optional)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content" className="text-sm font-medium">Content *</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Enter the knowledge content that your agent should know..."
                  className="min-h-[200px] resize-y"
                  required
                />
                <div className="text-xs text-muted-foreground">
                  Approximately {Math.ceil(formData.content.length / 4).toLocaleString()} tokens
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={!formData.name.trim() || !formData.content.trim() || 
                           createMutation.isPending || updateMutation.isPending}
                  className="gap-2"
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {editDialog.entry ? 'Save Changes' : 'Add Knowledge'}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteEntryId} onOpenChange={() => setDeleteEntryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Delete Knowledge Entry
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this knowledge entry. Your agent will no longer have access to this information.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteEntryId && handleDelete(deleteEntryId)}
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete Entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
