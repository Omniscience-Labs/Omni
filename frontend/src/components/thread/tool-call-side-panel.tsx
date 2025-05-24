'use client';

import { Project } from '@/lib/api';
import { getToolIcon } from '@/components/thread/utils';
import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiMessageType } from '@/components/thread/types';
import { CircleDashed, X, ChevronLeft, ChevronRight, Computer, Radio } from 'lucide-react';
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
  externalNavigateToIndex?: number;
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

interface ToolCallSnapshot {
  id: string;
  toolCall: ToolCallInput;
  index: number;
  timestamp: number;
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
  externalNavigateToIndex,
}: ToolCallSidePanelProps) {
  const [dots, setDots] = React.useState('');
  const [internalIndex, setInternalIndex] = React.useState(0);
  const [navigationMode, setNavigationMode] = React.useState<'live' | 'manual'>('live');
  const [toolCallSnapshots, setToolCallSnapshots] = React.useState<ToolCallSnapshot[]>([]);
  const [isInitialized, setIsInitialized] = React.useState(false);
  
  const isMobile = useIsMobile();

  React.useEffect(() => {
    const newSnapshots = toolCalls.map((toolCall, index) => ({
      id: `${index}-${toolCall.assistantCall.timestamp || Date.now()}`,
      toolCall,
      index,
      timestamp: Date.now(),
    }));
    
    const hadSnapshots = toolCallSnapshots.length > 0;
    const hasNewSnapshots = newSnapshots.length > toolCallSnapshots.length;
    setToolCallSnapshots(newSnapshots);
    
    if (!isInitialized && newSnapshots.length > 0) {
      setInternalIndex(Math.max(0, newSnapshots.length - 1));
      setIsInitialized(true);
    } else if (hasNewSnapshots && navigationMode === 'live') {
      setInternalIndex(newSnapshots.length - 1);
    } else if (hasNewSnapshots && navigationMode === 'manual') {
    }
  }, [toolCalls, navigationMode, toolCallSnapshots.length, isInitialized]);

  React.useEffect(() => {
    if (isOpen && !isInitialized && toolCallSnapshots.length > 0) {
      setInternalIndex(Math.min(currentIndex, toolCallSnapshots.length - 1));
    }
  }, [isOpen, currentIndex, isInitialized, toolCallSnapshots.length]);

  const currentSnapshot = toolCallSnapshots[internalIndex];
  const currentToolCall = currentSnapshot?.toolCall;
  const totalCalls = toolCallSnapshots.length;
  
  const currentToolName = currentToolCall?.assistantCall?.name || 'Tool Call';
  const CurrentToolIcon = getToolIcon(
    currentToolName === 'Tool Call' ? 'unknown' : currentToolName,
  );
  const isStreaming = currentToolCall?.toolResult?.content === 'STREAMING';
  const isSuccess = currentToolCall?.toolResult?.isSuccess ?? true;

  const internalNavigate = React.useCallback((newIndex: number, source: string = 'internal') => {
    if (newIndex < 0 || newIndex >= totalCalls) return;
    
    const isNavigatingToLatest = newIndex === totalCalls - 1;
    
    console.log(`[INTERNAL_NAV] ${source}: ${internalIndex} -> ${newIndex}, mode will be: ${isNavigatingToLatest ? 'live' : 'manual'}`);
    
    setInternalIndex(newIndex);
    
    if (isNavigatingToLatest) {
      setNavigationMode('live');
    } else {
      setNavigationMode('manual');
    }
    
    if (source === 'user_explicit') {
      onNavigate(newIndex);
    }
  }, [internalIndex, totalCalls, onNavigate]);

  const isLiveMode = navigationMode === 'live';
  const showJumpToLive = navigationMode === 'manual' && agentStatus === 'running';
  const showJumpToLatest = navigationMode === 'manual' && agentStatus !== 'running';

  const navigateToPrevious = React.useCallback(() => {
    if (internalIndex > 0) {
      internalNavigate(internalIndex - 1, 'user_explicit');
    }
  }, [internalIndex, internalNavigate]);
  
  const navigateToNext = React.useCallback(() => {
    if (internalIndex < totalCalls - 1) {
      internalNavigate(internalIndex + 1, 'user_explicit');
    }
  }, [internalIndex, totalCalls, internalNavigate]);

  const jumpToLive = React.useCallback(() => {
    setNavigationMode('live');
    internalNavigate(totalCalls - 1, 'user_explicit');
  }, [totalCalls, internalNavigate]);

  const jumpToLatest = React.useCallback(() => {
    setNavigationMode('manual');
    internalNavigate(totalCalls - 1, 'user_explicit');
  }, [totalCalls, internalNavigate]);

  const handleSliderChange = React.useCallback(([newValue]: [number]) => {
    internalNavigate(newValue, 'user_explicit');
  }, [internalNavigate]);

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
    if (externalNavigateToIndex !== undefined && externalNavigateToIndex >= 0 && externalNavigateToIndex < totalCalls) {
      internalNavigate(externalNavigateToIndex, 'external_click');
    }
  }, [externalNavigateToIndex, totalCalls, internalNavigate]);

  React.useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isStreaming]);

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
                <div className="ml-2 flex items-center gap-2">
                  <Computer className="h-4 w-4" />
                  <h2 className="text-md font-medium text-zinc-900 dark:text-zinc-100">
                    Computer View
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
              <div className="ml-2 flex items-center gap-2">
                <Computer className="h-4 w-4" />
                <h2 className="text-md font-medium text-zinc-900 dark:text-zinc-100">
                  Computer View
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
          <div className="flex flex-col items-center justify-center flex-1 p-8">
            <div className="flex flex-col items-center space-y-4 max-w-sm text-center">
              <div className="relative">
                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center">
                  <Computer className="h-8 w-8 text-zinc-400 dark:text-zinc-500" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-zinc-200 dark:bg-zinc-700 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-zinc-400 dark:text-zinc-500 rounded-full"></div>
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
                  No tool activity
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Tool calls and computer interactions will appear here when they're being executed.
                </p>
              </div>
            </div>
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
        currentIndex={internalIndex}
        totalCalls={totalCalls}
      />
    );

    return (
      <div className="flex flex-col h-full">
        <div className="p-3">
          <div className="flex items-center justify-between">
            <div className="ml-2 flex items-center gap-2">
              <Computer className="h-4 w-4" />
              <h2 className="text-md font-medium text-zinc-900 dark:text-zinc-100">
                Computer View
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

              <div className="flex items-center gap-2">
                {isLiveMode && agentStatus === 'running' ? (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">Live</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-neutral-50 dark:bg-neutral-900/20 border border-neutral-200 dark:border-neutral-800">
                    <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full"></div>
                    <span className="text-xs font-medium text-neutral-700 dark:text-neutral-400">Live</span>
                  </div>
                )}
                
                <span className="text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                  Step {internalIndex + 1} of {totalCalls}
                </span>
              </div>
            </div>
          )}

          {isMobile ? (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={navigateToPrevious}
                disabled={internalIndex <= 0}
                className="h-9 px-3"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                <span>Previous</span>
              </Button>

              <div className="flex items-center gap-2">
                {isLiveMode && agentStatus === 'running' ? (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">Live</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-neutral-50 dark:bg-neutral-900/20 border border-neutral-200 dark:border-neutral-800">
                    <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full"></div>
                    <span className="text-xs font-medium text-neutral-700 dark:text-neutral-400">Live</span>
                  </div>
                )}
                
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {internalIndex + 1} / {totalCalls}
                </span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={navigateToNext}
                disabled={internalIndex >= totalCalls - 1}
                className="h-9 px-3"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          ) : (
            <div className="relative flex items-center gap-1.5">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigateToPrevious}
                  disabled={internalIndex <= 0}
                  className="h-6 w-6 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigateToNext}
                  disabled={internalIndex >= totalCalls - 1}
                  className="h-6 w-6 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="relative w-full">
                <Slider
                  min={0}
                  max={totalCalls - 1}
                  step={1}
                  value={[internalIndex]}
                  onValueChange={handleSliderChange}
                  className="w-full [&>span:first-child]:h-1 [&>span:first-child]:bg-zinc-200 dark:[&>span:first-child]:bg-zinc-800 [&>span:first-child>span]:bg-zinc-500 dark:[&>span:first-child>span]:bg-zinc-400 [&>span:first-child>span]:h-1"
                />
                
                {showJumpToLive && (
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-12 z-50">
                    <div className="relative">
                      <Button
                        onClick={jumpToLive}
                        size="sm"
                        className="h-8 px-3 bg-red-500 hover:bg-red-600 text-white shadow-lg dark:border-red-400 flex items-center gap-1.5"
                      >
                        <Radio className="h-3 w-3" />
                        <span className="text-xs font-medium">Jump to Live</span>
                      </Button>
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-red-500"></div>
                    </div>
                  </div>
                )}
                {showJumpToLatest && (
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-12 z-50">
                    <div className="relative">
                      <Button
                        onClick={jumpToLatest}
                        size="sm"
                        className="h-8 px-3 shadow-lg flex items-center gap-1.5"
                      >
                        <span className="text-xs font-medium">Jump to Latest</span>
                      </Button>
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-primary"></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}