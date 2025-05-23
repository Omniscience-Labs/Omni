'use client';

import { initiateAgent, InitiateAgentResponse } from "@/lib/api";
import { createMutationHook } from "@/hooks/use-query";
import { toast } from "sonner";
import { dashboardKeys } from "./keys";
import { useQueryClient } from "@tanstack/react-query";
import { useModal } from "@/hooks/use-modal-store";

export const useInitiateAgentMutation = createMutationHook<
  InitiateAgentResponse, 
  FormData
>(
  initiateAgent,
  {
    onSuccess: (data) => {
      toast.success("Agent initiated successfully");
    },
    onError: (error) => {
      if (error instanceof Error) {
        if (error.message.includes("Cannot connect to backend server")) {
          toast.error("Connection error: Please check your internet connection and ensure the backend server is running");
        } else if (error.message.includes("No access token available")) {
          toast.error("Authentication error: Please sign in again");
        } else {
          toast.error(`Failed to initiate agent: ${error.message}`);
        }
      } else {
        toast.error("An unexpected error occurred while initiating the agent");
      }
    }
  }
);

export const useInitiateAgentWithInvalidation = () => {
  const queryClient = useQueryClient();
  const { onOpen } = useModal();
  return useInitiateAgentMutation({
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.agents });
    },
    onError: (error) => {
      if (error instanceof Error && error.message.includes("Payment Required")) {
        onOpen("paymentRequiredDialog");
      }
    }
  });
};
