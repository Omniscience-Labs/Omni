'use client';
import { siteConfig } from '@/lib/home';
import { useIsMobile } from '@/hooks/utils';
import { useState, useEffect, useRef, FormEvent, lazy, Suspense } from 'react';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { AgentRunLimitError, BillingError } from '@/lib/api/errors';
import { useInitiateAgentMutation } from '@/hooks/dashboard/use-initiate-agent';
import { useThreadQuery } from '@/hooks/threads/use-threads';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogOverlay,
} from '@/components/ui/dialog';
import { isLocalMode, config, isStagingMode } from '@/lib/config';
import { toast } from 'sonner';
import { ChatInput, ChatInputHandles } from '@/components/thread/chat-input/chat-input';
import { normalizeFilenameToNFC } from '@/lib/utils/unicode';
import { GeodesicSphere } from '@/components/ui/geodesic-sphere';
import { useQuery } from '@tanstack/react-query';
import { agentKeys } from '@/hooks/agents/keys';
import { getAgents } from '@/hooks/agents/utils';
import { useOmniModePersistence } from '@/stores/suna-modes-store';
import { useAgentSelection } from '@/stores/agent-selection-store';
import { useTranslations } from 'next-intl';

// Lazy load components only needed when dialogs are open
const GoogleSignIn = lazy(() => import('@/components/GoogleSignIn'));
const GitHubSignIn = lazy(() => import('@/components/GithubSignIn'));
const PlanSelectionModal = lazy(() => 
    import('@/components/billing/pricing').then(mod => ({ default: mod.PlanSelectionModal }))
);
const AgentRunLimitDialog = lazy(() => 
    import('@/components/thread/agent-run-limit-dialog').then(mod => ({ default: mod.AgentRunLimitDialog }))
);
const SunaModesPanel = lazy(() =>
    import('@/components/dashboard/suna-modes-panel').then(mod => ({ default: mod.SunaModesPanel }))
);

// Custom dialog overlay with blur effect
const BlurredDialogOverlay = () => (
    <DialogOverlay className="bg-background/40 backdrop-blur-md" />
);

// Constant for localStorage key to ensure consistency
const PENDING_PROMPT_KEY = 'pendingAgentPrompt';



export function HeroSection() {
    const t = useTranslations('omni');
    const { hero } = siteConfig;
    const isMobile = useIsMobile();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [inputValue, setInputValue] = useState('');

    // Use centralized agent selection hook with persistence
    const {
        selectedAgentId,
        setSelectedAgent,
        initializeFromAgents,
        getCurrentAgent
    } = useAgentSelection();

    // Use centralized Omni modes persistence hook
    const {
        selectedMode,
        selectedCharts,
        selectedOutputFormat,
        selectedTemplate,
        setSelectedMode,
        setSelectedCharts,
        setSelectedOutputFormat,
        setSelectedTemplate,
    } = useOmniModePersistence();
    const router = useRouter();
    const { user, isLoading } = useAuth();
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const initiateAgentMutation = useInitiateAgentMutation();
    const [initiatedThreadId, setInitiatedThreadId] = useState<string | null>(null);
    const threadQuery = useThreadQuery(initiatedThreadId || '');
    const chatInputRef = useRef<ChatInputHandles>(null);
    const [showAgentLimitDialog, setShowAgentLimitDialog] = useState(false);
    const [agentLimitData, setAgentLimitData] = useState<{
        runningCount: number;
        runningThreadIds: string[];
    } | null>(null);

    // Fetch agents for selection
    const { data: agentsResponse } = useQuery({
        queryKey: agentKeys.list({
            limit: 100,
            sort_by: 'name',
            sort_order: 'asc'
        }),
        queryFn: () => getAgents({
            limit: 100,
            sort_by: 'name',
            sort_order: 'asc'
        }),
        enabled: !!user && !isLoading,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
    });

    const agents = agentsResponse?.agents || [];

    // Initialize agent selection from agents list
    useEffect(() => {
        if (agents.length > 0) {
            initializeFromAgents(agents, undefined, setSelectedAgent);
        }
    }, [agents, initializeFromAgents, setSelectedAgent]);

    // Determine if selected agent is Omni default
    // For unauthenticated users, assume Omni is the default
    const selectedAgent = selectedAgentId
        ? agents.find(agent => agent.agent_id === selectedAgentId)
        : null;
    const isOmniAgent = !user || selectedAgent?.metadata?.is_suna_default || false;

    // Auth dialog state
    const [authDialogOpen, setAuthDialogOpen] = useState(false);

    useEffect(() => {
        if (authDialogOpen && inputValue.trim()) {
            localStorage.setItem(PENDING_PROMPT_KEY, inputValue.trim());
        }
    }, [authDialogOpen, inputValue]);

    useEffect(() => {
        if (authDialogOpen && user && !isLoading) {
            setAuthDialogOpen(false);
            router.push('/dashboard');
        }
    }, [user, isLoading, authDialogOpen, router]);

    useEffect(() => {
        if (threadQuery.data && initiatedThreadId) {
            const thread = threadQuery.data;
            if (thread.project_id) {
                router.push(`/projects/${thread.project_id}/thread/${initiatedThreadId}`);
            } else {
                router.push(`/agents/${initiatedThreadId}`);
            }
            setInitiatedThreadId(null);
        }
    }, [threadQuery.data, initiatedThreadId, router]);

    // Handle ChatInput submission
    const handleChatInputSubmit = async (
        message: string,
        options?: { model_name?: string; enable_thinking?: boolean }
    ) => {
        if ((!message.trim() && !chatInputRef.current?.getPendingFiles().length) || isSubmitting) return;

        // If user is not logged in, save prompt and show auth dialog
        if (!user && !isLoading) {
            localStorage.setItem(PENDING_PROMPT_KEY, message.trim());
            setAuthDialogOpen(true);
            return;
        }

        // User is logged in, create the agent with files like dashboard does
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

            // Add files if any
            files.forEach((file) => {
                const normalizedName = normalizeFilenameToNFC(file.name);
                formData.append('files', file, normalizedName);
            });

            if (options?.model_name) formData.append('model_name', options.model_name);
            formData.append('enable_thinking', String(options?.enable_thinking ?? false));
            formData.append('reasoning_effort', 'low');
            formData.append('stream', 'true');
            formData.append('enable_context_manager', 'false');

            const result = await initiateAgentMutation.mutateAsync(formData);

            if (result.thread_id) {
                setInitiatedThreadId(result.thread_id);
            } else {
                throw new Error('Agent initiation did not return a thread_id.');
            }

            chatInputRef.current?.clearPendingFiles();
            setInputValue('');
        } catch (error: any) {
            if (error instanceof BillingError) {
                setShowPaymentModal(true);
            } else if (error instanceof AgentRunLimitError) {
                // Skip agent run limit errors in local mode
                if (isLocalMode()) {
                    console.log('Agent run limit error in local mode - ignoring');
                    return;
                }
                const { running_thread_ids, running_count } = error.detail;

                setAgentLimitData({
                    runningCount: running_count,
                    runningThreadIds: running_thread_ids,
                });
                setShowAgentLimitDialog(true);
            } else {
                const isConnectionError =
                    error instanceof TypeError &&
                    error.message.includes('Failed to fetch');
                if (!isLocalMode() || isConnectionError) {
                    toast.error(
                        error.message || 'Failed to create agent. Please try again.',
                    );
                }
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <section id="hero" className="w-full relative overflow-hidden">
            {/* Lazy load payment modal - only needed on interaction */}
            {showPaymentModal && (
                <Suspense fallback={null}>
                    <PlanSelectionModal
                        open={showPaymentModal}
                        onOpenChange={setShowPaymentModal}
                    />
                </Suspense>
            )}
            <div className="relative flex flex-col items-center w-full px-4 sm:px-6 pb-8 sm:pb-10">

                <div className="relative z-10 pt-20 sm:pt-24 md:pt-32 mx-auto h-full w-full max-w-6xl flex flex-col items-center justify-center min-h-[60vh] sm:min-h-0">

                    {/* Spinning Geodesic Sphere Logo */}
                    <div className="mb-6">
                        <GeodesicSphere size={120} glow speed={1} />
                    </div>

                    {/* Decorative line */}
                    <div className="w-24 h-0.5 bg-gradient-to-r from-purple-500 to-pink-500 mb-8" />

                    {/* Main Heading */}
                    <div className="flex flex-col items-center justify-center gap-4 sm:gap-6 max-w-4xl mx-auto pb-4">
                        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-balance text-center px-4 sm:px-2 text-foreground">
                            {hero.title}
                        </h1>
                        <p className="text-base sm:text-lg text-muted-foreground text-center">
                            a generalist <span className="text-purple-400">AI Agent</span> that works on your behalf.
                        </p>
                    </div>

                    {/* Search Input */}
                    <div className="flex flex-col items-center w-full max-w-xl mx-auto gap-2 flex-wrap justify-center px-4 sm:px-0 mt-8">
                        <div className="w-full relative">
                            <div className="relative flex items-center w-full bg-muted/20 border border-border/50 rounded-full px-6 py-3">
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleChatInputSubmit(inputValue);
                                        }
                                    }}
                                    placeholder={hero.inputPlaceholder}
                                    className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/60 text-sm outline-none"
                                    disabled={isSubmitting}
                                />
                                <button
                                    onClick={() => handleChatInputSubmit(inputValue)}
                                    disabled={isSubmitting || !inputValue.trim()}
                                    className="ml-4 w-10 h-10 rounded-full bg-muted/30 hover:bg-muted/50 flex items-center justify-center transition-colors disabled:opacity-50"
                                >
                                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Stats Section */}
                    <div className="mt-16 text-center">
                        <p className="text-base sm:text-lg text-muted-foreground">
                            {hero.stats?.text1}{' '}
                            <span className="font-bold text-foreground">{hero.stats?.highlight1}</span>
                            {' '}{hero.stats?.text2}{' '}
                            <span className="font-bold text-foreground">{hero.stats?.highlight2}</span>
                        </p>
                    </div>

                </div>

            </div>

            {/* Auth Dialog */}
            <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
                <BlurredDialogOverlay />
                <DialogContent className="sm:max-w-md rounded-xl bg-background border border-border">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-xl font-medium">
                                Sign in to continue
                            </DialogTitle>
                            {/* <button 
                onClick={() => setAuthDialogOpen(false)}
                className="rounded-full p-1 hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button> */}
                        </div>
                        <DialogDescription className="text-muted-foreground">
                            Sign in or create an account to talk with Omni
                        </DialogDescription>
                    </DialogHeader>

                    {/* OAuth Sign In */}
                    <div className="w-full space-y-3 mt-8">
                        <Suspense fallback={<div className="h-12 bg-muted/20 rounded-full animate-pulse" />}>
                            <GoogleSignIn returnUrl="/dashboard" />
                        </Suspense>
                        <Suspense fallback={<div className="h-12 bg-muted/20 rounded-full animate-pulse" />}>
                            <GitHubSignIn returnUrl="/dashboard" />
                        </Suspense>
                    </div>

                    {/* Divider */}
                    <div className="relative my-2">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-border"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-3 bg-background text-muted-foreground font-medium">
                                or continue with email
                            </span>
                        </div>
                    </div>

                    {/* Sign in options */}
                    <div className="space-y-3">
                        <Link
                            href={`/auth?returnUrl=${encodeURIComponent('/dashboard')}`}
                            className="flex h-12 items-center justify-center w-full text-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm font-medium"
                            onClick={() => setAuthDialogOpen(false)}
                        >
                            Sign in with email
                        </Link>

                        <Link
                            href={`/auth?mode=signup&returnUrl=${encodeURIComponent('/dashboard')}`}
                            className="flex h-12 items-center justify-center w-full text-center rounded-full border border-border bg-background hover:bg-accent/50 transition-all font-medium"
                            onClick={() => setAuthDialogOpen(false)}
                        >
                            Create new account
                        </Link>
                    </div>

                    <div className="mt-8 text-center text-[13px] text-muted-foreground leading-relaxed">
                        By continuing, you agree to our{' '}
                        <a href="https://www.becomeomni.com/legal?tab=terms" target="_blank" rel="noopener noreferrer" className="text-foreground/70 hover:text-foreground underline underline-offset-2 transition-colors">
                            Terms of Service
                        </a>{' '}
                        and{' '}
                        <a href="https://www.becomeomni.com/legal?tab=privacy" target="_blank" rel="noopener noreferrer" className="text-foreground/70 hover:text-foreground underline underline-offset-2 transition-colors">
                            Privacy Policy
                        </a>
                    </div>
                </DialogContent>
            </Dialog>

            {agentLimitData && (
                <Suspense fallback={null}>
                    <AgentRunLimitDialog
                        open={showAgentLimitDialog}
                        onOpenChange={setShowAgentLimitDialog}
                        runningCount={agentLimitData.runningCount}
                        runningThreadIds={agentLimitData.runningThreadIds}
                        projectId={undefined} // Hero section doesn't have a specific project context
                    />
                </Suspense>
            )}
        </section>
    );
}
