import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Globe,
  FileText,
  Clock,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Code,
  Settings,
  Zap,
  Network,
  Info,
  Tag,
  Hash,
  Check
} from 'lucide-react';
import { ToolViewProps } from './types';
import {
  extractSearchQuery,
  formatTimestamp,
  getToolTitle,
  normalizeContentToString,
} from './utils';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface EndpointInfo {
  name: string;
  description?: string;
  method?: string;
  parameters?: Array<{
    name: string;
    type: string;
    required?: boolean;
    description?: string;
  }>;
  example?: string;
  category?: string;
}

interface DataProviderEndpointsData {
  provider: string;
  endpoints: EndpointInfo[];
  description?: string;
  base_url?: string;
  auth_required?: boolean;
  rate_limit?: string;
}

export function DataProviderToolView({
  name = 'get-data-provider-endpoints',
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === 'dark';
  const [progress, setProgress] = useState(0);
  const [expandedEndpoints, setExpandedEndpoints] = useState<Record<number, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Extract provider name from assistant content
  const extractProviderName = (content: string | object | undefined | null): string => {
    const contentStr = normalizeContentToString(content);
    if (!contentStr) return 'Unknown Provider';
    
    const match = contentStr.match(/provider["\s]*[:=]["\s]*([^"'\s,}]+)/i);
    return match ? match[1] : 'Unknown Provider';
  };

  const provider = extractProviderName(assistantContent || '');
  const toolTitle = getToolTitle(name);

  // Parse endpoint data from tool content
  const [endpointsData, setEndpointsData] = useState<DataProviderEndpointsData | null>(null);

  // Toggle endpoint expansion
  const toggleExpand = (idx: number) => {
    setExpandedEndpoints(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

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

  useEffect(() => {
    if (toolContent) {
      try {
        const parsedContent = JSON.parse(toolContent);
        setEndpointsData(parsedContent);
      } catch (e) {
        // Try to extract from nested structure
        try {
          const lines = toolContent.split('\n');
          const jsonLine = lines.find(line => line.trim().startsWith('{'));
          if (jsonLine) {
            const parsed = JSON.parse(jsonLine);
            setEndpointsData(parsed);
          }
        } catch (e2) {
          console.error('Failed to parse endpoints data:', e2);
        }
      }
    }
  }, [toolContent]);

  // Get unique categories
  const categories = endpointsData?.endpoints 
    ? ['all', ...new Set(endpointsData.endpoints.map(e => e.category).filter(Boolean))]
    : ['all'];

  // Filter endpoints by category
  const filteredEndpoints = endpointsData?.endpoints?.filter(endpoint => 
    selectedCategory === 'all' || endpoint.category === selectedCategory
  ) || [];

  // Helper to get method color
  const getMethodColor = (method: string = 'GET') => {
    switch (method.toLowerCase()) {
      case 'get': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300';
      case 'post': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300';
      case 'put': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300';
      case 'delete': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300';
      default: return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300';
    }
  };

  // Helper to get parameter type color
  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'string': return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300';
      case 'number': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300';
      case 'boolean': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300';
      case 'array': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300';
      case 'object': return 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300';
      default: return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300';
    }
  };

  return (
    <Card className="gap-0 flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-white dark:bg-zinc-950">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
          <div className="relative p-2 rounded-lg bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/20">
            <Database className="w-5 h-5 text-green-500 dark:text-green-400" />
          </div>
            <div>
              <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                {toolTitle}
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {provider}
              </CardDescription>
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
                <CheckCircle className="h-3.5 w-3.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
              {isSuccess ? 'Endpoints loaded successfully' : 'Failed to load endpoints'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden relative">
        {isStreaming ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
            <div className="text-center w-full max-w-xs">
              <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center bg-gradient-to-b from-violet-100 to-violet-50 shadow-inner dark:from-violet-800/40 dark:to-violet-900/60 dark:shadow-violet-950/20">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500 dark:text-violet-400" />
              </div>
              <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-2">
                Loading endpoints
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                <span className="font-mono text-xs break-all">{provider}</span>
              </p>
              <Progress value={progress} className="w-full h-2" />
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">{progress}%</p>
            </div>
          </div>
        ) : endpointsData && filteredEndpoints.length > 0 ? (
          <ScrollArea className="h-full w-full">
            <div className="p-4 py-0 my-4">
              {/* Provider Info Section */}
              {endpointsData.description && (
                <div className="mb-6 bg-violet-50/70 dark:bg-violet-950/30 p-4 rounded-lg border border-violet-100 dark:border-violet-900/50 shadow-sm">
                  <h3 className="text-sm font-medium text-violet-800 dark:text-violet-300 mb-2 flex items-center">
                    <Info className="h-4 w-4 mr-2 opacity-70" />
                    Provider Information
                  </h3>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">
                    {endpointsData.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {endpointsData.base_url && (
                      <Badge variant="outline" className="text-xs">
                        <Globe className="h-3 w-3 mr-1" />
                        {endpointsData.base_url}
                      </Badge>
                    )}
                    {endpointsData.auth_required && (
                      <Badge variant="outline" className="text-xs">
                        <Settings className="h-3 w-3 mr-1" />
                        Auth Required
                      </Badge>
                    )}
                    {endpointsData.rate_limit && (
                      <Badge variant="outline" className="text-xs">
                        <Zap className="h-3 w-3 mr-1" />
                        {endpointsData.rate_limit}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Category Filter */}
              {categories.length > 1 && (
                <div className="mb-4">
                  <div className="flex gap-2 flex-wrap">
                    {categories.map((category) => (
                      <Button
                        key={category}
                        variant={selectedCategory === category ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedCategory(category)}
                        className="text-xs h-7"
                      >
                        <Tag className="h-3 w-3 mr-1" />
                        {category === 'all' ? 'All' : category}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-4 flex items-center justify-between">
                <span>Available Endpoints ({filteredEndpoints.length})</span>
                <Badge variant="outline" className="text-xs font-normal">
                  <Clock className="h-3 w-3 mr-1.5 opacity-70" />
                  {new Date().toLocaleDateString()}
                </Badge>
              </div>

              <div className="space-y-4">
                {filteredEndpoints.map((endpoint, idx) => {
                  const isExpanded = expandedEndpoints[idx] || false;
                  
                  return (
                    <div 
                      key={idx} 
                      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm hover:shadow transition-shadow overflow-hidden"
                    >
                      <div className="p-4">
                        <div className="flex items-start gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={cn("text-xs px-2 py-0 h-5 font-mono", getMethodColor(endpoint.method))}>
                                {endpoint.method || 'GET'}
                              </Badge>
                              {endpoint.category && (
                                <Badge variant="outline" className="text-xs px-2 py-0 h-5">
                                  <Tag className="h-3 w-3 mr-1" />
                                  {endpoint.category}
                                </Badge>
                              )}
                            </div>
                            <h4 className="text-md font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                              {endpoint.name}
                            </h4>
                            {endpoint.description && (
                              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                                {endpoint.description}
                              </p>
                            )}
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
                                <p>{isExpanded ? 'Show less' : 'Show details'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-800">
                          {/* Parameters Section */}
                          {endpoint.parameters && endpoint.parameters.length > 0 && (
                            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
                              <h5 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3 flex items-center">
                                <Settings className="h-4 w-4 mr-2 opacity-70" />
                                Parameters
                              </h5>
                              <div className="space-y-2">
                                {endpoint.parameters.map((param, paramIdx) => (
                                  <div key={paramIdx} className="bg-white dark:bg-zinc-900 p-3 rounded-md border border-zinc-200 dark:border-zinc-800">
                                    <div className="flex items-center gap-2 mb-1">
                                      <code className="text-sm font-mono text-zinc-900 dark:text-zinc-100">
                                        {param.name}
                                      </code>
                                      <Badge className={cn("text-xs", getTypeColor(param.type))}>
                                        {param.type}
                                      </Badge>
                                      {param.required && (
                                        <Badge variant="outline" className="text-xs text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800">
                                          Required
                                        </Badge>
                                      )}
                                    </div>
                                    {param.description && (
                                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                        {param.description}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Example Section */}
                          {endpoint.example && (
                            <div className="p-4">
                              <h5 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3 flex items-center">
                                <Code className="h-4 w-4 mr-2 opacity-70" />
                                Example Usage
                              </h5>
                              <div className="bg-zinc-900 dark:bg-zinc-950 p-3 rounded-md">
                                <code className="text-sm font-mono text-green-400 dark:text-green-300">
                                  {endpoint.example}
                                </code>
                              </div>
                            </div>
                          )}
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
              <Database className="h-10 w-10 text-zinc-400 dark:text-zinc-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              No Endpoints Found
            </h3>
            <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 w-full max-w-md text-center mb-4 shadow-sm">
              <code className="text-sm font-mono text-zinc-700 dark:text-zinc-300 break-all">
                {provider || 'Unknown provider'}
              </code>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No endpoints available for this data provider
            </p>
          </div>
        )}
      </CardContent>
      
      <div className="px-4 py-2 h-10 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center gap-4">
        <div className="h-full flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          {!isStreaming && endpointsData && (
            <Badge variant="outline" className="h-6 py-0.5">
              <Network className="h-3 w-3" />
              {filteredEndpoints.length} endpoints
            </Badge>
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
