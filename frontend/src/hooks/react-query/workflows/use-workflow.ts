import { createQueryHook } from "@/hooks/use-query";
import { getWorkflow, type Workflow } from "@/lib/api";

export const useWorkflow = (workflowId: string | undefined) =>
  createQueryHook(
    ['workflow', workflowId],
    () => getWorkflow(workflowId!),
    {
      enabled: !!workflowId,
      retry: 1,
    }
  )(); 