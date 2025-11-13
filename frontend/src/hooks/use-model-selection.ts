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
  
  // Log any query errors
  if (error) {
    console.error('❌ [useModelSelection] Error fetching models:', error);
  }

  const { data: subscriptionData } = useSubscriptionData();
  const { selectedModel, setSelectedModel } = useModelStore();

  // Transform API data to ModelOption format with fallback models (like PRODUCTION)
  const availableModels = useMemo<ModelOption[]>(() => {
    console.log('🔍 [availableModels] Building model list:', { 
      hasModelsData: !!modelsData, 
      hasModels: !!modelsData?.models,
      modelsCount: modelsData?.models?.length,
      isLoading,
      rawModelsData: modelsData
    });
    
    let models: ModelOption[] = [];
    
    if (!modelsData?.models || isLoading) {
      // Fallback models when API fails (matching PRODUCTION pattern)
      console.warn('⚠️ [availableModels] Using fallback - no models data or still loading');
      models = [
        { 
          id: 'claude-haiku-4.5', 
          label: 'Omni Quick 4.5', 
          requiresSubscription: false,
          priority: 102,
          recommended: true
        },
      ];
    } else {
      console.log('✅ [availableModels] Processing', modelsData.models.length, 'models from API');
      models = modelsData.models
        .filter(model => {
          // Hide GPT-5 models entirely
          const modelName = model.display_name || model.short_name || model.id;
          return !modelName.toLowerCase().includes('gpt-5');
        })
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

  // Get accessible models based on subscription (matching PRODUCTION pattern)
  const accessibleModels = useMemo(() => {
    // Check enterprise mode safely to avoid hydration mismatches
    const isEnterpriseMode = typeof window !== 'undefined' && 
      process.env.NEXT_PUBLIC_ENTERPRISE_MODE === 'true';
    
    if (isEnterpriseMode) {
      console.log('🔧 [useModelSelection] Enterprise mode - all models accessible');
      return availableModels; // All models accessible in enterprise mode
    }
    
    // In staging/local environments, all models are accessible (matching backend behavior)
    const isStagingOrLocal = typeof window !== 'undefined' && (
      process.env.NEXT_PUBLIC_ENV_MODE?.toLowerCase() === 'staging' ||
      process.env.NEXT_PUBLIC_ENV_MODE?.toLowerCase() === 'local'
    );
    
    if (isStagingOrLocal) {
      console.log('🔧 [useModelSelection] Staging/Local mode - all models accessible');
      return availableModels; // All models accessible in staging/local
    }
    
    const hasActiveSubscription = subscriptionData?.status === 'active' || subscriptionData?.status === 'trialing';
    console.log('🔧 [useModelSelection] Production mode - hasActiveSubscription:', hasActiveSubscription);
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
    console.log('🔄 [Init Effect] Running:', { 
      isLoading, 
      accessibleModelsCount: accessibleModels.length,
      selectedModel,
      isAccessible: isModelAccessible(selectedModel)
    });
    
    if (isLoading || !accessibleModels.length) {
      console.log('⏭️ [Init Effect] Skipping - loading or no models');
      return;
    }

    // If no model selected or selected model is not accessible, pick default from API data
    if (!selectedModel || !isModelAccessible(selectedModel)) {
      console.log('⚠️ [Init Effect] Need to set default - no model or not accessible');
      const hasActiveSubscription = subscriptionData?.status === 'active' || subscriptionData?.status === 'trialing';
      const defaultModelId = getDefaultModel(availableModels, hasActiveSubscription);
      
      // Make sure the default model is accessible
      const finalModel = isModelAccessible(defaultModelId)
        ? defaultModelId 
        : accessibleModels[0]?.id;
        
      if (finalModel) {
        console.log('✅ [Init Effect] Setting default model:', finalModel);
        setSelectedModel(finalModel);
      }
    } else {
      console.log('✅ [Init Effect] Model is accessible, no change needed');
    }
  }, [selectedModel, accessibleModels, availableModels, isLoading, setSelectedModel, subscriptionData, isModelAccessible]);

  const handleModelChange = (modelId: string) => {
    console.log('📝 [handleModelChange] Called with:', modelId);
    console.log('📝 [handleModelChange] Available model IDs:', accessibleModels.map(m => m.id));
    
    // Try to find exact match first
    let model = accessibleModels.find(m => m.id === modelId);
    console.log('📝 [handleModelChange] Exact match found:', !!model);
    
    // If not found, try to find by matching the end of the ID (for full vs short IDs)
    if (!model && modelId.includes('/')) {
      const shortId = modelId.split('/').pop();
      console.log('📝 [handleModelChange] Trying fuzzy match with shortId:', shortId);
      model = accessibleModels.find(m => 
        m.id === shortId || 
        m.id.endsWith(`/${shortId}`) || 
        m.id.endsWith(`-${shortId}`)
      );
      console.log('📝 [handleModelChange] Fuzzy match found:', !!model, model?.id);
    }
    
    // If found via matching, use the canonical ID from the list
    if (model) {
      console.log('✅ [handleModelChange] Setting model to:', model.id, modelId !== model.id ? `(normalized from ${modelId})` : '');
      setSelectedModel(model.id);
    } else {
      // If model not found in list, still set it (backend might have it)
      // This allows the backend to handle unknown/new models
      console.warn('⚠️ [handleModelChange] Model not in accessible list, setting anyway:', modelId);
      setSelectedModel(modelId);
    }
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
