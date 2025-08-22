'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { LuckysheetViewer } from '@/components/thread/tool-views/sheets-tools/luckysheet-viewer';

interface XlsxRendererProps {
  content?: string | null;
  filePath?: string;
  fileName: string;
  className?: string;
  sandboxId?: string;
  project?: {
    sandbox?: {
      id?: string;
      sandbox_url?: string;
    };
  };
  onDownload?: () => void;
  isDownloading?: boolean;
}

export function XlsxRenderer({
  filePath,
  fileName,
  className,
  sandboxId,
  project
}: XlsxRendererProps) {
  // Determine the path for LuckysheetViewer
  const xlsxPath = filePath || fileName;
  const resolvedSandboxId = sandboxId || project?.sandbox?.id;

  return (
    <div className={cn('w-full h-full', className)}>
      <LuckysheetViewer 
        xlsxPath={xlsxPath}
        sandboxId={resolvedSandboxId}
        className="w-full h-full"
        height="100%"
      />
    </div>
  );
}
