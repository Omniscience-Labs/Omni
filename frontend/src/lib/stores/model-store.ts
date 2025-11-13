import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ModelStore {
  selectedModel: string;
  setSelectedModel: (model: string) => void;
}

// Default models matching backend registry - using full IDs for consistency
const DEFAULT_FREE_MODEL_ID = 'anthropic/claude-haiku-4-5';
const DEFAULT_PREMIUM_MODEL_ID = 'anthropic/claude-sonnet-4-20250514';

// Helper to normalize model IDs to full format
const normalizeToFullId = (modelId: string): string => {
  // If already a full ID, return as-is
  if (modelId.includes('/')) return modelId;
  
  // Convert short IDs to full IDs
  if (modelId === 'claude-haiku-4.5' || modelId === 'Claude Haiku 4.5') {
    return 'anthropic/claude-haiku-4-5';
  }
  if (modelId === 'claude-sonnet-4' || modelId === 'Claude Sonnet 4' || modelId === 'claude-sonnet-4-20250514') {
    return 'anthropic/claude-sonnet-4-20250514';
  }
  
  // If starts with claude-, try to convert to anthropic/
  if (modelId.startsWith('claude-')) {
    const normalized = modelId.replace(/\./g, '-');
    return `anthropic/${normalized}`;
  }
  
  return modelId;
};

export const useModelStore = create<ModelStore>()(
  persist(
    (set) => ({
      selectedModel: DEFAULT_FREE_MODEL_ID, // Default to Haiku 4.5
      setSelectedModel: (model: string) => {
        const normalizedModel = normalizeToFullId(model);
        console.log('🔧 ModelStore: Setting selected model to:', normalizedModel, model !== normalizedModel ? `(normalized from ${model})` : '');
        set({ selectedModel: normalizedModel });
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
  // Special case for Haiku 4.5 to display as "Omni Quick 4.5"
  if (name === 'Haiku 4.5' || name === 'Claude Haiku 4.5' || name === 'claude-haiku-4.5' || name === 'anthropic/claude-haiku-4-5') {
    return 'Omni Quick 4.5';
  }
  
  // Special case for Sonnet 4 to display as "Omni 4.5"
  if (name === 'Claude Sonnet 4' || name === 'claude-sonnet-4' || name === 'anthropic/claude-sonnet-4-20250514') {
    return 'Omni 4.5';
  }
  
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
