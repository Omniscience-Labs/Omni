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
import { Plus, Settings, Zap, Bot, ChevronDown } from 'lucide-react';
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
  const { data: profiles } = usePipedreamProfiles();

  const { data: iconData } = usePipedreamAppIcon(app.name_slug, {
    enabled: !app.img_src
  });
  
  const appProfiles = useMemo(() => {
    return profiles?.filter(p => p.app_slug === app.name_slug && p.is_active) || [];
  }, [profiles, app.name_slug]);

  const connectedProfiles = useMemo(() => {
    if ('connectedProfiles' in app && app.connectedProfiles) {
      return app.connectedProfiles;
    }
    return appProfiles.filter(p => p.is_connected);
  }, [appProfiles, app]);
  
  const agentProfiles = useMemo(() => {
    if (!currentAgentId) return [];
    return agentPipedreamProfiles.filter(p => p.app_slug === app.name_slug);
  }, [app.name_slug, currentAgentId, agentPipedreamProfiles]);

  const handleConnectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mode === 'simple' || mode === 'profile-only') {
      onAppSelected?.({ app_slug: app.name_slug, app_name: app.name });
    } else {
      onConnectApp?.(app);
    }
  };

  const handleConfigureClick = (profile: any) => {
    onConfigureTools?.(profile);
  };

  const handleCategoryClick = (e: React.MouseEvent, category: string) => {
    e.stopPropagation();
    handleCategorySelect?.(category);
  };

  const totalToolsCount = agentProfiles.reduce((sum, profile) => {
    const count = profile.toolsCount ?? profile.enabledTools?.length ?? 0;
    return sum + count;
  }, 0);

  return (
    <Card className="group h-full">
      <CardContent className="h-full flex flex-col">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 relative">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center text-primary font-semibold overflow-hidden">
              {(app.img_src || iconData?.icon_url) ? (
                <img
                  src={app.img_src || iconData?.icon_url || ''}
                  alt={app.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <span className={cn(
                "font-semibold text-sm",
                (app.img_src || iconData?.icon_url) ? "hidden" : "block"
              )}>
                {app.name.charAt(0).toUpperCase()}
              </span>
            </div>
            {connectedProfiles.length > 0 && (
              <div className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm text-foreground mb-1 truncate">
              {app.name}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-2 leading-tight">
              {app.description}
            </p>
          </div>
        </div>

        {!compact && app.categories.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {app.categories.slice(0, 2).map((category) => (
              <Badge 
                key={category} 
                variant="outline" 
                className="text-xs px-2 py-0.5 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={(e) => handleCategoryClick(e, category)}
              >
                {getCategoryEmoji(category)} {category}
              </Badge>
            ))}
            {app.categories.length > 2 && (
              <Badge variant="outline" className="text-xs px-2 py-0.5">
                +{app.categories.length - 2}
              </Badge>
            )}
          </div>
        )}

        {agentProfiles.length > 0 && (
          <div className="mb-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-8 w-full justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Bot className="h-3 w-3 text-primary" />
                    <span className="text-xs font-medium text-foreground">
                      {agentProfiles.length} {agentProfiles.length === 1 ? 'Profile' : 'Profiles'} • {totalToolsCount} tools
                    </span>
                  </div>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-full">
                {agentProfiles.map((profile) => (
                  <DropdownMenuItem 
                    key={profile.profile_id} 
                    onClick={() => handleConfigureClick(profile)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <Settings className="h-3 w-3" />
                        <span className="font-medium">{profile.profile_name}</span>
                      </div>
                      <Badge variant="outline" className="text-xs px-1 py-0">
                        {profile.toolsCount ?? profile.enabledTools?.length ?? 0} tools
                      </Badge>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <div className="flex-1" />
        
        <div className="flex items-center gap-2 mt-auto">
          {mode === 'simple' ? (
            <Button
              size="sm"
              onClick={handleConnectClick}
              className="flex-1"
            >
              <Plus className="h-3 w-3" />
              Connect
            </Button>
          ) : mode === 'profile-only' ? (
            <Button
              size="sm"
              onClick={handleConnectClick}
              variant={connectedProfiles.length > 0 ? "outline" : "default"}
              className="flex-1"
            >
              <Plus className="h-3 w-3" />
              {connectedProfiles.length > 0 ? 'Add Profile' : 'Connect'}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleConnectClick}
              className={cn(
                "flex-1",
                connectedProfiles.length > 0 && "bg-purple-600 hover:bg-purple-700"
              )}
            >
              {connectedProfiles.length > 0 ? (
                <>
                  <Zap className="h-3 w-3" />
                  Add Tools
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3" />
                  Connect
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}; 