import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useTourPermissions } from './use-tour-permissions';

export interface TourStep {
  target: string;
  content: string;
  title?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto' | 'center';
  disableBeacon?: boolean;
  hideCloseButton?: boolean;
  hideSkipButton?: boolean;
  spotlightClicks?: boolean;
}

interface AgentConfigTourState {
  hasSeenTour: boolean;
  run: boolean;
  stepIndex: number;
  setHasSeenTour: (seen: boolean) => void;
  setRun: (run: boolean) => void;
  setStepIndex: (index: number) => void;
  startTour: () => void;
  stopTour: () => void;
  skipTour: () => void;
  resetTour: () => void;
}

const useAgentConfigTourStore = create<AgentConfigTourState>()(
  persist(
    (set, get) => ({
      hasSeenTour: false,
      run: false,
      stepIndex: 0,
      setHasSeenTour: (seen) => set({ hasSeenTour: seen }),
      setRun: (run) => set({ run }),
      setStepIndex: (index) => set({ stepIndex: index }),
      startTour: () => {
        set({ run: true, stepIndex: 0 });
      },
      stopTour: () => {
        set({ run: false, hasSeenTour: true });
      },
      skipTour: () => {
        set({ run: false, hasSeenTour: true });
      },
      resetTour: () => {
        set({ hasSeenTour: false, run: false, stepIndex: 0 });
      },
    }),
    {
      name: 'agent-config-tour-storage',
      partialize: (state) => ({
        hasSeenTour: state.hasSeenTour,
      }),
    }
  )
);

export const useAgentConfigTour = () => {
  const {
    toursEnabled,
    showWelcome,
    handleWelcomeAccept,
    handleWelcomeDecline,
  } = useTourPermissions(true);
  
  const {
    hasSeenTour,
    run,
    stepIndex,
    setStepIndex,
    startTour,
    stopTour,
    skipTour,
    resetTour,
  } = useAgentConfigTourStore();

  useEffect(() => {
    if (toursEnabled && !hasSeenTour && !run) {
      const timer = setTimeout(() => {
        startTour();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [toursEnabled, hasSeenTour, run, startTour]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).agentConfigTour = {
        resetTour,
        getState: () => ({
          hasSeenTour,
          run,
          stepIndex,
          toursEnabled,
        })
      };
    }
  }, [hasSeenTour, run, stepIndex, toursEnabled, resetTour]);

  return {
    run: run && toursEnabled,
    stepIndex,
    setStepIndex,
    startTour,
    stopTour,
    skipTour,
    showWelcome,
    handleWelcomeAccept,
    handleWelcomeDecline,
    hasSeenTour,
    resetTour,
  };
};
