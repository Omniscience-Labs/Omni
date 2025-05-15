import { createQueryKeys } from "@/hooks/use-query";

export const threadKeys = createQueryKeys({
  all: ['threads'] as const,
  details: (threadId: string) => ['thread', threadId] as const,
  messages: (threadId: string) => ['thread', threadId, 'messages'] as const,
  project: (projectId: string) => ['project', projectId] as const,
  agentRuns: (threadId: string) => ['thread', threadId, 'agent-runs'] as const,
  billingStatus: ['billing', 'status'] as const,
});