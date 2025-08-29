"use client";

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ArrowRight, Clock, PlugZap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { TriggerConfigDialog } from '@/components/agents/triggers/trigger-config-dialog';
import { EventBasedTriggerDialog } from '@/components/agents/triggers/event-based-trigger-dialog';
import { useCreateTrigger } from '@/hooks/react-query/triggers';
import { toast } from 'sonner';
import { AgentIconAvatar } from '@/components/agents/config/agent-icon-avatar';

interface TriggerCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'schedule' | 'event';
  onTriggerCreated?: (triggerId: string) => void;
}

export function TriggerCreationDialog({
  open,
  onOpenChange,
  type,
  onTriggerCreated
}: TriggerCreationDialogProps) {
  const [step, setStep] = useState<'agent-selection' | 'trigger-config'>('agent-selection');
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const createTriggerMutation = useCreateTrigger();

  // Fetch user's agents
  const { data: agents, isLoading } = useQuery({
    queryKey: ['user-agents'],
    queryFn: async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('agents')
        .select('agent_id, name, icon_name, icon_color, icon_background, profile_image_url')
        .eq('account_id', user.id);
        
      if (error) throw error;
      return data || [];
    },
    enabled: open
  });

  const scheduleProvider = {
    provider_id: 'schedule',
    name: 'Schedule',
    trigger_type: 'schedule',
    webhook_enabled: true,
    config_schema: {}
  };

  const handleAgentSelect = () => {
    if (!selectedAgent) {
      toast.error('Please select an agent');
      return;
    }
    setStep('trigger-config');
  };

  const handleScheduleSave = async (config: any) => {
    try {
      const newTrigger = await createTriggerMutation.mutateAsync({
        agentId: selectedAgent,
        provider_id: 'schedule',
        name: config.name || 'Scheduled Trigger',
        description: config.description || 'Automatically scheduled trigger',
        config: config.config,
      });
      toast.success('Schedule trigger created successfully');
      
      // Call the callback with the new trigger ID
      if (onTriggerCreated && newTrigger?.trigger_id) {
        onTriggerCreated(newTrigger.trigger_id);
      }
      
      handleClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create schedule trigger');
      console.error('Error creating schedule trigger:', error);
    }
  };

  const handleClose = () => {
    setStep('agent-selection');
    setSelectedAgent('');
    onOpenChange(false);
  };

  const handleBack = () => {
    setStep('agent-selection');
  };

  if (!open) return null;
  if (step === 'agent-selection') {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {type === 'schedule' ? (
                <>
                  <Clock className="h-5 w-5" />
                  Create Scheduled Task
                </>
              ) : (
                <>
                  <PlugZap className="h-5 w-5" />
                  Create App-based Task
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              First, select which agent should handle this task
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="agent">Select Agent</Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger id="agent">
                  <SelectValue placeholder="Choose an agent" />
                </SelectTrigger>
                <SelectContent>
                  {isLoading ? (
                    <div className="p-2 text-sm text-muted-foreground">Loading agents...</div>
                  ) : agents?.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No agents found. Create an agent first.
                    </div>
                  ) : (
                    agents?.map(agent => (
                      <SelectItem key={agent.agent_id} value={agent.agent_id}>
                        <div className="flex items-center gap-2">
                          <AgentIconAvatar
                            profileImageUrl={agent.profile_image_url}
                            iconName={agent.icon_name}
                            iconColor={agent.icon_color}
                            backgroundColor={agent.icon_background}
                            agentName={agent.name}
                            size={20}
                          />
                          <span>{agent.name}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleAgentSelect} disabled={!selectedAgent}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  if (type === 'schedule') {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <TriggerConfigDialog
          provider={scheduleProvider}
          existingConfig={undefined}
          onSave={handleScheduleSave}
          onCancel={handleBack}
          isLoading={createTriggerMutation.isPending}
          agentId={selectedAgent}
        />
      </Dialog>
    );
  }
  return (
    <EventBasedTriggerDialog 
      open={open} 
      onOpenChange={handleClose}
      agentId={selectedAgent}
      onTriggerCreated={onTriggerCreated}
    />
  );
} 