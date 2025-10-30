import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ModelStore {
  selectedModel: string;
  setSelectedModel: (model: string) => void;
}

// Default models matching PRODUCTION branch
const DEFAULT_FREE_MODEL_ID = 'claude-haiku-4.5';
const DEFAULT_PREMIUM_MODEL_ID = 'claude-haiku-4.5';

export const useModelStore = create<ModelStore>()(
  persist(
    (set) => ({
      selectedModel: DEFAULT_FREE_MODEL_ID, // Default to Haiku 4.5
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
  // Special case for Haiku 4.5 to display as "Omni 4.5"
  if (name === 'Haiku 4.5' || name === 'Claude Haiku 4.5' || name === 'claude-haiku-4.5' || name === 'anthropic/claude-haiku-4-5') {
    return 'Omni 4.5';
  }
  
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
