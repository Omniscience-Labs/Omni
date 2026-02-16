'use client';

import React from 'react';
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
import type { DefaultFile } from '@/hooks/agents/use-agent-default-files';

interface DeleteDefaultFileDialogProps {
  file: DefaultFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (file: DefaultFile) => void;
}

export function DeleteDefaultFileDialog({
  file,
  open,
  onOpenChange,
  onConfirm,
}: DeleteDefaultFileDialogProps) {
  if (!file) return null;

  const handleConfirm = () => {
    onConfirm(file);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove default file?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove &quot;{file.name}&quot; from default files? It will no longer be attached when starting a chat.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-destructive hover:bg-destructive/90 text-white"
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
