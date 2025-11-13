'use client';

import { useModelStore } from '@/lib/stores/model-store';
import { useSubscriptionData } from '@/contexts/SubscriptionContext';
import { useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAvailableModels } from '@/lib/api';

export interface ModelOption {
  id: string;
  label: string;
  requiresSubscription: boolean;
  description?: string;
  priority?: number;
  recommended?: boolean;
  capabilities?: string[];
  contextWindow?: number;
}

// Helper function to get default model from API data
const getDefaultModel = (models: ModelOption[], hasActiveSubscription: boolean): string => {
  if (hasActiveSubscription) {
    // For premium users, find the first recommended model
    const recommendedModel = models.find(m => m.recommended);
    if (recommendedModel) return recommendedModel.id;
  }
  
  // For free users, find the first non-subscription model with highest priority
  const freeModels = models.filter(m => !m.requiresSubscription);
  if (freeModels.length > 0) {
    const sortedFreeModels = freeModels.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return sortedFreeModels[0].id;
  }
  
  // Fallback to first available model
  return models.length > 0 ? models[0].id : '';
};

export const useModelSelection = () => {
  // Fetch models directly in this hook
  const { data: modelsData, isLoading, error } = useQuery({
    queryKey: ['models', 'available'],
    queryFn: getAvailableModels,
    staleTime: 30 * 1000, // 30 seconds (reduced for debugging)
    refetchOnWindowFocus: true, // Refetch when window regains focus
    retry: 2,
  });
  

  const { data: subscriptionData } = useSubscriptionData();
  const { selectedModel, setSelectedModel } = useModelStore();

  // Transform API data to ModelOption format with fallback models
  const availableModels = useMemo<ModelOption[]>(() => {
    let models: ModelOption[] = [];
    
    if (!modelsData?.models || isLoading) {
      // Fallback models when API fails
      models = [
        { 
          id: 'anthropic/claude-haiku-4-5', 
          label: 'Omni Quick 4.5', 
          requiresSubscription: false,
          priority: 102,
          recommended: true
        },
      ];
    } else {
      models = modelsData.models
        .map(model => {
          let label = model.display_name || model.short_name || model.id;
          
          // Transform Haiku 4.5 to Omni Quick 4.5
          if (label === 'Haiku 4.5' || label === 'Claude Haiku 4.5' || label === 'claude-haiku-4.5' || 
              (model.short_name || model.id) === 'anthropic/claude-haiku-4-5') {
            label = 'Omni Quick 4.5';
          }
          
          return {
            id: model.short_name || model.id,
            label: label,
            requiresSubscription: model.requires_subscription || false,
            priority: model.priority || 0,
            recommended: model.recommended || false,
            capabilities: model.capabilities || [],
            contextWindow: model.context_window || 128000,
          };
        });
    }
    
    return models.sort((a, b) => {
      // Sort by recommended first, then priority, then name
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.label.localeCompare(b.label);
    });
  }, [modelsData, isLoading]);

  // Get accessible models based on subscription
  const accessibleModels = useMemo(() => {
    // Check enterprise mode safely to avoid hydration mismatches
    const isEnterpriseMode = typeof window !== 'undefined' && 
      process.env.NEXT_PUBLIC_ENTERPRISE_MODE === 'true';
    
    if (isEnterpriseMode) {
      return availableModels; // All models accessible in enterprise mode
    }
    
    // In staging/local environments, all models are accessible
    const isStagingOrLocal = typeof window !== 'undefined' && (
      process.env.NEXT_PUBLIC_ENV_MODE?.toLowerCase() === 'staging' ||
      process.env.NEXT_PUBLIC_ENV_MODE?.toLowerCase() === 'local'
    );
    
    if (isStagingOrLocal) {
      return availableModels; // All models accessible in staging/local
    }
    
    const hasActiveSubscription = subscriptionData?.status === 'active' || subscriptionData?.status === 'trialing';
    return availableModels.filter(model => hasActiveSubscription || !model.requiresSubscription);
  }, [availableModels, subscriptionData]);

  // Helper function to check if a model is accessible (with fuzzy matching)
  const isModelAccessible = useCallback((modelId: string | undefined): boolean => {
    if (!modelId) return false;
    
    // Try exact match first
    if (accessibleModels.some(m => m.id === modelId)) {
      return true;
    }
    
    // Try fuzzy matching for full vs short IDs
    if (modelId.includes('/')) {
      const shortId = modelId.split('/').pop();
      return accessibleModels.some(m => 
        m.id === shortId || 
        m.id.endsWith(`/${shortId}`) || 
        m.id.endsWith(`-${shortId}`)
      );
    }
    
    return false;
  }, [accessibleModels]);

  // Initialize selected model when data loads
  useEffect(() => {
    if (isLoading || !accessibleModels.length) {
      return;
    }

    // If no model selected or selected model is not accessible, pick default from API data
    if (!selectedModel || !isModelAccessible(selectedModel)) {
      const hasActiveSubscription = subscriptionData?.status === 'active' || subscriptionData?.status === 'trialing';
      const defaultModelId = getDefaultModel(availableModels, hasActiveSubscription);
      
      // Make sure the default model is accessible
      const finalModel = isModelAccessible(defaultModelId)
        ? defaultModelId 
        : accessibleModels[0]?.id;
        
      if (finalModel) {
        setSelectedModel(finalModel);
      }
    }
  }, [selectedModel, accessibleModels, availableModels, isLoading, setSelectedModel, subscriptionData, isModelAccessible]);

  const handleModelChange = (modelId: string) => {
    // Try to find exact match first
    let model = accessibleModels.find(m => m.id === modelId);
    
    // If not found, try to find by matching the end of the ID (for full vs short IDs)
    if (!model && modelId.includes('/')) {
      const shortId = modelId.split('/').pop();
      model = accessibleModels.find(m => 
        m.id === shortId || 
        m.id.endsWith(`/${shortId}`) || 
        m.id.endsWith(`-${shortId}`)
      );
    }
    
    // Use the canonical ID from the list if found, otherwise use as-is
    setSelectedModel(model ? model.id : modelId);
  };

  return {
    selectedModel,
    setSelectedModel: handleModelChange,
    availableModels: accessibleModels,
    allModels: availableModels, // For compatibility
    isLoading,
    modelsData, // Expose raw API data for components that need it
    subscriptionStatus: (subscriptionData?.status === 'active' || subscriptionData?.status === 'trialing') ? 'active' as const : 'no_subscription' as const,
    canAccessModel: (modelId: string) => {
      return isModelAccessible(modelId);
    },
    isSubscriptionRequired: (modelId: string) => {
      const model = availableModels.find(m => m.id === modelId);
      return model?.requiresSubscription || false;
    },
    
    // Compatibility stubs for custom models (not needed with API-driven approach)
    handleModelChange,
    customModels: [] as any[], // Empty array since we're not using custom models
    addCustomModel: (_model: any) => {}, // No-op
    updateCustomModel: (_id: string, _model: any) => {}, // No-op
    removeCustomModel: (_id: string) => {}, // No-op
    
    // Get the actual model ID to send to the backend (no transformation needed now)
    getActualModelId: (modelId: string) => modelId,
    
    // Refresh function for compatibility (no-op since we use API)
    refreshCustomModels: () => {},
  };
};
