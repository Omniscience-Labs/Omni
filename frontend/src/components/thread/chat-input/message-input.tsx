'use client';

import React, { forwardRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Square, Loader2, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UploadedFile } from './chat-input';

interface MessageInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  placeholder: string;
  loading: boolean;
  disabled: boolean;
  isAgentRunning: boolean;
  onStopAgent?: () => void;
  isDraggingOver: boolean;
  uploadedFiles: UploadedFile[];
}

export const MessageInput = forwardRef<HTMLTextAreaElement, MessageInputProps>(
  (
    {
      value,
      onChange,
      onSubmit,
      placeholder,
      loading,
      disabled,
      isAgentRunning,
      onStopAgent,
      isDraggingOver,
      uploadedFiles,
    },
    ref,
  ) => {
    useEffect(() => {
      const textarea = ref as React.RefObject<HTMLTextAreaElement>;
      if (!textarea.current) return;

      const adjustHeight = () => {
        textarea.current!.style.height = 'auto';
        const newHeight = Math.min(
          Math.max(textarea.current!.scrollHeight, 24),
          200,
        );
        textarea.current!.style.height = `${newHeight}px`;
      };

      adjustHeight();

      // Call it twice to ensure proper height calculation
      adjustHeight();

      window.addEventListener('resize', adjustHeight);
      return () => window.removeEventListener('resize', adjustHeight);
    }, [value, ref]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (
          (value.trim() || uploadedFiles.length > 0) &&
          !loading &&
          (!disabled || isAgentRunning)
        ) {
          onSubmit(e as unknown as React.FormEvent);
        }
      }
    };

    return (
      <div className="flex gap-2 px-2">
        <Textarea
          ref={ref}
          value={value}
          onChange={onChange}
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
          onClick={isAgentRunning && onStopAgent ? onStopAgent : onSubmit}
          size="icon"
          className={cn(
            'flex-shrink-0 self-end',
            isAgentRunning ? 'bg-red-500 hover:bg-red-600' : '',
            (!value.trim() && uploadedFiles.length === 0 && !isAgentRunning) ||
              loading ||
              (disabled && !isAgentRunning)
              ? 'opacity-50'
              : '',
          )}
          disabled={
            (!value.trim() && uploadedFiles.length === 0 && !isAgentRunning) ||
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
    );
  },
);

MessageInput.displayName = 'MessageInput';
