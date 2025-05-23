'use client';

import React, { useState } from 'react';
import { ChevronDown, Plus, Star, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useAgents } from '@/hooks/react-query/agents/use-agents';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface AgentSelectorProps {
  onAgentSelect?: (agentId: string) => void;
  selectedAgentId?: string;
  className?: string;
}

export function AgentSelector({ 
  onAgentSelect, 
  selectedAgentId, 
  className 
}: AgentSelectorProps) {
  const { data: agents = [], isLoading } = useAgents();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const defaultAgent = agents.find(agent => agent.is_default);
  const currentAgent = selectedAgentId 
    ? agents.find(agent => agent.agent_id === selectedAgentId)
    : defaultAgent;

  const handleAgentSelect = (agentId: string) => {
    onAgentSelect?.(agentId);
    setIsOpen(false);
  };

  const handleNewAgent = () => {
    router.push('/agents');
    setIsOpen(false);
  };

  const handleManageAgents = () => {
    router.push('/agents');
    setIsOpen(false);
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-background">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading agents...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="flex items-center gap-2 px-3 py-2 h-auto min-w-[200px] justify-between"
          >
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium">
                    {currentAgent?.name || 'No agent selected'}
                  </span>
                  {currentAgent?.is_default && (
                    <Badge variant="secondary" className="text-xs px-1 py-0">
                      <Star className="h-2.5 w-2.5 mr-0.5 fill-current" />
                      Default
                    </Badge>
                  )}
                </div>
                {currentAgent?.description && (
                  <span className="text-xs text-muted-foreground line-clamp-1 max-w-[150px]">
                    {currentAgent.description}
                  </span>
                )}
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent align="start" className="w-[280px]">
          {agents.length > 0 ? (
            <>
              {agents.map((agent) => (
                <DropdownMenuItem
                  key={agent.agent_id}
                  onClick={() => handleAgentSelect(agent.agent_id)}
                  className="flex flex-col items-start gap-1 p-3 cursor-pointer"
                >
                  <div className="flex items-center gap-2 w-full">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    <div className="flex items-center gap-1 flex-1">
                      <span className="font-medium">{agent.name}</span>
                      {agent.is_default && (
                        <Badge variant="secondary" className="text-xs px-1 py-0">
                          <Star className="h-2.5 w-2.5 mr-0.5 fill-current" />
                          Default
                        </Badge>
                      )}
                    </div>
                    {currentAgent?.agent_id === agent.agent_id && (
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>
                  {agent.description && (
                    <span className="text-xs text-muted-foreground pl-6 line-clamp-2">
                      {agent.description}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          ) : (
            <DropdownMenuItem disabled className="text-center text-muted-foreground">
              No agents available
            </DropdownMenuItem>
          )}
          
          <DropdownMenuItem onClick={handleNewAgent} className="cursor-pointer">
            <Plus className="h-4 w-4" />
            New Agent
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={handleManageAgents} className="cursor-pointer">
            <Bot className="h-4 w-4" />
            Manage Agents
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
} 