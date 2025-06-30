"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Zap, MessageSquare, Webhook, Plus, Settings } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { ConfiguredTriggersList } from './configured-triggers-list';
import { TriggerConfigDialog } from './trigger-config-dialog';
import { TriggerConfiguration, TriggerProvider } from './types';
import { 
  useAgentTriggers, 
  useCreateTrigger, 
  useUpdateTrigger, 
  useDeleteTrigger, 
  useToggleTrigger,
  useTriggerProviders 
} from '@/hooks/react-query/triggers';
import { toast } from 'sonner';
import { getTriggerIcon } from './utils';

interface AgentTriggersConfigurationProps {
  agentId: string;
}


export const AgentTriggersConfiguration: React.FC<AgentTriggersConfigurationProps> = ({
  agentId,
}) => {
  const [configuringProvider, setConfiguringProvider] = useState<TriggerProvider | null>(null);
  const [editingTrigger, setEditingTrigger] = useState<TriggerConfiguration | null>(null);

  const { data: triggers = [], isLoading, error } = useAgentTriggers(agentId);
  const { data: providers = [] } = useTriggerProviders();
  const createTriggerMutation = useCreateTrigger();
  const updateTriggerMutation = useUpdateTrigger();
  const deleteTriggerMutation = useDeleteTrigger();
  const toggleTriggerMutation = useToggleTrigger();

  const handleProviderClick = (provider: TriggerProvider) => {
    setConfiguringProvider(provider);
    setEditingTrigger(null);
  };

  const handleEditTrigger = (trigger: TriggerConfiguration) => {
    setEditingTrigger(trigger);
    setConfiguringProvider({
      provider_id: trigger.provider_id,
      name: trigger.trigger_type,
      description: '',
      trigger_type: trigger.trigger_type,
      webhook_enabled: !!trigger.webhook_url,
      config_schema: {}
    });
  };

  const handleRemoveTrigger = async (trigger: TriggerConfiguration) => {
    try {
      await deleteTriggerMutation.mutateAsync(trigger.trigger_id);
      toast.success('Trigger deleted successfully');
    } catch (error) {
      toast.error('Failed to delete trigger');
      console.error('Error deleting trigger:', error);
    }
  };

  const handleSaveTrigger = async (config: any) => {
    try {
      if (editingTrigger) {
        await updateTriggerMutation.mutateAsync({
          triggerId: editingTrigger.trigger_id,
          name: config.name,
          description: config.description,
          config: config.config,
          is_active: config.is_active,
        });
        toast.success('Trigger updated successfully');
      } else {
        await createTriggerMutation.mutateAsync({
          agentId,
          provider_id: configuringProvider!.provider_id,
          name: config.name,
          description: config.description,
          config: config.config,
        });
        toast.success('Trigger created successfully');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to save trigger');
      console.error('Error saving trigger:', error);
    }
    
    setConfiguringProvider(null);
    setEditingTrigger(null);
  };

  const handleToggleTrigger = async (trigger: TriggerConfiguration) => {
    try {
      await toggleTriggerMutation.mutateAsync({
        triggerId: trigger.trigger_id,
        isActive: !trigger.is_active,
      });
      toast.success(`Trigger ${!trigger.is_active ? 'enabled' : 'disabled'}`);
    } catch (error) {
      toast.error('Failed to toggle trigger');
      console.error('Error toggling trigger:', error);
    }
  };

  // Get available providers that can be directly configured
  const availableProviders = providers.filter(provider => 
    ['telegram', 'slack', 'webhook'].includes(provider.trigger_type)
  );

  if (error) {
    return (
      <div className="rounded-xl p-6 border border-destructive/20 bg-destructive/5">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-destructive/10 rounded-lg">
            <Zap className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-destructive">Error Loading Triggers</h3>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Failed to load triggers'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* <div className="rounded-xl p-6 border">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                Configure external triggers that can activate your agent automatically from services like Telegram, Slack, webhooks, and more
              </p>
              {triggers.length > 0 && (
                <div className="flex items-center mt-3 space-x-2">
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      {triggers.filter(t => t.is_active).length} active trigger{triggers.filter(t => t.is_active).length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {triggers.some(t => !t.is_active) && (
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        {triggers.filter(t => !t.is_active).length} inactive
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div> */}
      <div>
        <h4 className="text-sm font-medium text-foreground mb-3">Connect</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {availableProviders.map((provider) => (
            <Button
              key={provider.provider_id}
              variant="outline"
              size="sm"
              onClick={() => handleProviderClick(provider)}
              disabled={isLoading}
            >
              {getTriggerIcon(provider.trigger_type)}
              <span className="text-xs font-medium capitalize">{provider.trigger_type}</span>
            </Button>
          ))}
        </div>
      </div>

      {triggers.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/30">
            <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configured Triggers
            </h4>
          </div>
          <div className="p-2 divide-y divide-border">
            <ConfiguredTriggersList
              triggers={triggers}
              onEdit={handleEditTrigger}
              onRemove={handleRemoveTrigger}
              onToggle={handleToggleTrigger}
              isLoading={deleteTriggerMutation.isPending || toggleTriggerMutation.isPending}
            />
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && triggers.length === 0 && (
        <div className="text-center py-12 px-6 bg-muted/30 rounded-xl border-2 border-dashed border-border">
          <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
            <Zap className="h-6 w-6 text-muted-foreground" />
          </div>
          <h4 className="text-sm font-medium text-foreground mb-2">
            No triggers configured
          </h4>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Click on a trigger provider above to get started
          </p>
        </div>
      )}
      
      {configuringProvider && (
        <Dialog open={!!configuringProvider} onOpenChange={() => setConfiguringProvider(null)}>
          <TriggerConfigDialog
            provider={configuringProvider}
            existingConfig={editingTrigger}
            onSave={handleSaveTrigger}
            onCancel={() => setConfiguringProvider(null)}
            isLoading={createTriggerMutation.isPending || updateTriggerMutation.isPending}
          />
        </Dialog>
      )}
    </div>
  );
}; 