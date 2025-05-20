import React, { useMemo } from 'react';
import {
  Globe,
  MonitorPlay,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  CircleDashed,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react';
import { ToolViewProps } from './types';
import {
  extractBrowserUrl,
  extractBrowserOperation,
  formatTimestamp,
  getToolTitle,
} from './utils';
import { ApiMessageType } from '@/components/thread/types';
import { safeJsonParse } from '@/components/thread/utils';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function BrowserToolView({
  name = 'browser-operation',
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
  project,
  agentStatus = 'idle',
  messages = [],
  currentIndex = 0,
  totalCalls = 1,
}: ToolViewProps) {
  const url = extractBrowserUrl(assistantContent);
  const operation = extractBrowserOperation(name);
  const toolTitle = getToolTitle(name);

  // --- message_id Extraction Logic ---
  let browserStateMessageId: string | undefined;

  try {
    // 1. Parse the top-level JSON
    const topLevelParsed = safeJsonParse<{ content?: string }>(toolContent, {});
    const innerContentString = topLevelParsed?.content;

    if (innerContentString && typeof innerContentString === 'string') {
      // 2. Extract the output='...' string using regex
      const outputMatch = innerContentString.match(/\boutput='(.*?)'(?=\s*\))/);
      const outputString = outputMatch ? outputMatch[1] : null;

      if (outputString) {
        // 3. Unescape the JSON string (basic unescaping for \n and \")
        const unescapedOutput = outputString
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"');

        // 4. Parse the unescaped JSON to get message_id
        const finalParsedOutput = safeJsonParse<{ message_id?: string }>(
          unescapedOutput,
          {},
        );
        browserStateMessageId = finalParsedOutput?.message_id;
      }
    }
  } catch (error) {
    console.error(
      '[BrowserToolView] Error parsing tool content for message_id:',
      error,
    );
  }

  // Find the browser_state message and extract the screenshot
  let screenshotBase64: string | null = null;
  if (browserStateMessageId && messages.length > 0) {
    const browserStateMessage = messages.find(
      (msg) =>
        (msg.type as string) === 'browser_state' &&
        msg.message_id === browserStateMessageId,
    );

    if (browserStateMessage) {
      const browserStateContent = safeJsonParse<{ screenshot_base64?: string }>(
        browserStateMessage.content,
        {},
      );
      screenshotBase64 = browserStateContent?.screenshot_base64 || null;
    }
  }

  // Check if we have a VNC preview URL from the project
  const vncPreviewUrl = project?.sandbox?.vnc_preview
    ? `${project.sandbox.vnc_preview}/vnc_lite.html?password=${project?.sandbox?.pass}&autoconnect=true&scale=local&width=1024&height=768`
    : undefined;

  const isRunning = isStreaming || agentStatus === 'running';
  const isLastToolCall = currentIndex === totalCalls - 1;

  // Memoize the VNC iframe to prevent reconnections on re-renders
  const vncIframe = useMemo(() => {
    if (!vncPreviewUrl) return null;

    console.log(
      '[BrowserToolView] Creating memoized VNC iframe with URL:',
      vncPreviewUrl,
    );

    return (
      <iframe
        src={vncPreviewUrl}
        title="Browser preview"
        className="w-full h-full border-0 min-h-[600px]"
        style={{ width: '100%', height: '100%', minHeight: '600px' }}
      />
    );
  }, [vncPreviewUrl]); // Only recreate if the URL changes

  // Progress for loading state - only for visual feedback
  const [progress, setProgress] = React.useState(100);

  // Simulate progress when running
  React.useEffect(() => {
    if (isRunning) {
      setProgress(0);
      const timer = setInterval(() => {
        setProgress((prevProgress) => {
          if (prevProgress >= 95) {
            clearInterval(timer);
            return prevProgress;
          }
          return prevProgress + 2;
        });
      }, 500);
      return () => clearInterval(timer);
    } else {
      setProgress(100);
    }
  }, [isRunning]);

  return (
    <Card className="gap-0 flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-white dark:bg-zinc-950">
      <CardHeader className="h-13 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-b from-purple-100 to-purple-50 shadow-inner dark:from-purple-800/40 dark:to-purple-900/60 dark:shadow-purple-950/20">
              <MonitorPlay className="h-5 w-5 text-purple-500 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                {toolTitle}
              </CardTitle>
            </div>
          </div>
          
          {!isRunning && (
            <Badge 
              variant="secondary" 
              className={
                isSuccess 
                  ? "bg-gradient-to-b from-emerald-200 to-emerald-100 text-emerald-700 dark:from-emerald-800/50 dark:to-emerald-900/60 dark:text-emerald-300" 
                  : "bg-gradient-to-b from-rose-200 to-rose-100 text-rose-700 dark:from-rose-800/50 dark:to-rose-900/60 dark:text-rose-300"
              }
            >
              {isSuccess ? (
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              )}
              {isSuccess ? 'Browser action completed' : 'Browser action failed'}
            </Badge>
          )}

          {isRunning && (
            <Badge className="bg-gradient-to-b from-blue-200 to-blue-100 text-blue-700 dark:from-blue-800/50 dark:to-blue-900/60 dark:text-blue-300">
              <CircleDashed className="h-3.5 w-3.5 mr-1 animate-spin" />
              Executing browser action
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 overflow-hidden relative" style={{ height: 'calc(100vh - 150px)', minHeight: '600px' }}>
        {/* Browser View Logic - Preserving the core functionality */}
        <div className="flex-1 flex h-full items-stretch bg-black">
          {isLastToolCall ? (
            // Only show live sandbox or fallback to screenshot for the last tool call
            isRunning && vncIframe ? (
              <div className="flex flex-col items-center justify-center w-full h-full min-h-[600px]" style={{ minHeight: '600px' }}>
                <div className="relative w-full h-full min-h-[600px]" style={{ minHeight: '600px' }}>
                  {vncIframe}
                  <div className="absolute top-4 right-4 z-10">
                    <Badge className="bg-blue-500/90 text-white border-none shadow-lg animate-pulse">
                      <CircleDashed className="h-3 w-3 mr-1.5 animate-spin" />
                      {operation} in progress
                    </Badge>
                  </div>
                </div>
              </div>
            ) : screenshotBase64 ? (
              <div className="flex items-center justify-center w-full h-full min-h-[600px]" style={{ minHeight: '600px' }}>
                <img
                  src={`data:image/jpeg;base64,${screenshotBase64}`}
                  alt="Browser Screenshot"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            ) : vncIframe ? (
              // Use the memoized iframe
              <div className="flex flex-col items-center justify-center w-full h-full min-h-[600px]" style={{ minHeight: '600px' }}>
                {vncIframe}
              </div>
            ) : (
              <div className="p-8 flex flex-col items-center justify-center w-full bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900 text-zinc-700 dark:text-zinc-400">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 bg-gradient-to-b from-purple-100 to-purple-50 shadow-inner dark:from-purple-800/40 dark:to-purple-900/60">
                  <MonitorPlay className="h-10 w-10 text-purple-400 dark:text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
                  Browser preview not available
                </h3>
                {url && (
                  <div className="mt-4">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 shadow-sm hover:shadow-md transition-shadow"
                      asChild
                    >
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-2" />
                        Visit URL
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            )
          ) : // For non-last tool calls, only show screenshot if available, otherwise show "No Browser State"
          screenshotBase64 ? (
            <div className="flex items-center justify-center w-full h-full max-h-[650px] overflow-auto">
              <img
                src={`data:image/jpeg;base64,${screenshotBase64}`}
                alt="Browser Screenshot"
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : (
            <div className="p-8 h-full flex flex-col items-center justify-center w-full bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900 text-zinc-700 dark:text-zinc-400">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 bg-gradient-to-b from-zinc-100 to-zinc-50 shadow-inner dark:from-zinc-800/40 dark:to-zinc-900/60">
                <MonitorPlay className="h-10 w-10 text-zinc-400 dark:text-zinc-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
                No Browser State Available
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Browser state image not found for this action
              </p>
            </div>
          )}
        </div>
      </CardContent>

      {/* Footer */}
      <div className="px-4 py-2 h-10 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center gap-4">
        <div className="h-full flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          {!isRunning && (
            <Badge className="h-6 py-0.5">
              <Globe className="h-3 w-3" />
              {operation}
            </Badge>
          )}
          {url && (
            <span className="text-xs truncate max-w-[200px] hidden sm:inline-block">
              {url}
            </span>
          )}
        </div>
        
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {toolTimestamp && !isRunning
            ? formatTimestamp(toolTimestamp)
            : assistantTimestamp
              ? formatTimestamp(assistantTimestamp)
              : ''}
        </div>
      </div>
    </Card>
  );
}