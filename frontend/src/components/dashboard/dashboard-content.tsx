'use client';

import React, { useState, Suspense, useCallback, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChatInput,
  ChatInputHandles,
} from '@/components/thread/chat-input/chat-input';
import {
  BillingError,
  AgentRunLimitError,
  ProjectLimitError,
} from '@/lib/api';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBillingError } from '@/hooks/useBillingError';
import { BillingErrorAlert } from '@/components/billing/usage-limit-alert';
import { useAccounts } from '@/hooks/use-accounts';
import { useAuth } from '@/components/AuthProvider';
import { config, isLocalMode, isStagingMode } from '@/lib/config';
import { useInitiateAgentWithInvalidation } from '@/hooks/react-query/dashboard/use-initiate-agent';

import { useAgents } from '@/hooks/react-query/agents/use-agents';
import { cn } from '@/lib/utils';
import { BillingModal } from '@/components/billing/billing-modal';
import { ProjectLimitDialog } from '@/components/billing/project-limit-dialog';
import { CreditsLimitDialog } from '@/components/billing/credits-limit-dialog';
import { useAgentSelection } from '@/lib/stores/agent-selection-store';
import { SunaModesPanel } from './suna-modes-panel';
import { AIWorkerTemplates } from './ai-worker-templates';
import { useThreadQuery } from '@/hooks/react-query/threads/use-threads';
import { normalizeFilenameToNFC } from '@/lib/utils/unicode';
import { OmniLogo } from '../sidebar/omni-logo';
import { AgentRunLimitDialog } from '@/components/thread/agent-run-limit-dialog';
import { CustomAgentsSection } from './custom-agents-section';
import { toast } from 'sonner';
import { ReleaseBadge } from '../auth/release-badge';
import { Calendar, MessageSquare, Plus, Sparkles, Zap } from 'lucide-react';
import { AgentConfigurationDialog } from '@/components/agents/agent-configuration-dialog';

const PENDING_PROMPT_KEY = 'pendingAgentPrompt';

export function DashboardContent() {
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [configAgentId, setConfigAgentId] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'super-worker' | 'worker-templates'>('super-worker');
  const [selectedCharts, setSelectedCharts] = useState<string[]>([]);
  const [selectedOutputFormat, setSelectedOutputFormat] = useState<string | null>(null);
  
  // Reset data selections when mode changes
  React.useEffect(() => {
    if (selectedMode !== 'data') {
      setSelectedCharts([]);
      setSelectedOutputFormat(null);
    }
  }, [selectedMode]);
  const {
    selectedAgentId,
    setSelectedAgent,
    initializeFromAgents,
    getCurrentAgent
  } = useAgentSelection();
  const [initiatedThreadId, setInitiatedThreadId] = useState<string | null>(null);
  const { billingError, handleBillingError, clearBillingError } =
    useBillingError();
  const [showAgentLimitDialog, setShowAgentLimitDialog] = useState(false);
  const [agentLimitData, setAgentLimitData] = useState<{
    runningCount: number;
    runningThreadIds: string[];
  } | null>(null);
  const [showProjectLimitDialog, setShowProjectLimitDialog] = useState(false);
  const [projectLimitData, setProjectLimitData] = useState<{currentCount: number; limit: number; tierName: string} | null>(null);
  const [showCreditsLimitDialog, setShowCreditsLimitDialog] = useState(false);
  const [creditsLimitData, setCreditsLimitData] = useState<{message: string; currentUsage?: number; limit?: number; creditBalance?: number; isEnterprise?: boolean} | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { data: accounts } = useAccounts({ enabled: !!user });
  const personalAccount = accounts?.find((account) => account.personal_account);
  const chatInputRef = React.useRef<ChatInputHandles>(null);
  const initiateAgentMutation = useInitiateAgentWithInvalidation();
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Fetch agents to get the selected agent's name
  const { data: agentsResponse } = useAgents({
    limit: 100,
    sort_by: 'name',
    sort_order: 'asc'
  });

  const agents = agentsResponse?.agents || [];
  const selectedAgent = selectedAgentId
    ? agents.find(agent => agent.agent_id === selectedAgentId)
    : null;
  const displayName = selectedAgent?.name || 'Omni';
  const agentAvatar = undefined;
  const isSunaAgent = selectedAgent?.metadata?.is_suna_default || selectedAgent?.metadata?.is_omni_default || false;

  const threadQuery = useThreadQuery(initiatedThreadId || '');

  React.useEffect(() => {
    if (agents.length > 0) {
      initializeFromAgents(agents, undefined, setSelectedAgent);
    }
  }, [agents, initializeFromAgents, setSelectedAgent]);

  React.useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'worker-templates') {
      setViewMode('worker-templates');
    } else {
      setViewMode('super-worker');
    }
  }, [searchParams]);

  React.useEffect(() => {
    const agentIdFromUrl = searchParams.get('agent_id');
    if (agentIdFromUrl && agentIdFromUrl !== selectedAgentId) {
      setSelectedAgent(agentIdFromUrl);
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('agent_id');
      router.replace(newUrl.pathname + newUrl.search, { scroll: false });
    }
  }, [searchParams, selectedAgentId, router, setSelectedAgent]);

  React.useEffect(() => {
    if (threadQuery.data && initiatedThreadId) {
      const thread = threadQuery.data;
      setIsRedirecting(true);
      if (thread.project_id) {
        router.push(`/projects/${thread.project_id}/thread/${initiatedThreadId}`);
      } else {
        router.push(`/agents/${initiatedThreadId}`);
      }
      setInitiatedThreadId(null);
    }
  }, [threadQuery.data, initiatedThreadId, router]);

  const handleSubmit = async (
    message: string,
    options?: {
      model_name?: string;
      enable_context_manager?: boolean;
    },
  ) => {
    if (
      (!message.trim() && !chatInputRef.current?.getPendingFiles().length) ||
      isSubmitting ||
      isRedirecting
    )
      return;

    setIsSubmitting(true);

    try {
      const files = chatInputRef.current?.getPendingFiles() || [];
      localStorage.removeItem(PENDING_PROMPT_KEY);

      const formData = new FormData();
      formData.append('prompt', message);

      // Add selected agent if one is chosen
      if (selectedAgentId) {
        formData.append('agent_id', selectedAgentId);
      }

      files.forEach((file, index) => {
        const normalizedName = normalizeFilenameToNFC(file.name);
        formData.append('files', file, normalizedName);
      });

      if (options?.model_name) formData.append('model_name', options.model_name);
      formData.append('stream', 'true'); // Always stream for better UX
      formData.append('enable_context_manager', String(options?.enable_context_manager ?? false));

      const result = await initiateAgentMutation.mutateAsync(formData);

      if (result.thread_id) {
        setInitiatedThreadId(result.thread_id);
        // Don't reset isSubmitting here - keep loading until redirect happens
      } else {
        throw new Error('Agent initiation did not return a thread_id.');
      }
      chatInputRef.current?.clearPendingFiles();
    } catch (error: any) {
      console.error('Error during submission process:', error);
      if (error instanceof BillingError) {
        setCreditsLimitData({
          message: error.detail.message || "You've exhausted your available credits.",
          currentUsage: error.detail.currentUsage,
          limit: error.detail.limit,
          creditBalance: error.detail.creditBalance,
          isEnterprise: process.env.NEXT_PUBLIC_ENTERPRISE_MODE === 'true' || error.detail.is_enterprise || false,
        });
        setShowCreditsLimitDialog(true);
      } else if (error instanceof AgentRunLimitError) {
        const { running_thread_ids, running_count } = error.detail;
        setAgentLimitData({
          runningCount: running_count,
          runningThreadIds: running_thread_ids,
        });
        setShowAgentLimitDialog(true);
      } else if (error instanceof ProjectLimitError) {
        setProjectLimitData({
          currentCount: error.detail.current_count,
          limit: error.detail.limit,
          tierName: error.detail.tier_name,
        });
        setShowProjectLimitDialog(true);
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Operation failed';
        toast.error(errorMessage);
      }
      // Only reset loading state if there was an error or no thread_id was returned
      setIsSubmitting(false);
    }
  };

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const pendingPrompt = localStorage.getItem(PENDING_PROMPT_KEY);

      if (pendingPrompt) {
        setInputValue(pendingPrompt);
        setAutoSubmit(true);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    if (autoSubmit && inputValue && !isSubmitting && !isRedirecting) {
      const timer = setTimeout(() => {
        handleSubmit(inputValue);
        setAutoSubmit(false);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [autoSubmit, inputValue, isSubmitting, isRedirecting]);

  return (
    <>
      <BillingModal
        open={showPaymentModal}
        onOpenChange={setShowPaymentModal}
        showUsageLimitAlert={true}
      />

      {projectLimitData && (
        <ProjectLimitDialog
          open={showProjectLimitDialog}
          onOpenChange={setShowProjectLimitDialog}
          currentCount={projectLimitData.currentCount}
          limit={projectLimitData.limit}
          tierName={projectLimitData.tierName}
          onUpgrade={() => setShowPaymentModal(true)}
        />
      )}

      {creditsLimitData && (
        <CreditsLimitDialog
          open={showCreditsLimitDialog}
          onOpenChange={setShowCreditsLimitDialog}
          message={creditsLimitData.message}
          currentUsage={creditsLimitData.currentUsage}
          limit={creditsLimitData.limit}
          creditBalance={creditsLimitData.creditBalance}
          isEnterprise={creditsLimitData.isEnterprise}
          onUpgrade={() => setShowPaymentModal(true)}
        />
      )}
      <div className="flex flex-col h-screen w-full overflow-hidden">



        <div className="flex-1 overflow-y-auto">
          <div className="min-h-full flex flex-col">
            {/* Tabs at the top */}
            {(isStagingMode() || isLocalMode()) && (
              <div className="px-4 pt-4 pb-4">
                <div className="flex items-center justify-center gap-2 p-1 bg-muted/50 rounded-xl w-fit mx-auto">
                  <button
                    onClick={() => {
                      setViewMode('super-worker');
                      setSelectedMode(null);
                      router.push('/dashboard');
                    }}
                    className={cn(
                      "px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                      viewMode === 'super-worker'
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Omni
                  </button>
                  <button
                    onClick={() => {
                      setViewMode('worker-templates');
                      setSelectedMode(null);
                      router.push('/dashboard?tab=worker-templates');
                    }}
                    className={cn(
                      "px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                      viewMode === 'worker-templates'
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Worker Templates
                  </button>
                </div>
              </div>
            )}

            {/* Centered content area */}
            <div className="flex-1 flex items-start justify-center pt-[20vh]">
              {/* Super Worker View - Suna only */}
              {viewMode === 'super-worker' && (
                <div className="w-full animate-in fade-in-0 duration-300">
                  {/* Title and chat input - Fixed position */}
                  <div className="px-4 py-8">
                    <div className="w-full max-w-3xl mx-auto flex flex-col items-center space-y-4 md:space-y-6">
                      <div className="flex flex-col items-center text-center w-full">
                        <p
                          className="tracking-tight text-2xl md:text-3xl font-normal text-foreground/90"
                        >
                          What should Omni do for you today?
                        </p>
                      </div>

                      <div className="w-full">
                        <ChatInput
                          ref={chatInputRef}
                          onSubmit={handleSubmit}
                          loading={isSubmitting || isRedirecting}
                          placeholder="Describe what you need help with..."
                          value={inputValue}
                          onChange={setInputValue}
                          hideAttachments={false}
                          selectedAgentId={selectedAgentId}
                          onAgentSelect={setSelectedAgent}
                          enableAdvancedConfig={!isStagingMode() && !isLocalMode()}
                          onConfigureAgent={(agentId) => {
                            setConfigAgentId(agentId);
                            setShowConfigDialog(true);
                          }}
                          selectedMode={selectedMode}
                          onModeDeselect={() => setSelectedMode(null)}
                          animatePlaceholder={true}
                          selectedCharts={selectedCharts}
                          selectedOutputFormat={selectedOutputFormat}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Modes Panel - Below chat input, doesn't affect its position */}
                  {(isStagingMode() || isLocalMode()) && isSunaAgent && (
                    <div className="px-4 pb-8">
                      <div className="max-w-3xl mx-auto">
                        <SunaModesPanel
                          selectedMode={selectedMode}
                          onModeSelect={setSelectedMode}
                          onSelectPrompt={setInputValue}
                          isMobile={isMobile}
                          selectedCharts={selectedCharts}
                          onChartsChange={setSelectedCharts}
                          selectedOutputFormat={selectedOutputFormat}
                          onOutputFormatChange={setSelectedOutputFormat}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
              {(viewMode === 'worker-templates') && (
                <div className="w-full animate-in fade-in-0 duration-300">
                  {(isStagingMode() || isLocalMode()) && (
                    <div className="w-full px-4 pb-8">
                      <div className="max-w-5xl mx-auto">
                        <CustomAgentsSection
                          onAgentSelect={setSelectedAgent}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <BillingErrorAlert
          message={billingError?.message}
          currentUsage={billingError?.currentUsage}
          limit={billingError?.limit}
          accountId={personalAccount?.account_id}
          onDismiss={clearBillingError}
          isOpen={!!billingError}
          isEnterprise={process.env.NEXT_PUBLIC_ENTERPRISE_MODE === 'true'}
        />
      </div>

      {agentLimitData && (
        <AgentRunLimitDialog
          open={showAgentLimitDialog}
          onOpenChange={setShowAgentLimitDialog}
          runningCount={agentLimitData.runningCount}
          runningThreadIds={agentLimitData.runningThreadIds}
          projectId={undefined}
        />
      )}
      {configAgentId && (
        <AgentConfigurationDialog
          open={showConfigDialog}
          onOpenChange={setShowConfigDialog}
          agentId={configAgentId}
          onAgentChange={(newAgentId) => {
            setConfigAgentId(newAgentId);
            setSelectedAgent(newAgentId);
          }}
        />
      )}
    </>
  );
}
