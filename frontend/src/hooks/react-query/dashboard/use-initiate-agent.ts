'use client';

import { initiateAgent, InitiateAgentResponse } from "@/lib/api";
import { createMutationHook } from "@/hooks/use-query";
import { toast } from "sonner";
import { dashboardKeys } from "./keys";
import { useQueryClient } from "@tanstack/react-query";
import { useModal } from "@/hooks/use-modal-store";
import { projectKeys, threadKeys } from "../sidebar/keys";

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
        const errorMessage = error.message;
        if (errorMessage.toLowerCase().includes("payment required")) {
          return;
        }
        if (errorMessage.includes("Cannot connect to backend server")) {
          toast.error("Connection error: Please check your internet connection and ensure the backend server is running");
        } else if (errorMessage.includes("No access token available")) {
          toast.error("Authentication error: Please sign in again");
        } else {
          toast.error(`Failed to initiate agent: ${errorMessage}`);
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
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      queryClient.invalidateQueries({ queryKey: threadKeys.all });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.agents });
    },
    onError: (error) => {
      console.log('Mutation error:', error);
      if (error instanceof Error) {
        const errorMessage = error.message;
        if (errorMessage.toLowerCase().includes("payment required")) {
          console.log('Opening payment required modal');
          onOpen("paymentRequiredDialog");
          return;
        }
      }
    }
  });
};
