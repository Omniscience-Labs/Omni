'use client';

import React, { useState } from 'react';
import {
  Database,
  Pencil,
  Trash2,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
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
  useAllLlamaCloudKnowledgeBases,
  useUpdateLlamaCloudKnowledgeBase,
  useDeleteLlamaCloudKnowledgeBase,
  type AccountLlamaCloudKnowledgeBase,
} from '@/hooks/react-query/llamacloud-knowledge-base';

interface EditState {
  kb_id: string;
  name: string;
  index_name: string;
  description: string;
}

export function CloudKnowledgeBaseSection() {
  const { data: response, isLoading } = useAllLlamaCloudKnowledgeBases();
  const updateMutation = useUpdateLlamaCloudKnowledgeBase();
  const deleteMutation = useDeleteLlamaCloudKnowledgeBase();

  const [editState, setEditState] = useState<EditState | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const kbs = response?.knowledge_bases ?? [];

  const startEdit = (kb: AccountLlamaCloudKnowledgeBase) => {
    setEditState({
      kb_id: kb.kb_id,
      name: kb.name,
      index_name: kb.index_name,
      description: kb.description ?? '',
    });
  };

  const cancelEdit = () => setEditState(null);

  const saveEdit = async () => {
    if (!editState) return;
    await updateMutation.mutateAsync({
      kbId: editState.kb_id,
      kbData: {
        name: editState.name.trim(),
        index_name: editState.index_name.trim(),
        description: editState.description.trim() || undefined,
      },
    });
    setEditState(null);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    await deleteMutation.mutateAsync(deleteId);
    setDeleteId(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (kbs.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Database className="size-5" />
          Cloud Knowledge Bases
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          LlamaCloud indices connected to your account
        </p>
      </div>

      {/* KB rows */}
      <div className="space-y-2">
        {kbs.map((kb) => {
          const isEditing = editState?.kb_id === kb.kb_id;

          if (isEditing && editState) {
            return (
              <div
                key={kb.kb_id}
                className="border rounded-lg p-4 space-y-3 bg-muted/20"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={editState.name}
                      onChange={(e) =>
                        setEditState({ ...editState, name: e.target.value })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Index Key</Label>
                    <Input
                      value={editState.index_name}
                      onChange={(e) =>
                        setEditState({ ...editState, index_name: e.target.value })
                      }
                      className="h-8 text-sm font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    value={editState.description}
                    onChange={(e) =>
                      setEditState({ ...editState, description: e.target.value })
                    }
                    rows={2}
                    className="text-sm resize-none"
                    placeholder="Describe what this knowledge base contains..."
                  />
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={cancelEdit}
                    disabled={updateMutation.isPending}
                  >
                    <X className="size-3.5 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveEdit}
                    disabled={
                      updateMutation.isPending ||
                      !editState.name.trim() ||
                      !editState.index_name.trim()
                    }
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="size-3.5 mr-1 animate-spin" />
                    ) : (
                      <Check className="size-3.5 mr-1" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={kb.kb_id}
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/30 transition-colors group"
            >
              <div className="flex items-center justify-center h-10 w-10 rounded-md bg-muted shrink-0">
                <Database className="size-5 text-muted-foreground" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium truncate">{kb.name}</span>
                  <Badge
                    variant={kb.is_active ? 'highlight' : 'secondary'}
                    className="shrink-0"
                  >
                    {kb.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <code className="text-xs text-muted-foreground truncate block">
                  {kb.index_name}
                </code>
                {kb.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {kb.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => startEdit(kb)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleteId(kb.kb_id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Knowledge Base?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the knowledge base and remove it from all
              agents. The LlamaCloud index itself will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
