import React from 'react';
import { Sparkles, Settings, MoreHorizontal, Download, Image as ImageIcon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EditableText } from '@/components/ui/editable';
// import { StylePicker } from '../style-picker';
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
import { createClient } from '@/lib/supabase/client';

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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('You must be logged in to upload images');
        return;
      }
      
      const form = new FormData();
      form.append('file', file);
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/agents/profile-image/upload`, {
        method: 'POST',
        body: form,
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        }
      });
      
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      if (data?.url) {
        onFieldChange('profile_image_url', data.url);
        toast.success('Profile image updated');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload image');
    } finally {
      e.target.value = '';
    }
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
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <Avatar className="h-9 w-9 rounded-lg ring-1 ring-black/5 hover:ring-black/10">
                  {displayData.profile_image_url ? (
                    <AvatarImage src={displayData.profile_image_url} alt={displayData.name} />
                  ) : (
                    <AvatarFallback className="rounded-lg text-xs">
                      <ImageIcon className="h-4 w-4" />
                    </AvatarFallback>
                  )}
                </Avatar>
              </label>
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
        {onExport && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onExport}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  disabled={isExporting}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Export agent
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {!isSunaAgent && (
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
        )}
      </div>
    </div>
  );
} 