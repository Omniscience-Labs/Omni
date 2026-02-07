'use client';

import { Download, FileJson, Minus, Plus, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { FontFamily } from './types';

const FONT_OPTIONS: FontFamily[] = [
  'Arial',
  'Times New Roman',
  'Calibri',
  'Helvetica',
  'Courier New',
  'Georgia',
  'Verdana',
  'Comic Sans MS',
  'Trebuchet MS',
  'Tahoma',
];

interface ToolbarProps {
  fontSize: number;
  fontFamily: FontFamily;
  onFontSizeChange: (size: number) => void;
  onFontFamilyChange: (family: FontFamily) => void;
  onExport: () => void;
  onDownloadJson: () => void;
  disabled?: boolean;
  className?: string;
}

export function Toolbar({
  fontSize,
  fontFamily,
  onFontSizeChange,
  onFontFamilyChange,
  onExport,
  onDownloadJson,
  disabled,
  className,
}: ToolbarProps) {
  const handleFontSizeDecrease = () => {
    if (fontSize > 8) {
      onFontSizeChange(fontSize - 2);
    }
  };

  const handleFontSizeIncrease = () => {
    if (fontSize < 48) {
      onFontSizeChange(fontSize + 2);
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-4 p-4 bg-card border-b border-border',
        className
      )}
    >
      <div className="flex items-center gap-4">
        {/* Font Family Selector */}
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Font:</span>
          <Select
            value={fontFamily}
            onValueChange={(value) => onFontFamilyChange(value as FontFamily)}
            disabled={disabled}
          >
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((font) => (
                <SelectItem key={font} value={font}>
                  <span style={{ fontFamily: font }}>{font}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Font Size Controls */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Size:</span>
          <Button
            variant="outline"
            size="icon"
            onClick={handleFontSizeDecrease}
            disabled={disabled || fontSize <= 8}
            className="h-8 w-8"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <div className="w-20">
            <Slider
              value={[fontSize]}
              onValueChange={([value]) => onFontSizeChange(value)}
              min={8}
              max={48}
              step={2}
              disabled={disabled}
              className="w-full"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleFontSizeIncrease}
            disabled={disabled || fontSize >= 48}
            className="h-8 w-8"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-[3ch]">
            {fontSize}px
          </span>
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <Button
          onClick={onDownloadJson}
          disabled={disabled}
          variant="outline"
          size="default"
          className="gap-2"
        >
          <FileJson className="h-4 w-4" />
          Download JSON
        </Button>
        <Button
          onClick={onExport}
          disabled={disabled}
          variant="default"
          size="default"
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Export PDF
        </Button>
      </div>
    </div>
  );
}
