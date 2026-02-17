'use client';

import React, { useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAgentDefaultFiles,
  useUploadAgentDefaultFile,
  useDeleteAgentDefaultFile,
  type DefaultFile,
} from '@/hooks/agents/use-agent-default-files';
import { DefaultFileRow } from './default-file-row';
import { DeleteDefaultFileDialog } from './delete-default-file-dialog';

interface AgentDefaultFilesConfigurationProps {
  agentId: string;
}

export function AgentDefaultFilesConfiguration({ agentId }: AgentDefaultFilesConfigurationProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileToDelete, setFileToDelete] = useState<DefaultFile | null>(null);
  const { data: files = [], isLoading } = useAgentDefaultFiles(agentId);
  const uploadMutation = useUploadAgentDefaultFile(agentId);
  const deleteMutation = useDeleteAgentDefaultFile(agentId);

  const handleUploadClick = () => inputRef.current?.click();

  const handleDeleteConfirm = (file: DefaultFile) => {
    deleteMutation.mutate(file.id);
    setFileToDelete(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected?.length) return;
    for (let i = 0; i < selected.length; i++) {
      uploadMutation.mutate(selected[i]);
    }
    e.target.value = '';
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto pb-6">
        <div className="px-1 pt-1 space-y-3">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto pb-6">
      <div className="px-1 pt-1 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Files attached by default when starting a chat with this agent.
          </p>
          {files.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUploadClick}
              disabled={uploadMutation.isPending}
              className="gap-2 shrink-0"
            >
              <Upload className="h-4 w-4" />
              {uploadMutation.isPending ? 'Uploading...' : 'Upload file'}
            </Button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          onChange={handleFileSelect}
        />

        {files.length === 0 ? (
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleUploadClick()}
            onClick={handleUploadClick}
            className="cursor-pointer"
          >
          <SpotlightCard className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-center mb-4">
              <FileText className="h-12 w-12 text-muted-foreground shrink-0" />
            </div>
            <p className="text-muted-foreground mb-2">No default files yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Upload files to attach them automatically when users start chatting with this agent
            </p>
          </SpotlightCard>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file: DefaultFile) => (
              <DefaultFileRow
                key={file.id}
                file={file}
                onDeleteClick={setFileToDelete}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === file.id}
              />
            ))}
          </div>
        )}

        <DeleteDefaultFileDialog
          file={fileToDelete}
          open={fileToDelete !== null}
          onOpenChange={(open) => !open && setFileToDelete(null)}
          onConfirm={handleDeleteConfirm}
        />
      </div>
    </div>
  );
}
