import React, { useState, useEffect } from 'react';
import {
  FileDiff,
  CheckCircle,
  AlertTriangle,
  CircleDashed,
  Loader2,
  File,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus
} from 'lucide-react';
import { ToolViewProps } from './types';
import {
  extractFilePath,
  extractStrReplaceContent,
  formatTimestamp,
  getToolTitle,
} from './utils';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Define types for diffing
type DiffType = 'unchanged' | 'added' | 'removed';

interface LineDiff {
  type: DiffType;
  oldLine: string | null;
  newLine: string | null;
  lineNumber: number;
}

interface CharDiffPart {
  text: string;
  type: DiffType;
}

interface DiffStats {
  additions: number;
  deletions: number;
}

// Component to display unified diff view
const UnifiedDiffView: React.FC<{ lineDiff: LineDiff[] }> = ({ lineDiff }) => (
  <div className="bg-white dark:bg-zinc-950 font-mono text-sm overflow-x-auto">
    <table className="w-full border-collapse">
      <tbody>
        {lineDiff.map((line, i) => (
          <tr 
            key={i} 
            className={cn(
              "hover:bg-zinc-50 dark:hover:bg-zinc-900",
              line.type === 'removed' && "bg-red-50 dark:bg-red-950/30",
              line.type === 'added' && "bg-emerald-50 dark:bg-emerald-950/30",
            )}
          >
            <td className="w-10 text-right select-none py-0.5 pr-1 pl-4 text-xs text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-800">
              {line.lineNumber}
            </td>
            <td className="pl-2 py-0.5 w-6 select-none">
              {line.type === 'removed' && <Minus className="h-3.5 w-3.5 text-red-500" />}
              {line.type === 'added' && <Plus className="h-3.5 w-3.5 text-emerald-500" />}
            </td>
            <td className="w-full px-3 py-0.5">
              <div className="overflow-x-auto max-w-full">
                {line.type === 'removed' && <span className="text-red-700 dark:text-red-400">{line.oldLine}</span>}
                {line.type === 'added' && <span className="text-emerald-700 dark:text-emerald-400">{line.newLine}</span>}
                {line.type === 'unchanged' && <span className="text-zinc-700 dark:text-zinc-300">{line.oldLine}</span>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Component to display split diff view
const SplitDiffView: React.FC<{ lineDiff: LineDiff[] }> = ({ lineDiff }) => (
  <div className="bg-white dark:bg-zinc-950 font-mono text-sm overflow-x-auto">
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs">
          <th className="p-2 text-left text-zinc-500 dark:text-zinc-400 w-1/2">Removed</th>
          <th className="p-2 text-left text-zinc-500 dark:text-zinc-400 w-1/2">Added</th>
        </tr>
      </thead>
      <tbody>
        {lineDiff.map((line, i) => (
          <tr key={i}>
            <td 
              className={cn(
                "p-2 align-top", 
                line.type === 'removed' ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400' : '',
                line.oldLine === null ? 'bg-zinc-100 dark:bg-zinc-900' : ''
              )}
            >
              {line.oldLine !== null ? (
                <div className="flex">
                  <div className="w-8 text-right pr-2 select-none text-xs text-zinc-500 dark:text-zinc-400">
                    {line.lineNumber}
                  </div>
                  {line.type === 'removed' && 
                    <Minus className="h-3.5 w-3.5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                  }
                  <div className="overflow-x-auto">
                    <span className="break-all">{line.oldLine}</span>
                  </div>
                </div>
              ) : null}
            </td>
            <td 
              className={cn(
                "p-2 align-top",
                line.type === 'added' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' : '',
                line.newLine === null ? 'bg-zinc-100 dark:bg-zinc-900' : ''
              )}
            >
              {line.newLine !== null ? (
                <div className="flex">
                  <div className="w-8 text-right pr-2 select-none text-xs text-zinc-500 dark:text-zinc-400">
                    {line.lineNumber}
                  </div>
                  {line.type === 'added' && 
                    <Plus className="h-3.5 w-3.5 text-emerald-500 mt-0.5 mr-2 flex-shrink-0" />
                  }
                  <div className="overflow-x-auto">
                    <span className="break-all">{line.newLine}</span>
                  </div>
                </div>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Loading state component
const LoadingState: React.FC<{ filePath: string | null; progress: number }> = ({ filePath, progress }) => (
  <div className="flex flex-col items-center justify-center h-full py-12 px-6 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
    <div className="text-center w-full max-w-xs">
      <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center bg-gradient-to-b from-purple-100 to-purple-50 shadow-inner dark:from-purple-800/40 dark:to-purple-900/60 dark:shadow-purple-950/20">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500 dark:text-purple-400" />
      </div>
      <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-2">
        Processing replacement
      </h3>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        <span className="font-mono text-xs break-all">Replacing text in {filePath || 'file'}</span>
      </p>
      <Progress value={progress} className="w-full h-2" />
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">{progress}%</p>
    </div>
  </div>
);

// Error state component
const ErrorState: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full py-12 px-6 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
    <div className="text-center w-full max-w-xs">
      <AlertTriangle className="h-16 w-16 mx-auto mb-6 text-amber-500" />
      <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-2">
        Invalid String Replacement
      </h3>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Could not extract the old string and new string from the request.
      </p>
    </div>
  </div>
);

// Main component
export function StrReplaceToolView({
  name = 'str-replace',
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps): JSX.Element {
  const [progress, setProgress] = useState<number>(0);
  const [expanded, setExpanded] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  
  const filePath = extractFilePath(assistantContent);
  const { oldStr, newStr } = extractStrReplaceContent(assistantContent);
  const toolTitle = getToolTitle(name);

  // Simulate progress when streaming
  useEffect(() => {
    if (isStreaming) {
      const timer = setInterval(() => {
        setProgress((prevProgress) => {
          if (prevProgress >= 95) {
            clearInterval(timer);
            return prevProgress;
          }
          return prevProgress + 5;
        });
      }, 300);
      return () => clearInterval(timer);
    } else {
      setProgress(100);
    }
  }, [isStreaming]);

  // Parse text for newlines
  const parseNewlines = (text: string): string => {
    return text.replace(/\\n/g, '\n');
  };

  // Perform line-by-line diff
  const generateLineDiff = (oldText: string, newText: string): LineDiff[] => {
    const parsedOldText = parseNewlines(oldText);
    const parsedNewText = parseNewlines(newText);
    
    const oldLines = parsedOldText.split('\n');
    const newLines = parsedNewText.split('\n');
    
    const diffLines: LineDiff[] = [];
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const oldLine = i < oldLines.length ? oldLines[i] : null;
      const newLine = i < newLines.length ? newLines[i] : null;
      
      if (oldLine === newLine) {
        diffLines.push({ type: 'unchanged', oldLine, newLine, lineNumber: i + 1 });
      } else {
        if (oldLine !== null) {
          diffLines.push({ type: 'removed', oldLine, newLine: null, lineNumber: i + 1 });
        }
        if (newLine !== null) {
          diffLines.push({ type: 'added', oldLine: null, newLine, lineNumber: i + 1 });
        }
      }
    }
    
    return diffLines;
  };

  // Character-level diff for more precise display
  const generateCharDiff = (oldText: string, newText: string): CharDiffPart[] => {
    const parsedOldText = parseNewlines(oldText);
    const parsedNewText = parseNewlines(newText);
    
    // Find common prefix length
    let prefixLength = 0;
    while (
      prefixLength < parsedOldText.length &&
      prefixLength < parsedNewText.length &&
      parsedOldText[prefixLength] === parsedNewText[prefixLength]
    ) {
      prefixLength++;
    }

    let oldSuffixStart = parsedOldText.length;
    let newSuffixStart = parsedNewText.length;
    while (
      oldSuffixStart > prefixLength &&
      newSuffixStart > prefixLength &&
      parsedOldText[oldSuffixStart - 1] === parsedNewText[newSuffixStart - 1]
    ) {
      oldSuffixStart--;
      newSuffixStart--;
    }

    const parts: CharDiffPart[] = [];

    if (prefixLength > 0) {
      parts.push({
        text: parsedOldText.substring(0, prefixLength),
        type: 'unchanged',
      });
    }

    if (oldSuffixStart > prefixLength) {
      parts.push({
        text: parsedOldText.substring(prefixLength, oldSuffixStart),
        type: 'removed',
      });
    }
    if (newSuffixStart > prefixLength) {
      parts.push({
        text: parsedNewText.substring(prefixLength, newSuffixStart),
        type: 'added',
      });
    }

    if (oldSuffixStart < parsedOldText.length) {
      parts.push({
        text: parsedOldText.substring(oldSuffixStart),
        type: 'unchanged',
      });
    }

    return parts;
  };

  // If we don't have valid strings to compare
  if (!oldStr || !newStr) {
    return (
      <Card className="gap-0 flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-white dark:bg-zinc-950">
        <CardHeader className="h-13 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
          <div className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-b from-purple-100 to-purple-50 shadow-inner dark:from-purple-800/40 dark:to-purple-900/60 dark:shadow-purple-950/20">
                <FileDiff className="h-5 w-5 text-purple-500 dark:text-purple-400" />
              </div>
              <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                {toolTitle}
              </CardTitle>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 h-full flex-1 overflow-hidden relative">
          <ErrorState />
        </CardContent>
      </Card>
    );
  }

  // Generate diff data
  const lineDiff = generateLineDiff(oldStr, newStr);
  const charDiff = generateCharDiff(oldStr, newStr);
  
  // Calculate stats on changes
  const stats: DiffStats = {
    additions: lineDiff.filter(line => line.type === 'added').length,
    deletions: lineDiff.filter(line => line.type === 'removed').length
  };

  return (
    <Card className="gap-0 flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-white dark:bg-zinc-950">
      <CardHeader className="h-13 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-b from-purple-100 to-purple-50 shadow-inner dark:from-purple-800/40 dark:to-purple-900/60 dark:shadow-purple-950/20">
              <FileDiff className="h-5 w-5 text-purple-500 dark:text-purple-400" />
            </div>
            <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              {toolTitle}
            </CardTitle>
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
              {isSuccess ? 'Replacement completed' : 'Replacement failed'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden relative">
        {isStreaming ? (
          <LoadingState filePath={filePath} progress={progress} />
        ) : (
          <ScrollArea className="h-full w-full">
            <div className="p-4">
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm overflow-hidden mb-4">
                <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between">
                  <div className="flex items-center">
                    <File className="h-4 w-4 mr-2 text-zinc-500 dark:text-zinc-400" />
                    <code className="text-xs font-mono text-zinc-700 dark:text-zinc-300">
                      {filePath || 'Unknown file'}
                    </code>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex items-center text-xs text-zinc-500 dark:text-zinc-400 gap-3">
                      <div className="flex items-center">
                        <Plus className="h-3.5 w-3.5 text-emerald-500 mr-1" />
                        <span>{stats.additions}</span>
                      </div>
                      <div className="flex items-center">
                        <Minus className="h-3.5 w-3.5 text-red-500 mr-1" />
                        <span>{stats.deletions}</span>
                      </div>
                    </div>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setExpanded(!expanded)}
                          >
                            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{expanded ? 'Collapse' : 'Expand'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                
                {expanded && (
                  <div>
                    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'unified' | 'split')} className="w-auto">
                      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-2 flex justify-end">
                        <TabsList className="h-7 p-0.5">
                          <TabsTrigger value="unified" className="text-xs h-6 px-2">Unified</TabsTrigger>
                          <TabsTrigger value="split" className="text-xs h-6 px-2">Split</TabsTrigger>
                        </TabsList>
                      </div>
                    
                      <TabsContent value="unified" className="m-0 pb-4">
                        <UnifiedDiffView lineDiff={lineDiff} />
                      </TabsContent>
                      
                      <TabsContent value="split" className="m-0">
                        <SplitDiffView lineDiff={lineDiff} />
                      </TabsContent>
                    </Tabs>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
      
      <div className="px-4 py-2 h-10 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
        <div className="h-full flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          {!isStreaming && (
            <div className="flex items-center gap-1">
              {isSuccess ? (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mr-1" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-red-500 mr-1" />
              )}
              <span>
                {isSuccess
                  ? 'String replacement successful'
                  : 'String replacement failed'}
              </span>
              <Badge variant="outline" className="ml-2 h-5 py-0">
                <Plus className="h-3 w-3 text-emerald-500 mr-1" />
                {stats.additions}
                <Minus className="h-3 w-3 text-red-500 mx-1" />
                {stats.deletions}
              </Badge>
            </div>
          )}

          {isStreaming && (
            <div className="flex items-center gap-1">
              <CircleDashed className="h-3.5 w-3.5 text-blue-500 animate-spin mr-1" />
              <span>Processing replacement...</span>
            </div>
          )}
        </div>
        
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {toolTimestamp && !isStreaming
            ? formatTimestamp(toolTimestamp)
            : assistantTimestamp
              ? formatTimestamp(assistantTimestamp)
              : ''}
        </div>
      </div>
    </Card>
  );
}
