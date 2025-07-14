import React from 'react';
import { Sparkles, Settings } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EditableText } from '@/components/ui/editable';
import { StylePicker } from '../style-picker';
import { cn } from '@/lib/utils';

interface AgentHeaderProps {
  agentId: string;
  displayData: {
    name: string;
    description?: string;
  };
  currentStyle: {
    avatar: string;
    color: string;
  };
  activeTab: string;
  isViewingOldVersion: boolean;
  onFieldChange: (field: string, value: any) => void;
  onStyleChange: (emoji: string, color: string) => void;
  onTabChange: (value: string) => void;
}

export function AgentHeader({
  agentId,
  displayData,
  currentStyle,
  activeTab,
  isViewingOldVersion,
  onFieldChange,
  onStyleChange,
  onTabChange,
}: AgentHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <StylePicker
          currentEmoji={currentStyle.avatar}
          currentColor={currentStyle.color}
          onStyleChange={onStyleChange}
          agentId={agentId}
        >
          <div 
            className="h-9 w-9 rounded-lg flex items-center justify-center shadow-sm ring-1 ring-black/5 hover:ring-black/10 transition-all duration-200 cursor-pointer"
            style={{ backgroundColor: currentStyle.color }}
          >
            <div className="text-lg font-medium">{currentStyle.avatar}</div>
          </div>
        </StylePicker>
        <div className="flex-1 min-w-0">
          <EditableText
            value={displayData.name}
            onSave={(value) => onFieldChange('name', value)}
            className="text-lg font-semibold bg-transparent text-foreground placeholder:text-muted-foreground"
            placeholder="Agent name..."
            disabled={isViewingOldVersion}
          />
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList className="grid grid-cols-2 bg-muted/50 h-9">
          <TabsTrigger 
            value="agent-builder"
            disabled={isViewingOldVersion}
            className={cn(
              "flex items-center gap-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm",
              isViewingOldVersion && "opacity-50 cursor-not-allowed"
            )}
          >
            <Sparkles className="h-3 w-3" />
            Prompt to Build
          </TabsTrigger>
          <TabsTrigger 
            value="configuration"
            className="flex items-center gap-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Settings className="h-3 w-3" />
            Manual Config
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
} 