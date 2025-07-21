import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Plus, Settings, Zap, Bot, ChevronDown, Star, CheckCircle, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCategoryEmoji } from '../utils';
import type { AppCardProps } from '../types';
import { usePipedreamProfiles } from '@/hooks/react-query/pipedream/use-pipedream-profiles';
import { usePipedreamAppIcon } from '@/hooks/react-query/pipedream/use-pipedream';

export const AppCard: React.FC<AppCardProps> = ({ 
  app, 
  compact = false, 
  mode = 'full',
  currentAgentId,
  agentName,
  agentPipedreamProfiles = [],
  onAppSelected,
  onConnectApp,
  onConfigureTools,
  handleCategorySelect,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const { data: profiles } = usePipedreamProfiles();
  const { data: iconData } = usePipedreamAppIcon(app.name_slug, {
    enabled: !app.img_src
  });

  const connectedProfiles = useMemo(() => {
    return profiles?.filter(p => p.app_slug === app.name_slug && p.is_connected) || [];
  }, [profiles, app.name_slug]);

  const agentProfiles = useMemo(() => {
    return agentPipedreamProfiles?.filter(p => p.app_slug === app.name_slug) || [];
  }, [agentPipedreamProfiles, app.name_slug]);

  const totalToolsCount = useMemo(() => {
    return agentProfiles.reduce((sum, profile) => {
      return sum + (profile.toolsCount ?? profile.enabledTools?.length ?? 0);
    }, 0);
  }, [agentProfiles]);

  const handleCategoryClick = (e: React.MouseEvent, category: string) => {
    e.stopPropagation();
    handleCategorySelect?.(category);
  };

  const handleConnectClick = () => {
    if (mode === 'simple' && onAppSelected) {
      onAppSelected({ app_slug: app.name_slug, app_name: app.name });
    } else if (onConnectApp) {
      onConnectApp(app);
    }
  };

  const handleConfigureClick = (profile: any) => {
    if (onConfigureTools) {
      onConfigureTools(profile);
    }
  };

  const isConnected = connectedProfiles.length > 0;
  const hasAgentTools = agentProfiles.length > 0;

  return (
    <Card 
      className={cn(
        "group relative overflow-hidden transition-all p-0 duration-300",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="p-4 h-full flex flex-col">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 relative">
            <div className={cn(
              "h-8 w-8 rounded-lg border bg-muted flex items-center justify-center text-primary font-semibold overflow-hidden transition-all duration-300"
            )}>
              {(app.img_src || iconData?.icon_url) ? (
                <img
                  src={app.img_src || iconData?.icon_url || ''}
                  alt={app.name}
                  className="w-5 h-5 object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <span className={cn(
                "font-bold text-lg",
                (app.img_src || iconData?.icon_url) ? "hidden" : "block"
              )}>
                {app.name.charAt(0).toUpperCase()}
              </span>
            </div>
            {isConnected && (
              <div className="absolute -top-1 -right-1 h-4 w-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center">
                <CheckCircle className="h-2 w-2 text-white" />
              </div>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="font-semibold text-base text-foreground truncate group-hover:text-primary transition-colors">
                {app.name}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {app.description}
            </p>
          </div>
        </div>
        {hasAgentTools && (
          <div className="mb-3">
            <div className="rounded-xl bg-muted py-2 border border">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-auto w-full justify-between p-0 hover:bg-transparent">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" />
                      <div className="text-left">
                        <div className="text-sm font-medium text-foreground">
                          {agentProfiles.length} {agentProfiles.length === 1 ? 'Profile' : 'Profiles'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {totalToolsCount} tools configured
                        </div>
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-full min-w-[200px]">
                  {agentProfiles.map((profile) => (
                    <DropdownMenuItem 
                      key={profile.profile_id} 
                      onClick={() => handleConfigureClick(profile)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <Settings className="h-4 w-4" />
                          <span className="font-medium">{profile.profile_name}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {profile.toolsCount ?? profile.enabledTools?.length ?? 0} tools
                        </Badge>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
        <div className="flex-1" />
        <div className="mt-auto">
          <Button
            size="sm"
            onClick={handleConnectClick}
            variant={isConnected && !hasAgentTools ? "outline" : "default"}
            className={cn("w-full font-medium transition-all duration-200")}
          >
            {mode === 'simple' ? (
              <>
                <Plus className="h-4 w-4" />
                Connect
              </>
            ) : mode === 'profile-only' ? (
              <>
                <Plus className="h-4 w-4" />
                {isConnected ? 'Add Profile' : 'Connect'}
              </>
            ) : (
              <>
                {isConnected ? (
                  <>
                    <Zap className="h-4 w-4" />
                    Add Tools
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Connect
                  </>
                )}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}; 