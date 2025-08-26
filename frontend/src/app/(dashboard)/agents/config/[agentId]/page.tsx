'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Save, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { useUpdateAgent } from '@/hooks/react-query/agents/use-agents';
import { useCreateAgentVersion, useActivateAgentVersion } from '@/hooks/react-query/agents/use-agent-versions';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AgentPreview } from '../../../../../components/agents/agent-preview';

import { useAgentVersionData } from '../../../../../hooks/use-agent-version-data';
import { useAgentVersionStore } from '../../../../../lib/stores/agent-version-store';

import { AgentHeader, VersionAlert, ConfigurationTab } from '@/components/agents/config';

import { DEFAULT_AGENTPRESS_TOOLS } from '@/components/agents/tools';
import { useExportAgent } from '@/hooks/react-query/agents/use-agent-export-import';
import { useAgentConfigTour } from '@/hooks/use-agent-config-tour';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { TourConfirmationDialog } from '@/components/tour/TourConfirmationDialog';

// Tour steps for agent configuration
const agentConfigTourSteps: Step[] = [
  {
    target: '[data-tour="agent-header"]',
    content: 'This is your agent\'s profile. You can edit the name and profile picture to personalize your agent.',
    title: 'Agent Profile',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="model-section"]',
    content: 'Choose the AI model that powers your agent. Different models have different capabilities and pricing.',
    title: 'Model Configuration',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="system-prompt"]',
    content: 'Define how your agent behaves and responds. This is the core instruction that guides your agent\'s personality and capabilities.',
    title: 'System Prompt',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="tools-section"]',
    content: 'Configure the tools and capabilities your agent can use. Enable browser automation, web development, and more.',
    title: 'Agent Tools',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="integrations-section"]',
    content: 'Connect your agent to external services. Add integrations to extend your agent\'s capabilities.',
    title: 'Integrations',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="knowledge-section"]',
    content: 'Add knowledge to your agent to provide it with context and information.',
    title: 'Knowledge Base',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="playbooks-section"]',
    content: 'Add playbooks to your agent to help it perform tasks and automate workflows.',
    title: 'Playbooks',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="triggers-section"]',
    content: 'Set up automated triggers for your agent to run on schedules or events.',
    title: 'Triggers & Automation',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="preview-agent"]',
    content: 'Build and test your agent by previewing how it will behave and respond. Here you can also ask the agent to self-configure',
    title: 'Build & Test Your Agent',
    placement: 'left',
    disableBeacon: true,
  },
];

// Form data interface
interface FormData {
  name: string;
  description: string;
  system_prompt: string;
  model?: string;
  agentpress_tools: any;
  configured_mcps: any[];
  custom_mcps: any[];
  is_default: boolean;
  profile_image_url?: string;
  icon_name?: string | null;
  icon_color: string;
  icon_background: string;
}

function AgentConfigurationContent() {
  const params = useParams();
  const agentId = params.agentId as string;
  const queryClient = useQueryClient();

  const { agent, versionData, isViewingOldVersion, isLoading, error } = useAgentVersionData({ agentId });
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialAccordion = searchParams.get('accordion');
  const versionParam = searchParams.get('version');
  const { setHasUnsavedChanges } = useAgentVersionStore();
  
  const updateAgentMutation = useUpdateAgent();
  const createVersionMutation = useCreateAgentVersion();
  const activateVersionMutation = useActivateAgentVersion();
  const exportMutation = useExportAgent();

  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    system_prompt: '',
    model: undefined,
    agentpress_tools: DEFAULT_AGENTPRESS_TOOLS,
    configured_mcps: [],
    custom_mcps: [],
    is_default: false,
    profile_image_url: '',
    icon_name: null,
    icon_color: '#000000',
    icon_background: '#e5e5e5',
  });

  const [originalData, setOriginalData] = useState<FormData>(formData);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(tabParam || 'configuration');

  useEffect(() => {
    if (!agent) return;
    let configSource = agent;
    if (versionData) {
      configSource = {
        ...agent,
        ...versionData,
        system_prompt: versionData.system_prompt,
        model: versionData.model,
        configured_mcps: versionData.configured_mcps,
        custom_mcps: versionData.custom_mcps,
        agentpress_tools: versionData.agentpress_tools,
        icon_name: versionData.icon_name || agent.icon_name,
        icon_color: versionData.icon_color || agent.icon_color,
        icon_background: versionData.icon_background || agent.icon_background,
      };
    }
    const newFormData: FormData = {
      name: configSource.name || '',
      description: configSource.description || '',
      system_prompt: configSource.system_prompt || '',
      model: configSource.model,
      agentpress_tools: configSource.agentpress_tools || DEFAULT_AGENTPRESS_TOOLS,
      configured_mcps: configSource.configured_mcps || [],
      custom_mcps: configSource.custom_mcps || [],
      is_default: configSource.is_default || false,
      profile_image_url: configSource.profile_image_url || '',
      icon_name: configSource.icon_name || null,
      icon_color: configSource.icon_color || '#000000',
      icon_background: configSource.icon_background || '#e5e5e5',
    };
    setFormData(newFormData);
    setOriginalData(newFormData);
  }, [agent, versionData]);

  const displayData = isViewingOldVersion && versionData ? {
    name: formData.name,
    description: formData.description,
    system_prompt: versionData.system_prompt || formData.system_prompt,
    model: versionData.model || formData.model,
    agentpress_tools: versionData.agentpress_tools || formData.agentpress_tools,
    configured_mcps: versionData.configured_mcps || formData.configured_mcps,
    custom_mcps: versionData.custom_mcps || formData.custom_mcps,
    is_default: formData.is_default,
    profile_image_url: formData.profile_image_url,
    icon_name: versionData.icon_name || formData.icon_name || null,
    icon_color: versionData.icon_color || formData.icon_color || '#000000',
    icon_background: versionData.icon_background || formData.icon_background || '#e5e5e5',
  } : formData;

  const handleFieldChange = useCallback((field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleMCPChange = useCallback((updates: { configured_mcps: any[]; custom_mcps: any[] }) => {
    setFormData(prev => ({
      ...prev,
      configured_mcps: updates.configured_mcps,
      custom_mcps: updates.custom_mcps
    }));
  }, []);

  const handleExport = useCallback(() => {
    exportMutation.mutate(agentId);
  }, [agentId, exportMutation]);

  const { hasUnsavedChanges, isCurrentVersion } = React.useMemo(() => {
    const formDataStr = JSON.stringify(formData);
    const originalDataStr = JSON.stringify(originalData);
    const hasChanges = formDataStr !== originalDataStr;
    const isCurrent = !isViewingOldVersion;
    
    return {
      hasUnsavedChanges: hasChanges && isCurrent,
      isCurrentVersion: isCurrent
    };
  }, [formData, originalData, isViewingOldVersion]);

  const prevHasUnsavedChangesRef = useRef(hasUnsavedChanges);
  useEffect(() => {
    if (prevHasUnsavedChangesRef.current !== hasUnsavedChanges) {
      prevHasUnsavedChangesRef.current = hasUnsavedChanges;
      setHasUnsavedChanges(hasUnsavedChanges);
    }
  }, [hasUnsavedChanges]);

  const router = useRouter();

  const handleActivateVersion = async (versionId: string) => {
    try {
      await activateVersionMutation.mutateAsync({ agentId, versionId });
      router.push(`/agents/config/${agentId}`);
    } catch (error) {
      console.error('Failed to activate version:', error);
    }
  };

  const handleSave = useCallback(async () => {
    if (hasUnsavedChanges) {
      try {
        await updateAgentMutation.mutateAsync({
          agentId,
          name: formData.name,
          description: formData.description,
          is_default: formData.is_default,
          profile_image_url: formData.profile_image_url,
          icon_name: formData.icon_name,
          icon_color: formData.icon_color,
          icon_background: formData.icon_background,
          system_prompt: formData.system_prompt,
          agentpress_tools: formData.agentpress_tools,
          configured_mcps: formData.configured_mcps,
          custom_mcps: formData.custom_mcps,
        });
        
        setOriginalData(formData);
        toast.success('Agent updated successfully');
      } catch (error) {
        toast.error('Failed to update agent');
        console.error('Failed to save agent:', error);
      }
    }
  }, [agentId, formData, hasUnsavedChanges, updateAgentMutation]);

  const handleNameSave = useCallback(async (name: string) => {
    try {
      await updateAgentMutation.mutateAsync({
        agentId,
        name,
      });
      
      setFormData(prev => ({ ...prev, name }));
      setOriginalData(prev => ({ ...prev, name }));
      toast.success('Agent name updated');
    } catch (error) {
      toast.error('Failed to update agent name');
      throw error;
    }
  }, [agentId, updateAgentMutation]);

  const handleProfileImageSave = useCallback(async (profileImageUrl: string | null) => {
    try {
      await updateAgentMutation.mutateAsync({
        agentId,
        profile_image_url: profileImageUrl || '',
      });
      
      setFormData(prev => ({ ...prev, profile_image_url: profileImageUrl || '' }));
      setOriginalData(prev => ({ ...prev, profile_image_url: profileImageUrl || '' }));
    } catch (error) {
      toast.error('Failed to update profile picture');
      throw error;
    }
  }, [agentId, updateAgentMutation]);
  
  const handleIconSave = useCallback(async (iconName: string | null, iconColor: string, iconBackground: string) => {
    try {
      await updateAgentMutation.mutateAsync({
        agentId,
        icon_name: iconName,
        icon_color: iconColor,
        icon_background: iconBackground,
      });
      
      setFormData(prev => ({ 
        ...prev, 
        icon_name: iconName,
        icon_color: iconColor,
        icon_background: iconBackground,
      }));
      setOriginalData(prev => ({ 
        ...prev, 
        icon_name: iconName,
        icon_color: iconColor,
        icon_background: iconBackground,
      }));
      toast.success('Agent icon updated');
    } catch (error) {
      toast.error('Failed to update agent icon');
      throw error;
    }
  }, [agentId, updateAgentMutation]);

  const handleSystemPromptSave = useCallback(async (value: string) => {
    try {
      await updateAgentMutation.mutateAsync({
        agentId,
        system_prompt: value,
      });
      
      setFormData(prev => ({ ...prev, system_prompt: value }));
      setOriginalData(prev => ({ ...prev, system_prompt: value }));
      toast.success('System prompt updated');
    } catch (error) {
      toast.error('Failed to update system prompt');
      throw error;
    }
  }, [agentId, updateAgentMutation]);

  const handleModelSave = useCallback(async (model: string) => {
    try {
      setFormData(prev => ({ ...prev, model }));
      setOriginalData(prev => ({ ...prev, model }));
      toast.success('Model updated');
    } catch (error) {
      toast.error('Failed to update model');
      throw error;
    }
  }, []);

  const handleToolsSave = useCallback(async (tools: Record<string, boolean | { enabled: boolean; description: string }>) => {
    try {
      await updateAgentMutation.mutateAsync({
        agentId,
        agentpress_tools: tools,
      });
      
      setFormData(prev => ({ ...prev, agentpress_tools: tools }));
      setOriginalData(prev => ({ ...prev, agentpress_tools: tools }));
      toast.success('Tools updated');
    } catch (error) {
      toast.error('Failed to update tools');
      throw error;
    }
  }, [agentId, updateAgentMutation]);

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Alert className="max-w-md">
          <AlertDescription>
            Failed to load agent: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Alert className="max-w-md">
          <AlertDescription>
            Agent not found
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const previewAgent = {
    ...agent,
    ...displayData,
    agent_id: agentId,
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="flex-1 flex overflow-hidden">
        <div className="hidden lg:grid lg:grid-cols-2 w-full h-full">
          <div className="bg-background h-full flex flex-col border-r border-border/40 overflow-hidden">
            <div className="flex-shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="pt-4">
                {isViewingOldVersion && (
                  <div className="mb-4 px-8">
                    <VersionAlert
                      versionData={versionData}
                      isActivating={activateVersionMutation.isPending}
                      onActivateVersion={handleActivateVersion}
                    />
                  </div>
                )}
                <div data-tour="agent-header">
                  <AgentHeader
                    agentId={agentId}
                    displayData={displayData}
                    isViewingOldVersion={isViewingOldVersion}
                    onFieldChange={handleFieldChange}
                    onExport={handleExport}
                    isExporting={exportMutation.isPending}
                    agentMetadata={agent?.metadata}
                    currentVersionId={agent?.current_version_id}
                    currentFormData={{
                      system_prompt: formData.system_prompt,
                      configured_mcps: formData.configured_mcps,
                      custom_mcps: formData.custom_mcps,
                      agentpress_tools: formData.agentpress_tools
                    }}
                    hasUnsavedChanges={hasUnsavedChanges}
                    onVersionCreated={() => {
                      setOriginalData(formData);
                    }}
                    onNameSave={handleNameSave}
                    onProfileImageSave={handleProfileImageSave}
                    onIconSave={handleIconSave}
                  />
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="h-full">
                <ConfigurationTab
                  agentId={agentId}
                  displayData={displayData}
                  versionData={versionData}
                  isViewingOldVersion={isViewingOldVersion}
                  onFieldChange={handleFieldChange}
                  onMCPChange={handleMCPChange}
                  onSystemPromptSave={handleSystemPromptSave}
                  onModelSave={handleModelSave}
                  onToolsSave={handleToolsSave}
                  initialAccordion={initialAccordion}
                  agentMetadata={agent?.metadata}
                  isLoading={updateAgentMutation.isPending}
                />
              </div>
            </div>
          </div>
          
          <div className="bg-muted/20 h-full flex flex-col relative" data-tour="preview-agent">
            <div className="absolute inset-0">
              <AgentPreview agent={previewAgent} />
            </div>
          </div>
        </div>

        <div className="lg:hidden w-full h-full">
          <div className="bg-background h-full flex flex-col overflow-hidden">
            <div className="flex-shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="pt-4">
                
                {isViewingOldVersion && (
                  <div className="mb-4 px-4">
                    <VersionAlert
                      versionData={versionData}
                      isActivating={activateVersionMutation.isPending}
                      onActivateVersion={handleActivateVersion}
                    />
                  </div>
                )}
                
                <div className="flex items-center justify-between px-4">
                  <AgentHeader
                    agentId={agentId}
                    displayData={displayData}
                    isViewingOldVersion={isViewingOldVersion}
                    onFieldChange={handleFieldChange}
                    onExport={handleExport}
                    isExporting={exportMutation.isPending}
                    agentMetadata={agent?.metadata}
                    currentVersionId={agent?.current_version_id}
                    currentFormData={{
                      system_prompt: formData.system_prompt,
                      configured_mcps: formData.configured_mcps,
                      custom_mcps: formData.custom_mcps,
                      agentpress_tools: formData.agentpress_tools
                    }}
                    hasUnsavedChanges={hasUnsavedChanges}
                    onVersionCreated={() => {
                      setOriginalData(formData);
                    }}
                    onNameSave={handleNameSave}
                    onProfileImageSave={handleProfileImageSave}
                    onIconSave={handleIconSave}
                  />
                  <Drawer>
                    <DrawerTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </Button>
                    </DrawerTrigger>
                    <DrawerContent className="h-[85vh]">
                      <DrawerHeader>
                        <DrawerTitle>Agent Preview</DrawerTitle>
                      </DrawerHeader>
                      <div className="flex-1 overflow-hidden">
                        <AgentPreview agent={previewAgent} />
                      </div>
                    </DrawerContent>
                  </Drawer>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="h-full">
                <ConfigurationTab
                  agentId={agentId}
                  displayData={displayData}
                  versionData={versionData}
                  isViewingOldVersion={isViewingOldVersion}
                  onFieldChange={handleFieldChange}
                  onMCPChange={handleMCPChange}
                  onSystemPromptSave={handleSystemPromptSave}
                  onModelSave={handleModelSave}
                  onToolsSave={handleToolsSave}
                  initialAccordion={initialAccordion}
                  agentMetadata={agent?.metadata}
                  isLoading={updateAgentMutation.isPending}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgentConfigurationPage() {
  const {
    run,
    stepIndex,
    setStepIndex,
    stopTour,
    showWelcome,
    handleWelcomeAccept,
    handleWelcomeDecline,
  } = useAgentConfigTour();

  const handleTourCallback = useCallback((data: CallBackProps) => {
    const { status, type, index } = data;
    
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      stopTour();
    } else if (type === 'step:after') {
      setStepIndex(index + 1);
    }
  }, [stopTour, setStepIndex]);

  return (
    <>
      <Joyride
        steps={agentConfigTourSteps}
        run={run}
        stepIndex={stepIndex}
        callback={handleTourCallback}
        continuous
        showProgress
        showSkipButton
        disableOverlayClose
        disableScrollParentFix
        styles={{
          options: {
            primaryColor: '#000000',
            backgroundColor: '#ffffff',
            textColor: '#000000',
            overlayColor: 'rgba(0, 0, 0, 0.7)',
            arrowColor: '#ffffff',
            zIndex: 1000,
          },
          tooltip: {
            backgroundColor: '#ffffff',
            borderRadius: 8,
            fontSize: 14,
            padding: 20,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            border: '1px solid #e5e7eb',
          },
          tooltipContainer: {
            textAlign: 'left',
          },
          tooltipTitle: {
            color: '#000000',
            fontSize: 16,
            fontWeight: 600,
            marginBottom: 8,
          },
          tooltipContent: {
            color: '#000000',
            fontSize: 14,
            lineHeight: 1.5,
          },
          buttonNext: {
            backgroundColor: '#000000',
            color: '#ffffff',
            fontSize: 12,
            padding: '8px 16px',
            borderRadius: 6,
            border: 'none',
            fontWeight: 500,
          },
          buttonBack: {
            color: '#6b7280',
            backgroundColor: 'transparent',
            fontSize: 12,
            padding: '8px 16px',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
          },
          buttonSkip: {
            color: '#6b7280',
            backgroundColor: 'transparent',
            fontSize: 12,
            border: 'none',
          },
          buttonClose: {
            color: '#6b7280',
            backgroundColor: 'transparent',
          },
        }}
      />
      <TourConfirmationDialog
        open={showWelcome}
        onAccept={handleWelcomeAccept}
        onDecline={handleWelcomeDecline}
      />
      <AgentConfigurationContent />
    </>
  );
} 