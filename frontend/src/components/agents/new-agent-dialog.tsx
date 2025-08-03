'use client';

import React, { useState, useRef } from 'react';
import { Loader2, Upload, Plus, FileJson, CheckCircle2, AlertCircle } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCreateNewAgent } from '@/hooks/react-query/agents/use-agents';
import { useImportAgent, parseAgentImportFile, type AgentExportData } from '@/hooks/react-query/agents/use-agent-export-import';
import { toast } from 'sonner';

interface NewAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function NewAgentDialog({ open, onOpenChange, onSuccess }: NewAgentDialogProps) {
  const [mode, setMode] = useState<'create' | 'import'>('create');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<AgentExportData | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createNewAgentMutation = useCreateNewAgent();
  const importMutation = useImportAgent();

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

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast.error('Please select a JSON file');
      return;
    }

    setIsProcessingFile(true);
    try {
      const data = await parseAgentImportFile(file);
      setImportFile(file);
      setImportData(data);
      toast.success('Import file loaded successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to parse import file');
      setImportFile(null);
      setImportData(null);
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleImport = () => {
    if (!importData) {
      toast.error('No import data available');
      return;
    }

    importMutation.mutate({
      import_data: importData,
      import_as_new: true
    }, {
      onSuccess: () => {
        onOpenChange(false);
        onSuccess?.();
        // Reset form
        setImportFile(null);
        setImportData(null);
        setMode('create');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    });
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      // Reset form when closing
      setImportFile(null);
      setImportData(null);
      setMode('create');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
    onOpenChange(open);
  };

  const isLoading = createNewAgentMutation.isPending || importMutation.isPending;

  return (
    <AlertDialog open={open} onOpenChange={handleDialogClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Create New Agent</AlertDialogTitle>
          <AlertDialogDescription>
            This will create a new agent that you can customize and configure.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {/* Content based on mode */}
          {mode === 'create' ? (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                This will create a new agent with a default name and description that you can customize later.
              </div>
              
              {/* Subtle import option */}
              <div className="text-center">
                <button
                  onClick={() => setMode('import')}
                  className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                  disabled={isLoading}
                >
                  or import from JSON
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="import-file">Select Agent JSON File</Label>
                <button
                  onClick={() => setMode('create')}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  disabled={isLoading}
                >
                  ← back to create blank
                </button>
              </div>
              
              <Input
                ref={fileInputRef}
                id="import-file"
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="mt-1"
                disabled={isLoading}
              />

              {isProcessingFile && (
                <Alert>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <AlertDescription>
                    Processing import file...
                  </AlertDescription>
                </Alert>
              )}

              {importData && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <div><strong>Agent:</strong> {importData.name}</div>
                      {importData.description && (
                        <div><strong>Description:</strong> {importData.description}</div>
                      )}
                      <div><strong>Exported:</strong> {new Date(importData.exported_at).toLocaleString()}</div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          
          {mode === 'create' ? (
            <AlertDialogAction 
              onClick={handleCreateNewAgent}
              disabled={isLoading}
              className="min-w-[100px]"
            >
              {createNewAgentMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Agent
                </>
              )}
            </AlertDialogAction>
          ) : (
            <AlertDialogAction 
              onClick={handleImport}
              disabled={!importData || isLoading}
              className="min-w-[100px]"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Agent
                </>
              )}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}