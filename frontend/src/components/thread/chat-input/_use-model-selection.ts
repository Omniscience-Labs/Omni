'use client';

import { useSubscription } from '@/hooks/react-query/subscriptions/use-subscriptions';
import { useState, useEffect } from 'react';
import { isLocalMode } from '@/lib/config';

export const STORAGE_KEY_MODEL = 'suna-preferred-model';
export const DEFAULT_FREE_MODEL_ID = 'deepseek';
export const DEFAULT_PREMIUM_MODEL_ID = 'sonnet-3.7';

export type SubscriptionStatus = 'no_subscription' | 'active';

export interface ModelOption {
  id: string;
  label: string;
  requiresSubscription: boolean;
  description?: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { 
    id: 'deepseek', 
    label: 'Free', 
    requiresSubscription: false,
    description: 'Limited capabilities. Upgrade for full performance.'
  },
  { 
    id: 'sonnet-3.7', 
    label: 'Standard', 
    requiresSubscription: true, 
    description: 'Excellent for complex tasks and nuanced conversations'
  },
];

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
  
  const subscriptionStatus: SubscriptionStatus = subscriptionData?.status === 'active' 
    ? 'active' 
    : 'no_subscription';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const savedModel = localStorage.getItem(STORAGE_KEY_MODEL);
      
      // In local mode, use saved model if available or default to premium model
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
  }, [subscriptionStatus]);

  const handleModelChange = (modelId: string) => {
    const modelOption = MODEL_OPTIONS.find(option => option.id === modelId);
    
    if (!modelOption) {
      return;
    }
    
    // In local mode, allow any model selection
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

  return {
    selectedModel,
    setSelectedModel: handleModelChange,
    subscriptionStatus,
    availableModels: isLocalMode() 
      ? MODEL_OPTIONS 
      : MODEL_OPTIONS.filter(model => 
          canAccessModel(subscriptionStatus, model.requiresSubscription)
        ),
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