import React, { useState, useEffect } from 'react';
import {
  Search,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Globe,
  FileText,
  Clock,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ToolViewProps } from './types';
import {
  extractSearchQuery,
  extractSearchResults,
  cleanUrl,
  formatTimestamp,
  getToolTitle,
  extractToolData,
} from './utils';
import { cn, truncateString } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LoadingState } from './shared/LoadingState';

export function WebSearchToolView({
  name = 'web-search',
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === 'dark';
  const [expandedResults, setExpandedResults] = useState<Record<number, boolean>>({});

  // Enhanced data extraction with support for both old and new formats
  let query: string | null = null;
  let searchResults: Array<{ title: string; url: string; snippet?: string }> = [];
  let answer: string | null = null;
  let images: string[] = [];
  let actualIsSuccess = isSuccess;
  let actualToolTimestamp = toolTimestamp;
  let actualAssistantTimestamp = assistantTimestamp;

  // Debug logging
  console.log('WebSearchToolView: Input data:', {
    assistantContent,
    toolContent,  
    isStreaming
  });

  // Helper function to extract web search data from new format
  const extractFromNewFormat = (content: any): { 
    query: string | null; 
    results: Array<{ title: string; url: string; snippet?: string }>; 
    answer: string | null; 
    images: string[]; 
    success?: boolean; 
    timestamp?: string 
  } => {
    if (!content) {
      return { query: null, results: [], answer: null, images: [], success: undefined, timestamp: undefined };
    }

    // If content is a string, try to parse it as JSON first
    let parsedContent = content;
    if (typeof content === 'string') {
      try {
        parsedContent = JSON.parse(content);
      } catch (e) {
        console.warn('WebSearchToolView: Failed to parse content as JSON:', e);
        return { query: null, results: [], answer: null, images: [], success: undefined, timestamp: undefined };
      }
    }

    if (typeof parsedContent !== 'object' || parsedContent === null) {
      return { query: null, results: [], answer: null, images: [], success: undefined, timestamp: undefined };
    }

    // Check for new structured format with tool_execution
    if ('tool_execution' in parsedContent && typeof parsedContent.tool_execution === 'object') {
      const toolExecution = parsedContent.tool_execution;
      const args = toolExecution.arguments || {};
      
      let parsedOutput = null;
      try {
        // Parse the output JSON string
        if (toolExecution.result?.output) {
          parsedOutput = JSON.parse(toolExecution.result.output);
        }
      } catch (e) {
        console.warn('WebSearchToolView: Failed to parse tool execution output:', e);
        console.warn('Raw output:', toolExecution.result?.output);
      }

      const extractedData = {
        query: args.query || parsedOutput?.query || null,
        results: parsedOutput?.results?.map((result: any) => ({
          title: result.title || '',
          url: result.url || '',
          snippet: result.content || result.snippet || ''
        })) || [],
        answer: parsedOutput?.answer || null,
        images: parsedOutput?.images || [],
        success: toolExecution.result?.success,
        timestamp: toolExecution.execution_details?.timestamp
      };

      console.log('WebSearchToolView: Extracted from new format:', {
        query: extractedData.query,
        resultsCount: extractedData.results.length,
        hasAnswer: !!extractedData.answer,
        imagesCount: extractedData.images.length,
        success: extractedData.success,
        firstResult: extractedData.results[0]
      });
      
      return extractedData;
    }

    // Check for nested format with role and content
    if ('role' in parsedContent && 'content' in parsedContent) {
      return extractFromNewFormat(parsedContent.content);
    }

    return { query: null, results: [], answer: null, images: [], success: undefined, timestamp: undefined };
  };

  // Helper function to extract web search data from legacy format
  const extractFromLegacyFormat = (content: any): { 
    query: string | null; 
    results: Array<{ title: string; url: string; snippet?: string }>; 
    answer: string | null; 
    images: string[] 
  } => {
    // Try to extract data using the existing parser first
    const toolData = extractToolData(content);
    
    if (toolData.toolResult) {
      const args = toolData.arguments || {};
      
      console.log('WebSearchToolView: Extracted from legacy format (extractToolData):', {
        query: toolData.query || args.query,
        resultsCount: 0 // Will be extracted separately
      });
      
      return {
        query: toolData.query || args.query || null,
        results: [], // Will be extracted using extractSearchResults
        answer: null, // Will be extracted separately
        images: [] // Will be extracted separately
      };
    }

    // Fall back to legacy extraction methods
    const legacyQuery = extractSearchQuery(content);
    
    console.log('WebSearchToolView: Extracted from legacy format (fallback):', {
      query: legacyQuery,
      resultsCount: 0 // Will be extracted separately
    });
    
    return {
      query: legacyQuery,
      results: [], // Will be extracted using extractSearchResults
      answer: null, // Will be extracted separately
      images: [] // Will be extracted separately
    };
  };

  // Try to extract from new format first (both assistant and tool content)
  const assistantNewFormat = extractFromNewFormat(assistantContent);
  const toolNewFormat = extractFromNewFormat(toolContent);

  console.log('WebSearchToolView: Format detection results:', {
    assistantNewFormat: {
      hasQuery: !!assistantNewFormat.query,
      resultsCount: assistantNewFormat.results.length,
      hasAnswer: !!assistantNewFormat.answer,
      imagesCount: assistantNewFormat.images.length
    },
    toolNewFormat: {
      hasQuery: !!toolNewFormat.query,
      resultsCount: toolNewFormat.results.length,
      hasAnswer: !!toolNewFormat.answer,
      imagesCount: toolNewFormat.images.length
    }
  });

  // Use new format data if available
  if (assistantNewFormat.query || assistantNewFormat.results.length > 0) {
    query = assistantNewFormat.query;
    searchResults = assistantNewFormat.results;
    answer = assistantNewFormat.answer;
    images = assistantNewFormat.images;
    if (assistantNewFormat.success !== undefined) {
      actualIsSuccess = assistantNewFormat.success;
    }
    if (assistantNewFormat.timestamp) {
      actualAssistantTimestamp = assistantNewFormat.timestamp;
    }
    console.log('WebSearchToolView: Using assistant new format data');
  } else if (toolNewFormat.query || toolNewFormat.results.length > 0) {
    query = toolNewFormat.query;
    searchResults = toolNewFormat.results;
    answer = toolNewFormat.answer;
    images = toolNewFormat.images;
    if (toolNewFormat.success !== undefined) {
      actualIsSuccess = toolNewFormat.success;
    }
    if (toolNewFormat.timestamp) {
      actualToolTimestamp = toolNewFormat.timestamp;
    }
    console.log('WebSearchToolView: Using tool new format data');
  } else {
    // Fall back to legacy format extraction
    const assistantLegacy = extractFromLegacyFormat(assistantContent);
    const toolLegacy = extractFromLegacyFormat(toolContent);

    // Use assistant content first, then tool content as fallback
    query = assistantLegacy.query || toolLegacy.query;
    
    // Extract search results using legacy method
    const legacyResults = extractSearchResults(toolContent);
    searchResults = legacyResults;
    
    console.log('WebSearchToolView: Using legacy format data:', {
      query,
      legacyResultsCount: legacyResults.length,
      firstLegacyResult: legacyResults[0]
    });
    
    // Extract additional data from legacy format
    if (toolContent) {
      try {
        // Handle both string and object formats
        let parsedContent;
        if (typeof toolContent === 'string') {
          parsedContent = JSON.parse(toolContent);
        } else if (typeof toolContent === 'object' && toolContent !== null) {
          parsedContent = toolContent;
        } else {
          parsedContent = {};
        }

        // Check if it's the response format with answer
        if (parsedContent.answer && typeof parsedContent.answer === 'string') {
          answer = parsedContent.answer;
        }
        // Check for images array
        if (parsedContent.images && Array.isArray(parsedContent.images)) {
          images = parsedContent.images;
        }
      } catch (e) {
        // Silently fail - the view will work without these extras
      }
    }
  }

  // Additional legacy extraction for edge cases
  if (!query) {
    query = extractSearchQuery(assistantContent) || extractSearchQuery(toolContent);
  }
  
  if (searchResults.length === 0) {
    const fallbackResults = extractSearchResults(toolContent);
    searchResults = fallbackResults;
    console.log('WebSearchToolView: Fallback extraction results:', fallbackResults.length);
  }

  console.log('WebSearchToolView: Final extracted data:', {
    query,
    searchResultsCount: searchResults.length,
    hasAnswer: !!answer,
    imagesCount: images.length,
    actualIsSuccess,
    firstResult: searchResults[0]
  });

  const toolTitle = getToolTitle(name);

  // Toggle result expansion
  const toggleExpand = (idx: number) => {
    setExpandedResults(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  // Helper to determine favicon 
  const getFavicon = (url: string) => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    } catch (e) {
      return null;
    }
  };

  const getResultType = (result: any) => {
    const { url, title } = result;

    if (url.includes('news') || url.includes('article') || title.includes('News')) {
      return { icon: FileText, label: 'Article' };
    } else if (url.includes('wiki')) {
      return { icon: BookOpen, label: 'Wiki' };
    } else if (url.includes('blog')) {
      return { icon: CalendarDays, label: 'Blog' };
    } else {
      return { icon: Globe, label: 'Website' };
    }
  };

  return (
    <Card className="gap-0 flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-white dark:bg-zinc-950">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20">
              <Search className="w-5 h-5 text-blue-500 dark:text-blue-400" />
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
                actualIsSuccess
                  ? "bg-gradient-to-b from-emerald-200 to-emerald-100 text-emerald-700 dark:from-emerald-800/50 dark:to-emerald-900/60 dark:text-emerald-300"
                  : "bg-gradient-to-b from-rose-200 to-rose-100 text-rose-700 dark:from-rose-800/50 dark:to-rose-900/60 dark:text-rose-300"
              }
            >
              {actualIsSuccess ? (
                <CheckCircle className="h-3.5 w-3.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
              {actualIsSuccess ? 'Search completed successfully' : 'Search failed'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden relative">
        {isStreaming && searchResults.length === 0 && !answer ? (
          <LoadingState
            icon={Search}
            iconColor="text-blue-500 dark:text-blue-400"
            bgColor="bg-gradient-to-b from-blue-100 to-blue-50 shadow-inner dark:from-blue-800/40 dark:to-blue-900/60 dark:shadow-blue-950/20"
            title="Searching the web"
            filePath={query}
            showProgress={true}
          />
        ) : searchResults.length > 0 || answer ? (
          <ScrollArea className="h-full w-full">
            <div className="p-4 py-0 my-4">
              {images.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3 flex items-center">
                    <ImageIcon className="h-4 w-4 mr-2 opacity-70" />
                    Images
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-1">
                    {images.slice(0, 6).map((image, idx) => (
                      <a
                        key={idx}
                        href={image}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 hover:border-blue-300 dark:hover:border-blue-700 transition-colors shadow-sm hover:shadow-md"
                      >
                        <img
                          src={image}
                          alt={`Search result ${idx + 1}`}
                          className="object-cover w-full h-32 group-hover:opacity-90 transition-opacity"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'%3E%3C/circle%3E%3Cpolyline points='21 15 16 10 5 21'%3E%3C/polyline%3E%3C/svg%3E";
                            target.classList.add("p-4");
                          }}
                        />
                        <div className="absolute top-0 right-0 p-1">
                          <Badge variant="secondary" className="bg-black/60 hover:bg-black/70 text-white border-none shadow-md">
                            <ExternalLink className="h-3 w-3" />
                          </Badge>
                        </div>
                      </a>
                    ))}
                  </div>
                  {images.length > 6 && (
                    <Button variant="outline" size="sm" className="mt-2 text-xs">
                      View {images.length - 6} more images
                    </Button>
                  )}
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-4 flex items-center justify-between">
                  <span>Search Results ({searchResults.length})</span>
                  <Badge variant="outline" className="text-xs font-normal">
                    <Clock className="h-3 w-3 mr-1.5 opacity-70" />
                    {new Date().toLocaleDateString()}
                  </Badge>
                </div>
              )}

              <div className="space-y-4">
                {searchResults.map((result, idx) => {
                  const { icon: ResultTypeIcon, label: resultTypeLabel } = getResultType(result);
                  const isExpanded = expandedResults[idx] || false;
                  const favicon = getFavicon(result.url);

                  return (
                    <div
                      key={idx}
                      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm hover:shadow transition-shadow overflow-hidden"
                    >
                      <div className="p-4">
                        <div className="flex items-start gap-3 mb-2">
                          {favicon && (
                            <img
                              src={favicon}
                              alt=""
                              className="w-5 h-5 mt-1 rounded"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs px-2 py-0 h-5 font-normal bg-zinc-50 dark:bg-zinc-800">
                                <ResultTypeIcon className="h-3 w-3 mr-1 opacity-70" />
                                {resultTypeLabel}
                              </Badge>
                            </div>
                            <a
                              href={result.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-md font-medium text-blue-600 dark:text-blue-400 hover:underline line-clamp-1 mb-1"
                            >
                              {truncateString(cleanUrl(result.title), 50)}
                            </a>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 flex items-center">
                              <Globe className="h-3 w-3 mr-1.5 flex-shrink-0 opacity-70" />
                              {truncateString(cleanUrl(result.url), 70)}
                            </div>
                          </div>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 rounded-full"
                                  onClick={() => toggleExpand(idx)}
                                >
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{isExpanded ? 'Show less' : 'Show more'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>

                        {result.snippet && (
                          <p className={cn(
                            "text-sm text-zinc-600 dark:text-zinc-400",
                            isExpanded ? "" : "line-clamp-2"
                          )}>
                            {result?.snippet
                              ?.replace(/\\\\\n/g, ' ')
                              ?.replace(/\\\\n/g, ' ')
                              ?.replace(/\\n/g, ' ')
                              ?.replace(/\\\\\t/g, ' ')
                              ?.replace(/\\\\t/g, ' ')
                              ?.replace(/\\t/g, ' ')
                              ?.replace(/\\\\\r/g, ' ')
                              ?.replace(/\\\\r/g, ' ')
                              ?.replace(/\\r/g, ' ')
                              ?.replace(/\s+/g, ' ')
                              ?.trim()}
                          </p>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="bg-zinc-50 px-4 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-800 p-3 flex justify-between items-center">
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            Source: {cleanUrl(result.url)}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs bg-white dark:bg-zinc-900"
                            asChild
                          >
                            <a href={result.url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3" />
                              Visit Site
                            </a>
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 bg-gradient-to-b from-zinc-100 to-zinc-50 shadow-inner dark:from-zinc-800/40 dark:to-zinc-900/60">
              <Search className="h-10 w-10 text-zinc-400 dark:text-zinc-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              No Results Found
            </h3>
            <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 w-full max-w-md text-center mb-4 shadow-sm">
              <code className="text-sm font-mono text-zinc-700 dark:text-zinc-300 break-all">
                {query || 'Unknown query'}
              </code>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Try refining your search query for better results
            </p>
          </div>
        )}
      </CardContent>

      <div className="px-4 py-2 h-10 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center gap-4">
        <div className="h-full flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          {!isStreaming && searchResults.length > 0 && (
            <Badge variant="outline" className="h-6 py-0.5">
              <Globe className="h-3 w-3" />
              {searchResults.length} results
            </Badge>
          )}
        </div>

        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {actualToolTimestamp && !isStreaming
            ? formatTimestamp(actualToolTimestamp)
            : actualAssistantTimestamp
              ? formatTimestamp(actualAssistantTimestamp)
              : ''}
        </div>
      </div>
    </Card>
  );
}
