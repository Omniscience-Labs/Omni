export const knowledgeBaseKeys = {
    all: ['knowledge-base'] as const,
    threads: () => [...knowledgeBaseKeys.all, 'threads'] as const,
    thread: (threadId: string) => [...knowledgeBaseKeys.threads(), threadId] as const,
    entry: (entryId: string) => [...knowledgeBaseKeys.all, 'entry', entryId] as const,
    context: (threadId: string) => [...knowledgeBaseKeys.all, 'context', threadId] as const,
  };