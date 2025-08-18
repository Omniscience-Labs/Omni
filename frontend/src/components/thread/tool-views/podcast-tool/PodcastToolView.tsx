import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Headphones, 
  Download, 
  PlayCircle, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle,
  Clock,
  Mic
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolViewProps } from '../types';
import { LoadingState } from '../shared/LoadingState';

interface PodcastData {
  agent_run_id?: string;
  podcast_title?: string;
  tts_model?: string;
  status?: string;
  podcast_url?: string;
  audio_url?: string;
  transcript_url?: string;
  message?: string;
  message_count?: number;
  service_response?: any;
  error?: string;
}

export function PodcastToolView({
  name = 'generate_podcast',
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const [podcastData, setPodcastData] = useState<PodcastData>({});
  const [progress, setProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  // Parse tool content
  useEffect(() => {
    if (toolContent && !isStreaming) {
      try {
        const contentStr = typeof toolContent === 'string' ? toolContent : JSON.stringify(toolContent);
        
        // Try to parse as JSON first
        let parsedData: PodcastData = {};
        try {
          parsedData = JSON.parse(contentStr);
        } catch {
          // If not JSON, look for specific patterns
          const urlMatch = contentStr.match(/podcast_url["']?\s*:\s*["']([^"']+)["']/);
          const audioMatch = contentStr.match(/audio_url["']?\s*:\s*["']([^"']+)["']/);
          const statusMatch = contentStr.match(/status["']?\s*:\s*["']([^"']+)["']/);
          const titleMatch = contentStr.match(/podcast_title["']?\s*:\s*["']([^"']+)["']/);
          const ttsMatch = contentStr.match(/tts_model["']?\s*:\s*["']([^"']+)["']/);
          
          if (urlMatch || audioMatch) {
            parsedData = {
              podcast_url: urlMatch?.[1],
              audio_url: audioMatch?.[1],
              status: statusMatch?.[1] || 'completed',
              podcast_title: titleMatch?.[1] || 'Generated Podcast',
              tts_model: ttsMatch?.[1] || 'openai'
            };
          }
        }
        
        setPodcastData(parsedData);
      } catch (e) {
        console.error('Error parsing podcast tool content:', e);
      }
    }
  }, [toolContent, isStreaming]);

  // Progress animation for streaming
  useEffect(() => {
    if (isStreaming) {
      setProgress(0);
      const timer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(timer);
            return prev;
          }
          return prev + 1;
        });
      }, 2000); // Slower progress for 2-3 minute generation
      
      return () => clearInterval(timer);
    } else {
      setProgress(100);
    }
  }, [isStreaming]);

  const handleDownload = async () => {
    const audioUrl = podcastData.audio_url || podcastData.podcast_url;
    if (!audioUrl || isDownloading) return;

    setIsDownloading(true);
    try {
      // Ensure HTTPS URL
      const httpsUrl = audioUrl.replace('http://', 'https://');
      
      const response = await fetch(httpsUrl);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${podcastData.podcast_title || 'podcast'}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePlayInBrowser = () => {
    const audioUrl = podcastData.audio_url || podcastData.podcast_url;
    if (audioUrl) {
      const httpsUrl = audioUrl.replace('http://', 'https://');
      window.open(httpsUrl, '_blank');
    }
  };

  const getTTSDisplayName = (model: string) => {
    const names: Record<string, string> = {
      'openai': 'OpenAI TTS',
      'elevenlabs': 'ElevenLabs',
      'edge': 'Edge TTS'
    };
    return names[model] || model.toUpperCase();
  };

  const getTTSBadgeColor = (model: string) => {
    const colors: Record<string, string> = {
      'openai': 'bg-blue-100 text-blue-800 dark:bg-blue-800/30 dark:text-blue-300',
      'elevenlabs': 'bg-purple-100 text-purple-800 dark:bg-purple-800/30 dark:text-purple-300',
      'edge': 'bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-300'
    };
    return colors[model] || 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300';
  };

  if (isStreaming) {
    return (
      <Card className="gap-0 flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-card">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-rose-50 to-orange-50 dark:from-rose-950/50 dark:to-orange-950/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-800/50 border flex items-center justify-center">
                <Headphones className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Podcast Generator
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Generating podcast from agent conversation...
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-800/30 dark:text-yellow-300">
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Generating
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0 h-full flex-1 overflow-hidden">
          <LoadingState
            icon={Mic}
            iconColor="text-rose-500 dark:text-rose-400"
            bgColor="bg-gradient-to-b from-rose-100 to-rose-50 shadow-inner dark:from-rose-800/40 dark:to-rose-900/60"
            title="Generating Your Podcast"
            subtitle="This process takes 2-3 minutes. Converting conversation to engaging audio format..."
            showProgress={true}
            progressText="Processing conversation and generating speech"
            autoProgress={true}
            initialProgress={0}
          />
        </CardContent>
      </Card>
    );
  }

  const audioUrl = podcastData.audio_url || podcastData.podcast_url;
  const hasAudio = !!audioUrl;

  return (
    <Card className="gap-0 flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="border-b border-border/50 bg-gradient-to-r from-rose-50 to-orange-50 dark:from-rose-950/50 dark:to-orange-950/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-800/50 border flex items-center justify-center">
              <Headphones className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Podcast Generator
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {podcastData.podcast_title || 'Agent Conversation Podcast'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {podcastData.tts_model && (
              <Badge className={getTTSBadgeColor(podcastData.tts_model)}>
                {getTTSDisplayName(podcastData.tts_model)}
              </Badge>
            )}
            <Badge variant={isSuccess && hasAudio ? 'default' : 'destructive'} 
                   className={isSuccess && hasAudio ? 'bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-300' : ''}>
              {isSuccess && hasAudio ? (
                <>
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Ready
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Failed
                </>
              )}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        {isSuccess && hasAudio ? (
          <div className="p-6 space-y-6">
            {/* Podcast Info */}
            <div className="bg-gradient-to-r from-rose-50 to-orange-50 dark:from-rose-950/50 dark:to-orange-950/50 rounded-lg p-4 border">
              <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                <Headphones className="h-5 w-5 text-rose-600" />
                {podcastData.podcast_title || 'Agent Conversation Podcast'}
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">TTS Engine:</span>
                  <span className="ml-2 font-medium">{getTTSDisplayName(podcastData.tts_model || 'openai')}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Format:</span>
                  <span className="ml-2 font-medium">MP3 Audio</span>
                </div>
                {podcastData.message_count && (
                  <div>
                    <span className="text-muted-foreground">Messages:</span>
                    <span className="ml-2 font-medium">{podcastData.message_count}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <span className="ml-2 font-medium text-green-600">Ready to Download</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download Podcast
                  </>
                )}
              </Button>
              
              <Button 
                variant="outline" 
                onClick={handlePlayInBrowser}
                className="flex-1"
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                Play in Browser
              </Button>
            </div>

            {/* Audio Player */}
            {audioUrl && (
              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4 border">
                <div className="flex items-center gap-2 mb-3">
                  <Mic className="h-4 w-4 text-rose-600" />
                  <span className="font-medium text-sm">Audio Player</span>
                </div>
                <audio 
                  controls 
                  className="w-full"
                  preload="metadata"
                >
                  <source src={audioUrl.replace('http://', 'https://')} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {/* Transcript Link */}
            {podcastData.transcript_url && (
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-sm">Transcript Available</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.open(podcastData.transcript_url!.replace('http://', 'https://'), '_blank')}
                  >
                    View Transcript
                  </Button>
                </div>
              </div>
            )}

            {/* Generation Details */}
            {podcastData.service_response && (
              <details className="bg-zinc-50 dark:bg-zinc-900 rounded-lg border">
                <summary className="p-4 cursor-pointer font-medium text-sm">
                  Technical Details
                </summary>
                <div className="px-4 pb-4 text-xs">
                  <pre className="bg-zinc-100 dark:bg-zinc-800 rounded p-3 overflow-auto">
                    {JSON.stringify(podcastData.service_response, null, 2)}
                  </pre>
                </div>
              </details>
            )}
          </div>
        ) : (
          // Error State
          <div className="flex flex-col items-center justify-center h-64 p-6">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center mb-4">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Podcast Generation Failed</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              {podcastData.error || 'An error occurred while generating the podcast. Please try again.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}