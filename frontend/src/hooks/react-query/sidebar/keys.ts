import { createQueryKeys } from "@/hooks/use-query";

export const threadKeys = createQueryKeys({
  all: ['threads'] as const,
  lists: () => [...threadKeys.all, 'list'] as const,
  detail: (id: string) => [...threadKeys.all, 'detail', id] as const,
});
  
export const projectKeys = createQueryKeys({
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  detail: (id: string) => [...projectKeys.all, 'detail', id] as const,
});