import { createQueryHook } from "@/hooks/use-query";
import { threadKeys } from "./keys";
import { getThread } from "@/lib/api";

export const useThreadQuery = (threadId: string) =>
  createQueryHook(
    threadKeys.details(threadId),
    () => getThread(threadId),
    {
      enabled: !!threadId,
      retry: 1,
    }
  )();
