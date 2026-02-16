'use client';

import React from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DefaultFile } from '@/hooks/agents/use-agent-default-files';
import { formatFileSize } from '@/lib/utils/file-utils';
import { getFileIconAndColor } from '@/components/thread/tool-views/utils';

interface DefaultFileRowProps {
  file: DefaultFile;
  onDeleteClick: (file: DefaultFile) => void;
  isDeleting: boolean;
}

export function DefaultFileRow({ file, onDeleteClick, isDeleting }: DefaultFileRowProps) {
  const { icon: FileIcon, color } = getFileIconAndColor(file.name);

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card'
      )}
    >
      <FileIcon className={cn('h-4 w-4 shrink-0', color)} />
      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground truncate">{formatFileSize(file.size)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive shrink-0 ml-auto"
        onClick={() => onDeleteClick(file)}
        disabled={isDeleting}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
