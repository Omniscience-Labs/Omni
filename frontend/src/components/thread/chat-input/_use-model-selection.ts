'use client';

import { useSubscription } from '@/hooks/react-query/subscriptions/use-subscriptions';
import { useState, useEffect } from 'react';

export const STORAGE_KEY_MODEL = 'suna-preferred-model';
export const DEFAULT_MODEL_ID = 'qwen3-4b';

export type SubscriptionTier = 'free' | 'base' | 'extra';

export type ModelTier = 'free' | 'base-only' | 'extra-only';

export interface ModelOption {
  id: string;
  label: string;
  tier: ModelTier;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'qwen3-4b', label: 'Qwen 3', tier: 'free' },
  { id: 'sonnet-3.7', label: 'Sonnet 3.7', tier: 'base-only' },
];

export const canAccessModel = (
  subscriptionTier: SubscriptionTier,
  modelTier: ModelTier,
): boolean => {
  switch (modelTier) {
    case 'free':
      return true;
    case 'base-only':
      return subscriptionTier === 'base' || subscriptionTier === 'extra';
    case 'extra-only':
      return subscriptionTier === 'extra';
    default:
      return false;
  }
};

export const useModelSelection = () => {
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID);

  const { data: subscriptionData } = useSubscription();
  const subscriptionTier: SubscriptionTier = (() => {
    if (!subscriptionData) return 'free';
    if (subscriptionData.plan_name === 'free') return 'free';
    if (subscriptionData.plan_name === 'base') return 'base';
    if (subscriptionData.plan_name === 'extra') return 'extra';
    return 'free';
  })();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedModel = localStorage.getItem(STORAGE_KEY_MODEL);
        if (
          savedModel &&
          MODEL_OPTIONS.some((option) => option.id === savedModel)
        ) {
          const modelOption = MODEL_OPTIONS.find(
            (option) => option.id === savedModel,
          );
          if (
            modelOption &&
            canAccessModel(subscriptionTier, modelOption.tier)
          ) {
            setSelectedModel(savedModel);
          } else {
            setSelectedModel(DEFAULT_MODEL_ID);
          }
        } else if (savedModel) {
          localStorage.removeItem(STORAGE_KEY_MODEL);
        }
      } catch (error) {
        console.warn('Failed to load preferences from localStorage:', error);
      }
    }
  }, [subscriptionTier]);

  const handleModelChange = (value: string) => {
    const modelOption = MODEL_OPTIONS.find((option) => option.id === value);
    if (modelOption && canAccessModel(subscriptionTier, modelOption.tier)) {
      setSelectedModel(value);
      try {
        localStorage.setItem(STORAGE_KEY_MODEL, value);
      } catch (error) {
        console.warn('Failed to save model preference to localStorage:', error);
      }
    }
  };

  const availableModels = MODEL_OPTIONS.filter((model) =>
    canAccessModel(subscriptionTier, model.tier),
  );

  return {
    selectedModel,
    setSelectedModel: handleModelChange,
    subscriptionTier,
    availableModels,
    allModels: MODEL_OPTIONS,
    canAccessModel: (modelId: string) => {
      const model = MODEL_OPTIONS.find((m) => m.id === modelId);
      return model ? canAccessModel(subscriptionTier, model.tier) : false;
    },
  };
};
