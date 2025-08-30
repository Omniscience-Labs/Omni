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
import { Label } from '@/components/ui/label';
import { ArrowRight, Clock, PlugZap, Sparkles } from 'lucide-react';
import { TriggerConfigDialog } from '@/components/agents/triggers/trigger-config-dialog';
import { EventBasedTriggerDialog } from '@/components/agents/triggers/event-based-trigger-dialog';
import { SimplifiedScheduleConfig } from '@/components/agents/triggers/providers/simplified-schedule-config';
import { useCreateTrigger } from '@/hooks/react-query/triggers';
import { toast } from 'sonner';
import { AgentSelectionDropdown } from '@/components/agents/agent-selection-dropdown';

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
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [taskName, setTaskName] = useState<string>('');
  const [taskDescription, setTaskDescription] = useState<string>('');
  const [taskConfig, setTaskConfig] = useState<any>({});
  const createTriggerMutation = useCreateTrigger();

  const scheduleProvider = {
    provider_id: 'schedule',
    name: 'Schedule',
    trigger_type: 'schedule',
    webhook_enabled: true,
    config_schema: {}
  };



  const handleScheduleSave = async (data: { name: string; description: string; config: any; is_active: boolean }) => {
    if (!selectedAgent) {
      toast.error('Please select an agent');
      return;
    }
    
    try {
      const newTrigger = await createTriggerMutation.mutateAsync({
        agentId: selectedAgent,
        provider_id: 'schedule',
        name: data.name || 'Scheduled Trigger',
        description: data.description || 'Automatically scheduled trigger',
        config: data.config,
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
    setSelectedAgent('');
    setTaskName('');
    setTaskDescription('');
    setTaskConfig({});
    onOpenChange(false);
  };

  if (!open) return null;
  
  if (type === 'schedule') {
    return (
      <SimplifiedScheduleConfig
        provider={scheduleProvider}
        config={taskConfig}
        onChange={setTaskConfig}
        errors={{}}
        agentId={selectedAgent}
        name={taskName}
        description={taskDescription}
        onNameChange={setTaskName}
        onDescriptionChange={setTaskDescription}
        isActive={true}
        onActiveChange={() => {}}
        selectedAgent={selectedAgent}
        onAgentSelect={setSelectedAgent}
        open={open}
        onOpenChange={onOpenChange}
        onSave={handleScheduleSave}
      />
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