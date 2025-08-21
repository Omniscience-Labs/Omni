import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Presentation,
  Clock,
  Loader2,
  CheckCircle,
  AlertTriangle,
  FileText,
  Hash,
  Maximize2,

} from 'lucide-react';
import { ToolViewProps } from '../types';
import { formatTimestamp, extractToolData } from '../utils';
import { constructHtmlPreviewUrl } from '@/lib/utils/url';
import { CodeBlockCode } from '@/components/ui/code-block';
import { LoadingState } from '../shared/LoadingState';

interface SlideMetadata {
  title: string;
  filename: string;
  file_path: string;
  preview_url: string;
  created_at: string;
}

interface PresentationMetadata {
  presentation_name: string;
  title: string;
  description: string;
  slides: Record<string, SlideMetadata>;
  created_at: string;
  updated_at: string;
}

interface PresentationViewerProps extends ToolViewProps {
  title: string;
  currentSlideNumber?: number;
  presentationPath?: string;
  presentationName?: string;
}

export function PresentationViewer({
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
  name,
  project,
  title,
  currentSlideNumber,
  presentationPath,
  presentationName,
}: PresentationViewerProps) {
  const [metadata, setMetadata] = useState<PresentationMetadata | null>(null);

  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasScrolledToCurrentSlide, setHasScrolledToCurrentSlide] = useState(false);

  const [visibleSlide, setVisibleSlide] = useState<number | null>(null);

  // Extract presentation info from tool data
  const { toolResult } = extractToolData(toolContent);
  let extractedPresentationName = presentationName;
  let extractedPresentationPath = presentationPath;

  if (toolResult && toolResult.toolOutput) {
    try {
      const output = typeof toolResult.toolOutput === 'string' 
        ? JSON.parse(toolResult.toolOutput) 
        : toolResult.toolOutput;
      
      extractedPresentationName = output.presentation_name || extractedPresentationName;
      extractedPresentationPath = output.presentation_path || extractedPresentationPath;
    } catch (e) {
      console.error('Failed to parse tool output:', e);
    }
  }

  // Load metadata.json for the presentation
  const loadMetadata = async () => {
    if (!extractedPresentationName || !project?.sandbox?.sandbox_url) return;
    
    setIsLoadingMetadata(true);
    setError(null);
    
    try {
      const metadataUrl = constructHtmlPreviewUrl(
        project.sandbox.sandbox_url, 
        `presentations/${extractedPresentationName}/metadata.json`
      );
      
      // Add cache-busting parameter to ensure fresh data
      const urlWithCacheBust = `${metadataUrl}?t=${Date.now()}`;
      
      const response = await fetch(urlWithCacheBust, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      if (response.ok) {
        const data = await response.json();
        setMetadata(data);
        

      } else {
        setError('Failed to load presentation metadata');
      }
    } catch (err) {
      console.error('Error loading metadata:', err);
      setError('Failed to load presentation metadata');
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  useEffect(() => {
    loadMetadata();
  }, [extractedPresentationName, project?.sandbox?.sandbox_url, toolContent]);

  // Reset scroll state when tool content changes (new tool call)
  useEffect(() => {
    setHasScrolledToCurrentSlide(false);
  }, [toolContent, currentSlideNumber]);

  // Scroll to current slide when metadata loads or when tool content changes
  useEffect(() => {
    if (metadata && currentSlideNumber && !hasScrolledToCurrentSlide) {
      // Wait longer for memoized components to render
      scrollToCurrentSlide(800);
      setHasScrolledToCurrentSlide(true);
    }
  }, [metadata, currentSlideNumber, hasScrolledToCurrentSlide]);

  const slides = metadata ? Object.entries(metadata.slides)
    .map(([num, slide]) => ({ number: parseInt(num), ...slide }))
    .sort((a, b) => a.number - b.number) : [];

  // Additional effect to scroll when slides are actually rendered
  useEffect(() => {
    if (slides.length > 0 && currentSlideNumber && metadata && !hasScrolledToCurrentSlide) {
      // Extra delay to ensure DOM is fully rendered
      const timer = setTimeout(() => {
        scrollToCurrentSlide(100);
        setHasScrolledToCurrentSlide(true);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [slides.length, currentSlideNumber, metadata, hasScrolledToCurrentSlide]);

  // Intersection Observer to track visible slide
  useEffect(() => {
    if (!slides.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const slideId = entry.target.id;
            const slideNumber = parseInt(slideId.replace('slide-', ''));
            if (!isNaN(slideNumber)) {
              setVisibleSlide(slideNumber);
            }
          }
        });
      },
      {
        threshold: 0.5, // Trigger when 50% of slide is visible
        rootMargin: '-20% 0px -20% 0px' // Only consider center 60% of viewport
      }
    );

    // Observe all slide elements
    slides.forEach((slide) => {
      const element = document.getElementById(`slide-${slide.number}`);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [slides]);

  // Helper function to scroll to current slide
  const scrollToCurrentSlide = (delay: number = 200) => {
    if (!currentSlideNumber || !metadata) return;
    
    setTimeout(() => {
      const slideElement = document.getElementById(`slide-${currentSlideNumber}`);
      
      if (slideElement) {
        slideElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'nearest'
        });
      } else {
        // Fallback: try again after a longer delay if element not found yet
        setTimeout(() => {
          const retryElement = document.getElementById(`slide-${currentSlideNumber}`);
          if (retryElement) {
            retryElement.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center',
              inline: 'nearest'
            });
          }
        }, 500);
      }
    }, delay);
  };

  // Create a refresh timestamp when metadata changes
  const refreshTimestamp = useMemo(() => Date.now(), [metadata]);

  // Memoized slide iframe component to prevent unnecessary re-renders
  const SlideIframe = useMemo(() => {
    const SlideIframeComponent = React.memo(({ slide }: { slide: SlideMetadata & { number: number } }) => {
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
            
            // Only update if scale actually changed to prevent unnecessary re-renders
            if (Math.abs(newScale - scale) > 0.001) {
              setScale(newScale);
            }
          };

          // Use a debounced version for resize events to prevent excessive updates
          let resizeTimeout: NodeJS.Timeout;
          const debouncedUpdateScale = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(updateScale, 100);
          };

          updateScale();
          window.addEventListener('resize', debouncedUpdateScale);
          return () => {
            window.removeEventListener('resize', debouncedUpdateScale);
            clearTimeout(resizeTimeout);
          };
        }
      }, [containerRef, scale]);

      if (!project?.sandbox?.sandbox_url) {
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Presentation className="h-12 w-12 mx-auto mb-4 text-zinc-400" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No slide content to preview</p>
            </div>
          </div>
        );
      }

      const slideUrl = constructHtmlPreviewUrl(project.sandbox.sandbox_url, slide.file_path);
      // Add cache-busting to iframe src to ensure fresh content
      const slideUrlWithCacheBust = `${slideUrl}?t=${refreshTimestamp}`;

      return (
        <div className="w-full h-full flex items-center justify-center bg-muted/20 p-6">
          <div 
            ref={setContainerRef}
            className="relative bg-white rounded-xl shadow-lg border border-border/60 overflow-hidden transition-all duration-200 hover:shadow-xl"
            style={{
              width: '100%',
              maxWidth: '90vw',
              aspectRatio: '16 / 9',
              maxHeight: 'calc(100vh - 12rem)',
              containIntrinsicSize: '1920px 1080px',
              contain: 'layout style'
            }}
          >
            <iframe
              key={`slide-${slide.number}-${refreshTimestamp}`} // Key with stable timestamp ensures iframe refreshes when metadata changes
              src={slideUrlWithCacheBust}
              title={`Slide ${slide.number}: ${slide.title}`}
              className="border-0 rounded-xl"
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
                left: 0,
                willChange: 'transform',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden'
              }}
            />
          </div>
        </div>
      );
    }, (prevProps, nextProps) => {
      // Custom comparison function - only re-render if slide number or file_path changes
      return prevProps.slide.number === nextProps.slide.number && 
             prevProps.slide.file_path === nextProps.slide.file_path;
    });
    
    SlideIframeComponent.displayName = 'SlideIframeComponent';
    return SlideIframeComponent;
  }, [project?.sandbox?.sandbox_url, refreshTimestamp]);

  // Render individual slide using the original approach
  const renderSlidePreview = useCallback((slide: SlideMetadata & { number: number }) => {
    return <SlideIframe slide={slide} />;
  }, [SlideIframe]);



  return (
    <Card className="gap-0 flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40 p-4">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20">
              <Presentation className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">
                {metadata?.title || extractedPresentationName || 'Presentation'}
              </CardTitle>
              {/* Dynamic slide info based on visible slide */}
              {visibleSlide && metadata?.slides[visibleSlide] ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                  <span className={`font-medium ${
                    currentSlideNumber === visibleSlide ? 'text-primary' : 'text-muted-foreground'
                  }`}>
                    {visibleSlide}/{slides.length}
                  </span>
                  <span>•</span>
                  <span className="truncate max-w-md">
                    {metadata.slides[visibleSlide].title}
                  </span>
                  {currentSlideNumber === visibleSlide && (
                    <>
                      <span>•</span>
                      <span className="text-primary text-xs">Current</span>
                    </>
                  )}
                </div>
              ) : metadata?.description ? (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {metadata.description}
                </p>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                  <span>{slides.length} slides</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Show actions for visible slide */}
            {visibleSlide && project?.sandbox?.sandbox_url && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const slide = metadata?.slides[visibleSlide];
                  if (slide) {
                    const slideUrl = constructHtmlPreviewUrl(project.sandbox.sandbox_url, slide.file_path);
                    const slideUrlWithCacheBust = `${slideUrl}?t=${Date.now()}`;
                    window.open(slideUrlWithCacheBust, '_blank');
                  }
                }}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                title="Open in fullscreen"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {!visibleSlide && !isStreaming && !error && metadata && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{slides.length} slides</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden relative">
        {(isStreaming || (isLoadingMetadata && !metadata)) ? (
          <LoadingState
            icon={Presentation}
            iconColor="text-blue-500 dark:text-blue-400"
            bgColor="bg-gradient-to-b from-blue-100 to-blue-50 shadow-inner dark:from-blue-800/40 dark:to-blue-900/60 dark:shadow-blue-950/20"
            title="Loading presentation"
            filePath="Loading slides..."
            showProgress={true}
          />
        ) : error || !metadata ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 bg-gradient-to-b from-rose-100 to-rose-50 shadow-inner dark:from-rose-800/40 dark:to-rose-900/60">
              <AlertTriangle className="h-10 w-10 text-rose-400 dark:text-rose-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              {error || 'Failed to load presentation'}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-md">
              There was an error loading the presentation. Please try again.
            </p>
          </div>
        ) : slides.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 bg-gradient-to-b from-blue-100 to-blue-50 shadow-inner dark:from-blue-800/40 dark:to-blue-900/60">
              <Presentation className="h-10 w-10 text-blue-400 dark:text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              No slides found
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-md">
              This presentation doesn't have any slides yet.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-8 p-6">
              {slides.map((slide) => (
                <div key={slide.number} id={`slide-${slide.number}`} className={`rounded-lg border backdrop-blur-sm shadow-sm transition-all duration-200 hover:shadow-md overflow-hidden ${
                  currentSlideNumber === slide.number 
                    ? 'border-primary/30 bg-primary/5' 
                    : 'border-border/60 bg-card/50'
                }`}>
                  {/* Slide Preview */}
                  <div className="relative h-96 bg-muted/20">
                    {renderSlidePreview(slide)}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      <div className="px-4 py-2 h-10 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 flex justify-end items-center">
        <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
          <Clock className="h-3 w-3" />
          <span>
            {formatTimestamp(toolTimestamp)}
          </span>
        </div>
      </div>
    </Card>
  );
}
