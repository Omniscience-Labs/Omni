import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Presentation,
  Code,
  Eye,
  ExternalLink,
  Clock,
  Loader2,
  CheckCircle,
  AlertTriangle,
  FileText,
  Hash,
} from 'lucide-react';
import { ToolViewProps } from './types';
import { 
  formatTimestamp, 
  extractToolData, 
  extractFilePath,
  extractFileContent,
  extractStreamingFileContent
} from './utils';
import { processUnicodeContent } from '@/components/file-renderers/markdown-renderer';
import { cn } from '@/lib/utils';
import { constructHtmlPreviewUrl } from '@/lib/utils/url';
import { CodeBlockCode } from '@/components/ui/code-block';
import { LoadingState } from './shared/LoadingState';

interface CreateSlideData {
  message: string;
  presentation_name: string;
  presentation_path: string;
  slide_number: number;
  slide_title: string;
  slide_file: string;
  preview_url: string;
  total_slides: number;
  note?: string;
  presentation_title?: string;
}

export function CreateSlideToolView({
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
  name,
  project,
}: ToolViewProps) {
  const [loadedHtmlContent, setLoadedHtmlContent] = useState<string | null>(null);
  const [isLoadingHtml, setIsLoadingHtml] = useState(false);
  
  // Extract data using the same approach as FileOperationToolView
  const assistantToolData = extractToolData(assistantContent);
  const toolToolData = extractToolData(toolContent);

  let filePath: string | null = null;
  let fileContent: string | null = null;
  let slideData: CreateSlideData | null = null;
  let error: string | null = null;

  // Extract file path and content using FileOperationToolView approach
  if (assistantToolData.toolResult) {
    filePath = assistantToolData.filePath;
    fileContent = assistantToolData.fileContent;
  } else if (toolToolData.toolResult) {
    filePath = toolToolData.filePath;
    fileContent = toolToolData.fileContent;
  }

  if (!filePath) {
    filePath = extractFilePath(assistantContent);
  }

  if (!fileContent) {
    // Try to extract content using various patterns
    fileContent = isStreaming
      ? extractStreamingFileContent(assistantContent, 'create-file') || 
        extractStreamingFileContent(assistantContent, 'edit-file') || ''
      : extractFileContent(assistantContent, 'create-file') ||
        extractFileContent(assistantContent, 'edit-file');
  }

  // Also try to extract slide data from tool output
  try {
    const { toolResult } = extractToolData(toolContent);
    if (toolResult && toolResult.toolOutput) {
      const output = toolResult.toolOutput;
      if (typeof output === 'string') {
        try {
          slideData = JSON.parse(output);
        } catch (e) {
          console.error('Failed to parse tool output:', e);
          error = 'Failed to parse slide data';
        }
      } else {
        slideData = output as unknown as CreateSlideData;
      }
    }
  } catch (e) {
    console.error('Error parsing slide data:', e);
    error = 'Failed to parse slide data';
  }

  // Process file content for display
  const processedContent = fileContent ? processUnicodeContent(fileContent) : null;

  // Construct HTML preview URL
  const htmlPreviewUrl = filePath && project?.sandbox?.sandbox_url
    ? constructHtmlPreviewUrl(project.sandbox.sandbox_url, filePath)
    : undefined;

  const loadSlideHtmlContent = async () => {
    if (isLoadingHtml || loadedHtmlContent) return;
    
    const slidePreviewUrl = slideData?.preview_url && project?.sandbox?.sandbox_url
      ? constructHtmlPreviewUrl(project.sandbox.sandbox_url, slideData.slide_file)
      : htmlPreviewUrl;
    
    if (!slidePreviewUrl) return;
    
    setIsLoadingHtml(true);
    try {
      const response = await fetch(slidePreviewUrl);
      if (response.ok) {
        const html = await response.text();
        setLoadedHtmlContent(html);
      }
    } catch (error) {
      console.error('Failed to load slide HTML:', error);
    } finally {
      setIsLoadingHtml(false);
    }
  };

  const openSlideInNewTab = () => {
    // Use slide preview URL from tool response if available, otherwise fallback to htmlPreviewUrl
    const slidePreviewUrl = slideData?.preview_url && project?.sandbox?.sandbox_url
      ? constructHtmlPreviewUrl(project.sandbox.sandbox_url, slideData.slide_file)
      : htmlPreviewUrl;
    
    if (slidePreviewUrl) {
      window.open(slidePreviewUrl, '_blank');
    }
  };

  const renderSlidePreview = () => {
    // Check if we have slide data with preview URL from the tool response
    const slidePreviewUrl = slideData?.preview_url && project?.sandbox?.sandbox_url
      ? constructHtmlPreviewUrl(project.sandbox.sandbox_url, slideData.slide_file)
      : htmlPreviewUrl;

    if (!slidePreviewUrl && !processedContent && !isStreaming) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <Presentation className="h-12 w-12 mx-auto mb-4 text-zinc-400" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No slide content to preview</p>
          </div>
        </div>
      );
    }

    // Render slide with proper scaling to show the full 1920x1080 slide
    const renderIframe = (src?: string, srcDoc?: string) => {
      const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);
      const [scale, setScale] = useState(1);

      useEffect(() => {
        if (containerRef) {
          const updateScale = () => {
            const containerWidth = containerRef.offsetWidth;
            const containerHeight = containerRef.offsetHeight;
            
            // Calculate scale to fit 1920x1080 into container while maintaining aspect ratio
            const scaleX = containerWidth / 1920;
            const scaleY = containerHeight / 1080;
            const newScale = Math.min(scaleX, scaleY);
            
            setScale(newScale);
          };

          updateScale();
          window.addEventListener('resize', updateScale);
          return () => window.removeEventListener('resize', updateScale);
        }
      }, [containerRef]);

      return (
        <div className="w-full h-full flex items-center justify-center bg-gray-900 p-4">
          <div 
            ref={setContainerRef}
            className="relative bg-black shadow-2xl"
            style={{
              width: '100%',
              maxWidth: '90vw',
              aspectRatio: '16 / 9',
              maxHeight: 'calc(100vh - 12rem)',
              overflow: 'hidden'
            }}
          >
            <iframe
              src={src}
              srcDoc={srcDoc}
              title={`Slide ${slideData?.slide_number}: ${slideData?.slide_title || 'Preview'}`}
              className="border-0"
              sandbox="allow-same-origin allow-scripts"
              style={{
                width: '1920px',
                height: '1080px',
                border: 'none',
                display: 'block',
                transform: `scale(${scale})`,
                transformOrigin: '0 0',
                position: 'absolute',
                top: 0,
                left: 0
              }}
            />
          </div>
        </div>
      );
    };

    // Primary: Use the slide preview URL
    if (slidePreviewUrl) {
      return renderIframe(slidePreviewUrl);
    }

    // Fallback to srcDoc if we have content but no preview URL
    if (processedContent) {
      return renderIframe(undefined, processedContent);
    }

    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  };

  const renderSlideCode = () => {
    // Try to get content from multiple sources
    let htmlContent = loadedHtmlContent || processedContent || fileContent;
    
    // If we don't have content yet but can load it, trigger loading
    if (!htmlContent && !isLoadingHtml && (slideData?.preview_url || htmlPreviewUrl)) {
      loadSlideHtmlContent();
    }
    
    // Show loading state
    if (isLoadingHtml) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading HTML source...</p>
          </div>
        </div>
      );
    }
    
    // If we have slide data but no file content, try to show what we can
    if (!htmlContent && slideData) {
      htmlContent = `<!-- Slide Data -->
<div class="slide-info">
  <h1>Slide ${slideData.slide_number}: ${slideData.slide_title}</h1>
  <p>Presentation: ${slideData.presentation_name}</p>
  <p>File: ${slideData.slide_file}</p>
  <p>Preview URL: ${slideData.preview_url}</p>
</div>

<!-- Note: Full HTML content not available in tool response -->
<!-- Use the preview tab to see the rendered slide -->`;
    }

    if (!htmlContent && !isStreaming) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <Code className="h-12 w-12 mx-auto mb-4 text-zinc-400" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No HTML source code to display</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
              The slide HTML is loaded dynamically from the file system
            </p>
          </div>
        </div>
      );
    }

    if (htmlContent) {
      return (
        <div className="p-4">
          <CodeBlockCode
            code={htmlContent}
            language="html"
            className="text-xs"
          />
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  };

  return (
    <Card className="gap-0 flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20">
              <Presentation className="w-5 h-5 text-blue-500 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                Create Slide
              </CardTitle>
              {slideData?.slide_title ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {slideData.slide_title}
                </p>
              ) : filePath ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 font-mono">
                  {filePath.split('/').pop()}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {((slideData?.preview_url && project?.sandbox?.sandbox_url) || htmlPreviewUrl) && !isStreaming && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 text-xs bg-white dark:bg-muted/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 shadow-none" 
                onClick={openSlideInNewTab}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Open in Browser
              </Button>
            )}
            {!isStreaming && !error && (slideData || fileContent) && (
              <Badge
                variant="secondary"
                className="bg-gradient-to-b from-emerald-200 to-emerald-100 text-emerald-700 dark:from-emerald-800/50 dark:to-emerald-900/60 dark:text-emerald-300"
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                Created
              </Badge>
            )}
            {!isStreaming && (error || !isSuccess) && (
              <Badge
                variant="secondary"
                className="bg-gradient-to-b from-rose-200 to-rose-100 text-rose-700 dark:from-rose-800/50 dark:to-rose-900/60 dark:text-rose-300"
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                Failed
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden relative">
        {isStreaming ? (
          <LoadingState
            icon={Presentation}
            iconColor="text-blue-500 dark:text-blue-400"
            bgColor="bg-gradient-to-b from-blue-100 to-blue-50 shadow-inner dark:from-blue-800/40 dark:to-blue-900/60 dark:shadow-blue-950/20"
            title="Creating slide"
            filePath="Creating Slide..."
            showProgress={true}
          />
        ) : error || (!slideData && !fileContent) ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 bg-gradient-to-b from-rose-100 to-rose-50 shadow-inner dark:from-rose-800/40 dark:to-rose-900/60">
              <AlertTriangle className="h-10 w-10 text-rose-400 dark:text-rose-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              {error || 'Failed to create slide'}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-md">
              There was an error creating the slide. Please try again.
            </p>
          </div>
        ) : (
          <Tabs defaultValue="preview" className="w-full h-full flex flex-col">
            {/* Slide Info Header */}
            <div className="px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {slideData?.slide_number && (
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Slide {slideData.slide_number}</span>
                    </div>
                  )}
                  {slideData?.presentation_name && (
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {slideData.presentation_name}
                      </span>
                    </div>
                  )}
                  {filePath && !slideData?.presentation_name && (
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground font-mono">
                        {filePath}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <TabsList className="h-8 bg-muted/50 border border-border/50 p-0.5 gap-1">
                    <TabsTrigger
                      value="preview"
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-all [&[data-state=active]]:bg-white [&[data-state=active]]:dark:bg-primary/10 [&[data-state=active]]:text-foreground hover:bg-background/50 text-muted-foreground shadow-none"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </TabsTrigger>
                    <TabsTrigger
                      value="code"
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-all [&[data-state=active]]:bg-white [&[data-state=active]]:dark:bg-primary/10 [&[data-state=active]]:text-foreground hover:bg-background/50 text-muted-foreground shadow-none"
                    >
                      <Code className="h-3.5 w-3.5" />
                      HTML Source
                    </TabsTrigger>
                  </TabsList>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <TabsContent value="preview" className="h-full mt-0">
                <div className="h-full">
                  {renderSlidePreview()}
                </div>
              </TabsContent>

              <TabsContent value="code" className="h-full mt-0 p-0">
                <ScrollArea className="h-full">
                  <div className="p-4">
                    {renderSlideCode()}
                  </div>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        )}
      </CardContent>

      <div className="px-4 py-2 h-10 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center gap-4">
        <div className="h-full flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          {!isStreaming && (
            <>
              <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900">
                HTML
              </Badge>
              <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900">
                1920x1080px
              </Badge>
              {slideData?.total_slides && (
                <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900">
                  {slideData.total_slides} total slides
                </Badge>
              )}
            </>
          )}
        </div>
        <div className="h-full flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
          <Clock className="h-3 w-3" />
          <span>
            {formatTimestamp(toolTimestamp)}
          </span>
        </div>
      </div>
    </Card>
  );
}
