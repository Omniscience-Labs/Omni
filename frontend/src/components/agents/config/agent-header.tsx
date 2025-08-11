import React, { useState } from 'react';
import { Sparkles, Settings, MoreHorizontal, Download, Image as ImageIcon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EditableText } from '@/components/ui/editable';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ProfilePictureDialog } from './profile-picture-dialog';

interface AgentHeaderProps {
  agentId: string;
  displayData: {
    name: string;
    description?: string;
    profile_image_url?: string;
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
  onExport?: () => void;
  isExporting?: boolean;
  agentMetadata?: {
    is_suna_default?: boolean;
    centrally_managed?: boolean;
    restrictions?: {
      name_editable?: boolean;
    };
  };
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
  onExport,
  isExporting = false,
  agentMetadata,
}: AgentHeaderProps) {
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const isSunaAgent = agentMetadata?.is_suna_default || false;
  const restrictions = agentMetadata?.restrictions || {};
  const isNameEditable = !isViewingOldVersion && (restrictions.name_editable !== false);
  
  const handleNameChange = (value: string) => {
    if (!isNameEditable && isSunaAgent) {
      toast.error("Name cannot be edited", {
        description: "Suna's name is managed centrally and cannot be changed.",
      });
      return;
    }
    onFieldChange('name', value);
  };

  const handleImageUpdate = (url: string | null) => {
    onFieldChange('profile_image_url', url);
  };

  return (
    <div className="flex items-center justify-between mb-0">
      <div className="flex items-center gap-3">
        <div className="relative">
          {isSunaAgent ? (
            <div className="h-9 w-9 rounded-lg bg-muted border flex items-center justify-center">
              <KortixLogo size={16} />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button 
                className="cursor-pointer transition-opacity hover:opacity-80"
                onClick={() => setIsProfileDialogOpen(true)}
                type="button"
              >
                <Avatar className="h-9 w-9 rounded-lg ring-1 ring-black/5 hover:ring-black/10 transition-colors">
                  {displayData.profile_image_url ? (
                    <AvatarImage src={displayData.profile_image_url} alt={displayData.name} />
                  ) : (
                    <AvatarFallback className="rounded-lg text-xs hover:bg-muted">
                      <ImageIcon className="h-4 w-4" />
                    </AvatarFallback>
                  )}
                </Avatar>
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <EditableText
            value={displayData.name}
            onSave={handleNameChange}
            className={cn(
              "text-lg font-semibold bg-transparent text-foreground placeholder:text-muted-foreground",
              !isNameEditable && isSunaAgent && "cursor-not-allowed opacity-75"
            )}
            placeholder="Agent name..."
            disabled={!isNameEditable}
          />
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="agent-builder" className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Prompt to Build</span>
            </TabsTrigger>
            <TabsTrigger value="configuration" className="flex items-center gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Manual Config</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onExport && (
              <DropdownMenuItem 
                onClick={onExport} 
                disabled={isExporting}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export Agent'}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ProfilePictureDialog
        isOpen={isProfileDialogOpen}
        onClose={() => setIsProfileDialogOpen(false)}
        currentImageUrl={displayData.profile_image_url}
        agentName={displayData.name}
        onImageUpdate={handleImageUpdate}
      />
    </div>
  );
} 