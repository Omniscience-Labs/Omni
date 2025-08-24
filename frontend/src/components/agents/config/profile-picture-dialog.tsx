'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { IconPicker } from './icon-picker';
import { AgentIconAvatar } from './agent-icon-avatar';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ProfilePictureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl?: string;
  agentName?: string;
  onImageUpdate: (url: string | null) => void;
  currentIconName?: string;
  currentIconColor?: string;
  currentBackgroundColor?: string;
  onIconUpdate?: (iconName: string | null, iconColor: string, backgroundColor: string) => void;
}

export function ProfilePictureDialog({
  isOpen,
  onClose,
  currentImageUrl,
  agentName,
  onImageUpdate,
  currentIconName,
  currentIconColor = '#000000',
  currentBackgroundColor = '#F3F4F6',
  onIconUpdate,
}: ProfilePictureDialogProps) {
  const [selectedIcon, setSelectedIcon] = useState(currentIconName || 'bot');
  const [iconColor, setIconColor] = useState(currentIconColor || '#000000');
  const [backgroundColor, setBackgroundColor] = useState(currentBackgroundColor || '#e5e5e5');

  useEffect(() => {
    if (isOpen) {
      setSelectedIcon(currentIconName || 'bot');
      setIconColor(currentIconColor || '#000000');
      setBackgroundColor(currentBackgroundColor || '#e5e5e5');
    }
  }, [isOpen, currentIconName, currentIconColor, currentBackgroundColor]);
  
  const handleIconSave = useCallback(() => {
    if (onIconUpdate) {
      onIconUpdate(selectedIcon, iconColor, backgroundColor);
      onImageUpdate(null);
      toast.success('Agent icon updated!');
      onClose();
    }
  }, [selectedIcon, iconColor, backgroundColor, onIconUpdate, onImageUpdate, onClose]);

  const presetColors = [
    { bg: '#6366F1', icon: '#FFFFFF', name: 'Indigo' },
    { bg: '#10B981', icon: '#FFFFFF', name: 'Emerald' },
    { bg: '#F59E0B', icon: '#FFFFFF', name: 'Amber' },
    { bg: '#EF4444', icon: '#FFFFFF', name: 'Red' },
    { bg: '#8B5CF6', icon: '#FFFFFF', name: 'Purple' },
  ];
  
  const ColorControls = () => (
    <div className="space-y-6">

      <div className="flex flex-col items-center space-y-3 py-4">
        <AgentIconAvatar
          iconName={selectedIcon}
          iconColor={iconColor}
          backgroundColor={backgroundColor}
          agentName={agentName}
          size={100}
          className="rounded-3xl border"
        />
        <div className="text-center">
          <p className="font-medium">{agentName || 'Agent'}</p>
        </div>
      </div>
      <div className="space-y-4">
        <div>
          <Label htmlFor="icon-color" className="text-sm mb-2 block">Icon Color</Label>
          <div className="flex gap-2">
            <Input
              id="icon-color"
              type="color"
              value={iconColor}
              onChange={(e) => setIconColor(e.target.value)}
              className="w-16 h-10 p-1 cursor-pointer"
            />
            <Input
              type="text"
              value={iconColor}
              onChange={(e) => setIconColor(e.target.value)}
              placeholder="#000000"
              className="flex-1"
              maxLength={7}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="bg-color" className="text-sm mb-2 block">Background Color</Label>
          <div className="flex gap-2">
            <Input
              id="bg-color"
              type="color"
              value={backgroundColor}
              onChange={(e) => setBackgroundColor(e.target.value)}
              className="w-16 h-10 p-1 cursor-pointer"
            />
            <Input
              type="text"
              value={backgroundColor}
              onChange={(e) => setBackgroundColor(e.target.value)}
              placeholder="#F3F4F6"
              className="flex-1"
              maxLength={7}
            />
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <Label className="text-sm">Quick Presets</Label>
        <div className="grid grid-cols-5 gap-2">
          {presetColors.map((preset) => (
            <button
              key={preset.name}
              onClick={() => {
                setIconColor(preset.icon);
                setBackgroundColor(preset.bg);
              }}
              className="group relative h-10 w-full rounded-lg border-2 border-border hover:border-primary transition-all hover:scale-105"
              style={{ backgroundColor: preset.bg }}
              title={preset.name}
            >
              <span className="sr-only">{preset.name}</span>
              {backgroundColor === preset.bg && iconColor === preset.icon && (
                <div className="absolute inset-0 rounded-lg ring-2 ring-primary ring-offset-2" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Customize Agent Icon
          </DialogTitle>
        </DialogHeader>
        <div className="hidden md:flex flex-1 min-h-0 px-6">
          <div className="flex gap-6 w-full">
            <div className="flex-1 min-w-0">
              <IconPicker
                selectedIcon={selectedIcon}
                onIconSelect={setSelectedIcon}
                iconColor={iconColor}
                backgroundColor={backgroundColor}
                className="h-full"
              />
            </div>
            <Separator orientation="vertical" className="h-full" />
            <div className="w-80 shrink-0">
              <ScrollArea className="h-[500px] pr-4">
                <ColorControls />
              </ScrollArea>
            </div>
          </div>
        </div>
        <div className="md:hidden flex-1 min-h-0 px-6">
          <Tabs defaultValue="customize" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2 shrink-0">
              <TabsTrigger value="customize">Customize</TabsTrigger>
              <TabsTrigger value="icons">Icons</TabsTrigger>
            </TabsList>
            
            <TabsContent value="customize" className="flex-1 min-h-0 mt-4">
              <ScrollArea className="h-[400px]">
                <ColorControls />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="icons" className="flex-1 min-h-0 mt-4">
              <IconPicker
                selectedIcon={selectedIcon}
                onIconSelect={setSelectedIcon}
                iconColor={iconColor}
                backgroundColor={backgroundColor}
                className="h-[400px]"
              />
            </TabsContent>
          </Tabs>
        </div>
        <DialogFooter className="px-6 py-4 shrink-0 border-t">
          <Button
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleIconSave}
          >
            Save Icon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
