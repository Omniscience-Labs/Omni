import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Palette, Type } from 'lucide-react';
import { ToolViewProps } from '../types';
import { extractToolData } from '../utils';

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

// Style preview component that renders a mini slide preview
const StylePreview: React.FC<{ style: StyleInfo; styleName: string }> = ({ style, styleName }) => {
  const isGradient = style.background.includes('gradient');
  const isDark = style.background.startsWith('#0') || style.background.startsWith('#1') || 
                style.background.includes('gradient') || style.background === '#164E63' || 
                style.background === '#451A03' || style.background === '#78350F' || 
                style.background === '#064E3B';

  return (
    <div className="relative group cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg">
      <div 
        className="w-full aspect-[16/9] rounded-lg overflow-hidden border border-gray-200 relative"
        style={{
          background: style.background,
          color: style.text_color
        }}
      >
        {/* Mini slide content */}
        <div className="absolute inset-0 p-4 flex flex-col justify-center">
          <div 
            className="text-lg font-bold mb-2 truncate"
            style={{ color: style.primary_color }}
          >
            {style.name}
          </div>
          <div 
            className="w-8 h-1 mb-3 rounded"
            style={{ backgroundColor: style.accent_color }}
          />
          <div 
            className="text-sm opacity-80 mb-2"
            style={{ color: style.text_color }}
          >
            This is a body text
          </div>
          
          {/* Visual elements based on style characteristics */}
          {style.characteristics.includes('Charts') || style.characteristics.includes('data') ? (
            <div className="flex items-center gap-2 mt-auto">
              <div 
                className="w-4 h-4 rounded"
                style={{ backgroundColor: style.primary_color }}
              />
              <div 
                className="w-6 h-4 rounded"
                style={{ backgroundColor: style.accent_color }}
              />
              <div 
                className="w-3 h-4 rounded opacity-60"
                style={{ backgroundColor: style.primary_color }}
              />
            </div>
          ) : style.characteristics.includes('Magazine') || style.characteristics.includes('editorial') ? (
            <div className="flex items-center justify-between mt-auto">
              <div className="flex flex-col">
                <div 
                  className="text-xs font-medium"
                  style={{ color: style.primary_color }}
                >
                  Article
                </div>
                <div className="text-xs opacity-60">Reading time</div>
              </div>
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
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
                backgroundImage: `linear-gradient(45deg, ${style.primary_color}22, ${style.accent_color}22)`
              }}
            />
          ) : (
            <div className="flex items-center gap-2 mt-auto">
              <div 
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: style.accent_color }}
              />
              <div className="text-xs opacity-70">Feature point</div>
            </div>
          )}
        </div>
        
        {/* Slide number indicator */}
        <div 
          className="absolute bottom-2 right-2 text-xs opacity-60"
          style={{ color: style.text_color }}
        >
          1
        </div>
      </div>
      
      {/* Style name below */}
      <div className="mt-3 text-center">
        <h3 className="font-medium text-gray-900 capitalize">
          {style.name}
        </h3>
        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
          {style.description}
        </p>
      </div>
    </div>
  );
};

export const PresentationStylesToolView: React.FC<ToolViewProps> = ({
  toolContent
}) => {
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

  if (!data || !data.styles) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-gray-600">
            <Palette className="w-5 h-5" />
            <span>Loading presentation styles...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const styles = Object.entries(data.styles) as Array<[string, StyleInfo]>;
  
  // Group styles by category
  const premiumStyles = styles.filter(([key]) => 
    ['silicon', 'vercel', 'legal', 'investment', 'luxury', 'minimal'].includes(key)
  );
  
  const industryStyles = styles.filter(([key]) => 
    ['medical', 'startup', 'academic', 'obsidian'].includes(key)
  );
  
  const creativeStyles = styles.filter(([key]) => 
    ['velvet', 'aurora', 'coral', 'ember', 'electric', 'orchid'].includes(key)
  );
  
  const professionalStyles = styles.filter(([key]) => 
    ['glacier', 'sage', 'platinum', 'midnight', 'citrus', 'frost', 'azure', 'crimson'].includes(key)
  );
  
  const uniqueStyles = styles.filter(([key]) => 
    !premiumStyles.some(([k]) => k === key) && 
    !industryStyles.some(([k]) => k === key) && 
    !creativeStyles.some(([k]) => k === key) && 
    !professionalStyles.some(([k]) => k === key) &&
    key !== 'default'
  );

  const defaultStyle = styles.find(([key]) => key === 'default');

  const StyleSection: React.FC<{ title: string; styles: Array<[string, StyleInfo]>; description?: string }> = ({ 
    title, 
    styles: sectionStyles, 
    description 
  }) => (
    <div className="mb-8">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
        {description && (
          <p className="text-sm text-gray-600">{description}</p>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {sectionStyles.map(([styleName, styleInfo]) => (
          <StylePreview 
            key={styleName} 
            style={styleInfo} 
            styleName={styleName}
          />
        ))}
      </div>
    </div>
  );

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Palette className="w-6 h-6 text-blue-600" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Presentation Styles
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {data.message} - Choose a style to match your presentation's purpose and audience
            </p>
          </div>
        </div>

        {data.usage_tip && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Type className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-900 mb-1">Usage Tip</p>
                <p className="text-sm text-blue-800">{data.usage_tip}</p>
              </div>
            </div>
          </div>
        )}

        {/* Default Style (highlighted) */}
        {defaultStyle && (
          <div className="mb-8">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Default Style</h3>
              <p className="text-sm text-gray-600">Clean Inter black/white theme - perfect starting point</p>
            </div>
            <div className="max-w-xs">
              <StylePreview 
                style={defaultStyle[1]} 
                styleName={defaultStyle[0]}
              />
            </div>
          </div>
        )}

        {/* Style Categories */}
        <StyleSection
          title="Premium Professional"
          description="High-end corporate and minimalist designs"
          styles={premiumStyles}
        />
        
        <StyleSection
          title="Industry Specific"
          description="Tailored for healthcare, startups, academia, and tech"
          styles={industryStyles}
        />
        
        <StyleSection
          title="Creative & Artistic"
          description="Vibrant and expressive designs with unique aesthetics"
          styles={creativeStyles}
        />
        
        <StyleSection
          title="Professional Business"
          description="Classic corporate styles for presentations and reports"
          styles={professionalStyles}
        />
        
        {uniqueStyles.length > 0 && (
          <StyleSection
            title="Unique Aesthetics"
            description="Distinctive styles with specialized themes and visual approaches"
            styles={uniqueStyles}
          />
        )}

        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Badge variant="outline" className="text-xs">
              {styles.length} Styles Available
            </Badge>
            <span>•</span>
            <span>Each style includes custom fonts and color palettes</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
