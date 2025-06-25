'use client';

import React, { useState } from 'react';
import { Settings, ChevronRight, Bot, Presentation, Video, Code, FileSpreadsheet, Search, Plus, Star, User, Sparkles, Database, MessageSquare, Calculator, Palette, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ChatSettingsDialog } from './chat-settings-dialog';
import { SubscriptionStatus } from './_use-model-selection';
import { useAgents } from '@/hooks/react-query/agents/use-agents';
import { useFeatureFlag } from '@/lib/feature-flags';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

interface PredefinedAgent {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: 'productivity' | 'creative' | 'development';
}

const PREDEFINED_AGENTS: PredefinedAgent[] = [
  {
    id: 'slides',
    name: 'Slides Pro',
    description: 'Create stunning presentations and slide decks',
    icon: <Presentation className="h-4 w-4 mt-1" />,
    category: 'productivity'
  },
  {
    id: 'sheets',
    name: 'Data Analyst',
    description: 'Spreadsheet and data analysis expert',
    icon: <FileSpreadsheet className="h-4 w-4 mt-1" />,
    category: 'productivity'
  }
];

interface ChatSettingsDropdownProps {
  selectedAgentId?: string;
  onAgentSelect?: (agentId: string | undefined) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  modelOptions: any[];
  subscriptionStatus: SubscriptionStatus;
  canAccessModel: (modelId: string) => boolean;
  refreshCustomModels?: () => void;
  disabled?: boolean;
  className?: string;
}

export function ChatSettingsDropdown({
  selectedAgentId,
  onAgentSelect,
  selectedModel,
  onModelChange,
  modelOptions,
  subscriptionStatus,
  canAccessModel,
  refreshCustomModels,
  disabled = false,
  className,
}: ChatSettingsDropdownProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const router = useRouter();
  
  // Check if custom agents feature is enabled
  const { enabled: customAgentsEnabled, loading: flagsLoading } = useFeatureFlag('custom_agents');
  
  // Fetch real agents from API only if feature is enabled
  const { data: agentsResponse, isLoading: agentsLoading, refetch: loadAgents } = useAgents({
    limit: 100,
    sort_by: 'name',
    sort_order: 'asc'
  });
  
  const agents = (customAgentsEnabled && agentsResponse?.agents) || [];
  const defaultAgent = agents.find(agent => agent.is_default);
  
  // Find selected agent - could be from real agents or predefined
  const selectedRealAgent = agents.find(a => a.agent_id === selectedAgentId);
  const selectedPredefinedAgent = PREDEFINED_AGENTS.find(a => a.id === selectedAgentId);
  const selectedAgent = selectedRealAgent || selectedPredefinedAgent;
  
  const handleAgentSelect = (agentId: string | undefined) => {
    onAgentSelect?.(agentId);
    setDropdownOpen(false);
  };

  const handleMoreOptions = () => {
    setDropdownOpen(false);
    setDialogOpen(true);
  };

  const handleExploreAll = () => {
    setDropdownOpen(false);
    router.push('/agents');
  };

  const getAgentDisplay = () => {
    if (selectedRealAgent) {
      return {
        name: selectedRealAgent.name,
        icon: <Bot className="h-4 w-4" />,
        avatar: selectedRealAgent.avatar
      };
    }
    if (selectedPredefinedAgent) {
      return {
        name: selectedPredefinedAgent.name,
        icon: selectedPredefinedAgent.icon,
        avatar: null
      };
    }
    return {
      name: 'Suna',
      icon: <User className="h-4 w-4" />,
      avatar: null
    };
  };

  const agentDisplay = getAgentDisplay();

  const AgentCard = ({ agent, isSelected, onClick, type }: {
    agent: any;
    isSelected: boolean;
    onClick: () => void;
    type: 'predefined' | 'custom' | 'default';
  }) => (
    <div
      onClick={onClick}
      className={cn(
        "group relative rounded-lg p-1.5 cursor-pointer transition-all",
        "hover:bg-accent/50",
        isSelected ? "bg-accent border-accent-foreground/50" : ""
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0">
          {type === 'default' ? (
            <User className="h-4 w-4 mt-1" />
          ) : type === 'custom' ? (
            agent.avatar
          ) : (
            agent.icon
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm truncate">{agent.name}</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-8 w-8 p-0 text-muted-foreground hover:text-foreground relative',
                    'rounded-lg',
                    className
                  )}
                  disabled={disabled}
                >
                  <Settings className="h-4 w-4" />
                  {selectedAgentId && (
                    <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                  )}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>
                {agentDisplay.name}
                {agentDisplay.avatar && ` ${agentDisplay.avatar}`}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <PopoverContent align="end" className="w-[480px] p-0" sideOffset={4}>
          <div className="p-4">
            <div className="mb-4">
              <h3 className="text-sm font-medium">Choose Your Agent</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <Label className="text-xs text-muted-foreground font-medium">Default Agents</Label>
                </div>
                <AgentCard
                  agent={{ name: 'Suna', description: 'Your personal AI assistant' }}
                  isSelected={!selectedAgentId}
                  onClick={() => handleAgentSelect(undefined)}
                  type="default"
                />
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {PREDEFINED_AGENTS.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      isSelected={selectedAgentId === agent.id}
                      onClick={() => handleAgentSelect(agent.id)}
                      type="predefined"
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Label className="text-xs text-muted-foreground font-medium">Your Agents</Label>
                </div>
                {agentsLoading ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    Loading...
                  </div>
                ) : agents.length > 0 ? (
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {agents.map((agent) => (
                      <AgentCard
                        key={agent.agent_id}
                        agent={agent}
                        isSelected={selectedAgentId === agent.agent_id}
                        onClick={() => handleAgentSelect(agent.agent_id)}
                        type="custom"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Bot className="h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground mb-2">No custom agents yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExploreAll}
                      className="text-xs"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Get Started
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <Separator className="my-4" />
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExploreAll}
                  className="text-xs"
                >
                  <Search className="h-3 w-3" />
                  Explore All
                </Button>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMoreOptions}
                className="text-xs"
              >
                <Settings className="h-3 w-3" />
                More Options
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <ChatSettingsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selectedModel={selectedModel}
        onModelChange={onModelChange}
        modelOptions={modelOptions}
        subscriptionStatus={subscriptionStatus}
        canAccessModel={canAccessModel}
        refreshCustomModels={refreshCustomModels}
      />
    </>
  );
} 