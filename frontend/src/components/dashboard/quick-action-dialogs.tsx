'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { BarChart3, Image as ImageIcon, Presentation, FileText, Users, Search } from 'lucide-react';
import { SunaModesPanel } from './suna-modes-panel';

export function ChartSelectionDialog({ 
  open, 
  onOpenChange, 
  onSelectPrompt,
  onChartsChange,
  onOutputFormatChange 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSelectPrompt: (prompt: string) => void;
  onChartsChange?: (charts: string[]) => void;
  onOutputFormatChange?: (format: string | null) => void;
}) {
  const [selectedCharts, setSelectedCharts] = useState<string[]>([]);
  const [selectedOutputFormat, setSelectedOutputFormat] = useState<string | null>(null);

  const handleChartsChange = (charts: string[]) => {
    setSelectedCharts(charts);
    onChartsChange?.(charts);
  };

  const handleOutputFormatChange = (format: string | null) => {
    setSelectedOutputFormat(format);
    onOutputFormatChange?.(format);
  };

  const handleApply = () => {
    let prompt = 'Create a data visualization';
    if (selectedOutputFormat) {
      prompt += ` in ${selectedOutputFormat} format`;
    }
    if (selectedCharts.length > 0) {
      prompt += ` with ${selectedCharts.join(', ')} charts`;
    }
    onSelectPrompt(prompt);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            Chart & Data Visualization
          </DialogTitle>
          <DialogDescription>
            Select chart types and output format for your data visualization
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <SunaModesPanel
            selectedMode="data"
            onModeSelect={() => {}}
            onSelectPrompt={onSelectPrompt}
            selectedCharts={selectedCharts}
            onChartsChange={handleChartsChange}
            selectedOutputFormat={selectedOutputFormat}
            onOutputFormatChange={handleOutputFormatChange}
          />
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ImageGenerationDialog({ 
  open, 
  onOpenChange, 
  onSelectPrompt 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSelectPrompt: (prompt: string) => void;
}) {
  const imageStyles = [
    { id: 'photorealistic', name: 'Photorealistic', image: '/images/image-styles/photorealistic_eagle-min.png' },
    { id: 'watercolor', name: 'Watercolor', image: '/images/image-styles/watercolor_garden-min.png' },
    { id: 'digital-art', name: 'Digital Art', image: '/images/image-styles/digital_art_cyberpunk-min.png' },
    { id: 'oil-painting', name: 'Oil Painting', image: '/images/image-styles/oil_painting_villa-min.png' },
    { id: 'minimalist', name: 'Minimalist', image: '/images/image-styles/minimalist_coffee-min.png' },
    { id: 'isometric', name: 'Isometric', image: '/images/image-styles/isometric_bedroom-min.png' },
    { id: 'vintage', name: 'Vintage', image: '/images/image-styles/vintage_diner-min.png' },
    { id: 'comic', name: 'Comic Book', image: '/images/image-styles/comic_book_robot-min.png' },
    { id: 'neon', name: 'Neon', image: '/images/image-styles/neon_jellyfish-min.png' },
    { id: 'pastel', name: 'Pastel', image: '/images/image-styles/pastel_landscape-min.png' },
    { id: 'geometric', name: 'Geometric', image: '/images/image-styles/geometric_crystal-min.png' },
    { id: 'abstract', name: 'Abstract', image: '/images/image-styles/abstract_organic-min.png' },
    { id: 'anime', name: 'Anime', image: '/images/image-styles/anime_forest-min.png' },
    { id: 'impressionist', name: 'Impressionist', image: '/images/image-styles/impressionist_garden-min.png' },
    { id: 'surreal', name: 'Surreal', image: '/images/image-styles/surreal_islands-min.png' },
  ];

  const samplePrompts = [
    'A majestic golden eagle soaring through misty mountain peaks at sunrise with dramatic lighting',
    'Close-up portrait of a fashion model with avant-garde makeup, studio lighting, high contrast shadows',
    'Cozy Scandinavian living room with natural wood furniture, indoor plants, and soft morning sunlight',
    'Futuristic cyberpunk street market at night with neon signs, rain-slicked pavement, and holographic displays',
  ];

  const handleStyleSelect = (styleName: string) => {
    onSelectPrompt(`Generate an image using ${styleName.toLowerCase()} style`);
    onOpenChange(false);
  };

  const handlePromptSelect = (prompt: string) => {
    onSelectPrompt(prompt);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-purple-500" />
            Image Generation
          </DialogTitle>
          <DialogDescription>
            Choose an image style or select from sample prompts
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Sample Prompts */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Sample prompts</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {samplePrompts.map((prompt, index) => (
                <Card
                  key={index}
                  className="p-4 cursor-pointer hover:bg-primary/5 transition-all duration-200 group border border-border rounded-xl"
                  onClick={() => handlePromptSelect(prompt)}
                >
                  <p className="text-sm text-foreground/80 leading-relaxed">{prompt}</p>
                </Card>
              ))}
            </div>
          </div>

          {/* Style Selection */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Choose a style</h3>
            <ScrollArea className="w-full">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 pb-2">
                {imageStyles.map((style) => (
                  <Card
                    key={style.id}
                    className="flex flex-col items-center gap-2 cursor-pointer group p-2 hover:bg-primary/5 transition-all duration-200 border border-border rounded-xl overflow-hidden"
                    onClick={() => handleStyleSelect(style.name)}
                  >
                    <div className="w-full aspect-square bg-gradient-to-br from-muted/50 to-muted rounded-lg border border-border/50 group-hover:border-primary/50 group-hover:scale-105 transition-all duration-200 flex items-center justify-center overflow-hidden relative">
                      {style.image ? (
                        <img 
                          src={style.image} 
                          alt={style.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-muted-foreground/50 group-hover:text-primary/70 transition-colors duration-200" />
                      )}
                    </div>
                    <span className="text-xs text-center text-foreground/70 group-hover:text-foreground transition-colors duration-200 font-medium">
                      {style.name}
                    </span>
                  </Card>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SlidesDialog({ 
  open, 
  onOpenChange, 
  onSelectPrompt 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSelectPrompt: (prompt: string) => void;
}) {
  const handlePromptSelect = (prompt: string) => {
    onSelectPrompt(prompt);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Presentation className="w-5 h-5 text-orange-500" />
            Create Slides
          </DialogTitle>
          <DialogDescription>
            Select a template or choose from sample prompts
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <SunaModesPanel
            selectedMode="slides"
            onModeSelect={() => {}}
            onSelectPrompt={handlePromptSelect}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DocsDialog({ 
  open, 
  onOpenChange, 
  onSelectPrompt 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSelectPrompt: (prompt: string) => void;
}) {
  const handlePromptSelect = (prompt: string) => {
    onSelectPrompt(prompt);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-green-500" />
            Create Documents
          </DialogTitle>
          <DialogDescription>
            Select a document template or choose from sample prompts
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <SunaModesPanel
            selectedMode="docs"
            onModeSelect={() => {}}
            onSelectPrompt={handlePromptSelect}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PeopleDialog({ 
  open, 
  onOpenChange, 
  onSelectPrompt 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSelectPrompt: (prompt: string) => void;
}) {
  const handlePromptSelect = (prompt: string) => {
    onSelectPrompt(prompt);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-pink-500" />
            Find People
          </DialogTitle>
          <DialogDescription>
            Search for people based on your criteria
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <SunaModesPanel
            selectedMode="people"
            onModeSelect={() => {}}
            onSelectPrompt={handlePromptSelect}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ResearchDialog({ 
  open, 
  onOpenChange, 
  onSelectPrompt 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSelectPrompt: (prompt: string) => void;
}) {
  const handlePromptSelect = (prompt: string) => {
    onSelectPrompt(prompt);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-indigo-500" />
            Research
          </DialogTitle>
          <DialogDescription>
            Research topics and get comprehensive analysis
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <SunaModesPanel
            selectedMode="research"
            onModeSelect={() => {}}
            onSelectPrompt={handlePromptSelect}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
