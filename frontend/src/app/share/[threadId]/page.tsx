'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getMessages,
  getProject,
  getThread,
  Project,
  Message as BaseApiMessageType,
} from '@/lib/api';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { FileViewerModal } from '@/components/thread/file-viewer-modal';
import { ToolCallSidePanel, ToolCallInput } from "@/components/thread/tool-call-side-panel";
import { ThreadContent } from '@/components/thread/content/ThreadContent';
import { PlaybackControls, PlaybackController } from '@/components/thread/content/PlaybackControls';
import { UnifiedMessage, ParsedMetadata, ThreadParams } from '@/components/thread/types';
import { safeJsonParse } from '@/components/thread/utils';
import { useAgentStream } from '@/hooks/useAgentStream';
import { threadErrorCodeMessages } from '@/lib/constants/errorCodeMessages';
import { ThreadSkeleton } from '@/components/thread/content/ThreadSkeleton';


// Extend the base Message type with the expected database fields
interface ApiMessageType extends BaseApiMessageType {
  message_id?: string;
  thread_id?: string;
  is_llm_message?: boolean;
  metadata?: string;
  created_at?: string;
  updated_at?: string;
}

// Add a simple interface for streaming tool calls
interface StreamingToolCall {
  id?: string;
  name?: string;
  arguments?: string;
  index?: number;
  xml_tag_name?: string;
}

// Add a helper function to extract tool calls from message content
const extractToolCallsFromMessage = (content: string) => {
  const toolCallRegex = /<([a-zA-Z\-_]+)(?:\s+[^>]*)?>(?:[\s\S]*?)<\/\1>|<([a-zA-Z\-_]+)(?:\s+[^>]*)?\/>/g;
  const results = [];
  let match;

  while ((match = toolCallRegex.exec(content)) !== null) {
    const toolName = match[1] || match[2];
    results.push({
      name: toolName,
      fullMatch: match[0]
    });
  }

  return results;
};

export default function ThreadPage({
  params,
}: {
  params: Promise<ThreadParams>;
}) {
  const unwrappedParams = React.use(params);
  const threadId = unwrappedParams.threadId;

  const router = useRouter();
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentRunId, setAgentRunId] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<'idle' | 'running' | 'connecting' | 'error'>('idle');
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCallInput[]>([]);
  const [currentToolIndex, setCurrentToolIndex] = useState<number>(0);
  const [autoOpenedPanel, setAutoOpenedPanel] = useState(false);

  // Playback control states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [streamingText, setStreamingText] = useState('');
  const [currentToolCall, setCurrentToolCall] =
    useState<StreamingToolCall | null>(null);

  // Create a message-to-tool-index map for faster lookups
  const [messageToToolIndex, setMessageToToolIndex] = useState<Record<string, number>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const latestMessageRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const hasInitiallyScrolled = useRef<boolean>(false);

  const [project, setProject] = useState<Project | null>(null);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [fileViewerOpen, setFileViewerOpen] = useState(false);
  const [projectName, setProjectName] = useState<string>('');
  const [fileToView, setFileToView] = useState<string | null>(null);

  const initialLoadCompleted = useRef<boolean>(false);
  const messagesLoadedRef = useRef(false);
  const agentRunsCheckedRef = useRef(false);

  const [streamingTextContent, setStreamingTextContent] = useState('');

  const userClosedPanelRef = useRef(false);

  // Initialize as if user already closed panel to prevent auto-opening
  useEffect(() => {
    userClosedPanelRef.current = true;
    // Initially hide the side panel
    setIsSidePanelOpen(false);
  }, []);

  const toggleSidePanel = useCallback(() => {
    setIsSidePanelOpen((prev) => !prev);
  }, []);

  const handleSidePanelNavigate = useCallback((newIndex: number) => {
    setCurrentToolIndex(newIndex);
    console.log(`Tool panel manually set to index ${newIndex}`);
  }, []);

  const handleNewMessageFromStream = useCallback((message: UnifiedMessage) => {
    // Log the ID of the message received from the stream
    console.log(
      `[STREAM HANDLER] Received message: ID=${message.message_id}, Type=${message.type}`,
    );
    if (!message.message_id) {
      console.warn(`[STREAM HANDLER] Received message is missing ID: Type=${message.type}, Content=${message.content?.substring(0, 50)}...`);
    }

    setMessages(prev => {
      // First check if the message already exists
      const messageExists = prev.some(
        (m) => m.message_id === message.message_id,
      );
      if (messageExists) {
        // If it exists, update it instead of adding a new one
        return prev.map((m) =>
          m.message_id === message.message_id ? message : m,
        );
      } else {
        // If it's a new message, add it to the end
        return [...prev, message];
      }
    });

    // If we received a tool message, refresh the tool panel
    if (message.type === 'tool') {
      setAutoOpenedPanel(false);
    }
  }, []);

  const handleStreamStatusChange = useCallback((hookStatus: string) => {
    console.log(`[PAGE] Hook status changed: ${hookStatus}`);
    switch (hookStatus) {
      case 'idle':
      case 'completed':
      case 'stopped':
      case 'agent_not_running':
        setAgentStatus('idle');
        setAgentRunId(null);
        // Reset auto-opened state when agent completes to trigger tool detection
        setAutoOpenedPanel(false);
        break;
      case 'connecting':
        setAgentStatus('connecting');
        break;
      case 'streaming':
        setAgentStatus('running');
        break;
      case 'error':
        setAgentStatus('error');
        // Handle errors by going back to idle state after a short delay
        setTimeout(() => {
          setAgentStatus('idle');
          setAgentRunId(null);
        }, 3000);
        break;
    }
  }, [threadId]);

  const handleStreamError = useCallback((errorMessage: string) => {
    console.error(`[PAGE] Stream hook error: ${errorMessage}`);
    if (!errorMessage.toLowerCase().includes('not found') &&
      !errorMessage.toLowerCase().includes('agent run is not running')) {
      toast.error(`Stream Error: ${errorMessage}`);
    }
  }, []);

  const handleStreamClose = useCallback(() => {
    console.log(`[PAGE] Stream hook closed with final status: ${agentStatus}`);
  }, [agentStatus]);

  // Main playback function
  useEffect(() => {
    if (!isPlaying || messages.length === 0) return;

    let playbackTimeout: NodeJS.Timeout;

    const playbackNextMessage = async () => {
      // Ensure we're within bounds
      if (currentMessageIndex >= messages.length) {
        setIsPlaying(false);
        return;
      }

      const currentMessage = messages[currentMessageIndex];
      console.log(`Playing message ${currentMessageIndex}:`, currentMessage.type, currentMessage.message_id);

      // Move to the next message
      setCurrentMessageIndex((prevIndex) => prevIndex + 1);
    };

    // Start playback with a small delay
    playbackTimeout = setTimeout(playbackNextMessage, 500);

    return () => {
      clearTimeout(playbackTimeout);
    };
  }, [isPlaying, currentMessageIndex, messages]);

  const {
    status: streamHookStatus,
    toolCall: streamingToolCall,
    error: streamError,
    agentRunId: currentHookRunId,
    startStreaming,
    stopStreaming,
  } = useAgentStream(
    {
      onMessage: handleNewMessageFromStream,
      onStatusChange: handleStreamStatusChange,
      onError: handleStreamError,
      onClose: handleStreamClose,
    },
    threadId,
    setMessages,
  );

  useEffect(() => {
    if (agentRunId && agentRunId !== currentHookRunId) {
      console.log(
        `[PAGE] Target agentRunId set to ${agentRunId}, initiating stream...`,
      );
      startStreaming(agentRunId);
    }
  }, [agentRunId, startStreaming, currentHookRunId]);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (!initialLoadCompleted.current) setIsLoading(true);
      setError(null);

      try {
        if (!threadId) throw new Error('Thread ID is required');

        // Start loading all data in parallel
        const [threadData, messagesData] = await Promise.all([
          getThread(threadId).catch(err => {
            if (threadErrorCodeMessages[err.code]) {
              setError(threadErrorCodeMessages[err.code]);
            } else {
              throw new Error(err.message);
            }
            return null;
          }),
          getMessages(threadId).catch(err => {
            console.warn('Failed to load messages:', err);
            return [];
          }),
        ]);

        if (!isMounted) return;

        // Load project data if we have a project ID
        const projectData = threadData?.project_id ?
          await getProject(threadData.project_id).catch(err => {
            console.warn('[SHARE] Could not load project data:', err);
            return null;
          }) : null;

        if (isMounted) {
          if (projectData) {
            // Set project data
            setProject(projectData);

            // Make sure sandbox ID is set correctly
            if (typeof projectData.sandbox === 'string') {
              setSandboxId(projectData.sandbox);
            } else if (projectData.sandbox?.id) {
              setSandboxId(projectData.sandbox.id);
            }

            setProjectName(projectData.name || '');
          } else {
            // Set a generic name if we couldn't load the project
            setProjectName('Shared Conversation');
          }

          // Map API message type to UnifiedMessage type
          const unifiedMessages = (messagesData || [])
            .filter((msg) => msg.type !== 'status')
            .map((msg: ApiMessageType) => ({
              message_id: msg.message_id || null,
              thread_id: msg.thread_id || threadId,
              type: (msg.type || 'system') as UnifiedMessage['type'],
              is_llm_message: Boolean(msg.is_llm_message),
              content: msg.content || '',
              metadata: msg.metadata || '{}',
              created_at: msg.created_at || new Date().toISOString(),
              updated_at: msg.updated_at || new Date().toISOString(),
            }));

          setMessages(unifiedMessages);

          // Calculate historical tool pairs
          const historicalToolPairs: ToolCallInput[] = [];
          const assistantMessages = unifiedMessages.filter(m => m.type === 'assistant' && m.message_id);

          // Map to track which assistant messages have tool results
          const assistantToolMap = new Map<string, UnifiedMessage>();

          // First build a map of assistant message IDs to tool messages
          unifiedMessages.forEach((msg) => {
            if (msg.type === 'tool' && msg.metadata) {
              try {
                const metadata = JSON.parse(msg.metadata);
                if (metadata.assistant_message_id) {
                  assistantToolMap.set(metadata.assistant_message_id, msg);
                }
              } catch (e) {
                // Ignore parsing errors
              }
            }
          });

          // Now process each assistant message
          assistantMessages.forEach((assistantMsg) => {
            // Get message ID
            const messageId = assistantMsg.message_id;
            if (!messageId) return;

            // Find corresponding tool message
            const toolMessage = assistantToolMap.get(messageId);

            // Check for tool calls in the assistant message content
            let assistantContent: any;
            try {
              assistantContent = JSON.parse(assistantMsg.content);
            } catch (e) {
              assistantContent = { content: assistantMsg.content };
            }

            const assistantMessageText = assistantContent.content || assistantMsg.content;

            // Use a regex to find tool calls in the message content
            const toolCalls = extractToolCallsFromMessage(assistantMessageText);

            if (toolCalls.length > 0 && toolMessage) {
              // For each tool call in the message, create a pair
              toolCalls.forEach((toolCall) => {
                let toolContent: any;
                try {
                  toolContent = JSON.parse(toolMessage.content);
                } catch (e) {
                  toolContent = { content: toolMessage.content };
                }

                historicalToolPairs.push({
                  assistantCall: {
                    name: toolCall.name,
                    content: `${toolCall.fullMatch}<!-- messageId:${messageId} -->`,
                    timestamp: assistantMsg.created_at,
                  },
                  toolResult: {
                    content: toolContent.content || toolMessage.content,
                    isSuccess: true,
                    timestamp: toolMessage.created_at,
                  },
                });
              });
            }
          });

          // Sort the tool calls chronologically by timestamp
          historicalToolPairs.sort((a, b) => {
            const timeA = new Date(a.assistantCall.timestamp || '').getTime();
            const timeB = new Date(b.assistantCall.timestamp || '').getTime();
            return timeA - timeB;
          });

          setToolCalls(historicalToolPairs);

          // Build the message-to-tool-index map for faster lookups
          const mapBuilder: Record<string, number> = {};
          historicalToolPairs.forEach((tool, index) => {
            const content = tool.assistantCall?.content || '';
            const match = content.match(/<!-- messageId:([\w-]+) -->/);
            if (match && match[1]) {
              mapBuilder[match[1]] = index;
            }
          });
          setMessageToToolIndex(mapBuilder);

          // When loading is complete, prepare for playback
          initialLoadCompleted.current = true;
        }
      } catch (err) {
        console.error('Error loading thread data:', err);
        if (isMounted) {
          const errorMessage =
            err instanceof Error ? err.message : 'Failed to load thread';
          setError(errorMessage);
          toast.error(errorMessage);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [threadId]);

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } =
      messagesContainerRef.current;
    const isScrolledUp = scrollHeight - scrollTop - clientHeight > 100;
    setShowScrollButton(isScrolledUp);
    setUserHasScrolled(isScrolledUp);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Process the assistant call data
  const toolViewAssistant = useCallback((assistantContent?: string) => {
    if (!assistantContent) return null;

    return (
      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">Assistant Message</div>
        <div className="rounded-md border bg-muted/50 p-3">
          <div className="text-xs prose prose-xs dark:prose-invert chat-markdown max-w-none">{assistantContent}</div>
        </div>
      </div>
    );
  }, []);

  // Process the tool result data
  const toolViewResult = useCallback((toolContent?: string, isSuccess?: boolean) => {
    if (!toolContent) return null;

    return (
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <div className="text-xs font-medium text-muted-foreground">Tool Result</div>
          <div className={`px-2 py-0.5 rounded-full text-xs ${isSuccess
            ? 'bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-300'
            : 'bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-300'
            }`}>
            {isSuccess ? 'Success' : 'Failed'}
          </div>
        </div>
        <div className="rounded-md border bg-muted/50 p-3">
          <div className="text-xs prose prose-xs dark:prose-invert chat-markdown max-w-none">{toolContent}</div>
        </div>
      </div>
    );
  }, []);

  // Handle tool clicks
  const handleToolClick = useCallback((clickedAssistantMessageId: string | null, clickedToolName: string) => {
    // Explicitly ignore ask tags from opening the side panel
    if (clickedToolName === 'ask') {
      return;
    }

    if (!clickedAssistantMessageId) {
      console.warn("Clicked assistant message ID is null. Cannot open side panel.");
      toast.warning("Cannot view details: Assistant message ID is missing.");
      return;
    }

    // Reset user closed state when explicitly clicking a tool
    userClosedPanelRef.current = false;

    // Direct mapping using the message-to-tool-index map
    const toolIndex = messageToToolIndex[clickedAssistantMessageId];

    if (toolIndex !== undefined) {
      setCurrentToolIndex(toolIndex);
      setIsSidePanelOpen(true);
    } else {
      console.warn(`Could not find matching tool call for message ID: ${clickedAssistantMessageId}`);
      toast.info("Could not find details for this tool call.");
    }
  }, [messageToToolIndex]);

  const handleOpenFileViewer = useCallback((filePath?: string) => {
    if (filePath) {
      setFileToView(filePath);
    } else {
      setFileToView(null);
    }
    setFileViewerOpen(true);
  }, []);

  // Initialize PlaybackControls
  const playbackController: PlaybackController = PlaybackControls({
    messages,
    isSidePanelOpen,
    onToggleSidePanel: toggleSidePanel,
    toolCalls,
    setCurrentToolIndex,
    onFileViewerOpen: handleOpenFileViewer,
    projectName: projectName || 'Shared Conversation'
  });

  // Extract the playback state and functions
  const {
    playbackState,
    renderHeader,
    renderFloatingControls,
    renderWelcomeOverlay,
    togglePlayback,
    resetPlayback,
    skipToEnd
  } = playbackController;

  // Connect playbackState to component state
  useEffect(() => {
    // Keep the isPlaying state in sync with playbackState
    setIsPlaying(playbackState.isPlaying);
    setCurrentMessageIndex(playbackState.currentMessageIndex);
  }, [playbackState.isPlaying, playbackState.currentMessageIndex]);

  // Auto-scroll when new messages appear during playback
  useEffect(() => {
    if (playbackState.visibleMessages.length > 0 && !userHasScrolled) {
      scrollToBottom('smooth');
    }
  }, [playbackState.visibleMessages, userHasScrolled]);

  // Scroll button visibility
  useEffect(() => {
    if (!latestMessageRef.current || playbackState.visibleMessages.length === 0) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowScrollButton(!entry?.isIntersecting),
      { root: messagesContainerRef.current, threshold: 0.1 },
    );
    observer.observe(latestMessageRef.current);
    return () => observer.disconnect();
  }, [playbackState.visibleMessages, streamingText, currentToolCall]);

  useEffect(() => {
    console.log(`[PAGE] 🔄 Page AgentStatus: ${agentStatus}, Hook Status: ${streamHookStatus}, Target RunID: ${agentRunId || 'none'}, Hook RunID: ${currentHookRunId || 'none'}`);

    // If the stream hook reports completion/stopping but our UI hasn't updated
    if ((streamHookStatus === 'completed' || streamHookStatus === 'stopped' ||
      streamHookStatus === 'agent_not_running' || streamHookStatus === 'error') &&
      (agentStatus === 'running' || agentStatus === 'connecting')) {
      console.log('[PAGE] Detected hook completed but UI still shows running, updating status');
      setAgentStatus('idle');
      setAgentRunId(null);
      setAutoOpenedPanel(false);
    }
  }, [agentStatus, streamHookStatus, agentRunId, currentHookRunId]);

  // Auto-scroll function for use throughout the component
  const autoScrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (!userHasScrolled && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  }, [userHasScrolled]);

  // Very direct approach to update the tool index during message playback
  useEffect(() => {
    if (!isPlaying || currentMessageIndex <= 0 || !messages.length) return;

    // Check if current message is a tool message
    const currentMsg = messages[currentMessageIndex - 1]; // Look at previous message that just played

    if (currentMsg?.type === 'tool' && currentMsg.metadata) {
      try {
        const metadata = safeJsonParse<ParsedMetadata>(currentMsg.metadata, {});
        const assistantId = metadata.assistant_message_id;

        if (assistantId && messageToToolIndex[assistantId] !== undefined) {
          const toolIndex = messageToToolIndex[assistantId];
          console.log(
            `Direct mapping: Setting tool index to ${toolIndex} for message ${assistantId}`,
          );
          setCurrentToolIndex(toolIndex);
        }
      } catch (e) {
        console.error('Error in direct tool mapping:', e);
      }
    }
  }, [currentMessageIndex, isPlaying, messages, messageToToolIndex]);

  // Force an explicit update to the tool panel based on the current message index
  useEffect(() => {
    // Skip if not playing or no messages
    if (!isPlaying || messages.length === 0 || currentMessageIndex <= 0) return;

    // Get all messages up to the current index 
    const currentMessages = messages.slice(0, currentMessageIndex);

    // Find the most recent tool message to determine which panel to show
    for (let i = currentMessages.length - 1; i >= 0; i--) {
      const msg = currentMessages[i];
      if (msg.type === 'tool' && msg.metadata) {
        try {
          const metadata = safeJsonParse<ParsedMetadata>(msg.metadata, {});
          const assistantId = metadata.assistant_message_id;

          if (assistantId) {
            console.log(`Looking for tool panel for assistant message ${assistantId}`);

            // Scan for matching tool call
            for (let j = 0; j < toolCalls.length; j++) {
              const content = toolCalls[j].assistantCall?.content || '';
              if (content.includes(assistantId)) {
                console.log(
                  `Found matching tool call at index ${j}, updating panel`,
                );
                setCurrentToolIndex(j);
                return;
              }
            }
          }
        } catch (e) {
          console.error('Error parsing tool message metadata:', e);
        }
      }
    }
  }, [currentMessageIndex, isPlaying, messages, toolCalls]);

  // Loading skeleton UI
  if (isLoading && !initialLoadCompleted.current) {
    return <ThreadSkeleton isSidePanelOpen={isSidePanelOpen} showHeader={true} />;
  }

  // Error state UI
  if (error) {
    return (
      <div className="flex h-screen">
        <div
          className={`flex flex-col flex-1 overflow-hidden transition-all duration-200 ease-in-out ${isSidePanelOpen ? 'mr-[90%] sm:mr-[450px] md:mr-[500px] lg:mr-[550px] xl:mr-[650px]' : ''}`}
        >
          <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-14 items-center gap-4 px-4">
              <div className="flex-1">
                <span className="text-foreground font-medium">
                  Shared Conversation
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center p-4">
            <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border bg-card p-6 text-center">
              <h2 className="text-lg font-semibold text-destructive">Error</h2>
              <p className="text-sm text-muted-foreground">{error}</p>
              <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => router.push('/')}>
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main UI
  return (
    <div className="flex h-screen">
      <div
        className={`flex flex-col flex-1 overflow-hidden transition-all duration-200 ease-in-out ${isSidePanelOpen ? 'mr-[90%] sm:mr-[450px] md:mr-[500px] lg:mr-[550px] xl:mr-[650px]' : ''}`}
      >
        {/* Header with playback controls */}
        {renderHeader()}

        {/* Thread Content */}
        <ThreadContent
          messages={messages}
          agentStatus={agentStatus}
          handleToolClick={handleToolClick}
          handleOpenFileViewer={handleOpenFileViewer}
          readOnly={true}
          visibleMessages={playbackState.visibleMessages}
          streamingText={playbackState.streamingText}
          isStreamingText={playbackState.isStreamingText}
          currentToolCall={playbackState.currentToolCall}
          sandboxId={sandboxId || ""}
          project={project}
        />

        {/* Welcome overlay */}
        {renderWelcomeOverlay()}

        {/* Floating playback controls */}
        {renderFloatingControls()}
      </div>

      {/* Tool calls side panel */}
      <ToolCallSidePanel
        isOpen={isSidePanelOpen}
        onClose={() => {
          setIsSidePanelOpen(false);
          userClosedPanelRef.current = true;
        }}
        toolCalls={toolCalls}
        messages={messages as ApiMessageType[]}
        agentStatus="idle"
        currentIndex={currentToolIndex}
        onNavigate={handleSidePanelNavigate}
        project={project}
        renderAssistantMessage={toolViewAssistant}
        renderToolResult={toolViewResult}
      />

      {/* File viewer modal */}
      <FileViewerModal
        open={fileViewerOpen}
        onOpenChange={setFileViewerOpen}
        sandboxId={sandboxId || ''}
        initialFilePath={fileToView}
        project={project}
      />
    </div>
  );
}
