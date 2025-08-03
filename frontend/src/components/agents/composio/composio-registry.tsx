import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Zap, Plus, CheckCircle2, Settings2 } from 'lucide-react';
import { useComposioToolkits } from '@/hooks/react-query/composio/use-composio';
import { useComposioProfiles } from '@/hooks/react-query/composio/use-composio-profiles';
import { useAgent } from '@/hooks/react-query/agents/use-agents';
import { ComposioConnector } from './composio-connector';
import type { ComposioToolkit, ComposioProfile } from '@/hooks/react-query/composio/utils';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { AgentSelector } from '../../thread/chat-input/agent-selector';

interface ComposioRegistryProps {
  onToolsSelected?: (profileId: string, selectedTools: string[], appName: string, appSlug: string) => void;
  onAppSelected?: (app: ComposioToolkit) => void;
  mode?: 'full' | 'profile-only';
  onClose?: () => void;
  showAgentSelector?: boolean;
  selectedAgentId?: string;
  onAgentChange?: (agentId: string | undefined) => void;
}

const AppCardSkeleton = () => (
  <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 transition-all">
    <div className="flex items-center gap-4 mb-4">
      <Skeleton className="h-12 w-12 rounded-lg flex-shrink-0" />
      <div className="flex-1">
        <Skeleton className="h-5 w-32 mb-2" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
    <Skeleton className="h-10 w-full rounded-lg" />
  </div>
);

const AppCard = ({ app, onConnect, onConfigure, connectedProfiles }: {
  app: ComposioToolkit;
  onConnect: () => void;
  onConfigure?: (profile: ComposioProfile) => void;
  connectedProfiles: ComposioProfile[];
}) => {
  const isConnected = connectedProfiles.length > 0;
  
  return (
    <div 
      className={cn(
        "group relative overflow-hidden rounded-2xl bg-card border transition-all cursor-pointer transform hover:bg-muted/60",
      )}
      onClick={onConnect}
    >
      <div className="p-6">
        <div className="flex items-start gap-4 mb-4">
          {app.logo ? (
            <img 
              src={app.logo} 
              alt={app.name} 
              className="h-12 w-12 rounded-xl object-contain border flex-shrink-0 bg-muted p-2"
            />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary font-semibold text-lg">
              {app.name.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base truncate">{app.name}</h3>
              {isConnected && (
                <Badge variant="default" className="text-xs bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20">
                  Connected
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {app.description || `Connect your ${app.name} account`}
            </p>
          </div>
        </div>
        
        {connectedProfiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {connectedProfiles.map((profile) => (
              <Badge 
                key={profile.profile_id} 
                variant="default"
                className="text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                onClick={(e) => {
                  e.stopPropagation();
                  onConfigure?.(profile);
                }}
              >
                {profile.profile_name}
              </Badge>
            ))}
          </div>
        )}
      </div>
      
      {/* Subtle gradient overlay for better visual appeal */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
};

export const ComposioRegistry: React.FC<ComposioRegistryProps> = ({
  onToolsSelected,
  onAppSelected,
  mode = 'full',
  onClose,
  showAgentSelector = false,
  selectedAgentId,
  onAgentChange,
}) => {
  const [search, setSearch] = useState('');
  const [selectedApp, setSelectedApp] = useState<ComposioToolkit | null>(null);
  const [showConnector, setShowConnector] = useState(false);
  
  const [internalSelectedAgentId, setInternalSelectedAgentId] = useState<string | undefined>(selectedAgentId);
  const queryClient = useQueryClient();
  
  const { data: toolkits, isLoading } = useComposioToolkits(search);
  const { data: profiles } = useComposioProfiles();
  
  const currentAgentId = selectedAgentId ?? internalSelectedAgentId;
  const { data: agent } = useAgent(currentAgentId || '');

  const handleAgentSelect = (agentId: string | undefined) => {
    if (onAgentChange) {
      onAgentChange(agentId);
    } else {
      setInternalSelectedAgentId(agentId);
    }
  };

  // Group profiles by toolkit
  const profilesByToolkit = useMemo(() => {
    const grouped: Record<string, ComposioProfile[]> = {};
    profiles?.forEach(profile => {
      if (profile.is_connected) {
        if (!grouped[profile.toolkit_slug]) {
          grouped[profile.toolkit_slug] = [];
        }
        grouped[profile.toolkit_slug].push(profile);
      }
    });
    return grouped;
  }, [profiles]);

  // Filter toolkits based on search
  const filteredToolkits = useMemo(() => {
    if (!toolkits?.toolkits) return [];
    if (!search) return toolkits.toolkits;
    
    const searchLower = search.toLowerCase();
    return toolkits.toolkits.filter(toolkit =>
      toolkit.name.toLowerCase().includes(searchLower) ||
      toolkit.description?.toLowerCase().includes(searchLower)
    );
  }, [toolkits, search]);

  const handleConnect = (app: ComposioToolkit) => {
    if (!currentAgentId && showAgentSelector) {
      toast.error('Please select an agent first');
      return;
    }
    setSelectedApp(app);
    setShowConnector(true);
  };

  const handleConfigure = (app: ComposioToolkit, profile: ComposioProfile) => {
    if (!currentAgentId) {
      toast.error('Please select an agent first');
      return;
    }
    // Open connector in tools mode with selected profile
    setSelectedApp(app);
    setShowConnector(true);
  };

  const handleConnectionComplete = (profileId: string, appName: string, appSlug: string) => {
    setShowConnector(false);
    queryClient.invalidateQueries({ queryKey: ['composio', 'profiles'] });
    if (onToolsSelected) {
      onToolsSelected(profileId, [], appName, appSlug);
    }
  };

  if (!currentAgentId && showAgentSelector) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
          <Zap className="h-8 w-8 text-primary" />
        </div>
        <div className="max-w-sm space-y-2">
          <h3 className="text-lg font-medium">Select an Agent</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Choose an agent to connect and manage Composio integrations
          </p>
        </div>
        <AgentSelector
          selectedAgentId={currentAgentId}
          onAgentSelect={handleAgentSelect}
          isSunaAgent={agent?.metadata?.is_suna_default}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Integrations</h1>
              <p className="text-sm text-muted-foreground">
                Add external tools to your agent
              </p>
            </div>
          </div>
          
          {showAgentSelector && (
            <AgentSelector
              selectedAgentId={currentAgentId}
              onAgentSelect={handleAgentSelect}
              isSunaAgent={agent?.metadata?.is_suna_default}
            />
          )}
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search integrations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <AppCardSkeleton key={i} />
              ))}
            </div>
          ) : filteredToolkits.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredToolkits.map((app) => (
                <AppCard
                  key={app.slug}
                  app={app}
                  onConnect={() => handleConnect(app)}
                  onConfigure={(profile) => handleConfigure(app, profile)}
                  connectedProfiles={profilesByToolkit[app.slug] || []}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No integrations found</h3>
              <p className="text-sm text-muted-foreground">
                {search ? `No results for "${search}"` : 'No integrations available'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Connector Modal */}
      {selectedApp && (
        <ComposioConnector
          app={selectedApp}
          open={showConnector}
          onOpenChange={setShowConnector}
          onComplete={handleConnectionComplete}
          mode={mode}
          agentId={currentAgentId}
        />
      )}
    </div>
  );
}; 