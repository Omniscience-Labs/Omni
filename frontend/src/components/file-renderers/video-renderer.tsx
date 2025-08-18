'use client';

import React, { useState } from 'react';
import { AlertTriangle, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VideoRendererProps {
  url: string;
  fileName?: string;
  className?: string;
  onDownload?: () => void;
  isDownloading?: boolean;
}

export function VideoRenderer({ 
  url, 
  fileName = 'video.mp4', 
  className,
  onDownload,
  isDownloading = false
}: VideoRendererProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleLoadStart = () => {
    setIsLoading(true);
    setHasError(false);
  };

  const handleCanPlay = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    } else {
      // Fallback download method
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-64 bg-gradient-to-b from-red-50 to-red-100 dark:from-red-950/30 dark:to-red-900/20 rounded-lg border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
        <AlertTriangle className="h-8 w-8 mb-2" />
        <p className="text-sm font-medium">Unable to load video</p>
        <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">
          {fileName}
        </p>
        <Button 
          onClick={handleDownload}
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={isDownloading}
        >
          {isDownloading ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Downloading...
            </>
          ) : (
            <>
              <Download className="h-3 w-3 mr-1" />
              Download
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full", className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg z-10">
          <div className="flex flex-col items-center">
            <Loader2 className="h-8 w-8 animate-spin text-violet-600 mb-2" />
            <p className="text-sm text-muted-foreground">Loading video...</p>
          </div>
        </div>
      )}
      
      <div className="space-y-3">
        <video
          controls
          className="w-full h-auto rounded-lg shadow-sm"
          preload="metadata"
          onLoadStart={handleLoadStart}
          onCanPlay={handleCanPlay}
          onError={handleError}
          style={{ display: isLoading ? 'none' : 'block' }}
        >
          <source src={url} type="video/mp4" />
          <source src={url} type="video/webm" />
          <source src={url} type="video/ogg" />
          Your browser does not support the video element.
        </video>

        {/* Download button */}
        {!isLoading && !hasError && (
          <div className="flex justify-center">
            <Button 
              onClick={handleDownload}
              variant="outline"
              size="sm"
              disabled={isDownloading}
              className="bg-violet-50 hover:bg-violet-100 border-violet-200 text-violet-700 dark:bg-violet-900/20 dark:hover:bg-violet-900/30 dark:border-violet-800 dark:text-violet-300"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="h-3 w-3 mr-1" />
                  Download {fileName}
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}