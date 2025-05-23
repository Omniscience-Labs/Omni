import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, ImageOff, CheckCircle, AlertTriangle, Loader2, Download, ZoomIn, ZoomOut, ExternalLink, Check } from 'lucide-react';
import { ToolViewProps } from './types';
import { formatTimestamp, getToolTitle } from './utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from '@/lib/utils';
import { GenericToolView } from './GenericToolView';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface ImageInfo {
  filePath: string;
  description: string;
}

function extractImageFilePath(content: string | undefined): string | null {
  if (!content) return null;
  console.log('Extracting file path from content:', content);
  try {
    const parsedContent = JSON.parse(content);
    if (parsedContent.content && typeof parsedContent.content === 'string') {
      content = parsedContent.content;
    }
  } catch (e) {
  }
  let filePathMatch = content.match(/<see-image\s+file_path=["']([^"']+)["'][^>]*><\/see-image>/i);
  if (filePathMatch) {
    return cleanImagePath(filePathMatch[1]);
  }
  filePathMatch = content.match(/<see-image[^>]*>([^<]+)<\/see-image>/i);
  if (filePathMatch) {
    return cleanImagePath(filePathMatch[1]);
  }

  const embeddedFileMatch = content.match(/image\s*:\s*["']?([^,"'\s]+\.(jpg|jpeg|png|gif|svg|webp))["']?/i);
  if (embeddedFileMatch) {
    return cleanImagePath(embeddedFileMatch[1]);
  }

  const extensionMatch = content.match(/["']?([^,"'\s]+\.(jpg|jpeg|png|gif|svg|webp))["']?/i);
  if (extensionMatch) {
    return cleanImagePath(extensionMatch[1]);
  }

  console.log('No file path found in assistant content');
  return null;
}

function extractImageDescription(content: string | undefined): string | null {
  if (!content) return null;
  try {
    const parsedContent = JSON.parse(content);
    if (parsedContent.content && typeof parsedContent.content === 'string') {
      content = parsedContent.content;
    }
  } catch (e) {
  }

  const parts = content.split(/<see-image/i);
  if (parts.length > 1) {
    return parts[0].trim();
  }

  return null;
}

function cleanImagePath(path: string): string {
  if (!path) return path;

  return path
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '')
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .split('\n')[0]
    .trim();
}

function parseToolResult(content: string | undefined): { success: boolean; message: string; filePath?: string } {
  if (!content) return { success: false, message: 'No tool result available' };
  
  console.log('Parsing tool result content:', content);

  try {
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
      if (parsedContent.content) {
        content = parsedContent.content;
      }
    } catch (e) {
    }

    const toolResultPattern = /<tool_result>\s*<see-image>\s*ToolResult\(([^)]+)\)\s*<\/see-image>\s*<\/tool_result>/;
    const toolResultMatch = content.match(toolResultPattern);
    
    if (toolResultMatch) {
      const resultStr = toolResultMatch[1];
      const success = resultStr.includes('success=True');
      
      const outputMatch = resultStr.match(/output="([^"]+)"/);
      const message = outputMatch ? outputMatch[1] : '';

      let filePath;
      if (success && message) {
        const filePathMatch = message.match(/Successfully loaded the image ['"]([^'"]+)['"]/i);
        if (filePathMatch && filePathMatch[1]) {
          filePath = filePathMatch[1];
          console.log('Found file path in tool result:', filePath);
        }
      }
      
      return { success, message, filePath };
    }
    
    const directToolResultMatch = content.match(/<tool_result>\s*<see-image>\s*([^<]+)<\/see-image>\s*<\/tool_result>/);
    if (directToolResultMatch) {
      const resultContent = directToolResultMatch[1];
      const success = resultContent.includes('success=True') || resultContent.includes('Successfully');
      
      const filePathMatch = resultContent.match(/['"]([^'"]+\.(jpg|jpeg|png|gif|webp|svg))['"]/) ||
                           resultContent.match(/Successfully loaded the image ['"]([^'"]+)['"]/i);
      
      const filePath = filePathMatch ? filePathMatch[1] : undefined;
      console.log('Found file path in direct tool result:', filePath);
      
      return { 
        success, 
        message: success ? 'Image loaded successfully' : 'Failed to load image',
        filePath 
      };
    }
    
    if (content.includes('success=True') || content.includes('Successfully')) {
      const filePathMatch = content.match(/Successfully loaded the image ['"]([^'"]+)['"]/i);
      const filePath = filePathMatch ? filePathMatch[1] : undefined;
      
      return { success: true, message: 'Image loaded successfully', filePath };
    }
    
    if (content.includes('success=False') || content.includes('Failed')) {
      return { success: false, message: 'Failed to load image' };
    }
  } catch (e) {
    console.error('Error parsing tool result:', e);
    return { success: false, message: 'Failed to parse tool result' };
  }
  return { success: true, message: 'Image loaded' };
}

function constructImageUrl(filePath: string, project?: { sandbox?: { sandbox_url?: string; workspace_path?: string; id?: string } }): string {

  console.log('Image path:', filePath);
  console.log('Project sandbox:', project?.sandbox);

  if (!filePath || filePath === 'STREAMING') {
    console.error('Invalid image path:', filePath);
    return '';
  }

  const cleanPath = filePath.replace(/^['"](.*)['"]$/, '$1');
  const sandboxId = typeof project?.sandbox === 'string' 
    ? project.sandbox 
    : project?.sandbox?.id;
  
  if (sandboxId) {
    let normalizedPath = cleanPath;
    if (!normalizedPath.startsWith('/workspace')) {
      normalizedPath = `/workspace/${normalizedPath.startsWith('/') ? normalizedPath.substring(1) : normalizedPath}`;
    }
    
    const apiEndpoint = `${process.env.NEXT_PUBLIC_BACKEND_URL}/sandboxes/${sandboxId}/files/content?path=${encodeURIComponent(normalizedPath)}`;
    console.log('Constructed API endpoint URL:', apiEndpoint);
    return apiEndpoint;
  }
  
  if (project?.sandbox?.sandbox_url) {
    const sandboxUrl = project.sandbox.sandbox_url.replace(/\/$/, '');
    let normalizedPath = cleanPath;
    if (!normalizedPath.startsWith('/workspace')) {
      normalizedPath = `/workspace/${normalizedPath.startsWith('/') ? normalizedPath.substring(1) : normalizedPath}`;
    }
    
    const fullUrl = `${sandboxUrl}${normalizedPath}`;
    console.log('Constructed sandbox URL:', fullUrl);
    return fullUrl;
  }
  
  if (cleanPath.startsWith('http')) {
    return cleanPath;
  }
  
  console.warn('No sandbox URL or ID available, using path as-is:', cleanPath);
  return cleanPath;
}

function SafeImage({ src, alt, filePath, className }: { src: string; alt: string; filePath: string; className?: string }) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const { session } = useAuth();

  useEffect(() => {
    const setupAuthenticatedImage = async () => {
      if (src.includes('/sandboxes/') && src.includes('/files/content')) {
        try {
          const response = await fetch(src, {
            headers: {
              'Authorization': `Bearer ${session?.access_token}`
            }
          });
          
          if (!response.ok) {
            throw new Error(`Failed to load image: ${response.status} ${response.statusText}`);
          }
          
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setImgSrc(url);
        } catch (err) {
          console.error('Error loading authenticated image:', err);
          setError(true);
        }
      } else {
        setImgSrc(src);
      }
    };
    
    setupAuthenticatedImage();
    setError(false);
    setAttempts(0);
    
    return () => {
      if (imgSrc && imgSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imgSrc);
      }
    };
  }, [src, session?.access_token]);

  const handleError = () => {
    if (attempts < 3) {
      setAttempts(attempts + 1);
      console.log(`Image load failed (attempt ${attempts + 1}). Trying alternative:`, filePath);
      
      if (attempts === 0) {
        setImgSrc(filePath);
      } else if (attempts === 1) {
        if (!filePath.startsWith('/')) {
          setImgSrc(`/${filePath}`);
        } else {
          setError(true);
        }
      } else {
        setError(true);
      }
    } else {
      setError(true);
    }
  };

  const handleZoomToggle = () => {
    setIsZoomed(!isZoomed);
    setZoomLevel(1);
  };

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomLevel(prev => Math.min(prev + 0.25, 3));
    if (!isZoomed) setIsZoomed(true);
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!imgSrc) return;
    
    const link = document.createElement('a');
    link.href = imgSrc;
    link.download = filePath.split('/').pop() || 'image';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-64 bg-gradient-to-b from-rose-50 to-rose-100 dark:from-rose-950/30 dark:to-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 shadow-inner">
        <div className="bg-white dark:bg-black/30 p-3 rounded-full shadow-md mb-3">
          <ImageOff className="h-8 w-8 text-rose-500 dark:text-rose-400" />
        </div>
        <p className="text-sm font-medium">Unable to load image</p>
        <p className="text-xs text-rose-600/70 dark:text-rose-400/70 mt-1 max-w-xs text-center break-all">
          {filePath}
        </p>
      </div>
    );
  }

  if (!imgSrc) {
    return (
      <div className="flex py-8 flex-col items-center justify-center w-full h-64 bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-900/50 dark:to-zinc-800/30 rounded-lg border-zinc-200 dark:border-zinc-700/50 shadow-inner">
        <div className="space-y-2 w-full max-w-md py-8">
          <Skeleton className="h-8 w-8 rounded-full mx-auto" />
          <Skeleton className="h-4 w-48 mx-auto" />
          <Skeleton className="h-64 w-full rounded-lg mt-4" />
          <div className="flex justify-center gap-2 mt-4">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className={cn(
        "overflow-hidden transition-all duration-300 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 mb-3",
        isZoomed ? "cursor-zoom-out" : "cursor-zoom-in"
      )}>
        <div className="relative flex items-center justify-center">
          <img
            src={imgSrc}
            alt={alt}
            onClick={handleZoomToggle}
            className={cn(
              "max-w-full object-contain transition-all duration-300 ease-in-out",
              isZoomed 
                ? "max-h-[80vh]" 
                : "max-h-[500px] hover:scale-[1.01]",
              className
            )}
            style={{
              transform: isZoomed ? `scale(${zoomLevel})` : 'none',
            }}
            onError={handleError}
          />
        </div>
      </div>

      <div className="flex items-center justify-between w-full px-2 py-2 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
        <Badge variant="secondary" className="bg-white/90 dark:bg-black/70 text-zinc-700 dark:text-zinc-300 shadow-sm">
          <ImageIcon className="h-3 w-3 mr-1" />
          {filePath.split('.').pop()?.toUpperCase()}
        </Badge>
        
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-md bg-white dark:bg-zinc-800"
            onClick={handleZoomOut}
            disabled={zoomLevel <= 0.5}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs font-mono px-2 text-zinc-700 dark:text-zinc-300 min-w-12 text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-md bg-white dark:bg-zinc-800"
            onClick={handleZoomIn}
            disabled={zoomLevel >= 3}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          
          <span className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-2"></span>
          
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-md bg-white dark:bg-zinc-800"
            onClick={handleDownload}
            title="Download image"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SeeImageToolView({
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
  name,
  project,
}: ToolViewProps) {
  const [progress, setProgress] = useState(0);
  
  const assistantFilePath = extractImageFilePath(assistantContent);
  const description = extractImageDescription(assistantContent);
  const toolTitle = getToolTitle(name || 'see-image');
  const toolResult = parseToolResult(toolContent);
  
  const filePath = toolResult.filePath || assistantFilePath;
  
  console.log('Final file path:', filePath);

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

  if (!filePath) {
    console.log('No file path found, falling back to GenericToolView');
    return (
      <GenericToolView
        name={name || 'see-image'}
        assistantContent={assistantContent}
        toolContent={toolContent}
        assistantTimestamp={assistantTimestamp}
        toolTimestamp={toolTimestamp}
        isSuccess={isSuccess}
        isStreaming={isStreaming}
      />
    );
  }

  const config = {
    color: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-gradient-to-b from-blue-100 to-blue-50 shadow-inner dark:from-blue-800/40 dark:to-blue-900/60 dark:shadow-blue-950/20',
    badgeColor: 'bg-gradient-to-b from-blue-200 to-blue-100 text-blue-700 dark:from-blue-800/50 dark:to-blue-900/60 dark:text-blue-300',
    hoverColor: 'hover:bg-gradient-to-b hover:from-blue-200 hover:to-blue-100 dark:hover:from-blue-800/60 dark:hover:to-blue-900/40'
  };

  const imageUrl = constructImageUrl(filePath, project);
  const filename = filePath.split('/').pop() || filePath;
  const fileExt = filename.split('.').pop() || '';
  const isAnimated = ['gif', 'webp'].includes(fileExt.toLowerCase());

  return (
    <Card className="flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-white dark:bg-zinc-950">
      <CardHeader className="h-14 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-b p-2 px-4 space-y-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
          <div className={cn("relative p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 transition-colors", config.bgColor)}>
              <ImageIcon className={cn("w-5 h-5", config.color)} />
            </div>
            <div>
              <div className="flex items-center">
                <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                  {filename}
                </CardTitle>
                {isAnimated && (
                  <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1.5 h-4 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">
                    ANIMATED
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          {!isStreaming ? (
            <Badge variant="secondary" className={cn(
              "px-2.5 py-1 transition-colors flex items-center gap-1.5", 
              toolResult.success 
                  ? "bg-gradient-to-b from-emerald-200 to-emerald-100 text-emerald-700 dark:from-emerald-800/50 dark:to-emerald-900/60 dark:text-emerald-300" 
                  : "bg-gradient-to-b from-rose-200 to-rose-100 text-rose-700 dark:from-rose-800/50 dark:to-rose-900/60 dark:text-rose-300"
            )}>
              {toolResult.success ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5" />
                  Success
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Failed
                </>
              )}
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-gradient-to-b from-blue-50 to-blue-100 text-blue-700 border border-blue-200/50 dark:from-blue-900/30 dark:to-blue-800/20 dark:text-blue-400 dark:border-blue-800/30 px-2.5 py-1 flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading image...
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="p-0 flex-1 overflow-hidden relative">
        {isStreaming ? (
          <div className="flex flex-col items-center justify-center h-full p-12 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
            <div className="text-center w-full max-w-xs">
              <div className="space-y-3 mb-6">
                <Skeleton className="h-12 w-12 rounded-full mx-auto" />
                <Skeleton className="h-6 w-32 mx-auto" />
                <Skeleton className="h-4 w-48 mx-auto" />
              </div>
              <Skeleton className="h-48 w-full rounded-lg mb-6" />
              <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-400 to-blue-500 dark:from-blue-600 dark:to-blue-400 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">{progress}%</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="relative w-full overflow-hidden p-6 flex items-center justify-center">
              <SafeImage
                src={imageUrl}
                alt={description || filename}
                filePath={filePath}
                className="max-w-full max-h-[500px] object-contain"
              />
            </div>
          </div>
        )}
      </CardContent>
      
      <div className="h-10 px-4 py-2 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
        <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Badge className="py-0.5 h-6 bg-gradient-to-b from-blue-50 to-blue-100 text-blue-700 border border-blue-200/50 dark:from-blue-900/30 dark:to-blue-800/20 dark:text-blue-400 dark:border-blue-800/30">
            <ImageIcon className="h-3 w-3 mr-1" />
            IMAGE
          </Badge>
          {fileExt && (
            <Badge variant="outline" className="py-0 px-1.5 h-5 text-[10px] uppercase font-medium">
              {fileExt}
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