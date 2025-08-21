import React from 'react';
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
  Eye,
  ExternalLink,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
  Hash,
  Calendar,
} from 'lucide-react';
import { ToolViewProps } from './types';
import { formatTimestamp, extractToolData } from './utils';
import { cn } from '@/lib/utils';
import { constructHtmlPreviewUrl } from '@/lib/utils/url';
import { LoadingState } from './shared/LoadingState';

interface SlideInfo {
  slide_number: number;
  title: string;
  filename: string;
  preview_url: string;
  created_at: string;
}

interface ListSlidesData {
  message: string;
  presentation_name: string;
  presentation_title: string;
  slides: SlideInfo[];
  total_slides: number;
  presentation_path: string;
}

export function ListSlidesToolView({
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
  name,
  project,
}: ToolViewProps) {
  const { toolResult } = extractToolData(toolContent);
  
  let slidesData: ListSlidesData | null = null;
  let error: string | null = null;

  try {
    if (toolResult && toolResult.toolOutput) {
      const output = toolResult.toolOutput;
      if (typeof output === 'string') {
        try {
          slidesData = JSON.parse(output);
        } catch (e) {
          console.error('Failed to parse tool output:', e);
          error = 'Failed to parse slides data';
        }
      } else {
        slidesData = output as unknown as ListSlidesData;
      }
    }
  } catch (e) {
    console.error('Error parsing slides data:', e);
    error = 'Failed to parse slides data';
  }

  const openSlideInNewTab = (slide: SlideInfo) => {
    if (project?.sandbox?.sandbox_url) {
      const fullUrl = constructHtmlPreviewUrl(project.sandbox.sandbox_url, slide.preview_url.replace('/workspace/', ''));
      window.open(fullUrl, '_blank');
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Unknown';
    }
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
                Presentation Slides
              </CardTitle>
              {slidesData && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {slidesData.presentation_title}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isStreaming && !error && slidesData && (
              <Badge
                variant="secondary"
                className="bg-gradient-to-b from-emerald-200 to-emerald-100 text-emerald-700 dark:from-emerald-800/50 dark:to-emerald-900/60 dark:text-emerald-300"
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                {slidesData.total_slides} slides
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
            title="Loading slides"
            filePath="Fetching slide information..."
            showProgress={true}
          />
        ) : error || !slidesData ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 bg-gradient-to-b from-rose-100 to-rose-50 shadow-inner dark:from-rose-800/40 dark:to-rose-900/60">
              <AlertTriangle className="h-10 w-10 text-rose-400 dark:text-rose-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              {error || 'Failed to load slides'}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-md">
              There was an error loading the slides. Please try again.
            </p>
          </div>
        ) : slidesData.slides.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 bg-gradient-to-b from-blue-100 to-blue-50 shadow-inner dark:from-blue-800/40 dark:to-blue-900/60">
              <Presentation className="h-10 w-10 text-blue-400 dark:text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              No slides found
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-md">
              This presentation doesn't have any slides yet. Create your first slide to get started.
            </p>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* Presentation Info Header */}
            <div className="px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{slidesData.presentation_name}</span>
                  </div>
                  <Badge variant="outline" className="h-6 py-0.5">
                    {slidesData.total_slides} slides
                  </Badge>
                </div>
              </div>
            </div>

            {/* Slides List */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {slidesData.slides.map((slide) => (
                  <Card key={slide.slide_number} className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium text-sm">
                          {slide.slide_number}
                        </div>
                        <div>
                          <h4 className="font-medium text-zinc-900 dark:text-zinc-100">
                            {slide.title}
                          </h4>
                          <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(slide.created_at)}
                            </div>
                            <div className="flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              {slide.filename}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 h-8 text-xs"
                          onClick={() => openSlideInNewTab(slide)}
                          title="Open slide in new tab"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>

      <div className="px-4 py-2 h-10 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center gap-4">
        <div className="h-full flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          {!isStreaming && slidesData && (
            <>
              <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900">
                {slidesData.slides.length} slides
              </Badge>
              <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900">
                1920x1080px each
              </Badge>
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
