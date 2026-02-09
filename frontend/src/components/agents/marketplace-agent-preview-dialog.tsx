'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Bot, Download, Wrench, Plug, Tag, User, Calendar, Loader2, Share, Cpu, Eye, Zap, MessageSquare, ArrowRight, Sparkles, FileText } from 'lucide-react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { toast } from 'sonner';
import type { MarketplaceTemplate, UsageExampleMessage } from '@/components/agents/installation/types';
import { useComposioToolkitIcon } from '@/hooks/composio/use-composio';
import { useRouter } from 'next/navigation';
import { backendApi } from '@/lib/api-client';
import { AgentAvatar } from '@/components/thread/content/agent-avatar';
import { useTheme } from 'next-themes';
import { Markdown } from '@/components/ui/markdown';

interface MarketplaceAgentPreviewDialogProps {
  agent: MarketplaceTemplate | null;
  isOpen: boolean;
  onClose: () => void;
  onInstall: (agent: MarketplaceTemplate) => void;
  isInstalling?: boolean;
}

const extractAppInfo = (qualifiedName: string, customType?: string) => {
  if (qualifiedName?.startsWith('composio.')) {
    const extractedSlug = qualifiedName.substring(9);
    if (extractedSlug) {
      return { type: 'composio', slug: extractedSlug };
    }
  }

  if (customType === 'composio') {
    if (qualifiedName?.startsWith('composio.')) {
      const extractedSlug = qualifiedName.substring(9);
      if (extractedSlug) {
        return { type: 'composio', slug: extractedSlug };
      }
    }
  }

  return null;
};

const IntegrationLogo: React.FC<{
  qualifiedName: string;
  displayName: string;
  customType?: string;
  toolkitSlug?: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ qualifiedName, displayName, customType, toolkitSlug, size = 'sm' }) => {
  let appInfo = extractAppInfo(qualifiedName, customType);

  if (!appInfo && toolkitSlug) {
    appInfo = { type: 'composio', slug: toolkitSlug };
  }

  const { data: composioIconData } = useComposioToolkitIcon(
    appInfo?.type === 'composio' ? appInfo.slug : '',
    { enabled: appInfo?.type === 'composio' }
  );

  let logoUrl: string | undefined;
  if (appInfo?.type === 'composio') {
    logoUrl = composioIconData?.icon_url;
  }

  const firstLetter = displayName.charAt(0).toUpperCase();

  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  return (
    <div className={`${sizeClasses[size]} flex items-center justify-center flex-shrink-0 overflow-hidden rounded-md`}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={displayName}
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            target.nextElementSibling?.classList.remove('hidden');
          }}
        />
      ) : null}
      <div className={logoUrl ? "hidden" : "flex w-full h-full items-center justify-center bg-muted rounded-md text-xs font-medium text-muted-foreground"}>
        {firstLetter}
      </div>
    </div>
  );
};

export const MarketplaceAgentPreviewDialog: React.FC<MarketplaceAgentPreviewDialogProps> = ({
  agent,
  isOpen,
  onClose,
  onInstall,
  isInstalling = false
}) => {
  const router = useRouter();
  const { theme } = useTheme();
  const [isGeneratingShareLink, setIsGeneratingShareLink] = React.useState(false);

  if (!agent) return null;

  const isOmniAgent = agent.is_omni_team || false;

  const tools = agent.mcp_requirements || [];

  const toolRequirements = tools.filter(req => req.source === 'tool');
  const triggerRequirements = tools.filter(req => req.source === 'trigger');

  const integrations = toolRequirements.filter(tool => !tool.custom_type || tool.custom_type !== 'sse');
  const customTools = toolRequirements.filter(tool => tool.custom_type === 'sse');

  const agentpressTools = Object.entries(agent.agentpress_tools || {})
    .filter(([_, enabled]) => enabled)
    .map(([toolName]) => toolName);

  const handleInstall = () => {
    onInstall(agent);
  };

  const handleShare = async () => {
    setIsGeneratingShareLink(true);
    try {
      // Simple approach: use template ID directly in URL
      const shareUrl = `${window.location.origin}/templates/${agent.template_id}`;

      await navigator.clipboard.writeText(shareUrl);
      toast.success('Share link copied to clipboard!');
    } catch (error: any) {
      console.error('Failed to copy share link:', error);
      toast.error('Failed to copy share link to clipboard');
    } finally {
      setIsGeneratingShareLink(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getAppDisplayName = (qualifiedName: string) => {
    if (qualifiedName.includes('_')) {
      const parts = qualifiedName.split('_');
      return parts[parts.length - 1].replace(/\b\w/g, l => l.toUpperCase());
    }
    return qualifiedName.replace(/\b\w/g, l => l.toUpperCase());
  };

  const hasUsageExamples = agent.usage_examples && agent.usage_examples.length > 0;

  const getDownloadsText = (count: number) => {
    if (count === 1) return '1 download';
    return `${count} downloads`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`${hasUsageExamples ? 'max-w-6xl' : 'max-w-2xl'} h-[85vh] p-0 overflow-hidden flex flex-col`}>
        <DialogHeader className='sr-only'>
          <DialogTitle>Agent Preview</DialogTitle>
        </DialogHeader>
        <div className={`flex ${hasUsageExamples ? 'flex-row' : 'flex-col'} flex-1 min-h-0`}>
          <div className={`${hasUsageExamples ? 'w-1/2' : 'w-full'} flex flex-col min-h-0`}>
            <div className="flex-shrink-0 p-8 pb-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 relative">
                  <AgentAvatar
                    iconName={agent.icon_name}
                    iconColor={agent.icon_color}
                    backgroundColor={agent.icon_background}
                    agentName={agent.name}
                    size={64}
                    className='rounded-2xl'
                  />
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <h1 className="text-3xl font-bold text-foreground mb-3 tracking-tight">
                    {agent.name}
                  </h1>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-1.5">
                      <User className="h-4 w-4" />
                      <span>{agent.creator_name || 'Unknown Creator'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Download className="h-4 w-4" />
                      <span>{getDownloadsText(agent.download_count || 0)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDate(agent.created_at)}</span>
                    </div>
                  </div>

                  {agent.description && (
                    <p className="text-base text-muted-foreground leading-relaxed">
                      {agent.description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* System Prompt hidden in marketplace view as per requirements */}
            {/* {agent.system_prompt && (
              <div className="flex-1 overflow-y-auto px-8 min-h-0 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-muted-foreground/10">
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium text-muted-foreground">System Prompt</h3>
                  </div>
                  <div className="rounded-lg">
                    <Markdown className="text-xs [&>*]:text-xs [&>*]:opacity-50 [&>*]:leading-relaxed select-text">
                      {agent.system_prompt}
                    </Markdown>
                  </div>
                </div>
              </div>
            )} */}

            <div className="flex-1 p-8 pt-2">
              <div className="bg-muted/30 rounded-xl p-8 h-full flex items-center justify-center border border-muted/40">
                {(integrations.length > 0 || customTools.length > 0 || triggerRequirements.length > 0) ? (
                  <div className="w-full">
                    <div className="flex items-center justify-center gap-2 mb-6">
                      <Plug className="h-5 w-5 text-muted-foreground" />
                      <h3 className="text-base font-medium text-muted-foreground">Integrations & Tools</h3>
                    </div>
                    <div className="flex flex-wrap justify-center gap-3">
                      {integrations.map((integration, index) => (
                        <div
                          key={`int-${index}`}
                          className="flex items-center gap-2 p-3 rounded-lg border bg-background/50 backdrop-blur-sm"
                        >
                          <IntegrationLogo
                            qualifiedName={integration.qualified_name}
                            displayName={integration.display_name || getAppDisplayName(integration.qualified_name)}
                            customType={integration.custom_type}
                            toolkitSlug={integration.toolkit_slug}
                            size="sm"
                          />
                          <span className="text-sm font-medium pr-1">
                            {integration.display_name || getAppDisplayName(integration.qualified_name)}
                          </span>
                        </div>
                      ))}
                      {triggerRequirements.map((trigger, index) => {
                        const appName = trigger.display_name?.split(' (')[0] || trigger.display_name;
                        const triggerName = trigger.display_name?.match(/\(([^)]+)\)/)?.[1] || trigger.display_name;

                        return (
                          <div
                            key={`trig-${index}`}
                            className="flex items-center gap-2 p-3 rounded-lg border bg-background/50 backdrop-blur-sm"
                          >
                            <IntegrationLogo
                              qualifiedName={trigger.qualified_name}
                              displayName={appName || getAppDisplayName(trigger.qualified_name)}
                              customType={trigger.custom_type || (trigger.qualified_name?.startsWith('composio.') ? 'composio' : undefined)}
                              toolkitSlug={trigger.toolkit_slug}
                              size="sm"
                            />
                            <div className="flex items-center gap-1">
                              <Zap className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm font-medium pr-1">
                                {triggerName || trigger.display_name}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      {customTools.map((tool, index) => (
                        <div
                          key={`tool-${index}`}
                          className="flex items-center gap-2 p-3 rounded-lg border bg-background/50 backdrop-blur-sm"
                        >
                          <IntegrationLogo
                            qualifiedName={tool.qualified_name}
                            displayName={tool.display_name || getAppDisplayName(tool.qualified_name)}
                            customType={tool.custom_type}
                            toolkitSlug={tool.toolkit_slug}
                            size="md"
                          />
                          <span className="text-sm font-medium pr-1">
                            {tool.display_name || getAppDisplayName(tool.qualified_name)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-center text-muted-foreground mt-6 max-w-md mx-auto">
                      This agent comes pre-configured with these specialized tools and integrations.
                    </p>
                  </div>
                ) : (
                  <div className="text-center max-w-md mx-auto">
                    <Bot className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <p className="text-muted-foreground text-lg font-medium mb-2">
                      Core AI Capabilities
                    </p>
                    <p className="text-sm text-muted-foreground/80">
                      This agent uses basic functionality without external integrations or specialized tools.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-8 pt-0 mt-auto">
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleInstall}
                  disabled={isInstalling}
                  className="flex-1 h-11 text-base font-medium shadow-md hover:shadow-lg transition-all"
                  size="lg"
                >
                  {isInstalling ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Download className="h-5 w-5 mr-2" />
                      Install Agent
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  className="h-11 px-6 border-muted-foreground/20 hover:bg-muted/50"
                  onClick={handleShare}
                  disabled={isGeneratingShareLink}
                >
                  {isGeneratingShareLink ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <Share className="h-4 w-4 mr-2" />
                  )}
                  Share
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  className="h-11 px-6 border-muted-foreground/20 hover:bg-muted/50"
                  onClick={onClose}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>

          {hasUsageExamples && (
            <div className="w-1/2 flex flex-col p-4 overflow-hidden border-l border-border/40">
              <div className="px-4 py-6 flex-shrink-0">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  <h3 className="text-base font-semibold text-foreground">Example Conversation</h3>
                </div>
                <p className="text-sm text-muted-foreground">See how this agent behaves in action</p>
              </div>
              <div className="px-4 pb-4 flex-1 overflow-y-auto space-y-4 min-h-0">
                <div
                  className="p-6 rounded-2xl flex-1 overflow-y-auto space-y-6 h-full border border-border/50 shadow-sm"
                  style={{
                    background: theme === 'dark'
                      ? `linear-gradient(to bottom right, ${agent.icon_background}10, ${agent.icon_background}05, transparent)`
                      : `linear-gradient(to bottom right, ${agent.icon_background}25, ${agent.icon_background}10, #ffffff)`
                  }}
                >
                  {(() => {
                    const messages = agent.usage_examples || [];
                    const groupedMessages: Array<{ role: string; messages: UsageExampleMessage[] }> = [];

                    messages.forEach((message) => {
                      const lastGroup = groupedMessages[groupedMessages.length - 1];
                      if (lastGroup && lastGroup.role === message.role) {
                        lastGroup.messages.push(message);
                      } else {
                        groupedMessages.push({ role: message.role, messages: [message] });
                      }
                    });

                    return groupedMessages.map((group, groupIndex) => {
                      const isUser = group.role === 'user';
                      return (
                        <div key={groupIndex} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                          <div className={`group relative max-w-[85%] ${isUser ? 'flex flex-row-reverse' : 'flex'} gap-3`}>
                            <div className="flex-shrink-0 mt-1">
                              {isUser ? (
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                                  <User className="h-4 w-4 text-primary" />
                                </div>
                              ) : (
                                <AgentAvatar
                                  iconName={agent.icon_name}
                                  iconColor={agent.icon_color}
                                  backgroundColor={agent.icon_background}
                                  agentName={agent.name}
                                  size={32}
                                  className="ring-1 ring-border/50"
                                />
                              )}
                            </div>

                            <div className={`rounded-2xl p-4 shadow-sm ${isUser
                                ? 'bg-primary text-primary-foreground rounded-tr-none'
                                : 'bg-background border border-border/50 rounded-tl-none'
                              }`}>
                              {group.messages.map((message, msgIndex) => (
                                <div key={msgIndex} className={msgIndex > 0 ? "mt-3 pt-3 border-t border-border/10" : ""}>
                                  <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isUser ? 'text-primary-foreground' : 'text-foreground'}`}>
                                    {message.content}
                                  </p>
                                  {message.tool_calls && message.tool_calls.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                      {message.tool_calls.map((tool, toolIndex) => (
                                        <div key={toolIndex} className="flex items-center gap-2 p-2 bg-black/5 dark:bg-white/5 rounded-lg text-xs font-mono">
                                          <Wrench className="h-3 w-3 opacity-70" />
                                          <span className="font-semibold opacity-90">{tool.name}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
