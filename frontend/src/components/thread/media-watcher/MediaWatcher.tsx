import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize,
  SkipForward,
  SkipBack,
  Download,
  Loader2,
  AlertTriangle,
  Video as VideoIcon,
  Headphones,
  Monitor
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface MediaWatcherProps {
  mediaUrl: string;
  mediaType: 'video' | 'audio';
  title?: string;
  subtitle?: string;
  showDownload?: boolean;
  onDownload?: () => void;
  isDownloading?: boolean;
  className?: string;
  thumbnailUrl?: string;
  metadata?: {
    duration?: string;
    size?: string;
    quality?: string;
    format?: string;
  };
}

export function MediaWatcher({
  mediaUrl,
  mediaType,
  title = 'Media Player',
  subtitle,
  showDownload = false,
  onDownload,
  isDownloading = false,
  className,
  thumbnailUrl,
  metadata,
}: MediaWatcherProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const handleTimeUpdate = () => setCurrentTime(media.currentTime);
    const handleDurationChange = () => setDuration(media.duration);
    const handleLoadStart = () => {
      setIsLoading(true);
      setHasError(false);
    };
    const handleCanPlay = () => setIsLoading(false);
    const handleError = () => {
      setIsLoading(false);
      setHasError(true);
      toast.error('Failed to load media');
    };
    const handleEnded = () => setIsPlaying(false);

    media.addEventListener('timeupdate', handleTimeUpdate);
    media.addEventListener('durationchange', handleDurationChange);
    media.addEventListener('loadstart', handleLoadStart);
    media.addEventListener('canplay', handleCanPlay);
    media.addEventListener('error', handleError);
    media.addEventListener('ended', handleEnded);

    return () => {
      media.removeEventListener('timeupdate', handleTimeUpdate);
      media.removeEventListener('durationchange', handleDurationChange);
      media.removeEventListener('loadstart', handleLoadStart);
      media.removeEventListener('canplay', handleCanPlay);
      media.removeEventListener('error', handleError);
      media.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const media = mediaRef.current;
    if (!media) return;

    if (isPlaying) {
      media.pause();
    } else {
      media.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number[]) => {
    const media = mediaRef.current;
    if (!media) return;

    media.currentTime = value[0];
    setCurrentTime(value[0]);
  };

  const handleVolumeChange = (value: number[]) => {
    const media = mediaRef.current;
    if (!media) return;

    const newVolume = value[0];
    media.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    const media = mediaRef.current;
    if (!media) return;

    if (isMuted) {
      media.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      media.volume = 0;
      setIsMuted(true);
    }
  };

  const skip = (seconds: number) => {
    const media = mediaRef.current;
    if (!media) return;

    media.currentTime = Math.max(0, Math.min(duration, currentTime + seconds));
  };

  const changePlaybackRate = () => {
    const media = mediaRef.current;
    if (!media) return;

    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    
    media.playbackRate = nextRate;
    setPlaybackRate(nextRate);
    toast.success(`Playback speed: ${nextRate}x`);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container || mediaType === 'audio') return;

    if (!document.fullscreenElement) {
      container.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const formatTime = (time: number) => {
    if (!isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (hasError) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center mb-4">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Unable to Load Media</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              The {mediaType} file could not be loaded. Please try again later.
            </p>
            {showDownload && onDownload && (
              <Button 
                onClick={onDownload} 
                disabled={isDownloading}
                variant="outline" 
                className="mt-4"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download Instead
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      ref={containerRef}
      className={cn(
        "w-full overflow-hidden",
        isFullscreen && "fixed inset-0 z-50 rounded-none",
        className
      )}
    >
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center border",
              mediaType === 'video' 
                ? "bg-violet-100 dark:bg-violet-900/30" 
                : "bg-rose-100 dark:bg-rose-900/30"
            )}>
              {mediaType === 'video' ? (
                <VideoIcon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              ) : (
                <Headphones className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              )}
            </div>
            <div>
              <CardTitle className="text-lg font-semibold">
                {title}
              </CardTitle>
              {subtitle && (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              <Monitor className="h-3 w-3 mr-1" />
              Streaming
            </Badge>
            {showDownload && onDownload && (
              <Button 
                onClick={onDownload} 
                disabled={isDownloading}
                variant="ghost" 
                size="sm"
              >
                {isDownloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="relative bg-black">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="flex flex-col items-center">
                <Loader2 className="h-12 w-12 animate-spin text-white mb-4" />
                <p className="text-white text-sm">Loading {mediaType}...</p>
              </div>
            </div>
          )}

          {mediaType === 'video' ? (
            <video
              ref={mediaRef as React.RefObject<HTMLVideoElement>}
              className="w-full aspect-video object-contain"
              poster={thumbnailUrl}
              preload="metadata"
              onClick={togglePlay}
            >
              <source src={mediaUrl} type="video/mp4" />
              Your browser does not support the video element.
            </video>
          ) : (
            <div className="w-full aspect-video flex items-center justify-center bg-gradient-to-br from-rose-500 to-orange-500">
              <div className="text-center text-white p-8">
                <Headphones className="h-20 w-20 mx-auto mb-4 opacity-80" />
                <h3 className="text-2xl font-bold mb-2">{title}</h3>
                {subtitle && <p className="text-sm opacity-90">{subtitle}</p>}
              </div>
              <audio
                ref={mediaRef as React.RefObject<HTMLAudioElement>}
                preload="metadata"
              >
                <source src={mediaUrl} type="audio/mpeg" />
                Your browser does not support the audio element.
              </audio>
            </div>
          )}
        </div>

        {/* Custom Controls */}
        <div className="bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950 border-t p-4 space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              className="w-full"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => skip(-10)}
                className="h-8 w-8"
              >
                <SkipBack className="h-4 w-4" />
              </Button>

              <Button
                variant="default"
                size="icon"
                onClick={togglePlay}
                className="h-10 w-10"
                disabled={isLoading}
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => skip(10)}
                className="h-8 w-8"
              >
                <SkipForward className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={changePlaybackRate}
                className="h-8 px-2 text-xs"
              >
                {playbackRate}x
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {/* Volume Control */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className="h-8 w-8"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  max={1}
                  step={0.01}
                  onValueChange={handleVolumeChange}
                  className="w-20"
                />
              </div>

              {/* Fullscreen for video */}
              {mediaType === 'video' && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleFullscreen}
                  className="h-8 w-8"
                >
                  {isFullscreen ? (
                    <Minimize className="h-4 w-4" />
                  ) : (
                    <Maximize className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Metadata */}
          {metadata && (
            <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
              {metadata.quality && (
                <div>
                  <span className="font-medium">Quality:</span> {metadata.quality}
                </div>
              )}
              {metadata.format && (
                <div>
                  <span className="font-medium">Format:</span> {metadata.format}
                </div>
              )}
              {metadata.size && (
                <div>
                  <span className="font-medium">Size:</span> {metadata.size}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

