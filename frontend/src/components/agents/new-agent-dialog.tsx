'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { useCreateNewAgent } from '@/hooks/agents/use-agents';
import { AgentCountLimitError } from '@/lib/api/errors';
import { toast } from 'sonner';

interface NewAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (agentId: string) => void;
}

export function NewAgentDialog({ open, onOpenChange, onSuccess }: NewAgentDialogProps) {
  const [name, setName] = useState('');
  const createNewAgentMutation = useCreateNewAgent();

  const handleCreateNewAgent = () => {
    if (!name.trim()) {
      toast.error('Please enter a name for your worker');
      return;
    }

    createNewAgentMutation.mutate(name, {
      onSuccess: (newAgent) => {
        onOpenChange(false);
        setName(''); // Reset name
        onSuccess?.(newAgent.agent_id);
      },
      onError: (error) => {
        if (error instanceof AgentCountLimitError) {
          onOpenChange(false);
        } else {
          toast.error(error instanceof Error ? error.message : 'Failed to create agent');
        }
      }
    });
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setName('');
    }
    onOpenChange(open);
  };

  const isLoading = createNewAgentMutation.isPending;

  return (
    <AlertDialog open={open} onOpenChange={handleDialogClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Create New Worker</AlertDialogTitle>
          <AlertDialogDescription>
            Give your new worker a name to get started. You can configure its capabilities later.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          <input
            type="text"
            placeholder="e.g. Research Assistant"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isLoading) {
                handleCreateNewAgent();
              }
            }}
            autoFocus
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCreateNewAgent}
            disabled={isLoading || !name.trim()}
            className="min-w-[100px]"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}