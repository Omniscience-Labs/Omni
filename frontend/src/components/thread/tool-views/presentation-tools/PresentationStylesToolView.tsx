import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Palette, CheckCircle, AlertTriangle, MessageSquare, Clock } from 'lucide-react';
import { ToolViewProps } from '../types';
import { extractToolData, getToolTitle, formatTimestamp } from '../utils';
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingState } from '../shared/LoadingState';

interface StyleInfo {
  name: string;
  description: string;
  primary_color: string;
  accent_color: string;
  background: string;
  text_color: string;
  font: string;
  characteristics: string[];
}

interface PresentationStylesData {
  styles: Record<string, StyleInfo>;
  message: string;
  usage_tip?: string;
}

// Style preview component that renders a display-only slide preview
const StylePreview: React.FC<{ style: StyleInfo; styleName: string }> = ({ style, styleName }) => {
  const isDark = style.background.startsWith('#0') || style.background.startsWith('#1') || 
                style.background.includes('gradient') || style.background === '#164E63' || 
                style.background === '#451A03' || style.background === '#78350F' || 
                style.background === '#064E3B';

  return (
    <div className="relative">
      <div 
        className="w-full aspect-[16/9] rounded-lg overflow-hidden border border-gray-200 relative shadow-sm"
        style={{
          background: style.background,
          color: style.text_color
        }}
      >
        {/* Slide content */}
        <div className="absolute inset-0 p-6 flex flex-col justify-center">
          <div 
            className="text-2xl font-bold mb-3 truncate"
            style={{ color: style.primary_color }}
          >
            {style.name}
          </div>
          <div 
            className="w-12 h-1.5 mb-4 rounded"
            style={{ backgroundColor: style.accent_color }}
          />
          <div 
            className="text-base opacity-80 mb-3"
            style={{ color: style.text_color }}
          >
            Sample Content
          </div>
          
          {/* Visual elements based on style characteristics */}
          {style.characteristics.includes('Charts') || style.characteristics.includes('data') ? (
            <div className="flex items-center gap-3 mt-auto">
              <div 
                className="w-6 h-6 rounded"
                style={{ backgroundColor: style.primary_color }}
              />
              <div 
                className="w-8 h-6 rounded"
                style={{ backgroundColor: style.accent_color }}
              />
              <div 
                className="w-4 h-6 rounded opacity-60"
                style={{ backgroundColor: style.primary_color }}
              />
            </div>
          ) : style.characteristics.includes('Magazine') || style.characteristics.includes('editorial') ? (
            <div className="flex items-center justify-between mt-auto">
              <div className="flex flex-col">
                <div 
                  className="text-sm font-medium"
                  style={{ color: style.primary_color }}
                >
                  Feature
                </div>
                <div className="text-sm opacity-60">Detail</div>
              </div>
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ 
                  backgroundColor: style.accent_color,
                  color: isDark ? '#FFFFFF' : style.text_color
                }}
              >
                📖
              </div>
            </div>
          ) : style.characteristics.includes('Embedded image') || style.characteristics.includes('image') ? (
            <div 
              className="absolute inset-0 bg-center bg-cover opacity-20"
              style={{
                backgroundImage: `linear-gradient(45deg, ${style.primary_color}33, ${style.accent_color}33)`
              }}
            />
          ) : (
            <div className="flex items-center gap-3 mt-auto">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: style.accent_color }}
              />
              <div className="text-sm opacity-70">Key Point</div>
            </div>
          )}
        </div>
      </div>
      
      {/* Style name below */}
      <div className="mt-3 text-center">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 capitalize text-lg">
          {style.name}
        </h3>
      </div>
    </div>
  );
};

export const PresentationStylesToolView: React.FC<ToolViewProps> = ({
  name = 'presentation-styles',
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}) => {
  const toolTitle = getToolTitle(name);
  const extractedData = extractToolData(toolContent);
  
  // Parse the tool result to get our specific data
  let data: PresentationStylesData | null = null;
  if (extractedData.toolResult?.toolOutput) {
    try {
      data = typeof extractedData.toolResult.toolOutput === 'string' 
        ? JSON.parse(extractedData.toolResult.toolOutput)
        : extractedData.toolResult.toolOutput;
    } catch (e) {
      console.error('Failed to parse presentation styles data:', e);
    }
  }

  const styles = data?.styles ? Object.entries(data.styles) as Array<[string, StyleInfo]> : [];

  return (
    <Card className="gap-0 flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20">
              <Palette className="w-5 h-5 text-blue-500 dark:text-blue-400" />
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
              className="bg-gradient-to-b from-emerald-200 to-emerald-100 text-emerald-700 dark:from-emerald-800/50 dark:to-emerald-900/60 dark:text-emerald-300"
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1" />
              {styles.length} styles loaded
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden relative">
        {isStreaming ? (
          <LoadingState
            icon={Palette}
            iconColor="text-blue-500 dark:text-blue-400"
            bgColor="bg-gradient-to-b from-blue-100 to-blue-50 shadow-inner dark:from-blue-800/40 dark:to-blue-900/60 dark:shadow-blue-950/20"
            title="Loading presentation styles"
            filePath="Fetching available styles..."
            showProgress={true}
          />
        ) : !data || !data.styles ? (
          <div className="p-8 text-center">
            <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400">
              <AlertTriangle className="w-5 h-5" />
              <span>No presentation styles available</span>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full w-full">
            <div className="p-6">
              
              {/* Instructions */}
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                      How to Use Styles
                    </p>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      To apply a style to your presentation, simply mention the style name in your chat message. 
                      For example: "Create a slide using the <strong>minimal</strong> style" or "Apply the <strong>vercel</strong> theme to my presentation"
                    </p>
                  </div>
                </div>
              </div>

              {/* Styles Grid - 2 per row */}
              <div className="grid grid-cols-2 gap-6">
                {styles.map(([styleName, styleInfo]) => (
                  <StylePreview 
                    key={styleName} 
                    style={styleInfo} 
                    styleName={styleName}
                  />
                ))}
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>

      {/* Footer */}
      <div className="px-4 py-2 h-10 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center gap-4">
        <div className="h-full flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          {!isStreaming && styles.length > 0 && (
            <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900">
              <Palette className="h-3 w-3 mr-1" />
              {styles.length} Styles Available
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
};
