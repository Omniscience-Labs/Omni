import React, { useState } from 'react';
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
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { ToolViewProps } from './types';
import { formatTimestamp, extractToolData } from './utils';
import { cn } from '@/lib/utils';
import { constructHtmlPreviewUrl } from '@/lib/utils/url';
import { CodeBlockCode } from '@/components/ui/code-block';
import { LoadingState } from './shared/LoadingState';

interface SlideInfo {
  slide_number: number;
  title: string;
  file: string;
  preview_url: string;
}

interface PresentationData {
  message: string;
  presentation_path: string;
  index_file: string;
  slides: SlideInfo[];
  presentation_name?: string;
  title?: string;
  total_slides?: number;
}

export function PresentationToolView({
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
  name,
  project,
}: ToolViewProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [slideContents, setSlideContents] = useState<Record<string, string>>({});
  const [loadingSlides, setLoadingSlides] = useState<Set<string>>(new Set());

  // Parse the tool output using existing helper
  const { toolResult } = extractToolData(toolContent);
  
  let presentationData: PresentationData | null = null;
  let error: string | null = null;

  try {
    if (toolResult && toolResult.toolOutput) {
      const output = toolResult.toolOutput;
      if (typeof output === 'string') {
        try {
          presentationData = JSON.parse(output);
        } catch (e) {
          console.error('Failed to parse tool output:', e);
          error = 'Failed to parse presentation data';
        }
      } else {
        presentationData = output as unknown as PresentationData;
      }
    }
  } catch (e) {
    console.error('Error parsing presentation data:', e);
    error = 'Failed to parse presentation data';
  }

  const loadSlideContent = async (slidePath: string) => {
    if (slideContents[slidePath] || loadingSlides.has(slidePath)) {
      return;
    }
    setLoadingSlides(prev => new Set(prev).add(slidePath));
    try {
      const slideUrl = constructHtmlPreviewUrl(project?.sandbox?.sandbox_url, slidePath);
      if (!slideUrl) {
        throw new Error('Unable to construct slide URL - sandbox not available');
      }
      const response = await fetch(slideUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch slide: ${response.statusText}`);
      }
      const htmlContent = await response.text();
      setSlideContents(prev => ({ ...prev, [slidePath]: htmlContent }));
    } catch (error) {
      console.error('Failed to load slide content:', error);
      const errorContent = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui;">
          <div style="text-align: center; color: #ef4444;">
            <h2>Failed to load slide</h2>
            <p>Could not fetch content from: ${slidePath}</p>
            <p style="font-size: 0.875rem; color: #666;">Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        </div>
      `;
      setSlideContents(prev => ({ ...prev, [slidePath]: errorContent }));
    } finally {
      setLoadingSlides(prev => {
        const newSet = new Set(prev);
        newSet.delete(slidePath);
        return newSet;
      });
    }
  };

  const currentSlide = presentationData?.slides[currentSlideIndex];
  const slideContent = slideContents[currentSlide?.file || ''];

  // Load current slide content if not loaded
  if (currentSlide && !slideContent && !loadingSlides.has(currentSlide.file)) {
    loadSlideContent(currentSlide.file);
  }

  const navigateSlide = (direction: 'prev' | 'next') => {
    if (!presentationData) return;
    if (direction === 'prev' && currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    } else if (direction === 'next' && currentSlideIndex < presentationData.slides.length - 1) {
      setCurrentSlideIndex(currentSlideIndex + 1);
    }
  };

  const renderSlidePreview = () => {
    if (!currentSlide) return null;

    if (loadingSlides.has(currentSlide.file) || !slideContent) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    return (
      <div className="relative w-full h-full bg-white dark:bg-zinc-900 rounded-lg overflow-hidden">
        <iframe
          srcDoc={slideContent}
          className="w-full h-full border-0"
          title={`Slide ${currentSlide.slide_number}: ${currentSlide.title}`}
          sandbox="allow-same-origin"
        />
      </div>
    );
  };

  const renderSlideCode = () => {
    if (!currentSlide) return null;

    if (loadingSlides.has(currentSlide.file) || !slideContent) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    return (
      <CodeBlockCode
        code={slideContent}
        language="html"
        className="text-xs"
      />
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
                {presentationData?.title || 'Presentation'}
              </CardTitle>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isStreaming && !error && presentationData && (
              <Badge
                variant="secondary"
                className="bg-gradient-to-b from-emerald-200 to-emerald-100 text-emerald-700 dark:from-emerald-800/50 dark:to-emerald-900/60 dark:text-emerald-300"
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                Success
              </Badge>
            )}
            {!isStreaming && (error || !isSuccess) && (
              <Badge
                variant="secondary"
                className="bg-gradient-to-b from-rose-200 to-rose-100 text-rose-700 dark:from-rose-800/50 dark:to-rose-900/60 dark:text-rose-300"
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                Presentation creation failed
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
            title="Creating presentation"
            filePath="Generating slides..."
            showProgress={true}
          />
        ) : error || !presentationData ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 bg-gradient-to-b from-rose-100 to-rose-50 shadow-inner dark:from-rose-800/40 dark:to-rose-900/60">
              <AlertTriangle className="h-10 w-10 text-rose-400 dark:text-rose-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              {error || 'Failed to create presentation'}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-md">
              There was an error creating the presentation. Please try again.
            </p>
          </div>
        ) : (
          <Tabs defaultValue="preview" className="w-full h-full flex flex-col">
            <div className="px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateSlide('prev')}
                    disabled={currentSlideIndex === 0}
                    className="h-7"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-2 px-3">
                    <span className="text-sm font-medium">
                      Slide {currentSlideIndex + 1} of {presentationData.slides.length}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateSlide('next')}
                    disabled={currentSlideIndex === presentationData.slides.length - 1}
                    className="h-7"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 h-7 text-xs"
                    disabled
                    title="Export functionality coming soon"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
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
                        Code
                    </TabsTrigger>
                  </TabsList>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <ScrollArea className="w-full h-12">
                  <div className="flex gap-2 p-1">
                    {presentationData.slides.map((slide, index) => (
                      <button
                        key={slide.slide_number}
                        onClick={() => setCurrentSlideIndex(index)}
                        className={cn(
                          "flex-shrink-0 w-16 h-10 rounded-lg border transition-all overflow-hidden",
                          "hover:border-primary/50",
                          index === currentSlideIndex
                            ? "border-primary shadow-sm"
                            : "border-border"
                        )}
                      >
                        <div className="w-full h-full bg-muted border rounded-lg flex items-center justify-center">
                          <span className="text-white text-xs font-medium">{index + 1}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <TabsContent value="preview" className="h-full mt-0 p-4">
                <div className="h-full rounded-lg border bg-muted/20 p-4">
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
          {!isStreaming && presentationData && (
            <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900">
              <Presentation className="h-3 w-3 mr-1" />
              Presentation
            </Badge>
          )}
        </div>

        <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" />
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