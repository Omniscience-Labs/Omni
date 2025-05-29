import React, { useState } from 'react';
import { Settings, Trash2, Star, MessageCircle, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';
import { getAgentAvatar } from '../_utils/get-agent-style';

interface Agent {
  agent_id: string;
  name: string;
  description?: string;
  is_default: boolean;
  created_at: string;
  updated_at?: string;
  configured_mcps?: Array<{ name: string }>;
  agentpress_tools?: Record<string, any>;
  avatar?: string;
  color?: string;
}

interface AgentsGridProps {
  agents: Agent[];
  onEditAgent: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  onToggleDefault: (agentId: string, currentDefault: boolean) => void;
  deleteAgentMutation: { isPending: boolean };
}

const AgentModal = ({ agent, isOpen, onClose, onCustomize, onChat }) => {
  const { avatar, color } = getAgentAvatar(agent.agent_id);
  
  const truncateDescription = (text, maxLength = 120) => {
    if (!text || text.length <= maxLength) return text || 'Try out this agent';
    return text.substring(0, maxLength) + '...';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-none">
        <DialogTitle className="sr-only">Agent actions</DialogTitle>
        <div className="relative">
          <div className={`${color} h-32 flex items-center justify-center relative bg-gradient-to-br from-opacity-90 to-opacity-100`}>
            <div className="text-6xl drop-shadow-sm">
              {agent.avatar || avatar}
            </div>
            {agent.is_default && (
              <div className="absolute top-4 right-4">
                <Star className="h-5 w-5 text-white fill-white drop-shadow-sm" />
              </div>
            )}
          </div>

          <div className="p-4 space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                {agent.name}
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {truncateDescription(agent.description)}
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => onCustomize(agent.agent_id)}
                variant="outline"
                className="flex-1 gap-2"
              >
                <Wrench className="h-4 w-4" />
                Customize
              </Button>
              <Button
                onClick={() => onChat(agent.agent_id)}
                className="flex-1 gap-2 bg-primary hover:bg-primary/90"
              >
                <MessageCircle className="h-4 w-4" />
                Chat
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const AgentsGrid = ({ 
  agents, 
  onEditAgent, 
  onDeleteAgent, 
  onToggleDefault,
  deleteAgentMutation 
}: AgentsGridProps) => {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const router = useRouter();

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent);
  };

  const handleCustomize = (agentId: string) => {
    router.push(`/agents/new/${agentId}`);
    setSelectedAgent(null);
  };

  const handleChat = (agentId: string) => {
    router.push(`/agents/new/${agentId}`);
    setSelectedAgent(null);
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {agents.map((agent) => {
          const { avatar, color } = getAgentAvatar(agent.agent_id);
          
          return (
            <div 
              key={agent.agent_id} 
              className="bg-neutral-100 dark:bg-sidebar border border-border rounded-2xl overflow-hidden hover:bg-muted/50 transition-all duration-200 cursor-pointer group"
              onClick={() => handleAgentClick(agent)}
            >
              <div className={`${color} h-50 flex items-center justify-center relative`}>
                <div className="text-4xl">
                  {agent.avatar || avatar}
                </div>
                {agent.is_default && (
                  <div className="absolute top-3 right-3">
                    <Star className="h-4 w-4 text-white fill-white drop-shadow-sm" />
                  </div>
                )}
              </div>
              
              <div className="p-4">
                <h3 className="text-foreground font-medium text-lg mb-1 line-clamp-1">
                  {agent.name}
                </h3>
                <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
                  {agent.description || 'Try out this agent'}
                </p>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">
                    By me
                  </span>
                  
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!agent.is_default && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                            disabled={deleteAgentMutation.isPending}
                            title="Delete agent"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="max-w-md">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-xl">Delete Agent</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete &quot;{agent.name}&quot;? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onDeleteAgent(agent.agent_id)}
                              disabled={deleteAgentMutation.isPending}
                              className="bg-destructive hover:bg-destructive/90 text-white"
                            >
                              {deleteAgentMutation.isPending ? 'Deleting...' : 'Delete'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedAgent && (
        <AgentModal
          agent={selectedAgent}
          isOpen={!!selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onCustomize={handleCustomize}
          onChat={handleChat}
        />
      )}
    </>
  );
};