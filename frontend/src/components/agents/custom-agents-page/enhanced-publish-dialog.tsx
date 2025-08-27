"use client";

import React, { useState } from 'react';
import { 
  MessageSquare, 
  Brain, 
  Wrench, 
  Puzzle, 
  BookOpen, 
  PlayCircle, 
  Zap,
  Globe,
  Loader2,
  CheckCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';


interface SharingPreferences {
  include_system_prompt: boolean;
  include_model_settings: boolean;
  include_default_tools: boolean;
  include_integrations: boolean;
  include_knowledge_bases: boolean;
  include_playbooks: boolean;
  include_triggers: boolean;
}

interface EnhancedPublishDialogProps {
  publishDialog: { templateId: string; templateName: string } | null;
  templatesActioningId: string | null;
  onClose: () => void;
  onPublish: (preferences: SharingPreferences) => void;
}

export const EnhancedPublishDialog = ({
  publishDialog,
  templatesActioningId,
  onClose,
  onPublish
}: EnhancedPublishDialogProps) => {
  const [preferences, setPreferences] = useState<SharingPreferences>({
    include_system_prompt: true,
    include_model_settings: true,
    include_default_tools: true,
    include_integrations: true,
    include_knowledge_bases: true,
    include_playbooks: true,
    include_triggers: true
  });



  const handlePreferenceChange = (key: keyof SharingPreferences, checked: boolean) => {
    setPreferences(prev => ({ ...prev, [key]: checked }));
  };

  const handleSelectAll = () => {
    const allSelected = Object.values(preferences).every(Boolean);
    const newValue = !allSelected;
    setPreferences({
      include_system_prompt: newValue,
      include_model_settings: newValue,
      include_default_tools: newValue,
      include_integrations: newValue,
      include_knowledge_bases: newValue,
      include_playbooks: newValue,
      include_triggers: newValue
    });
  };

  const handlePublish = () => {
    onPublish(preferences);
  };

  const allSelected = Object.values(preferences).every(Boolean);
  const someSelected = Object.values(preferences).some(Boolean);

  const componentItems = [
    {
      key: 'include_system_prompt' as keyof SharingPreferences,
      icon: MessageSquare,
      title: 'System Prompt',
      description: 'Agent behavior, goals, and personality'
    },
    {
      key: 'include_model_settings' as keyof SharingPreferences,
      icon: Brain,
      title: 'Model Settings',
      description: 'Default AI model and configuration'
    },
    {
      key: 'include_default_tools' as keyof SharingPreferences,
      icon: Wrench,
      title: 'Default Tools',
      description: 'Built-in AgentPress tools and capabilities'
    },
    {
      key: 'include_integrations' as keyof SharingPreferences,
      icon: Puzzle,
      title: 'Integrations',
      description: 'External services and MCP connections'
    },
    {
      key: 'include_knowledge_bases' as keyof SharingPreferences,
      icon: BookOpen,
      title: 'Knowledge Base',
      description: 'Uploaded files and knowledge content'
    },
    {
      key: 'include_playbooks' as keyof SharingPreferences,
      icon: PlayCircle,
      title: 'Playbooks',
      description: 'Variable-driven execution templates'
    },
    {
      key: 'include_triggers' as keyof SharingPreferences,
      icon: Zap,
      title: 'Triggers',
      description: 'Automated agent execution rules'
    }
  ];

  return (
    <Dialog open={!!publishDialog} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publish Template to Marketplace</DialogTitle>
          <DialogDescription>
            Configure sharing preferences for "{publishDialog?.templateName}"
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Include Components Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Include Components</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="h-auto p-1 text-xs"
              >
                {allSelected ? "Deselect All" : "Select All"}
              </Button>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {componentItems.map(({ key, icon: Icon, title, description }) => (
                <div key={key} className="flex items-start space-x-3 p-3 border rounded-lg">
                  <Checkbox
                    id={key}
                    checked={preferences[key]}
                    onCheckedChange={(checked) => 
                      handlePreferenceChange(key, checked === true)
                    }
                    className="mt-1"
                  />
                  <div className="space-y-1 flex-1">
                    <Label htmlFor={key} className="font-medium flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {title}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {!someSelected && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-700">
                  ⚠️ At least one component must be selected to publish a template
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={!!templatesActioningId}>
            Cancel
          </Button>
          <Button 
            onClick={handlePublish} 
            disabled={!!templatesActioningId || !someSelected}
          >
            {templatesActioningId ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Globe className="h-4 w-4" />
                Publish Template
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
