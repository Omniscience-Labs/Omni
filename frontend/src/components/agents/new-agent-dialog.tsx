'use client';

import React from 'react';
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
import { useCreateNewAgent } from '@/hooks/react-query/agents/use-agents';

interface NewAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function NewAgentDialog({ open, onOpenChange, onSuccess }: NewAgentDialogProps) {
  const createNewAgentMutation = useCreateNewAgent();

  const handleCreateNewAgent = () => {
    createNewAgentMutation.mutate(undefined, {
      onSuccess: () => {
        onOpenChange(false);
        onSuccess?.();
      },
      onError: () => {
        // Keep dialog open on error so user can see the error and try again
        // The useCreateNewAgent hook already shows error toasts
      }
    });
  };

  const isLoading = createNewAgentMutation.isPending;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create New Agent</AlertDialogTitle>
          <AlertDialogDescription>
            This will create a new agent with a default name and description.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleCreateNewAgent}
            disabled={isLoading}
            className="min-w-[100px]"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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