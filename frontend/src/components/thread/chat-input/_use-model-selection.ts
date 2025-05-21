'use client';

import { useSubscription } from '@/hooks/react-query/subscriptions/use-subscriptions';
import { useState, useEffect, useMemo } from 'react';
import { isLocalMode } from '@/lib/config';
import { useAvailableModels } from '@/hooks/react-query/subscriptions/use-model';

export const STORAGE_KEY_MODEL = 'suna-preferred-model';
export const STORAGE_KEY_CUSTOM_MODELS = 'customModels';
export const DEFAULT_FREE_MODEL_ID = 'deepseek';
export const DEFAULT_PREMIUM_MODEL_ID = 'sonnet-3.7';

export type SubscriptionStatus = 'no_subscription' | 'active';

export interface ModelOption {
  id: string;
  label: string;
  requiresSubscription: boolean;
  description?: string;
  top?: boolean;
  isCustom?: boolean;
}

export interface CustomModel {
  id: string;
  label: string;
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
  'deepseek-r1': 'DeepSeek R1 - Advanced model with enhanced reasoning and coding capabilities',
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

// Helper to format a model name for display
export const formatModelName = (name: string): string => {
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Add openrouter/ prefix to custom models
export const getPrefixedModelId = (modelId: string, isCustom: boolean): string => {
  if (isCustom && !modelId.startsWith('openrouter/')) {
    return `openrouter/${modelId}`;
  }
  return modelId;
};

// Helper to get custom models from localStorage
export const getCustomModels = () => {
  if (!isLocalMode()) return [];
  
  try {
    const storedModels = localStorage.getItem(STORAGE_KEY_CUSTOM_MODELS);
    if (!storedModels) return [];
    
    const parsedModels = JSON.parse(storedModels);
    if (!Array.isArray(parsedModels)) return [];
    
    // Ensure all custom models have openrouter/ prefix
    return parsedModels
      .filter((model: any) => 
        model && typeof model === 'object' && 
        typeof model.id === 'string' && 
        typeof model.label === 'string')
      .map((model: any) => ({
        ...model,
        id: model.id.startsWith('openrouter/') ? model.id : `openrouter/${model.id}`
      }));
  } catch (e) {
    console.error('Error parsing custom models:', e);
    return [];
  }
};

export const useModelSelection = () => {
  const [selectedModel, setSelectedModel] = useState(DEFAULT_FREE_MODEL_ID);
  const [customModels, setCustomModels] = useState<CustomModel[]>([]);
  
  const { data: subscriptionData } = useSubscription();
  //MOCK
  // const subscriptionData = {
  //   status: 'no_subscription'
  // };

  const { data: modelsData, isLoading: isLoadingModels } = useAvailableModels({
    refetchOnMount: false,
  });
  
  const subscriptionStatus: SubscriptionStatus = subscriptionData?.status === 'active' 
    ? 'active' 
    : 'no_subscription';

  // Load custom models from localStorage
  useEffect(() => {
    if (isLocalMode() && typeof window !== 'undefined') {
      const savedCustomModels = localStorage.getItem(STORAGE_KEY_CUSTOM_MODELS);
      if (savedCustomModels) {
        try {
          setCustomModels(JSON.parse(savedCustomModels));
        } catch (e) {
          console.error('Failed to parse custom models from localStorage', e);
        }
      }
    }
  }, []);

  const MODEL_OPTIONS = useMemo(() => {
    let baseModels = [];
    
    if (!modelsData?.models || isLoadingModels) {
      baseModels = [
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
    } else {
      const topModels = ['sonnet-3.7', 'gemini-flash-2.5'];
      baseModels = modelsData.models.map(model => {
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
        
        const isPremium = model?.requires_subscription || false;
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
    }
    
    // Add custom models if in local mode
    if (isLocalMode() && customModels.length > 0) {
      const customModelOptions = customModels.map(model => ({
        id: model.id,
        label: model.label || formatModelName(model.id),
        requiresSubscription: false,
        description: 'Custom model',
        top: false,
        isCustom: true
      }));
      
      return [...baseModels, ...customModelOptions];
    }
    
    return baseModels;
  }, [modelsData, isLoadingModels, customModels]);

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
    
    // Check if it's a custom model (in local storage)
    let isCustomModel = false;
    if (isLocalMode() && !modelOption) {
      isCustomModel = getCustomModels().some(model => model.id === modelId);
    }
    
    // Only return early if it's not a custom model and not in standard options
    if (!modelOption && !isCustomModel) {
      console.warn('Model not found in options:', modelId);
      return;
    }

    // For standard models, check access permissions
    if (!isCustomModel && !isLocalMode() && !canAccessModel(subscriptionStatus, modelOption?.requiresSubscription ?? false)) {
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

  // Get the actual model ID to send to the backend
  const getActualModelId = (modelId: string): string => {
    // First, check if this is a standard model directly
    const model = MODEL_OPTIONS.find(m => m.id === modelId);
    
    // If it's a standard model, use its ID as is
    if (model && !model.isCustom) {
      return modelId;
    }
    
    // For custom models, ensure they have the openrouter/ prefix
    if (model?.isCustom || isLocalMode() && getCustomModels().some(m => m.id === modelId)) {
      return modelId.startsWith('openrouter/') ? modelId : `openrouter/${modelId}`;
    }
    
    // Default fallback
    return modelId;
  };

  return {
    selectedModel,
    setSelectedModel: (modelId: string) => {
      handleModelChange(modelId);
    },
    subscriptionStatus,
    availableModels,
    allModels: MODEL_OPTIONS,
    customModels,
    // This is the model ID that should be sent to the backend
    getActualModelId,
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