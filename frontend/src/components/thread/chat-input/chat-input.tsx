'use client';

import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { FileUploadHandler, handleFiles } from './file-upload-handler';
import { MessageInput } from './message-input';
import { UploadedFilesDisplay } from './uploaded-file-display';
import { ModelSelector } from './model-selector';
import { useModelSelection } from './_use-model-selection';

export interface ChatInputHandles {
  getPendingFiles: () => File[];
  clearPendingFiles: () => void;
}

export interface ChatInputProps {
  onSubmit: (
    message: string,
    options?: { model_name?: string; enable_thinking?: boolean },
  ) => void;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  isAgentRunning?: boolean;
  onStopAgent?: () => void;
  autoFocus?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onFileBrowse?: () => void;
  sandboxId?: string;
  hideAttachments?: boolean;
}

export interface UploadedFile {
  name: string;
  path: string;
  size: number;
}

export const ChatInput = forwardRef<ChatInputHandles, ChatInputProps>(
  (
    {
      onSubmit,
      placeholder = 'Describe what you need help with...',
      loading = false,
      disabled = false,
      isAgentRunning = false,
      onStopAgent,
      autoFocus = true,
      value: controlledValue,
      onChange: controlledOnChange,
      onFileBrowse,
      sandboxId,
      hideAttachments = false,
    },
    ref,
  ) => {
    const isControlled =
      controlledValue !== undefined && controlledOnChange !== undefined;

    const [uncontrolledValue, setUncontrolledValue] = useState('');
    const value = isControlled ? controlledValue : uncontrolledValue;

    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    const {
      selectedModel,
      setSelectedModel: handleModelChange,
      subscriptionTier,
      allModels: modelOptions,
      canAccessModel,
    } = useModelSelection();

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useImperativeHandle(ref, () => ({
      getPendingFiles: () => pendingFiles,
      clearPendingFiles: () => setPendingFiles([]),
    }));

    useEffect(() => {
      if (autoFocus && textareaRef.current) {
        textareaRef.current.focus();
      }
    }, [autoFocus]);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (
        (!value.trim() && uploadedFiles.length === 0) ||
        loading ||
        (disabled && !isAgentRunning)
      )
        return;

      if (isAgentRunning && onStopAgent) {
        onStopAgent();
        return;
      }

      let message = value;

      if (uploadedFiles.length > 0) {
        const fileInfo = uploadedFiles
          .map((file) => `[Uploaded File: ${file.path}]`)
          .join('\n');
        message = message ? `${message}\n\n${fileInfo}` : fileInfo;
      }

      let baseModelName = selectedModel;
      let thinkingEnabled = false;
      if (selectedModel.endsWith('-thinking')) {
        baseModelName = selectedModel.replace(/-thinking$/, '');
        thinkingEnabled = true;
      }

      onSubmit(message, {
        model_name: baseModelName,
        enable_thinking: thinkingEnabled,
      });

      if (!isControlled) {
        setUncontrolledValue('');
      }

      setUploadedFiles([]);
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      if (isControlled) {
        controlledOnChange(newValue);
      } else {
        setUncontrolledValue(newValue);
      }
    };

    const removeUploadedFile = (index: number) => {
      setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
      if (!sandboxId && pendingFiles.length > index) {
        setPendingFiles((prev) => prev.filter((_, i) => i !== index));
      }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);
    };

    return (
      <div className="mx-auto w-full max-w-3xl px-4">
        <Card
          className="shadow-none w-full max-w-3xl mx-auto bg-transparent border-none rounded-xl overflow-hidden"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingOver(false);

            if (fileInputRef.current && e.dataTransfer.files.length > 0) {
              const files = Array.from(e.dataTransfer.files);
              handleFiles(
                files,
                sandboxId,
                setPendingFiles,
                setUploadedFiles,
                setIsUploading,
              );
            }
          }}
        >
          <div className="w-full bg-muted/30 text-sm flex flex-col justify-between items-start rounded-lg border-b">
            <CardContent className="shadow w-full p-1.5 pb-2 pt-3 bg-background rounded-2xl border">
              <UploadedFilesDisplay
                uploadedFiles={uploadedFiles}
                sandboxId={sandboxId}
                onRemoveFile={removeUploadedFile}
              />

              <MessageInput
                ref={textareaRef}
                value={value}
                onChange={handleChange}
                onSubmit={handleSubmit}
                placeholder={placeholder}
                loading={loading}
                disabled={disabled}
                isAgentRunning={isAgentRunning}
                onStopAgent={onStopAgent}
                isDraggingOver={isDraggingOver}
                uploadedFiles={uploadedFiles}
              />

              <div className="flex items-center justify-start mt-3 ml-3">
                <div className="flex items-center gap-3">
                  {!hideAttachments && (
                    <FileUploadHandler
                      ref={fileInputRef}
                      loading={loading}
                      disabled={disabled}
                      isAgentRunning={isAgentRunning}
                      isUploading={isUploading}
                      sandboxId={sandboxId}
                      setPendingFiles={setPendingFiles}
                      setUploadedFiles={setUploadedFiles}
                      setIsUploading={setIsUploading}
                    />
                  )}

                  <ModelSelector
                    selectedModel={selectedModel}
                    onModelChange={handleModelChange}
                    modelOptions={modelOptions}
                    currentTier={subscriptionTier}
                    canAccessModel={canAccessModel}
                  />
                </div>
              </div>
            </CardContent>
          </div>
        </Card>

        {isAgentRunning && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="pb-4 -mt-4 w-full flex items-center justify-center"
          >
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Kortix Suna is working...</span>
            </div>
          </motion.div>
        )}
      </div>
    );
  },
);

ChatInput.displayName = 'ChatInput';
