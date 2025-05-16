'use client';

import { useSubscription } from '@/hooks/react-query/subscriptions/use-subscriptions';
import { useState, useEffect, useMemo } from 'react';
import { isLocalMode } from '@/lib/config';
import { useAvailableModels } from '@/hooks/react-query/subscriptions/use-model';

export const STORAGE_KEY_MODEL = 'suna-preferred-model';
export const DEFAULT_FREE_MODEL_ID = 'deepseek';
export const DEFAULT_PREMIUM_MODEL_ID = 'sonnet-3.7';

export type SubscriptionStatus = 'no_subscription' | 'active';

export interface ModelOption {
  id: string;
  label: string;
  requiresSubscription: boolean;
  description?: string;
  top?: boolean;
}

const MODEL_DESCRIPTIONS: Record<string, string> = {
  'sonnet-3.7': 'Claude 3.7 Sonnet - Anthropic\'s powerful general-purpose AI assistant',
  'gpt-4.1': 'GPT-4.1 - OpenAI\'s most advanced model with enhanced reasoning',
  'gpt-4o': 'GPT-4o - Optimized for speed, reliability, and cost-effectiveness',
  'gpt-4-turbo': 'GPT-4 Turbo - OpenAI\'s powerful model with a great balance of performance and cost',
  'gpt-4': 'GPT-4 - OpenAI\'s highly capable model with advanced reasoning',
  'gemini-flash-2.5': 'Gemini Flash 2.5 - Google\'s fast, responsive AI model',
  'grok-3': 'Grok-3 - xAI\'s latest large language model with enhanced capabilities',
  'deepseek': 'DeepSeek - Free tier model with good general capabilities',
  'grok-3-mini': 'Grok-3 Mini - Smaller, faster version of Grok-3 for simpler tasks',
  'qwen3': 'Qwen3 - Alibaba\'s powerful multilingual language model'
};

export const canAccessModel = (
  subscriptionStatus: SubscriptionStatus,
  requiresSubscription: boolean,
): boolean => {
  if (isLocalMode()) {
    return true;
  }
  return subscriptionStatus === 'active' || !requiresSubscription;
};

export const useModelSelection = () => {
  const [selectedModel, setSelectedModel] = useState(DEFAULT_FREE_MODEL_ID);
  
  const { data: subscriptionData } = useSubscription();
  const { data: modelsData, isLoading: isLoadingModels } = useAvailableModels({
    refetchOnMount: false,
  });
  
  const subscriptionStatus: SubscriptionStatus = subscriptionData?.status === 'active' 
    ? 'active' 
    : 'no_subscription';

  const MODEL_OPTIONS = useMemo(() => {
    if (!modelsData?.models || isLoadingModels) {
      return [
        { 
          id: DEFAULT_FREE_MODEL_ID, 
          label: 'DeepSeek', 
          requiresSubscription: false,
          description: 'Free tier model with good general capabilities.'
        },
        { 
          id: DEFAULT_PREMIUM_MODEL_ID, 
          label: 'Claude 3.7 Sonnet', 
          requiresSubscription: true, 
          description: 'Anthropic\'s powerful general-purpose AI assistant.'
        },
      ];
    }

    const topModels = ['sonnet-3.7', 'gpt-4o', 'gemini-flash-2.5'];

    return modelsData.models.map(model => {
      const shortName = model.short_name || model.id;
      const displayName = model.display_name || shortName;

      let cleanLabel = displayName;
      if (cleanLabel.includes('/')) {
        cleanLabel = cleanLabel.split('/').pop() || cleanLabel;
      }
      
      cleanLabel = cleanLabel
        .replace(/-/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      const isPremium = shortName !== DEFAULT_FREE_MODEL_ID;
      
      return {
        id: shortName,
        label: cleanLabel,
        requiresSubscription: isPremium,
        description: MODEL_DESCRIPTIONS[shortName] || 
          (isPremium 
            ? 'Premium model with advanced capabilities' 
            : 'Free tier model with good general capabilities'),
        top: topModels.includes(shortName)
      };
    });
  }, [modelsData, isLoadingModels]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const savedModel = localStorage.getItem(STORAGE_KEY_MODEL);
      if (isLocalMode()) {
        if (savedModel && MODEL_OPTIONS.find(option => option.id === savedModel)) {
          setSelectedModel(savedModel);
        } else {
          setSelectedModel(DEFAULT_PREMIUM_MODEL_ID);
          try {
            localStorage.setItem(STORAGE_KEY_MODEL, DEFAULT_PREMIUM_MODEL_ID);
          } catch (error) {
            console.warn('Failed to save model preference to localStorage:', error);
          }
        }
        return;
      }
      
      if (subscriptionStatus === 'active') {
        if (savedModel) {
          const modelOption = MODEL_OPTIONS.find(option => option.id === savedModel);
          if (modelOption && canAccessModel(subscriptionStatus, modelOption.requiresSubscription)) {
            setSelectedModel(savedModel);
            return;
          }
        }
        
        setSelectedModel(DEFAULT_PREMIUM_MODEL_ID);
        try {
          localStorage.setItem(STORAGE_KEY_MODEL, DEFAULT_PREMIUM_MODEL_ID);
        } catch (error) {
          console.warn('Failed to save model preference to localStorage:', error);
        }
      } 
      else if (savedModel) {
        const modelOption = MODEL_OPTIONS.find(option => option.id === savedModel);
        if (modelOption && canAccessModel(subscriptionStatus, modelOption.requiresSubscription)) {
          setSelectedModel(savedModel);
        } else {
          localStorage.removeItem(STORAGE_KEY_MODEL);
          setSelectedModel(DEFAULT_FREE_MODEL_ID);
        }
      }
      else {
        setSelectedModel(DEFAULT_FREE_MODEL_ID);
      }
    } catch (error) {
      console.warn('Failed to load preferences from localStorage:', error);
    }
  }, [subscriptionStatus, MODEL_OPTIONS]);

  const handleModelChange = (modelId: string) => {
    const modelOption = MODEL_OPTIONS.find(option => option.id === modelId);
    
    if (!modelOption) {
      return;
    }

    if (!isLocalMode() && !canAccessModel(subscriptionStatus, modelOption.requiresSubscription)) {
      return;
    }
    
    setSelectedModel(modelId);
    try {
      localStorage.setItem(STORAGE_KEY_MODEL, modelId);
    } catch (error) {
      console.warn('Failed to save model preference to localStorage:', error);
    }
  };

  const availableModels = useMemo(() => {
    return isLocalMode() 
      ? MODEL_OPTIONS 
      : MODEL_OPTIONS.filter(model => 
          canAccessModel(subscriptionStatus, model.requiresSubscription)
        );
  }, [MODEL_OPTIONS, subscriptionStatus]);

  return {
    selectedModel,
    setSelectedModel: handleModelChange,
    subscriptionStatus,
    availableModels,
    allModels: MODEL_OPTIONS,
    canAccessModel: (modelId: string) => {
      if (isLocalMode()) return true;
      const model = MODEL_OPTIONS.find(m => m.id === modelId);
      return model ? canAccessModel(subscriptionStatus, model.requiresSubscription) : false;
    },
    isSubscriptionRequired: (modelId: string) => {
      return MODEL_OPTIONS.find(m => m.id === modelId)?.requiresSubscription || false;
    }
  };
};