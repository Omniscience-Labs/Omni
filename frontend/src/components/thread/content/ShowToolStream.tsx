import React, { useEffect, useRef, useState } from 'react';
import { CircleDashed } from 'lucide-react';
import { extractToolNameFromStream } from '@/components/thread/tool-views/xml-parser';
import { getToolIcon, getUserFriendlyToolName, extractPrimaryParam } from '@/components/thread/utils';

// Only show streaming for file operation tools
const FILE_OPERATION_TOOLS = new Set([
    'Create File',
    'Delete File',
    'Full File Rewrite',
    'Read File',
]);

interface ShowToolStreamProps {
    content: string;
    messageId?: string | null;
    onToolClick?: (messageId: string | null, toolName: string) => void;
    showExpanded?: boolean; // Whether to show expanded streaming view
    startTime?: number; // When the tool started running
}

export const ShowToolStream: React.FC<ShowToolStreamProps> = ({
    content,
    messageId,
    onToolClick,
    showExpanded = false,
    startTime
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [shouldShowContent, setShouldShowContent] = useState(false);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
    // Use ref to store stable start time - only set once!
    const stableStartTimeRef = useRef<number | null>(null);

    // Set stable start time only once
    if (showExpanded && !stableStartTimeRef.current) {
        stableStartTimeRef.current = Date.now();
    }

    const toolName = extractToolNameFromStream(content);

    // Time-based logic - show streaming content after 1500ms
    useEffect(() => {
        const effectiveStartTime = stableStartTimeRef.current;

        // Only show expanded content for file operation tools
        if (!effectiveStartTime || !showExpanded || !FILE_OPERATION_TOOLS.has(toolName || '')) {
            setShouldShowContent(false);
            return;
        }

        const elapsed = Date.now() - effectiveStartTime;
        if (elapsed >= 2000) {
            setShouldShowContent(true);
        } else {
            const delay = 2000 - elapsed;
            const timer = setTimeout(() => {
                setShouldShowContent(true);
            }, delay);

            return () => {
                clearTimeout(timer);
            };
        }
    }, [showExpanded, toolName]);

    useEffect(() => {
        if (containerRef.current && shouldShowContent && shouldAutoScroll) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [content, shouldShowContent, shouldAutoScroll]);

    // Handle scroll events to disable auto-scroll when user scrolls up
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5;
            setShouldAutoScroll(isAtBottom);
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [shouldShowContent]);

    if (!toolName) {
        return null;
    }

    // Check if this is a file operation tool
    const isFileOperationTool = FILE_OPERATION_TOOLS.has(toolName);

    const IconComponent = getToolIcon(toolName);
    const displayName = getUserFriendlyToolName(toolName);
    const paramDisplay = extractPrimaryParam(toolName, content);

    // Always show tool button, conditionally show content below for file operations only
    if (showExpanded && isFileOperationTool) {
        return (
            <div className="my-1">
                {shouldShowContent ? (
                    // Expanded view with content - show after 1500ms for file operations
                    <div className={`border border-neutral-200 dark:border-neutral-700/50 rounded-2xl overflow-hidden transition-all duration-500 ease-in-out ${shouldShowContent ? 'bg-zinc-100 dark:bg-neutral-900' : 'bg-muted'
                        }`}>
                        {/* Tool name header */}
                        <button
                            onClick={() => onToolClick?.(messageId, toolName)}
                            className={`w-full flex items-center gap-1.5 py-1 px-2 text-xs text-muted-foreground hover:bg-muted/80 transition-all duration-500 ease-in-out cursor-pointer bg-muted`}
                        >
                            <div className=' flex items-center justify-center p-1 rounded-sm'>
                                <CircleDashed className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 animate-spin animation-duration-2000" />
                            </div>
                            <span className="font-mono text-xs text-foreground">{displayName}</span>
                            {paramDisplay && <span className="ml-1 text-muted-foreground truncate max-w-[200px]" title={paramDisplay}>{paramDisplay}</span>}
                        </button>

                        {/* Streaming content below - only for file operations */}
                        <div className="relative border-t border-neutral-200 dark:border-neutral-700/50">
                            <div
                                ref={containerRef}
                                className="max-h-[300px] overflow-y-auto scrollbar-none text-xs font-mono whitespace-pre-wrap p-3 text-foreground transition-all duration-500 ease-in-out"
                                style={{
                                    maskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)',
                                    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)'
                                }}
                            >
                                {content}
                            </div>
                            {/* Top gradient */}
                            <div className={`absolute top-0 left-0 right-0 h-8 pointer-events-none transition-all duration-500 ease-in-out ${shouldShowContent
                                ? 'bg-gradient-to-b from-zinc-100 dark:from-neutral-900 via-zinc-100/80 dark:via-neutral-900/80 to-transparent'
                                : 'bg-gradient-to-b from-muted via-muted/80 to-transparent'
                                }`} />
                            {/* Bottom gradient */}
                            <div className={`absolute bottom-0 left-0 right-0 h-8 pointer-events-none transition-all duration-500 ease-in-out ${shouldShowContent
                                ? 'bg-gradient-to-t from-zinc-100 dark:from-neutral-900 via-zinc-100/80 dark:via-neutral-900/80 to-transparent'
                                : 'bg-gradient-to-t from-muted via-muted/80 to-transparent'
                                }`} />
                        </div>
                    </div>
                ) : (
                    // Just tool button with shimmer (first 1500ms)
                    <button
                        onClick={() => onToolClick?.(messageId, toolName)}
                        className="animate-shimmer inline-flex items-center gap-1.5 py-1 px-1 pr-1.5 text-xs text-muted-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors cursor-pointer border border-neutral-200 dark:border-neutral-700/50"
                    >
                        <div className='border-2 bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 flex items-center justify-center p-0.5 rounded-sm border-neutral-400/20 dark:border-neutral-600'>
                            <CircleDashed className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 animate-spin animation-duration-2000" />
                        </div>
                        <span className="font-mono text-xs text-foreground">{displayName}</span>
                        {paramDisplay && <span className="ml-1 text-muted-foreground truncate max-w-[200px]" title={paramDisplay}>{paramDisplay}</span>}
                    </button>
                )}
            </div>
        );
    }

    // Show normal tool button (non-file-operation tools or non-expanded case)
    return (
        <div className="my-1">
            <button
                onClick={() => onToolClick?.(messageId, toolName)}
                className="animate-shimmer inline-flex items-center gap-1.5 py-1 px-1 pr-1.5 text-xs text-muted-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors cursor-pointer border border-neutral-200 dark:border-neutral-700/50"
            >
                <div className='border-2 bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 flex items-center justify-center p-0.5 rounded-sm border-neutral-400/20 dark:border-neutral-600'>
                    <CircleDashed className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 animate-spin animation-duration-2000" />
                </div>
                <span className="font-mono text-xs text-foreground">{displayName}</span>
                {paramDisplay && <span className="ml-1 text-muted-foreground truncate max-w-[200px]" title={paramDisplay}>{paramDisplay}</span>}
            </button>
        </div>
    );
}; 