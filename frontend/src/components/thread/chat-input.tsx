'use client';

import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Send,
  Square,
  Loader2,
  X,
  Paperclip,
  Settings,
  ChevronDown,
  AlertTriangle,
  Info,
  ArrowUp,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Define API_URL
const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

// Local storage keys
const STORAGE_KEY_MODEL = 'suna-preferred-model';
const DEFAULT_MODEL_ID = 'deepseek'; // Define default model ID

interface ChatInputProps {
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

interface UploadedFile {
  name: string;
  path: string;
  size: number;
}

// Define interface for the ref
export interface ChatInputHandles {
  getPendingFiles: () => File[];
  clearPendingFiles: () => void;
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
    const [showInfo, setShowInfo] = useState(true);

    // Define model options array earlier so it can be used in useEffect
    const modelOptions = [
      { id: 'sonnet-3.7', label: 'Sonnet 3.7' },
      { id: 'sonnet-3.7-thinking', label: 'Sonnet 3.7 (Thinking)' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'gemini-flash-2.5', label: 'Gemini Flash 2.5' },
    ];

    // Initialize state with the default model
    const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID);
    const [showModelDialog, setShowModelDialog] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    // Expose methods through the ref
    useImperativeHandle(ref, () => ({
      getPendingFiles: () => pendingFiles,
      clearPendingFiles: () => setPendingFiles([]),
    }));

    useEffect(() => {
      if (typeof window !== 'undefined') {
        try {
          const savedModel = localStorage.getItem(STORAGE_KEY_MODEL);
          // Check if the saved model exists and is one of the valid options
          if (
            savedModel &&
            modelOptions.some((option) => option.id === savedModel)
          ) {
            setSelectedModel(savedModel);
          } else if (savedModel) {
            // If invalid model found in storage, clear it
            localStorage.removeItem(STORAGE_KEY_MODEL);
            console.log(
              `Removed invalid model '${savedModel}' from localStorage. Using default: ${DEFAULT_MODEL_ID}`,
            );
          }
        } catch (error) {
          console.warn('Failed to load preferences from localStorage:', error);
        }
      }
    }, []);

    useEffect(() => {
      if (autoFocus && textareaRef.current) {
        textareaRef.current.focus();
      }
    }, [autoFocus]);

    useEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const adjustHeight = () => {
        textarea.style.height = 'auto';
        const newHeight = Math.min(Math.max(textarea.scrollHeight, 24), 200);
        textarea.style.height = `${newHeight}px`;
      };

      adjustHeight();

      adjustHeight();

      window.addEventListener('resize', adjustHeight);
      return () => window.removeEventListener('resize', adjustHeight);
    }, [value]);

    const handleModelChange = (value: string) => {
      setSelectedModel(value);

      // Save to localStorage
      try {
        localStorage.setItem(STORAGE_KEY_MODEL, value);
      } catch (error) {
        console.warn('Failed to save model preference to localStorage:', error);
      }
    };

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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (
          (value.trim() || uploadedFiles.length > 0) &&
          !loading &&
          (!disabled || isAgentRunning)
        ) {
          handleSubmit(e as React.FormEvent);
        }
      }
    };

    const handleFileUpload = () => {
      if (fileInputRef.current) {
        fileInputRef.current.click();
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

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

      const files = Array.from(e.dataTransfer.files);

      if (sandboxId) {
        // If we have a sandboxId, upload files directly
        await uploadFiles(files);
      } else {
        // Otherwise, store files locally
        handleLocalFiles(files);
      }
    };

    const processFileUpload = async (
      event: React.ChangeEvent<HTMLInputElement>,
    ) => {
      if (!event.target.files || event.target.files.length === 0) return;

      const files = Array.from(event.target.files);

      if (sandboxId) {
        // If we have a sandboxId, upload files directly
        await uploadFiles(files);
      } else {
        // Otherwise, store files locally
        handleLocalFiles(files);
      }

      event.target.value = '';
    };

    // New function to handle files locally when there's no sandboxId
    const handleLocalFiles = (files: File[]) => {
      const filteredFiles = files.filter((file) => {
        if (file.size > 50 * 1024 * 1024) {
          toast.error(`File size exceeds 50MB limit: ${file.name}`);
          return false;
        }
        return true;
      });

      // Store the files in pendingFiles state
      setPendingFiles((prevFiles) => [...prevFiles, ...filteredFiles]);

      // Also add to uploadedFiles for UI display
      const newUploadedFiles: UploadedFile[] = filteredFiles.map((file) => ({
        name: file.name,
        path: `/workspace/${file.name}`, // This is just for display purposes
        size: file.size,
      }));

      setUploadedFiles((prev) => [...prev, ...newUploadedFiles]);
      filteredFiles.forEach((file) => {
        toast.success(`File attached: ${file.name} (pending upload)`);
      });
    };

    const uploadFiles = async (files: File[]) => {
      try {
        setIsUploading(true);

        const newUploadedFiles: UploadedFile[] = [];

        for (const file of files) {
          if (file.size > 50 * 1024 * 1024) {
            toast.error(`File size exceeds 50MB limit: ${file.name}`);
            continue;
          }

          const formData = new FormData();
          formData.append('file', file);

          const uploadPath = `/workspace/${file.name}`;
          formData.append('path', uploadPath);

          const supabase = createClient();
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session?.access_token) {
            throw new Error('No access token available');
          }

          const response = await fetch(
            `${API_URL}/sandboxes/${sandboxId}/files`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
              body: formData,
            },
          );

          if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
          }

          newUploadedFiles.push({
            name: file.name,
            path: uploadPath,
            size: file.size,
          });

          toast.success(`File uploaded: ${file.name}`);
        }

        setUploadedFiles((prev) => [...prev, ...newUploadedFiles]);
      } catch (error) {
        console.error('File upload failed:', error);
        toast.error(
          typeof error === 'string'
            ? error
            : error instanceof Error
              ? error.message
              : 'Failed to upload file',
        );
      } finally {
        setIsUploading(false);
      }
    };

    const formatFileSize = (bytes: number): string => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const removeUploadedFile = (index: number) => {
      setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
      // Also remove from pendingFiles if needed
      if (!sandboxId && pendingFiles.length > index) {
        setPendingFiles((prev) => prev.filter((_, i) => i !== index));
      }
    };

    return (
      <div className="mx-auto w-full max-w-3xl px-4">
        <Card className="shadow-none w-full max-w-3xl mx-auto bg-transparent border-none rounded-xl overflow-hidden">
          <div className="w-full bg-muted/30 text-sm flex flex-col justify-between items-start rounded-lg border-b">
            <CardContent className="shadow w-full p-1.5 pb-2 pt-3 bg-background rounded-2xl border">
              <AnimatePresence>
                {uploadedFiles.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-2 overflow-hidden"
                  >
                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto px-3">
                      {uploadedFiles.map((file, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.15 }}
                          className={cn(
                            'px-2 py-1 bg-muted rounded-md flex items-center gap-1.5 group text-sm',
                            !sandboxId
                              ? 'border-blue-200 dark:border-blue-800'
                              : '',
                          )}
                        >
                          <span className="truncate max-w-[120px] text-gray-700 dark:text-gray-300">
                            {file.name}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                            ({formatFileSize(file.size)})
                            {!sandboxId && (
                              <span className="ml-1 text-blue-500">
                                (pending)
                              </span>
                            )}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 rounded-full p-0 hover:bg-gray-200 dark:hover:bg-gray-700"
                            onClick={() => removeUploadedFile(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex gap-2 px-2">
                <Textarea
                  ref={textareaRef}
                  value={value}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  className={cn(
                    'w-full bg-transparent dark:bg-transparent border-none shadow-none focus-visible:ring-0 px-2 py-1 text-base min-h-[40px] max-h-[200px] overflow-y-auto resize-none',
                    isDraggingOver ? 'opacity-40' : '',
                  )}
                  disabled={loading || (disabled && !isAgentRunning)}
                  rows={2}
                />
                <Button
                  type="submit"
                  onClick={isAgentRunning ? onStopAgent : handleSubmit}
                  size="icon"
                  className={cn(
                    'flex-shrink-0 self-end',
                    isAgentRunning ? 'bg-red-500 hover:bg-red-600' : '',
                    (!value.trim() &&
                      uploadedFiles.length === 0 &&
                      !isAgentRunning) ||
                      loading ||
                      (disabled && !isAgentRunning)
                      ? 'opacity-50'
                      : '',
                  )}
                  disabled={
                    (!value.trim() &&
                      uploadedFiles.length === 0 &&
                      !isAgentRunning) ||
                    loading ||
                    (disabled && !isAgentRunning)
                  }
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : isAgentRunning ? (
                    <Square className="h-5 w-5" />
                  ) : (
                    <ArrowUp className="h-5 w-5" />
                  )}
                </Button>
              </div>

              <div className="flex items-center justify-start mt-3 ml-3">
                <div className="flex items-center gap-3">
                  {!hideAttachments && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            onClick={handleFileUpload}
                            variant="ghost"
                            size="sm"
                            className="h-7 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                            disabled={
                              loading ||
                              (disabled && !isAgentRunning) ||
                              isUploading
                            }
                          >
                            {isUploading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Paperclip className="h-4 w-4" />
                            )}
                            <span className="text-xs">Attachments</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>Attach files</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            </CardContent>
          </div>
        </Card>

        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={processFileUpload}
          multiple
        />

        {isAgentRunning && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 w-full flex items-center justify-center"
          >
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Kortix Suna is working...</span>
            </div>
          </motion.div>
        )}

        {/* Model Selection Dialog */}
        <Dialog open={showModelDialog} onOpenChange={setShowModelDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm font-medium">
                Select Model
              </DialogTitle>
            </DialogHeader>
            <div className="p-4">
              <RadioGroup
                defaultValue={selectedModel}
                onValueChange={handleModelChange}
                className="grid gap-2"
              >
                {modelOptions.map((option) => (
                  <div
                    key={option.id}
                    className="flex items-center space-x-2 rounded-md px-3 py-2 cursor-pointer hover:bg-accent"
                  >
                    <RadioGroupItem value={option.id} id={option.id} />
                    <Label
                      htmlFor={option.id}
                      className="flex-1 cursor-pointer text-sm font-normal"
                    >
                      {option.label}
                    </Label>
                    {selectedModel === option.id && (
                      <span className="text-xs text-muted-foreground">
                        Active
                      </span>
                    )}
                  </div>
                ))}
              </RadioGroup>
            </div>
            <DialogFooter>
              <Button onClick={() => setShowModelDialog(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  },
);

// Set display name for the component
ChatInput.displayName = 'ChatInput';
