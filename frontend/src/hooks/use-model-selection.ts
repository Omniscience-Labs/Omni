'use client';

import { useModelStore } from '@/lib/stores/model-store';
import { useSubscriptionData } from '@/contexts/SubscriptionContext';
import { useEffect, useMemo } from 'react';
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
  const { data: modelsData, isLoading } = useQuery({
    queryKey: ['models', 'available'],
    queryFn: getAvailableModels,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const { data: subscriptionData } = useSubscriptionData();
  const { selectedModel, setSelectedModel } = useModelStore();

  // Transform API data to ModelOption format with fallback models (like PRODUCTION)
  const availableModels = useMemo<ModelOption[]>(() => {
    let models: ModelOption[] = [];
    
    if (!modelsData?.models || isLoading) {
      // Fallback models when API fails - only Haiku and Sonnet
      models = [
        { 
          id: 'anthropic/claude-haiku-4-5-20251201', 
          label: 'Omni Quick 4.5', 
          requiresSubscription: false,
          priority: 102,
          recommended: true
        },
        {
          id: 'anthropic/claude-sonnet-4-20250514',
          label: 'Omni 4',
          requiresSubscription: false,
          priority: 100,
          recommended: true
        }
      ];
    } else {
      models = modelsData.models
        .filter(model => {
          // Only include Haiku and Sonnet models
          const modelId = (model.short_name || model.id).toLowerCase();
          const isHaiku = modelId.includes('haiku-4-5') || modelId.includes('haiku-4.5') || modelId.includes('haiku 4.5');
          const isSonnet = modelId.includes('sonnet-4') || modelId.includes('sonnet 4');
          return isHaiku || isSonnet;
        })
        .map(model => {
          let label = model.display_name || model.short_name || model.id;
          const modelId = (model.short_name || model.id || '').toLowerCase();
          const displayName = (model.display_name || '').toLowerCase();
          
          // Transform Claude Sonnet 4 to Omni 4 (check all variations)
          if (label === 'Claude Sonnet 4' || 
              label === 'claude-sonnet-4' || 
              displayName === 'claude sonnet 4' ||
              modelId.includes('claude-sonnet-4') ||
              modelId === 'anthropic/claude-sonnet-4-20250514') {
            label = 'Omni 4';
          }
          
          // Transform Claude Haiku 4.5 to Omni Quick 4.5 (check all variations)
          if (label === 'Claude Haiku 4.5' || 
              label === 'claude-haiku-4.5' ||
              label === 'claude-haiku-4-5' ||
              displayName === 'claude haiku 4.5' ||
              modelId.includes('claude-haiku-4-5') ||
              modelId.includes('claude-haiku-4.5') ||
              modelId === 'anthropic/claude-haiku-4-5-20251201') {
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
    
    const sortedModels = models.sort((a, b) => {
      // Sort by recommended first, then priority, then name
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.label.localeCompare(b.label);
    });
    
    // 🔥 TEMPORARY DEBUG LOG - Remove after verifying
    console.log('🔥 Available models (after transform):', sortedModels);
    
    return sortedModels;
  }, [modelsData, isLoading]);

  // Get accessible models based on subscription (matching PRODUCTION pattern)
  const accessibleModels = useMemo(() => {
    // Check enterprise mode safely to avoid hydration mismatches
    const isEnterpriseMode = typeof window !== 'undefined' && 
      process.env.NEXT_PUBLIC_ENTERPRISE_MODE === 'true';
    
    if (isEnterpriseMode) {
      return availableModels; // All models accessible in enterprise mode
    }
    
    const hasActiveSubscription = subscriptionData?.status === 'active' || subscriptionData?.status === 'trialing';
    return availableModels.filter(model => hasActiveSubscription || !model.requiresSubscription);
  }, [availableModels, subscriptionData]);

  // Initialize selected model when data loads
  useEffect(() => {
    if (isLoading || !accessibleModels.length) return;

    // If no model selected or selected model is not accessible, pick default from API data
    if (!selectedModel || !accessibleModels.some(m => m.id === selectedModel)) {
      // Default to Haiku (highest priority free model)
      const haikuModel = availableModels.find(m => 
        m.id.toLowerCase().includes('haiku-4-5') || 
        m.id.toLowerCase().includes('haiku-4.5')
      );
      
      const defaultModelId = haikuModel?.id || availableModels[0]?.id || 'anthropic/claude-haiku-4-5-20251201';
      
      // Make sure the default model is accessible
      const finalModel = accessibleModels.some(m => m.id === defaultModelId)
        ? defaultModelId 
        : accessibleModels[0]?.id;
        
      if (finalModel) {
        console.log('🔧 useModelSelection: Setting default to Haiku:', finalModel);
        setSelectedModel(finalModel);
      }
    }
  }, [selectedModel, accessibleModels, availableModels, isLoading, setSelectedModel, subscriptionData]);

  const handleModelChange = (modelId: string) => {
    const model = accessibleModels.find(m => m.id === modelId);
    if (model) {
      console.log('🔧 useModelSelection: Changing model to:', modelId);
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
      return accessibleModels.some(m => m.id === modelId);
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
