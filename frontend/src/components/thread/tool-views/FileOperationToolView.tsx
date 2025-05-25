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
  Check,
} from 'lucide-react';
import { ToolViewProps } from './types';
import {
  extractFilePath,
  extractFileContent,
  extractStreamingFileContent,
  getFileType,
  formatTimestamp,
  getToolTitle,
  normalizeContentToString,
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
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from "@/components/ui/scroll-area";

type FileOperation = 'create' | 'rewrite' | 'delete';

const getLanguageFromFileName = (fileName: string): string => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';

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

interface OperationConfig {
  icon: LucideIcon;
  color: string;
  successMessage: string;
  progressMessage: string;
  bgColor: string;
  gradientBg: string;
  borderColor: string;
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

  const getOperationType = (): FileOperation => {
    if (name) {
      if (name.includes('create')) return 'create';
      if (name.includes('rewrite')) return 'rewrite';
      if (name.includes('delete')) return 'delete';
    }

    if (!assistantContent) return 'create';

    const contentStr = normalizeContentToString(assistantContent);
    if (!contentStr) return 'create';

    if (contentStr.includes('<create-file>')) return 'create';
    if (contentStr.includes('<full-file-rewrite>')) return 'rewrite';
    if (
      contentStr.includes('delete-file') ||
      contentStr.includes('<delete>')
    )
      return 'delete';

    if (contentStr.toLowerCase().includes('create file')) return 'create';
    if (contentStr.toLowerCase().includes('rewrite file'))
      return 'rewrite';
    if (contentStr.toLowerCase().includes('delete file')) return 'delete';

    return 'create';
  };

  const operation = getOperationType();
  
  let filePath: string | null = null;
  let fileContent: string | null = null;
  
  // console.log('[FileOperationToolView] Debug:', {
  //   isStreaming,
  //   assistantContent,
  //   assistantContentType: typeof assistantContent,
  // });
  
  if (assistantContent) {
    try {
      const parsed = typeof assistantContent === 'string' ? JSON.parse(assistantContent) : assistantContent;
      if (parsed && typeof parsed === 'object' && 'role' in parsed && 'content' in parsed) {
        const messageContent = parsed.content;
        console.log('[FileOperationToolView] Found message format, content:', messageContent?.substring(0, 200));

        if (typeof messageContent === 'string') {
          const filePathPatterns = [
            /file_path=["']([^"']*?)["']/i,
            /<(?:create-file|delete-file|full-file-rewrite)\s+file_path=["']([^"']*)/i,
          ];
          
          for (const pattern of filePathPatterns) {
            const match = messageContent.match(pattern);
            if (match && match[1]) {
              filePath = match[1];
              console.log('[FileOperationToolView] Extracted file path:', filePath);
              break;
            }
          }
          
          if (operation !== 'delete' && !fileContent) {
            const tagName = operation === 'create' ? 'create-file' : 'full-file-rewrite';
            const openTagMatch = messageContent.match(new RegExp(`<${tagName}[^>]*>`, 'i'));
            if (openTagMatch) {
              const tagEndIndex = messageContent.indexOf(openTagMatch[0]) + openTagMatch[0].length;
              const afterTag = messageContent.substring(tagEndIndex);
              const closeTagMatch = afterTag.match(new RegExp(`<\\/${tagName}>`, 'i'));
              fileContent = closeTagMatch 
                ? afterTag.substring(0, closeTagMatch.index)
                : afterTag;
              console.log('[FileOperationToolView] Extracted file content length:', fileContent?.length);
            }
          }
        }
      }
      else if (parsed && typeof parsed === 'object') {
        console.log('[FileOperationToolView] Checking direct object format');
        if ('file_path' in parsed) {
          filePath = parsed.file_path;
        }
        if ('content' in parsed && operation !== 'delete') {
          fileContent = parsed.content;
        }
        
        if ('arguments' in parsed && parsed.arguments) {
          const args = typeof parsed.arguments === 'string' ? JSON.parse(parsed.arguments) : parsed.arguments;
          if (args.file_path) {
            filePath = args.file_path;
          }
          if (args.content && operation !== 'delete') {
            fileContent = args.content;
          }
        }
      }
    } catch (e) {
      if (typeof assistantContent === 'string') {
        const filePathPatterns = [
          /file_path=["']([^"']*)/i,
          /<(?:create-file|delete-file|full-file-rewrite)\s+file_path=["']([^"']*)/i,
          /<file_path>([^<]*)/i,
        ];
        
        for (const pattern of filePathPatterns) {
          const match = assistantContent.match(pattern);
          if (match && match[1]) {
            filePath = match[1];
            console.log('[FileOperationToolView] Extracted file path from string:', filePath);
            break;
          }
        }
        
        if (operation !== 'delete' && !fileContent) {
          const tagName = operation === 'create' ? 'create-file' : 'full-file-rewrite';
          const contentAfterTag = assistantContent.split(`<${tagName}`)[1];
          if (contentAfterTag) {
            const tagEndIndex = contentAfterTag.indexOf('>');
            if (tagEndIndex !== -1) {
              const potentialContent = contentAfterTag.substring(tagEndIndex + 1);
              const closingTagIndex = potentialContent.indexOf(`</${tagName}>`);
              fileContent = closingTagIndex !== -1 
                ? potentialContent.substring(0, closingTagIndex)
                : potentialContent;
            }
          }
        }
      }
    }
  }
  
  // console.log('[FileOperationToolView] After initial extraction:', { filePath, hasFileContent: !!fileContent });
  
  if (!filePath) {
    filePath = extractFilePath(assistantContent);
    // console.log('[FileOperationToolView] After extractFilePath utility:', filePath);
  }
  
  if (!fileContent && operation !== 'delete') {
    fileContent = isStreaming
      ? extractStreamingFileContent(
          assistantContent,
          operation === 'create' ? 'create-file' : 'full-file-rewrite',
        ) || ''
      : extractFileContent(
          assistantContent,
          operation === 'create' ? 'create-file' : 'full-file-rewrite',
        );
    // console.log('[FileOperationToolView] After content extraction utilities:', { hasFileContent: !!fileContent, contentLength: fileContent?.length });
  }
  
  const toolTitle = getToolTitle(name || `file-${operation}`);

  const processedFilePath = filePath
    ? filePath.trim().replace(/\\n/g, '\n').split('\n')[0]
    : null;

  const fileName = processedFilePath
    ? processedFilePath.split('/').pop() || processedFilePath
    : '';

  const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
  const isMarkdown = fileExtension === 'md';
  const isHtml = fileExtension === 'html' || fileExtension === 'htm';
  const isCsv = fileExtension === 'csv';
  
  const language = getLanguageFromFileName(fileName);
  const hasHighlighting = language !== 'text';
  
  const contentLines = fileContent
    ? fileContent.replace(/\\n/g, '\n').split('\n')
    : [];
  
  const htmlPreviewUrl =
    isHtml && project?.sandbox?.sandbox_url && processedFilePath
      ? constructHtmlPreviewUrl(project.sandbox.sandbox_url, processedFilePath)
      : undefined;


  const [viewMode, setViewMode] = useState<'code' | 'preview'>('preview');

  const configs: Record<FileOperation, OperationConfig> = {
    create: {
      icon: FilePen,
      color: 'text-emerald-600 dark:text-emerald-400',
      successMessage: 'File created successfully',
      progressMessage: 'Creating file...',
      bgColor: 'bg-gradient-to-b from-emerald-100 to-emerald-50 shadow-inner dark:from-emerald-800/40 dark:to-emerald-900/60 dark:shadow-emerald-950/20',
      gradientBg: 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/10',
      borderColor: 'border-emerald-500/20',
      badgeColor: 'bg-gradient-to-b from-emerald-200 to-emerald-100 text-emerald-700 shadow-sm dark:from-emerald-800/50 dark:to-emerald-900/60 dark:text-emerald-300',
      hoverColor: 'hover:bg-neutral-200 dark:hover:bg-neutral-800'
    },
    rewrite: {
      icon: Replace,
      color: 'text-blue-600 dark:text-blue-400',
      successMessage: 'File rewritten successfully',
      progressMessage: 'Rewriting file...',
      bgColor: 'bg-gradient-to-b from-blue-100 to-blue-50 shadow-inner dark:from-blue-800/40 dark:to-blue-900/60 dark:shadow-blue-950/20',
      gradientBg: 'bg-gradient-to-br from-blue-500/20 to-blue-600/10',
      borderColor: 'border-blue-500/20',
      badgeColor: 'bg-gradient-to-b from-blue-200 to-blue-100 text-blue-700 shadow-sm dark:from-blue-800/50 dark:to-blue-900/60 dark:text-blue-300',
      hoverColor: 'hover:bg-neutral-200 dark:hover:bg-neutral-800'
    },
    delete: {
      icon: Trash2,
      color: 'text-rose-600 dark:text-rose-400',
      successMessage: 'File deleted successfully',
      progressMessage: 'Deleting file...',
      bgColor: 'bg-gradient-to-b from-rose-100 to-rose-50 shadow-inner dark:from-rose-800/40 dark:to-rose-900/60 dark:shadow-rose-950/20',
      gradientBg: 'bg-gradient-to-br from-rose-500/20 to-rose-600/10',
      borderColor: 'border-rose-500/20',
      badgeColor: 'bg-gradient-to-b from-rose-200 to-rose-100 text-rose-700 shadow-sm dark:from-rose-800/50 dark:to-rose-900/60 dark:text-rose-300',
      hoverColor: 'hover:bg-neutral-200 dark:hover:bg-neutral-800'
    },
  };

  const config = configs[operation];
  const Icon = config.icon;

  const getFileIcon = () => {
    if (fileName.endsWith('.md')) return FileCode;
    if (fileName.endsWith('.csv')) return FileSpreadsheet;
    if (fileName.endsWith('.html')) return FileCode;
    return File;
  };
  
  const FileIcon = getFileIcon();

  if (!isStreaming && !processedFilePath && !fileContent) {
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

  const renderFilePreview = () => {
    if (!fileContent) {
      return (
        <div className="flex items-center justify-center h-full p-12">
          <div className="text-center">
            <FileIcon className="h-12 w-12 mx-auto mb-4 text-zinc-400" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No content to preview</p>
          </div>
        </div>
      );
    }

    if (isHtml && htmlPreviewUrl) {
      return (
        <div className="flex flex-col h-[calc(100vh-16rem)]"> 
          <iframe 
            src={htmlPreviewUrl}
            title={`HTML Preview of ${fileName}`}
            className="flex-grow border-0" 
            sandbox="allow-same-origin allow-scripts"
          />
        </div>
      );
    }
    
    if (isMarkdown) {
      return (
        <div className="p-1 py-0 prose dark:prose-invert prose-zinc max-w-none">
          <MarkdownRenderer
            content={processUnicodeContent(fileContent)}
          />
        </div>
      );
    }
    
    if (isCsv) {
      return (
        <div className="h-full w-full p-4">
          <div className="h-[calc(100vh-17rem)] w-[41%] bg-muted/20 border rounded-xl overflow-auto">
            <CsvRenderer content={processUnicodeContent(fileContent)} />
          </div>
        </div>
      );
    }

    return (
      <div className="p-4">
        <div className='w-full h-full bg-muted/20 border rounded-xl px-4 py-2 pb-6'>
        <pre className="text-sm font-mono text-zinc-800 dark:text-zinc-300 whitespace-pre-wrap break-words">
          {processUnicodeContent(fileContent)}
        </pre>
        </div>
      </div>
    );
  };

  return (
    <Card className="flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-white dark:bg-zinc-950">
      <Tabs defaultValue={'preview'} className="w-full h-full">
        <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2 mb-0">
          <div className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={cn("relative p-2 rounded-lg border", config.gradientBg, config.borderColor)}>
                <Icon className={cn("h-5 w-5", config.color)} />
              </div>
              <div>
                <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                  {toolTitle}
                </CardTitle>
              </div>
            </div>
            <div className='flex items-center gap-2'>
              {isHtml && viewMode === 'preview' && htmlPreviewUrl && !isStreaming && (
                <Button variant="outline" size="sm" className="h-8 text-xs bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800" asChild>
                  <a href={htmlPreviewUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Open in Browser
                  </a>
                </Button>
              )}
              <TabsList className="-mr-2 h-7 bg-zinc-100/70 dark:bg-zinc-800/70 rounded-lg">
                <TabsTrigger value="code" className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-primary">
                  <Code className="h-4 w-4" />
                  Source
                </TabsTrigger>
                <TabsTrigger value="preview" className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-primary">
                  <Eye className="h-4 w-4" />
                  Preview
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 -my-2 flex-1 overflow-hidden relative">
          <TabsContent value="code" className="flex-1 h-full mt-0 p-0 overflow-hidden">
            <ScrollArea className="h-full w-full">
              {operation === 'delete' ? (
                <div className="flex flex-col items-center justify-center h-full py-12 px-6">
                  <div className={cn("w-20 h-20 rounded-full flex items-center justify-center mb-6", config.bgColor)}>
                    <Trash2 className={cn("h-10 w-10", config.color)} />
                  </div>
                  <h3 className="text-xl font-semibold mb-6 text-zinc-900 dark:text-zinc-100">
                    Delete Operation
                  </h3>
                  <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 w-full max-w-md text-center">
                    <code className="text-sm font-mono text-zinc-700 dark:text-zinc-300 break-all">
                      {processedFilePath || 'Unknown file path'}
                    </code>
                  </div>
                </div>
              ) : fileContent ? (
                hasHighlighting ? (
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
                        className="text-xs"
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
                        <div className="table-cell text-right pr-3 pl-6 py-0.5 text-xs font-mono text-zinc-500 dark:text-zinc-500 select-none w-12 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                          {idx + 1}
                        </div>
                        <div className="table-cell pl-3 py-0.5 pr-4 text-xs font-mono whitespace-pre-wrap text-zinc-800 dark:text-zinc-300">
                          {processUnicodeContent(line) || ' '}
                        </div>
                      </div>
                    ))}
                    <div className="table-row h-4"></div>
                  </div>
                )
              ) : (
                <div className="flex items-center justify-center h-full p-12">
                  <div className="text-center">
                    <FileIcon className="h-12 w-12 mx-auto mb-4 text-zinc-400" />
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">No source code to display</p>
                  </div>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="preview" className="w-full flex-1 h-full mt-0 p-0 overflow-hidden">
            <ScrollArea className="h-full w-full">
              {operation === 'delete' ? (
                <div className="flex flex-col items-center justify-center h-full py-12 px-6 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
                  <div className={cn("w-20 h-20 rounded-full flex items-center justify-center mb-6", config.bgColor)}>
                    <Trash2 className={cn("h-10 w-10", config.color)} />
                  </div>
                  <h3 className="text-xl font-semibold mb-6 text-zinc-900 dark:text-zinc-100">
                    File Deleted
                  </h3>
                  <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 w-full max-w-md text-center mb-4 shadow-sm">
                    <code className="text-sm font-mono text-zinc-700 dark:text-zinc-300 break-all">
                      {processedFilePath || 'Unknown file path'}
                    </code>
                  </div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    This file has been permanently removed
                  </p>
                </div>
              ) : (
                renderFilePreview()
              )}
              
              {/* Streaming indicator overlay */}
              {isStreaming && fileContent && (
                <div className="sticky bottom-4 right-4 float-right mr-4 mb-4">
                  <Badge className="bg-blue-500/90 text-white border-none shadow-lg animate-pulse">
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    Streaming...
                  </Badge>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </CardContent>
        
        <div className="px-4 py-2 h-10 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center gap-4">
          <div className="h-full flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Badge variant="outline" className="py-0.5 h-6">
              <FileIcon className="h-3 w-3" />
              {hasHighlighting ? language.toUpperCase() : fileExtension.toUpperCase() || 'TEXT'}
            </Badge>
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
    </Card>
  );
}