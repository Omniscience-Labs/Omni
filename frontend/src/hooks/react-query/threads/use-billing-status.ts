import { createQueryHook } from "@/hooks/use-query";
import { threadKeys } from "./keys";
import { checkBillingStatus } from "@/lib/api";

export const useBillingStatusQuery = (enabled = true) =>
  createQueryHook(
    threadKeys.billingStatus,
    () => checkBillingStatus(),
    {
      enabled,
      retry: 1,
      staleTime: 1000 * 60 * 5,
    }
  )();
