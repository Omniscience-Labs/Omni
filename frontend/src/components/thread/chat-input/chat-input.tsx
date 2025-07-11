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
import { Settings2, Sparkles, Brain, ChevronRight, Zap, Workflow, Database, Wrench } from 'lucide-react';
import { FaGoogle, FaDiscord } from 'react-icons/fa';
import { SiNotion } from 'react-icons/si';
import { AgentConfigModal } from '@/components/agents/agent-config-modal';

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
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [configModalTab, setConfigModalTab] = useState('integrations');

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

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const hasLoadedFromLocalStorage = useRef(false);

    useImperativeHandle(ref, () => ({
      getPendingFiles: () => pendingFiles,
      clearPendingFiles: () => setPendingFiles([]),
    }));

    // Load saved agent from localStorage on mount
    useEffect(() => {
      if (typeof window !== 'undefined' && onAgentSelect && !hasLoadedFromLocalStorage.current) {
        // Don't load from localStorage if an agent is already selected
        // or if there are URL parameters that might be setting the agent
        const urlParams = new URLSearchParams(window.location.search);
        const hasAgentIdInUrl = urlParams.has('agent_id');
        
        if (!selectedAgentId && !hasAgentIdInUrl) {
          const savedAgentId = localStorage.getItem('lastSelectedAgentId');
          if (savedAgentId) {
            // Convert 'suna' back to undefined for the default agent
            const agentIdToSelect = savedAgentId === 'suna' ? undefined : savedAgentId;
            console.log('Loading saved agent from localStorage:', savedAgentId);
            onAgentSelect(agentIdToSelect);
          } else {
            console.log('No saved agent found in localStorage');
          }
        } else {
          console.log('Skipping localStorage load:', {
            hasSelectedAgent: !!selectedAgentId,
            hasAgentIdInUrl,
            selectedAgentId
          });
        }
        hasLoadedFromLocalStorage.current = true;
      }
    }, [onAgentSelect, selectedAgentId]); // Keep selectedAgentId to check current state

    // Save selected agent to localStorage whenever it changes
    useEffect(() => {
      if (typeof window !== 'undefined') {
        // Use 'suna' as a special key for the default agent (undefined)
        const keyToStore = selectedAgentId === undefined ? 'suna' : selectedAgentId;
        console.log('Saving selected agent to localStorage:', keyToStore);
        localStorage.setItem('lastSelectedAgentId', keyToStore);
      }
    }, [selectedAgentId]);

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
              <div className="w-full border-t border-border/30 bg-muted/20 px-4 py-1.5 rounded-b-3xl border-l border-r border-b border-border">
                <div className="flex items-center justify-center">
                  <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-none">
                    <button
                      onClick={() => {
                        setConfigModalTab('integrations');
                        setConfigModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-all duration-200 px-2.5 py-1.5 rounded-md hover:bg-muted/50 border border-transparent hover:border-border/30 flex-shrink-0"
                    >
                      <div className="flex items-center -space-x-0.5">
                        <div className="w-5 h-5 bg-white dark:bg-muted border border-border rounded-full flex items-center justify-center shadow-sm">
                          <FaGoogle className="w-3 h-3" />
                        </div>
                        <div className="w-5 h-5 bg-white dark:bg-muted border border-border rounded-full flex items-center justify-center shadow-sm">
                          <FaDiscord className="w-3 h-3" />
                        </div>
                        <div className="w-5 h-5 bg-white dark:bg-muted border border-border rounded-full flex items-center justify-center shadow-sm">
                          <SiNotion className="w-3 h-3" />
                        </div>
                      </div>
                      <span className="text-xs font-medium">Integrations</span>
                    </button>
                    
                    <div className="w-px h-4 bg-border/60" />
                    
                    <button
                      onClick={() => {
                        setConfigModalTab('instructions');
                        setConfigModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-all duration-200 px-2.5 py-1.5 rounded-md hover:bg-muted/50 border border-transparent hover:border-border/30 flex-shrink-0"
                    >
                      <Brain className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="text-xs font-medium">Instructions</span>
                    </button>
                    
                    <div className="w-px h-4 bg-border/60" />
                    
                    <button
                      onClick={() => {
                        setConfigModalTab('knowledge');
                        setConfigModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-all duration-200 px-2.5 py-1.5 rounded-md hover:bg-muted/50 border border-transparent hover:border-border/30 flex-shrink-0"
                    >
                      <Database className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="text-xs font-medium">Knowledge</span>
                    </button>
                    
                    <div className="w-px h-4 bg-border/60" />
                    
                    <button
                      onClick={() => {
                        setConfigModalTab('triggers');
                        setConfigModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-all duration-200 px-2.5 py-1.5 rounded-md hover:bg-muted/50 border border-transparent hover:border-border/30 flex-shrink-0"
                    >
                      <Zap className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="text-xs font-medium">Triggers</span>
                    </button>
                    
                    <div className="w-px h-4 bg-border/60" />
                    
                    <button
                      onClick={() => {
                        setConfigModalTab('workflows');
                        setConfigModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-all duration-200 px-2.5 py-1.5 rounded-md hover:bg-muted/50 border border-transparent hover:border-border/30 flex-shrink-0"
                    >
                      <Workflow className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="text-xs font-medium">Workflows</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
        <AgentConfigModal
          isOpen={configModalOpen}
          onOpenChange={setConfigModalOpen}
          selectedAgentId={selectedAgentId}
          onAgentSelect={onAgentSelect}
          initialTab={configModalTab}
        />
      </div>
    );
  },
);

ChatInput.displayName = 'ChatInput';