import { createQueryHook } from "@/hooks/use-query";
import { threadKeys } from "./keys";
import { checkBillingStatus, BillingStatusResponse } from "@/lib/api";
import { Query } from "@tanstack/react-query";

export const useBillingStatusQuery = (enabled = true) =>
  createQueryHook(
    threadKeys.billingStatus,
    () => checkBillingStatus(),
    {
      enabled,
      retry: 1,
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10, // 10 minutes (using gcTime instead of cacheTime)
      refetchOnWindowFocus: false, // Disable refetch on window focus
      refetchOnMount: false, // Disable refetch on component mount
      refetchOnReconnect: false, // Disable refetch on reconnect
      // Only refetch if the data is stale and the query is enabled
      refetchInterval: (query: Query<BillingStatusResponse, Error>) => {
        // If we have data and it indicates the user can't run, check more frequently
        if (query.state.data && !query.state.data.can_run) {
          return 1000 * 60; // Check every minute if user can't run
        }
        return false; // Don't refetch automatically otherwise
      },
    }
  )();
