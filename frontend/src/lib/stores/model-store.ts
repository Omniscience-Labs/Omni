import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ModelStore {
  selectedModel: string;
  setSelectedModel: (model: string) => void;
}

// Default models matching PRODUCTION branch
const DEFAULT_FREE_MODEL_ID = 'claude-sonnet-4';
const DEFAULT_PREMIUM_MODEL_ID = 'claude-sonnet-4';

export const useModelStore = create<ModelStore>()(
  persist(
    (set) => ({
      selectedModel: DEFAULT_FREE_MODEL_ID, // Default to Claude Sonnet 4
      setSelectedModel: (model: string) => {
        console.log('🔧 ModelStore: Setting selected model to:', model);
        set({ selectedModel: model });
      },
    }),
    {
      name: 'suna-model-selection-v3',
      partialize: (state) => ({
        selectedModel: state.selectedModel,
      }),
    }
  )
);

// Utility functions for compatibility
export const formatModelName = (name: string): string => {
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
