'use client';

import { Project } from '@/lib/api';
import { getToolIcon } from '@/components/thread/utils';
import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiMessageType } from '@/components/thread/types';
import { CircleDashed, X, ChevronLeft, ChevronRight, Computer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { ToolView } from './tool-views/wrapper';

export interface ToolCallInput {
  assistantCall: {
    content?: string;
    name?: string;
    timestamp?: string;
  };
  toolResult?: {
    content?: string;
    isSuccess?: boolean;
    timestamp?: string;
  };
  messages?: ApiMessageType[];
}

interface ToolCallSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  toolCalls: ToolCallInput[];
  currentIndex: number;
  onNavigate: (newIndex: number) => void;
  messages?: ApiMessageType[];
  agentStatus: string;
  project?: Project;
  renderAssistantMessage?: (
    assistantContent?: string,
    toolContent?: string,
  ) => React.ReactNode;
  renderToolResult?: (
    toolContent?: string,
    isSuccess?: boolean,
  ) => React.ReactNode;
  isLoading?: boolean;
}

export function ToolCallSidePanel({
  isOpen,
  onClose,
  toolCalls,
  currentIndex,
  onNavigate,
  messages,
  agentStatus,
  project,
  isLoading = false,
}: ToolCallSidePanelProps) {
  // Move hooks outside of conditional
  const [dots, setDots] = React.useState('');
  const currentToolCall = toolCalls[currentIndex];
  const totalCalls = toolCalls.length;
  const currentToolName = currentToolCall?.assistantCall?.name || 'Tool Call';
  const CurrentToolIcon = getToolIcon(
    currentToolName === 'Tool Call' ? 'unknown' : currentToolName,
  );
  const isStreaming = currentToolCall?.toolResult?.content === 'STREAMING';
  const isSuccess = currentToolCall?.toolResult?.isSuccess ?? true;
  const isMobile = useIsMobile();

  // Add keyboard shortcut for CMD+I to close panel
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'i') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Listen for sidebar toggle events
  React.useEffect(() => {
    if (!isOpen) return;

    const handleSidebarToggle = (event: CustomEvent) => {
      if (event.detail.expanded) {
        onClose();
      }
    };

    window.addEventListener(
      'sidebar-left-toggled',
      handleSidebarToggle as EventListener,
    );
    return () =>
      window.removeEventListener(
        'sidebar-left-toggled',
        handleSidebarToggle as EventListener,
      );
  }, [isOpen, onClose]);

  React.useEffect(() => {
    if (!isStreaming) return;

    // Create a loading animation with dots
    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isStreaming]);

  // Handle navigation with safety checks
  const navigateToPrevious = React.useCallback(() => {
    if (currentIndex > 0) {
      onNavigate(currentIndex - 1);
    }
  }, [currentIndex, onNavigate]);

  const navigateToNext = React.useCallback(() => {
    if (currentIndex < totalCalls - 1) {
      onNavigate(currentIndex + 1);
    }
  }, [currentIndex, totalCalls, onNavigate]);

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div
        className={cn(
          'fixed inset-y-0 right-0 border-l flex flex-col z-30 h-screen transition-all duration-200 ease-in-out',
          isMobile
            ? 'w-full'
            : 'w-[90%] sm:w-[450px] md:w-[500px] lg:w-[550px] xl:w-[650px]',
          !isOpen && 'translate-x-full',
        )}
      >
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          <div className="flex flex-col h-full">
            <div className="pt-4 pl-4 pr-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Computer className="h-4 w-4" />
                  <h2 className="text-md font-medium text-zinc-900 dark:text-zinc-100">
                    Suna's Computer
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 p-4 overflow-auto">
              <div className="space-y-4">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-20 w-full rounded-md" />
                <Skeleton className="h-40 w-full rounded-md" />
                <Skeleton className="h-20 w-full rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (!currentToolCall) {
      return (
        <div className="flex flex-col h-full">
          <div className="pt-4 pl-4 pr-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Computer className="h-4 w-4" />
                <h2 className="text-md font-medium text-zinc-900 dark:text-zinc-100">
                  Suna's Computer
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-center flex-1 p-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
              No tool call details available.
            </p>
          </div>
        </div>
      );
    }

    const toolView = (
      <ToolView
        name={currentToolCall.assistantCall.name}
        assistantContent={currentToolCall.assistantCall.content}
        toolContent={currentToolCall.toolResult?.content}
        assistantTimestamp={currentToolCall.assistantCall.timestamp}
        toolTimestamp={currentToolCall.toolResult?.timestamp}
        isSuccess={isStreaming ? true : (currentToolCall.toolResult?.isSuccess ?? true)}
        isStreaming={isStreaming}
        project={project}
        messages={messages}
        agentStatus={agentStatus}
        currentIndex={currentIndex}
        totalCalls={totalCalls}
      />
    );

    return (
      <div className="flex flex-col h-full">
        <div className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Computer className="h-4 w-4" />
              <h2 className="text-md font-medium text-zinc-900 dark:text-zinc-100">
                Suna's Computer
              </h2>
            </div>

            {currentToolCall.toolResult?.content && !isStreaming && (
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <CurrentToolIcon className="h-3.5 w-3.5 text-zinc-800 dark:text-zinc-300" />
                </div>
                <span
                  className={cn(
                    'text-sm text-zinc-700 dark:text-zinc-300',
                    isMobile && 'hidden sm:inline',
                  )}
                >
                  {currentToolName}
                </span>
                <div
                  className={cn(
                    'px-2.5 py-0.5 rounded-full text-xs font-medium',
                    isSuccess
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                      : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
                  )}
                >
                  {isSuccess ? 'Success' : 'Failed'}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8 ml-1"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {isStreaming && (
              <div className="flex items-center gap-2">
                <div className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 flex items-center gap-1.5">
                  <CircleDashed className="h-3 w-3 animate-spin" />
                  <span>Running</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8 ml-1"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {!currentToolCall.toolResult?.content && !isStreaming && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent">
          {toolView}
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        'fixed inset-y-0 right-0 border-l flex flex-col z-30 h-screen transition-all duration-200 ease-in-out',
        isMobile
          ? 'w-full'
          : 'w-[40vw] sm:w-[450px] md:w-[500px] lg:w-[550px] xl:w-[650px]',
        !isOpen && 'translate-x-full',
      )}
    >
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        {renderContent()}
      </div>

      {/* Navigation controls */}
      {totalCalls > 1 && (
        <div
          className={cn(
            'border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900',
            isMobile ? 'p-3' : 'p-4 space-y-2',
          )}
        >
          {!isMobile && (
            <div className="flex justify-between items-center gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-5 w-5 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <CurrentToolIcon className="h-3 w-3 text-zinc-800 dark:text-zinc-300" />
                </div>
                <span
                  className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate"
                  title={currentToolName}
                >
                  {currentToolName} {isStreaming && `(Running${dots})`}
                </span>
              </div>

              <span className="text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                Step {currentIndex + 1} of {totalCalls}
              </span>
            </div>
          )}

          {isMobile ? (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={navigateToPrevious}
                disabled={currentIndex <= 0}
                className="h-9 px-3"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                <span>Previous</span>
              </Button>

              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {currentIndex + 1} / {totalCalls}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={navigateToNext}
                disabled={currentIndex >= totalCalls - 1}
                className="h-9 px-3"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigateToPrevious}
                  disabled={currentIndex <= 0}
                  className="h-6 w-6 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigateToNext}
                  disabled={currentIndex >= totalCalls - 1}
                  className="h-6 w-6 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Slider
                min={0}
                max={totalCalls - 1}
                step={1}
                value={[currentIndex]}
                onValueChange={([newValue]) => onNavigate(newValue)}
                className="w-full [&>span:first-child]:h-1 [&>span:first-child]:bg-zinc-200 dark:[&>span:first-child]:bg-zinc-800 [&>span:first-child>span]:bg-zinc-500 dark:[&>span:first-child>span]:bg-zinc-400 [&>span:first-child>span]:h-1"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
