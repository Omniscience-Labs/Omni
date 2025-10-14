import React, { useState } from 'react';
import { Settings, Trash2, Star, MessageCircle, Wrench, Globe, GlobeLock, Download, Shield, AlertTriangle, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useCreateTemplate } from '@/hooks/react-query/secure-mcp/use-secure-mcp';
import { toast } from 'sonner';
import { UnifiedAgentCard } from '@/components/ui/unified-agent-card';
import { AgentAvatar } from '../thread/content/agent-avatar';
import { AgentConfigurationDialog } from './agent-configuration-dialog';
import { isStagingMode } from '@/lib/config';

interface Agent {
  agent_id: string;
  name: string;
  is_default: boolean;
  is_public?: boolean;
  marketplace_published_at?: string;
  download_count?: number;
  tags?: string[];
  created_at: string;
  updated_at?: string;
  configured_mcps?: Array<{ name: string }>;
  agentpress_tools?: Record<string, any>;
  template_id?: string;
  current_version_id?: string;
  version_count?: number;
  current_version?: {
    version_id: string;
    version_name: string;
    version_number: number;
  };
  metadata?: {
    is_suna_default?: boolean;
    is_omni_default?: boolean;
    centrally_managed?: boolean;
    restrictions?: {
      system_prompt_editable?: boolean;
      tools_editable?: boolean;
      name_editable?: boolean;
      mcps_editable?: boolean;
    };
  };
  // Icon system fields
  icon_name?: string | null;
  icon_color?: string | null;
  icon_background?: string | null;
}

interface AgentsGridProps {
  agents: Agent[];
  onEditAgent: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  onToggleDefault: (agentId: string, currentDefault: boolean) => void;
  deleteAgentMutation?: { isPending: boolean }; // Made optional as we'll track per-agent state
  isDeletingAgent?: (agentId: string) => boolean;
  onPublish?: (agent: Agent) => void;
  publishingId?: string | null;
}

interface AgentModalProps {
  agent: Agent | null;
  isOpen: boolean;
  onClose: () => void;
  onCustomize: (agentId: string) => void;
  onChat: (agentId: string) => void;
  onPublish: (agentId: string) => void;
  isPublishing: boolean;
}

const AgentModal: React.FC<AgentModalProps> = ({ 
  agent, 
  isOpen, 
  onClose, 
  onCustomize, 
  onChat, 
  onPublish, 
  isPublishing 
}) => {
  if (!agent) return null;

  const isSunaAgent = agent.metadata?.is_suna_default || agent.metadata?.is_omni_default || false;
  
  const truncateDescription = (text?: string, maxLength = 120) => {
    if (!text || text.length <= maxLength) return text || 'Try out this agent';
    return text.substring(0, maxLength) + '...';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-none">
        <DialogTitle className="sr-only">Agent actions</DialogTitle>
        <div className="relative">
          <div className={`p-4 h-24 flex items-start justify-start relative`}>
            <AgentAvatar
              iconName={agent.icon_name}
              iconColor={agent.icon_color}
              backgroundColor={agent.icon_background}
              agentName={agent.name}
              isSunaDefault={isSunaAgent}
              size={64}
            />
          </div>

          <div className="p-4 space-y-2">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-xl font-semibold text-foreground">
                  {agent.name}
                </h2>
                {!isSunaAgent && agent.current_version && (
                  <Badge variant="outline" className="text-xs">
                    <GitBranch className="h-3 w-3" />
                    {agent.current_version.version_name}
                  </Badge>
                )}
                {agent.is_public && (
                  <Badge variant="outline" className="text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    Published
                  </Badge>
                )}
              </div>
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
            {!isSunaAgent && isStagingMode && (
              <div className="pt-2">
                {agent.is_public ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Published as secure template</span>
                      <div className="flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        {agent.download_count || 0} downloads
                      </div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
                      <p className="text-xs text-muted-foreground">
                        To remove this template from the marketplace, go to the <span className="font-medium text-foreground">Marketplace tab</span> and use the three-dot menu.
                      </p>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => onPublish(agent.agent_id)}
                    disabled={isPublishing}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    {isPublishing ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        Publishing...
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4" />
                        Publish as Template
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const AgentsGrid: React.FC<AgentsGridProps> = ({ 
  agents, 
  onEditAgent, 
  onDeleteAgent, 
  onToggleDefault,
  deleteAgentMutation,
  isDeletingAgent,
  onPublish,
  publishingId: externalPublishingId
}) => {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
          onAgentChange={(newAgentId) => {
            setConfigAgentId(newAgentId);
          }}
        />
      )}
    </>
  );
};