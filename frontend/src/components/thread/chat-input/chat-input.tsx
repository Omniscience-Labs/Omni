'use client';

import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { handleFiles } from './file-upload-handler';
import { MessageInput } from './message-input';
import { AttachmentGroup } from '../attachment-group';
import { useModelSelection } from './_use-model-selection';
import { useFileDelete } from '@/hooks/react-query/files';
import { useQueryClient } from '@tanstack/react-query';
import { FloatingToolPreview, ToolCallInput } from './floating-tool-preview';
import { Settings2, Sparkles, Brain, ChevronRight, Zap, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FaGoogle, FaDiscord } from 'react-icons/fa';
import { SiNotion } from 'react-icons/si';

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
  selectedAgentId?: string;
  onAgentSelect?: (agentId: string | undefined) => void;
  agentName?: string;
  messages?: any[];
  bgColor?: string;
  toolCalls?: ToolCallInput[];
  toolCallIndex?: number;
  showToolPreview?: boolean;
  onExpandToolPreview?: () => void;
  isLoggedIn?: boolean;
  enableAdvancedConfig?: boolean;
  onConfigureAgent?: (agentId: string) => void;
  hideAgentSelection?: boolean;
}

export interface UploadedFile {
  name: string;
  path: string;
  size: number;
  type: string;
  localUrl?: string;
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
      selectedAgentId,
      onAgentSelect,
      agentName,
      messages = [],
      bgColor = 'bg-card',
      toolCalls = [],
      toolCallIndex = 0,
      showToolPreview = false,
      onExpandToolPreview,
      isLoggedIn = true,
      enableAdvancedConfig = false,
      onConfigureAgent,
      hideAgentSelection = false,
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
      subscriptionStatus,
      allModels: modelOptions,
      canAccessModel,
      getActualModelId,
      refreshCustomModels,
    } = useModelSelection();

    const deleteFileMutation = useFileDelete();
    const queryClient = useQueryClient();

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

      let baseModelName = getActualModelId(selectedModel);
      let thinkingEnabled = false;
      if (selectedModel.endsWith('-thinking')) {
        baseModelName = getActualModelId(selectedModel.replace(/-thinking$/, ''));
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

    const handleTranscription = (transcribedText: string) => {
      const currentValue = isControlled ? controlledValue : uncontrolledValue;
      const newValue = currentValue ? `${currentValue} ${transcribedText}` : transcribedText;

      if (isControlled) {
        controlledOnChange(newValue);
      } else {
        setUncontrolledValue(newValue);
      }
    };

    const removeUploadedFile = (index: number) => {
      const fileToRemove = uploadedFiles[index];

      // Clean up local URL if it exists
      if (fileToRemove.localUrl) {
        URL.revokeObjectURL(fileToRemove.localUrl);
      }

      // Remove from local state immediately for responsive UI
      setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
      if (!sandboxId && pendingFiles.length > index) {
        setPendingFiles((prev) => prev.filter((_, i) => i !== index));
      }

      // Check if file is referenced in existing chat messages before deleting from server
      const isFileUsedInChat = messages.some(message => {
        const content = typeof message.content === 'string' ? message.content : '';
        return content.includes(`[Uploaded File: ${fileToRemove.path}]`);
      });

      // Only delete from server if file is not referenced in chat history
      if (sandboxId && fileToRemove.path && !isFileUsedInChat) {
        deleteFileMutation.mutate({
          sandboxId,
          filePath: fileToRemove.path,
        }, {
          onError: (error) => {
            console.error('Failed to delete file from server:', error);
          }
        });
      } else if (isFileUsedInChat) {
        console.log(`Skipping server deletion for ${fileToRemove.path} - file is referenced in chat history`);
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
      <div className="mx-auto w-full max-w-4xl">
        <FloatingToolPreview
          toolCalls={toolCalls}
          currentIndex={toolCallIndex}
          onExpand={onExpandToolPreview || (() => { })}
          agentName={agentName}
          isVisible={showToolPreview}
        />
        
        <Card
          className={`-mb-2 shadow-none w-full max-w-4xl mx-auto bg-transparent border-none overflow-hidden ${enableAdvancedConfig && selectedAgentId ? '' : 'rounded-3xl'}`}
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
                messages,
                queryClient,
              );
            }
          }}
        >
          <div className="w-full text-sm flex flex-col justify-between items-start rounded-lg">
            <CardContent className={`w-full p-1.5 ${enableAdvancedConfig && selectedAgentId ? 'pb-1' : 'pb-2'} ${bgColor} border ${enableAdvancedConfig && selectedAgentId ? 'rounded-t-3xl' : 'rounded-3xl'}`}>
              <AttachmentGroup
                files={uploadedFiles || []}
                sandboxId={sandboxId}
                onRemove={removeUploadedFile}
                layout="inline"
                maxHeight="216px"
                showPreviews={true}
              />
              <MessageInput
                ref={textareaRef}
                value={value}
                onChange={handleChange}
                onSubmit={handleSubmit}
                onTranscription={handleTranscription}
                placeholder={placeholder}
                loading={loading}
                disabled={disabled}
                isAgentRunning={isAgentRunning}
                onStopAgent={onStopAgent}
                isDraggingOver={isDraggingOver}
                uploadedFiles={uploadedFiles}

                fileInputRef={fileInputRef}
                isUploading={isUploading}
                sandboxId={sandboxId}
                setPendingFiles={setPendingFiles}
                setUploadedFiles={setUploadedFiles}
                setIsUploading={setIsUploading}
                hideAttachments={hideAttachments}
                messages={messages}

                selectedModel={selectedModel}
                onModelChange={handleModelChange}
                modelOptions={modelOptions}
                subscriptionStatus={subscriptionStatus}
                canAccessModel={canAccessModel}
                refreshCustomModels={refreshCustomModels}
                isLoggedIn={isLoggedIn}

                selectedAgentId={selectedAgentId}
                onAgentSelect={onAgentSelect}
                hideAgentSelection={hideAgentSelection}
              />
            </CardContent>
            
            {enableAdvancedConfig && selectedAgentId && (
              <div 
                className="w-full border-t border-border/30 bg-muted/20 px-4 py-2.5 rounded-b-3xl border-l border-r border-b border-border cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => onConfigureAgent?.(selectedAgentId)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <span className="hidden sm:inline">Integrations</span>
                        <span className="sm:hidden">Integrations</span>
                        <div className="flex items-center -space-x-1 ml-1">
                          <div className="w-5 h-5 bg-white border border-border rounded-full flex items-center justify-center shadow-sm">
                            <FaGoogle className="w-2.5 h-2.5" />
                          </div>
                          <div className="w-5 h-5 bg-white border border-border rounded-full flex items-center justify-center shadow-sm">
                            <FaDiscord className="w-2.5 h-2.5" />
                          </div>
                          <div className="w-5 h-5 bg-white border border-border rounded-full flex items-center justify-center shadow-sm">
                            <SiNotion className="w-2.5 h-2.5" />
                          </div>
                        </div>
                      </div>
                      <div className="w-1 h-1 bg-muted-foreground/60 rounded-full hidden sm:block" />
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Brain className="h-2.5 w-2.5 flex-shrink-0" />
                        <span className="hidden sm:inline">Instructions</span>
                        <span className="sm:hidden">Instructions</span>
                      </div>
                      <div className="w-1 h-1 bg-muted-foreground/60 rounded-full hidden sm:block" />
                      <div className="flex items-center gap-1 text-muted-foreground hidden sm:flex">
                        <Zap className="h-2.5 w-2.5 flex-shrink-0" />
                        <span>Triggers</span>
                      </div>
                      <div className="w-1 h-1 bg-muted-foreground/60 rounded-full hidden sm:block" />
                      <div className="flex items-center gap-1 text-muted-foreground hidden sm:flex">
                        <Workflow className="h-2.5 w-2.5 flex-shrink-0" />
                        <span>Workflows</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* {isAgentRunning && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="pb-4 -mt-4 w-full flex items-center justify-center"
          >
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{agentName ? `${agentName} is working...` : 'Suna is working...'}</span>
            </div>
          </motion.div>
        )} */}

      </div>
    );
  },
);

ChatInput.displayName = 'ChatInput';