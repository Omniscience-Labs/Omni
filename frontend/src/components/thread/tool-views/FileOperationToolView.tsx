import React, { useState, useEffect } from 'react';
import {
  FileCode,
  Replace,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Code,
  Eye,
  FileSpreadsheet,
  File,
  Trash2,
  LucideIcon,
  FilePen,
} from 'lucide-react';
import { ToolViewProps } from './types';
import {
  extractFilePath,
  extractFileContent,
  getFileType,
  formatTimestamp,
  getToolTitle,
} from './utils';
import { GenericToolView } from './GenericToolView';
import {
  MarkdownRenderer,
  processUnicodeContent,
} from '@/components/file-renderers/markdown-renderer';
import { CsvRenderer } from '@/components/file-renderers/csv-renderer';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { CodeBlockCode } from '@/components/ui/code-block';
import { constructHtmlPreviewUrl } from '@/lib/utils/url';
import { 
  Card, 
  CardContent, 
  CardHeader,
  CardTitle,
  CardDescription 
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from "@/components/ui/scroll-area";

// Type for operation type
type FileOperation = 'create' | 'rewrite' | 'delete';

// Map file extensions to language names for syntax highlighting
const getLanguageFromFileName = (fileName: string): string => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';

  // Map of file extensions to language names for syntax highlighting
  const extensionMap: Record<string, string> = {
    // Web languages
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    json: 'json',
    jsonc: 'json',

    // Build and config files
    xml: 'xml',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    ini: 'ini',
    env: 'bash',
    gitignore: 'bash',
    dockerignore: 'bash',

    // Scripting languages
    py: 'python',
    rb: 'ruby',
    php: 'php',
    go: 'go',
    java: 'java',
    kt: 'kotlin',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    swift: 'swift',
    rs: 'rust',

    // Shell scripts
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    ps1: 'powershell',
    bat: 'batch',
    cmd: 'batch',

    // Markup languages (excluding markdown which has its own renderer)
    svg: 'svg',
    tex: 'latex',

    // Data formats
    graphql: 'graphql',
    gql: 'graphql',
  };

  return extensionMap[extension] || 'text';
};

// Interface for operation config
interface OperationConfig {
  icon: LucideIcon;
  color: string;
  successMessage: string;
  progressMessage: string;
  bgColor: string;
  badgeColor: string;
  hoverColor: string;
}

export function FileOperationToolView({
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
  name,
  project,
}: ToolViewProps) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === 'dark';
  const [progress, setProgress] = useState(0);

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

  // Determine operation type from content or name
  const getOperationType = (): FileOperation => {
    // First check tool name if available
    if (name) {
      if (name.includes('create')) return 'create';
      if (name.includes('rewrite')) return 'rewrite';
      if (name.includes('delete')) return 'delete';
    }

    if (!assistantContent) return 'create'; // default fallback

    if (assistantContent.includes('<create-file>')) return 'create';
    if (assistantContent.includes('<full-file-rewrite>')) return 'rewrite';
    if (
      assistantContent.includes('delete-file') ||
      assistantContent.includes('<delete>')
    )
      return 'delete';

    // Check for tool names as a fallback
    if (assistantContent.toLowerCase().includes('create file')) return 'create';
    if (assistantContent.toLowerCase().includes('rewrite file'))
      return 'rewrite';
    if (assistantContent.toLowerCase().includes('delete file')) return 'delete';

    // Default to create if we can't determine
    return 'create';
  };

  const operation = getOperationType();
  const filePath = extractFilePath(assistantContent);
  const toolTitle = getToolTitle(name || `file-${operation}`);

  // Only extract content for create and rewrite operations
  const fileContent =
    operation !== 'delete'
      ? extractFileContent(
          assistantContent,
          operation === 'create' ? 'create-file' : 'full-file-rewrite',
        )
      : null;

  // For debugging - show raw content if file path can't be extracted for delete operations
  const showDebugInfo = !filePath && operation === 'delete';

  // Process file path - handle potential newlines and clean up
  const processedFilePath = filePath
    ? filePath.trim().replace(/\\n/g, '\n').split('\n')[0]
    : null;

  // For create and rewrite, prepare content for display
  const contentLines = fileContent
    ? fileContent.replace(/\\n/g, '\n').split('\n')
    : [];
  const fileName = processedFilePath
    ? processedFilePath.split('/').pop() || processedFilePath
    : '';
  const fileType = processedFilePath ? getFileType(processedFilePath) : '';
  const isMarkdown = fileName.endsWith('.md');
  const isHtml = fileName.endsWith('.html');
  const isCsv = fileName.endsWith('.csv');
  const language = getLanguageFromFileName(fileName);
  const hasHighlighting = language !== 'text';
  
  // Construct HTML file preview URL if we have a sandbox and the file is HTML
  const htmlPreviewUrl =
    isHtml && project?.sandbox?.sandbox_url && processedFilePath
      ? constructHtmlPreviewUrl(project.sandbox.sandbox_url, processedFilePath)
      : undefined;

  // Add state for view mode toggle (code or preview)
  const [viewMode, setViewMode] = useState<'code' | 'preview'>(
    isHtml || isMarkdown || isCsv ? 'preview' : 'code',
  );

  // Fall back to generic view if file path is missing or if content is missing for non-delete operations
  if (
    (!filePath && !showDebugInfo) ||
    (operation !== 'delete' && !fileContent)
  ) {
    return (
      <GenericToolView
        name={name || `file-${operation}`}
        assistantContent={assistantContent}
        toolContent={toolContent}
        assistantTimestamp={assistantTimestamp}
        toolTimestamp={toolTimestamp}
        isSuccess={isSuccess}
        isStreaming={isStreaming}
      />
    );
  }

  const configs: Record<FileOperation, OperationConfig> = {
    create: {
      icon: FilePen,
      color: 'text-emerald-500 dark:text-emerald-400',
      successMessage: 'File created successfully',
      progressMessage: 'Creating file...',
      bgColor: 'bg-gradient-to-b from-emerald-100 to-emerald-50 shadow-inner dark:from-emerald-800/40 dark:to-emerald-900/60 dark:shadow-emerald-950/20',
      badgeColor: 'bg-gradient-to-b from-emerald-200 to-emerald-100 text-emerald-700 shadow-sm dark:from-emerald-800/50 dark:to-emerald-900/60 dark:text-emerald-300',
      hoverColor: 'hover:bg-gradient-to-b hover:from-emerald-200 hover:to-emerald-100 dark:hover:from-emerald-800/60 dark:hover:to-emerald-900/40'
    },
    rewrite: {
      icon: Replace,
      color: 'text-blue-500 dark:text-blue-400',
      successMessage: 'File rewritten successfully',
      progressMessage: 'Rewriting file...',
      bgColor: 'bg-gradient-to-b from-blue-100 to-blue-50 shadow-inner dark:from-blue-800/40 dark:to-blue-900/60 dark:shadow-blue-950/20',
      badgeColor: 'bg-gradient-to-b from-blue-200 to-blue-100 text-blue-700 shadow-sm dark:from-blue-800/50 dark:to-blue-900/60 dark:text-blue-300',
      hoverColor: 'hover:bg-gradient-to-b hover:from-blue-200 hover:to-blue-100 dark:hover:from-blue-800/60 dark:hover:to-blue-900/40'
    },
    delete: {
      icon: Trash2,
      color: 'text-rose-500 dark:text-rose-400',
      successMessage: 'File deleted successfully',
      progressMessage: 'Deleting file...',
      bgColor: 'bg-gradient-to-b from-rose-100 to-rose-50 shadow-inner dark:from-rose-800/40 dark:to-rose-900/60 dark:shadow-rose-950/20',
      badgeColor: 'bg-gradient-to-b from-rose-200 to-rose-100 text-rose-700 shadow-sm dark:from-rose-800/50 dark:to-rose-900/60 dark:text-rose-300',
      hoverColor: 'hover:bg-gradient-to-b hover:from-rose-200 hover:to-rose-100 dark:hover:from-rose-800/60 dark:hover:to-rose-900/40'
    },
  };

  const config = configs[operation];
  const Icon = config.icon;

  const getFileIcon = () => {
    if (isMarkdown) return FileCode;
    if (isCsv) return FileSpreadsheet;
    if (isHtml) return FileCode;
    return File;
  };
  
  const FileIcon = getFileIcon();

  const showTabs = operation !== 'delete' && fileContent && !isStreaming && (isHtml || isMarkdown || isCsv);

  return (
    <Card className="flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-white dark:bg-zinc-950">
      {showTabs ? (
        <Tabs defaultValue={viewMode} onValueChange={(v) => setViewMode(v as 'code' | 'preview')} className="w-full h-full">
          <CardHeader className="h-13 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
            <div className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn("p-2 rounded-lg", config.bgColor)}>
                  <Icon className={cn("h-5 w-5", config.color)} />
                </div>
                <div>
                  <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                    {processedFilePath || 'Unknown file path'}
                  </CardTitle>
                </div>
              </div>
              
              <TabsList className="-mr-2 h-7 bg-zinc-100/70 dark:bg-zinc-800/70 rounded-lg">
                <TabsTrigger value="code" className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-primary">
                  <Code className="h-4 w-4 mr-1.5" />
                  Source
                </TabsTrigger>
                <TabsTrigger value="preview" className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-primary">
                  <Eye className="h-4 w-4 mr-1.5" />
                  Preview
                </TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>

          <CardContent className="p-0 flex-1 overflow-hidden relative">
            <TabsContent value="code" className="flex-1 h-full mt-0 p-0 overflow-hidden">
              <ScrollArea className="h-full w-full">
                {hasHighlighting ? (
                  <div className="relative">
                    <div className="absolute left-0 top-0 bottom-0 w-12 border-r border-zinc-200 dark:border-zinc-800 z-10 flex flex-col bg-zinc-50 dark:bg-zinc-900">
                      {contentLines.map((_, idx) => (
                        <div
                          key={idx}
                          className="h-6 text-right pr-3 text-xs font-mono text-zinc-500 dark:text-zinc-500 select-none"
                        >
                          {idx + 1}
                        </div>
                      ))}
                    </div>
                    <div className="pl-12">
                      <CodeBlockCode
                        code={processUnicodeContent(fileContent)}
                        language={language}
                        className="text-xs p-4"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="min-w-full table">
                    {contentLines.map((line, idx) => (
                      <div
                        key={idx}
                        className={cn("table-row transition-colors", config.hoverColor)}
                      >
                        <div className="table-cell text-right pr-3 py-0.5 text-xs font-mono text-zinc-500 dark:text-zinc-500 select-none w-12 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                          {idx + 1}
                        </div>
                        <div className="table-cell pl-3 py-0.5 text-xs font-mono whitespace-pre text-zinc-800 dark:text-zinc-300">
                          {processUnicodeContent(line) || ' '}
                        </div>
                      </div>
                    ))}
                    <div className="table-row h-4"></div>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="preview" className="flex-1 h-full mt-0 p-0 overflow-hidden">
              <ScrollArea className="h-full w-full">
                {isHtml && htmlPreviewUrl && (
                  <div className="w-full h-full min-h-80 bg-white">
                    <iframe
                      src={htmlPreviewUrl}
                      title={`HTML Preview of ${fileName}`}
                      className="w-full h-full border-0"
                      style={{ minHeight: '300px', height: '100%' }}
                      sandbox="allow-same-origin allow-scripts"
                    />
                  </div>
                )}
                
                {isMarkdown && (
                  <div className="p-6 py-0 prose dark:prose-invert prose-zinc max-w-none">
                    <MarkdownRenderer
                      content={processUnicodeContent(fileContent)}
                    />
                  </div>
                )}
                
                {isCsv && (
                  <div className="h-full">
                    <CsvRenderer content={processUnicodeContent(fileContent)} />
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </CardContent>
          
          <div className="px-4 py-2 h-10 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center gap-4">
            <div className="h-full flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <Badge className="py-0.5 h-6">
                <FileIcon className="h-3 w-3" />
                {hasHighlighting ? language.toUpperCase() : fileType || 'TEXT'}
              </Badge>
              
              {isHtml && viewMode === 'preview' && htmlPreviewUrl && (
                <Button variant="outline" size="sm" className="h-8 text-xs bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800" asChild>
                  <a href={htmlPreviewUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Open in Browser
                  </a>
                </Button>
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
        </Tabs>
      ) : (
        <>
          <CardHeader className="h-13 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
            <div className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", config.bgColor)}>
                  <Icon className={cn("h-5 w-5", config.color)} />
                </div>
                <div>
                  <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                    {processedFilePath || 'Unknown file path'}
                  </CardTitle>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {!isStreaming ? (
                  <Badge variant="secondary" className={cn("px-2 py-1 transition-colors", config.badgeColor)}>
                    {isSuccess ? (
                      <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                    ) : (
                      <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {isSuccess ? config.successMessage : `Failed to ${operation}`}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 px-2 py-1">
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    {config.progressMessage}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0 flex-1 overflow-hidden relative">
            {operation !== 'delete' && fileContent && !isStreaming && !isHtml && !isMarkdown && !isCsv && (
              <ScrollArea className="h-full w-full">
                {hasHighlighting ? (
                  <div className="relative">
                    <div className="absolute left-0 top-0 bottom-0 w-12 border-r border-zinc-200 dark:border-zinc-800 z-10 flex flex-col bg-zinc-50 dark:bg-zinc-900">
                      {contentLines.map((_, idx) => (
                        <div
                          key={idx}
                          className="h-6 text-right pr-3 text-xs font-mono text-zinc-500 dark:text-zinc-500 select-none"
                        >
                          {idx + 1}
                        </div>
                      ))}
                    </div>
                    <div className="pl-12">
                      <CodeBlockCode
                        code={processUnicodeContent(fileContent)}
                        language={language}
                        className="text-xs p-4"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="min-w-full table">
                    {contentLines.map((line, idx) => (
                      <div
                        key={idx}
                        className={cn("table-row transition-colors", config.hoverColor)}
                      >
                        <div className="table-cell text-right pr-3 py-0.5 text-xs font-mono text-zinc-500 dark:text-zinc-500 select-none w-12 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                          {idx + 1}
                        </div>
                        <div className="table-cell pl-3 py-0.5 text-xs font-mono whitespace-pre text-zinc-800 dark:text-zinc-300">
                          {processUnicodeContent(line) || ' '}
                        </div>
                      </div>
                    ))}
                    <div className="table-row h-4"></div>
                  </div>
                )}
              </ScrollArea>
            )}
            {operation !== 'delete' && isStreaming && (
              <div className="flex flex-col h-full">
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileIcon className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {fileName || 'file.txt'}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {language.toUpperCase() || fileType || 'TEXT'}
                  </Badge>
                </div>

                <div className="flex-1 flex items-center justify-center p-12 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
                  <div className="text-center w-full max-w-xs">
                    <div className={cn("w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center", config.bgColor)}>
                      <Loader2 className={cn("h-8 w-8 animate-spin", config.color)} />
                    </div>
                    <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-2">
                      {operation === 'create' ? 'Creating File' : 'Updating File'}
                    </h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                      {processedFilePath ? (
                        <span className="font-mono text-xs break-all">{processedFilePath}</span>
                      ) : (
                        'Processing file operation'
                      )}
                    </p>
                    <Progress value={progress} className="w-full h-2" />
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">{progress}%</p>
                  </div>
                </div>
              </div>
            )}
            {operation === 'delete' && processedFilePath && !isStreaming && (
              <div className="flex flex-col items-center justify-center h-full py-12 px-6 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
                <div className={cn("w-20 h-20 rounded-full flex items-center justify-center mb-6", config.bgColor)}>
                  <Trash2 className={cn("h-10 w-10", config.color)} />
                </div>
                <h3 className="text-xl font-semibold mb-6 text-zinc-900 dark:text-zinc-100">
                  File Deleted
                </h3>
                <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 w-full max-w-md text-center mb-4 shadow-sm">
                  <code className="text-sm font-mono text-zinc-700 dark:text-zinc-300 break-all">
                    {processedFilePath}
                  </code>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  This file has been permanently removed
                </p>
              </div>
            )}
            {operation === 'delete' && isStreaming && (
              <div className="flex flex-col items-center justify-center h-full p-12 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
                <div className="text-center w-full max-w-xs">
                  <div className={cn("w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center", config.bgColor)}>
                    <Loader2 className={cn("h-8 w-8 animate-spin", config.color)} />
                  </div>
                  <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-2">
                    Deleting File
                  </h3>
                  {processedFilePath && (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                      <span className="font-mono text-xs break-all">{processedFilePath}</span>
                    </p>
                  )}
                  <Progress value={progress} className="w-full h-2" />
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">{progress}%</p>
                </div>
              </div>
            )}
            {operation === 'delete' &&
              !processedFilePath &&
              !showDebugInfo &&
              !isStreaming && (
                <div className="flex flex-col items-center justify-center h-full py-12 px-6 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
                  <div className={cn("w-20 h-20 rounded-full flex items-center justify-center mb-6", config.bgColor)}>
                    <Trash2 className={cn("h-10 w-10", config.color)} />
                  </div>
                  <h3 className="text-xl font-semibold mb-6 text-zinc-900 dark:text-zinc-100">
                    File Deleted
                  </h3>
                  <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 w-full max-w-md text-center mb-4 shadow-sm">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      Unknown file path
                    </p>
                  </div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    A file has been deleted but the path could not be determined
                  </p>
                </div>
              )}
          </CardContent>
          <div className="h-10 px-4 py-2 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
            <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <Badge className="py-0.5 h-6">
                <FileIcon className="h-3 w-3 mr-1" />
                {hasHighlighting ? language.toUpperCase() : fileType || 'TEXT'}
              </Badge>
              
              {isHtml && viewMode === 'preview' && htmlPreviewUrl && (
                <Button variant="outline" size="sm" className="h-8 text-xs bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800" asChild>
                  <a href={htmlPreviewUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Open in Browser
                  </a>
                </Button>
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
        </>
      )}
    </Card>
  );
}
