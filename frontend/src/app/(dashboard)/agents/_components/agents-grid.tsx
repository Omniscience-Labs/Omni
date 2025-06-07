import React, { useState } from 'react';
import { Settings, Trash2, Star, MessageCircle, Wrench, Globe, GlobeLock, Download, Shield, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { getAgentAvatar } from '../_utils/get-agent-style';
import { usePublishAgent, useUnpublishAgent } from '@/hooks/react-query/marketplace/use-marketplace';
import { useCreateTemplate } from '@/hooks/react-query/secure-mcp/use-secure-mcp';
import { toast } from 'sonner';

interface Agent {
  agent_id: string;
  name: string;
  description?: string;
  is_default: boolean;
  is_public?: boolean;
  marketplace_published_at?: string;
  download_count?: number;
  tags?: string[];
  created_at: string;
  updated_at?: string;
  configured_mcps?: Array<{ name: string }>;
  agentpress_tools?: Record<string, any>;
  avatar?: string;
  avatar_color?: string;
}

interface AgentsGridProps {
  agents: Agent[];
  onEditAgent: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  onToggleDefault: (agentId: string, currentDefault: boolean) => void;
  deleteAgentMutation: { isPending: boolean };
}

const PublishingChoiceDialog = ({ agent, isOpen, onClose, onRegularPublish, onSecurePublish, isPublishing, isCreatingTemplate }) => {
  const hasMCPCredentials = agent.configured_mcps && agent.configured_mcps.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose Publishing Method</DialogTitle>
          <DialogDescription>
            How would you like to publish "{agent.name}" to the marketplace?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {hasMCPCredentials && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  <p className="font-medium">This agent contains MCP credentials</p>
                  <p className="mt-1">We recommend using secure publishing to protect your API keys.</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Button
              onClick={() => onSecurePublish(agent.agent_id)}
              disabled={isCreatingTemplate}
              className="w-full justify-start gap-3 h-auto p-4 bg-green-50 hover:bg-green-100 border border-green-200 text-green-800"
              variant="outline"
            >
              <Shield className="h-5 w-5 text-green-600" />
              <div className="text-left">
                <div className="font-medium">Secure Template (Recommended)</div>
                <div className="text-xs text-green-600 mt-1">
                  Creates a secure template without exposing credentials
                </div>
              </div>
              {isCreatingTemplate && (
                <div className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
              )}
            </Button>

            <Button
              onClick={() => onRegularPublish(agent.agent_id)}
              disabled={isPublishing}
              variant="outline"
              className="w-full justify-start gap-3 h-auto p-4"
            >
              <Globe className="h-5 w-5" />
              <div className="text-left">
                <div className="font-medium">Regular Publishing</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {hasMCPCredentials 
                    ? "⚠️ Will expose API keys publicly" 
                    : "Standard marketplace publishing"
                  }
                </div>
              </div>
              {isPublishing && (
                <div className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AgentModal = ({ agent, isOpen, onClose, onCustomize, onChat, onPublish, onUnpublish, isPublishing, isUnpublishing }) => {
  const getAgentStyling = (agent: Agent) => {
    if (agent.avatar && agent.avatar_color) {
      return {
        avatar: agent.avatar,
        color: agent.avatar_color,
      };
    }
    return getAgentAvatar(agent.agent_id);
  };

  const { avatar, color } = getAgentStyling(agent);
  
  const truncateDescription = (text, maxLength = 120) => {
    if (!text || text.length <= maxLength) return text || 'Try out this agent';
    return text.substring(0, maxLength) + '...';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-none">
        <DialogTitle className="sr-only">Agent actions</DialogTitle>
        <div className="relative">
          <div className={`h-32 flex items-center justify-center relative bg-gradient-to-br from-opacity-90 to-opacity-100`} style={{ backgroundColor: color }}>
            <div className="text-6xl drop-shadow-sm">
              {avatar}
            </div>
            <div className="absolute top-4 right-4 flex gap-2">
              {agent.is_default && (
                <Star className="h-5 w-5 text-white fill-white drop-shadow-sm" />
              )}
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-xl font-semibold text-foreground">
                  {agent.name}
                </h2>
                {agent.is_public && (
                  <Badge variant="outline" className="text-xs">
                    <Globe className="h-3 w-3" />
                    Public
                  </Badge>
                )}
              </div>
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

            {/* Marketplace Actions */}
            <div className="pt-2 border-t">
              {agent.is_public ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Published to marketplace</span>
                    <div className="flex items-center gap-1">
                      <Download className="h-3 w-3" />
                      {agent.download_count || 0} downloads
                    </div>
                  </div>
                  <Button
                    onClick={() => onUnpublish(agent.agent_id)}
                    disabled={isUnpublishing}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    {isUnpublishing ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        Unpublishing...
                      </>
                    ) : (
                      <>
                        <GlobeLock className="h-4 w-4" />
                        Make Private
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => onPublish(agent.agent_id)}
                  disabled={isPublishing}
                  variant="outline"
                  className="w-full gap-2"
                >
                  <Globe className="h-4 w-4" />
                  Publish to Marketplace
                </Button>
              )}
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
  const [showPublishingChoice, setShowPublishingChoice] = useState(false);
  const [publishingAgent, setPublishingAgent] = useState<Agent | null>(null);
  const router = useRouter();
  
  const publishAgentMutation = usePublishAgent();
  const unpublishAgentMutation = useUnpublishAgent();
  const createTemplateMutation = useCreateTemplate();

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent);
  };

  const handleCustomize = (agentId: string) => {
    router.push(`/agents/new/${agentId}`);
    setSelectedAgent(null);
  };

  const handleChat = (agentId: string) => {
    router.push(`/dashboard?agent_id=${agentId}`);
    setSelectedAgent(null);
  };

  const handlePublish = (agentId: string) => {
    const agent = agents.find(a => a.agent_id === agentId);
    if (agent) {
      setPublishingAgent(agent);
      setShowPublishingChoice(true);
      setSelectedAgent(null);
    }
  };

  const handleRegularPublish = async (agentId: string) => {
    try {
      await publishAgentMutation.mutateAsync({ agentId, tags: [] });
      toast.success('Agent published to marketplace successfully!');
      setShowPublishingChoice(false);
      setPublishingAgent(null);
    } catch (error: any) {
      toast.error('Failed to publish agent to marketplace');
    }
  };

  const handleSecurePublish = async (agentId: string) => {
    try {
      const result = await createTemplateMutation.mutateAsync({ 
        agent_id: agentId, 
        make_public: true,
        tags: [] 
      });
      toast.success('Secure template created successfully!');
      setShowPublishingChoice(false);
      setPublishingAgent(null);
    } catch (error: any) {
      toast.error('Failed to create secure template');
    }
  };

  const handleUnpublish = async (agentId: string) => {
    try {
      await unpublishAgentMutation.mutateAsync(agentId);
      toast.success('Agent removed from marketplace');
      setSelectedAgent(null);
    } catch (error: any) {
      toast.error('Failed to remove agent from marketplace');
    }
  };

  const getAgentStyling = (agent: Agent) => {
    if (agent.avatar && agent.avatar_color) {
      return {
        avatar: agent.avatar,
        color: agent.avatar_color,
      };
    }
    return getAgentAvatar(agent.agent_id);
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {agents.map((agent) => {
          const { avatar, color } = getAgentStyling(agent);
          
          return (
            <div 
              key={agent.agent_id} 
              className="bg-neutral-100 dark:bg-sidebar border border-border rounded-2xl overflow-hidden hover:bg-muted/50 transition-all duration-200 cursor-pointer group"
              onClick={() => handleAgentClick(agent)}
            >
              <div className={`h-50 flex items-center justify-center relative`} style={{ backgroundColor: color }}>
                <div className="text-4xl">
                  {avatar}
                </div>
                <div className="absolute top-3 right-3 flex gap-2">
                  {agent.is_default && (
                    <Star className="h-4 w-4 text-white fill-white drop-shadow-sm" />
                  )}
                  {agent.is_public && (
                    <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm px-2 py-1 rounded-full">
                      <Globe className="h-3 w-3 text-white" />
                      <span className="text-white text-xs font-medium">{agent.download_count || 0}</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-foreground font-medium text-lg line-clamp-1 flex-1">
                    {agent.name}
                  </h3>
                  {agent.is_public && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      <Globe className="h-3 w-3" />
                      Public
                    </Badge>
                  )}
                </div>
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
                              {agent.is_public && (
                                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                                  Note: This agent is currently published to the marketplace and will be removed from there as well.
                                </span>
                              )}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteAgent(agent.agent_id);
                              }}
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
          onPublish={handlePublish}
          onUnpublish={handleUnpublish}
          isPublishing={publishAgentMutation.isPending}
          isUnpublishing={unpublishAgentMutation.isPending}
        />
      )}

      {publishingAgent && (
        <PublishingChoiceDialog
          agent={publishingAgent}
          isOpen={showPublishingChoice}
          onClose={() => {
            setShowPublishingChoice(false);
            setPublishingAgent(null);
          }}
          onRegularPublish={handleRegularPublish}
          onSecurePublish={handleSecurePublish}
          isPublishing={publishAgentMutation.isPending}
          isCreatingTemplate={createTemplateMutation.isPending}
        />
      )}
    </>
  );
};