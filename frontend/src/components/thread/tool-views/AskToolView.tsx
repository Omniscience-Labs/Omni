import React, { useState, useEffect } from 'react';
import {
  MessageCircleQuestion,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Clock,
  MessageSquare,
  Paperclip,
  ExternalLink,
} from 'lucide-react';
import { ToolViewProps } from './types';
import {
  formatTimestamp,
  getToolTitle,
  normalizeContentToString,
  getFileIconAndColor,
} from './utils';
import { cn, truncateString } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from "@/components/ui/scroll-area";

interface AskContent {
  attachments?: string[];
}

interface AskToolViewProps extends ToolViewProps {
  onFileClick?: (filePath: string) => void;
}

export function AskToolView({
  name = 'ask',
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
  onFileClick,
}: AskToolViewProps) {
  const [askData, setAskData] = useState<AskContent>({});

  // Extract attachments from assistant content
  useEffect(() => {
    if (assistantContent) {
      try {
        const contentStr = normalizeContentToString(assistantContent);
        
        // Extract attachments if present
        const attachmentsMatch = contentStr.match(/attachments=["']([^"']*)["']/i);
        if (attachmentsMatch) {
          const attachments = attachmentsMatch[1].split(',').map(a => a.trim()).filter(a => a.length > 0);
          setAskData(prev => ({ ...prev, attachments }));
        }
      } catch (e) {
        console.error('Error parsing ask content:', e);
      }
    }
  }, [assistantContent]);

  const toolTitle = getToolTitle(name) || 'Ask User';

  const handleFileClick = (filePath: string) => {
    if (onFileClick) {
      onFileClick(filePath);
    }
  };

  return (
    <Card className="gap-0 flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-white dark:bg-zinc-950">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20">
              <MessageCircleQuestion className="w-5 h-5 text-blue-500 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                {toolTitle}
              </CardTitle>
            </div>
          </div>
          
          {!isStreaming && (
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
              {isSuccess ? 'Success' : 'Failed'}
            </Badge>
          )}

          {isStreaming && (
            <Badge className="bg-gradient-to-b from-blue-200 to-blue-100 text-blue-700 dark:from-blue-800/50 dark:to-blue-900/60 dark:text-blue-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              Asking user
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 overflow-hidden relative">
        <ScrollArea className="h-full w-full">
          <div className="p-4 space-y-6">
            {askData.attachments && askData.attachments.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Paperclip className="h-4 w-4" />
                  Files ({askData.attachments.length})
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {askData.attachments.map((attachment, index) => {
                    const { icon: FileIcon, color, bgColor } = getFileIconAndColor(attachment);
                    const fileName = attachment.split('/').pop() || attachment;
                    const filePath = attachment.includes('/') ? attachment.substring(0, attachment.lastIndexOf('/')) : '';
                    
                    return (
                      <button
                        key={index}
                        onClick={() => handleFileClick(attachment)}
                        className="flex flex-col items-center justify-center gap-3 p-3 h-[15rem] w-full bg-muted/30 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors group cursor-pointer text-left"
                      >
                        <div className="flex-shrink-0">
                          <div className={cn(
                            "w-20 h-20 rounded-lg bg-gradient-to-br flex items-center justify-center",
                            bgColor
                          )}>
                            <FileIcon className={cn("h-10 w-10", color)} />
                          </div>
                        </div>
                        <div className="flex flex-col items-center gap-2 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {truncateString(fileName, 30)}
                          </p>
                          {filePath && (
                            <p className="text-xs text-muted-foreground truncate">
                              {filePath}
                            </p>
                          )}
                          <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ExternalLink className="h-4 w-4 text-muted-foreground" />
                            </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                
                {assistantTimestamp && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatTimestamp(assistantTimestamp)}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <MessageSquare className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Question Asked
                </h3>
                <p className="text-sm text-muted-foreground">
                  No files attached to this question
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      <div className="px-4 py-2 h-10 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center gap-4">
        <div className="h-full flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Badge className="h-6 py-0.5" variant="outline">
            <MessageCircleQuestion className="h-3 w-3" />
            User Interaction
          </Badge>
        </div>
        
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {assistantTimestamp ? formatTimestamp(assistantTimestamp) : ''}
        </div>
      </div>
    </Card>
  );
} 