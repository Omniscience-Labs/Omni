'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Save, Eye, Check, Wrench, Server, BookOpen, Workflow, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useUpdateAgent } from '@/hooks/react-query/agents/use-agents';
import { useCreateAgentVersion, useActivateAgentVersion } from '@/hooks/react-query/agents/use-agent-versions';
import { AgentMCPConfiguration } from '../../../../../components/agents/agent-mcp-configuration';
import { toast } from 'sonner';
import { AgentToolsConfiguration } from '../../../../../components/agents/agent-tools-configuration';
import { AgentPreview } from '../../../../../components/agents/agent-preview';
import { getAgentAvatar } from '../../../../../lib/utils/get-agent-style';
import { EditableText } from '@/components/ui/editable';
import { ExpandableMarkdownEditor } from '@/components/ui/expandable-markdown-editor';
import { StylePicker } from '../../../../../components/agents/style-picker';
import { AgentBuilderChat } from '../../../../../components/agents/agent-builder-chat';
import { AgentTriggersConfiguration } from '@/components/agents/triggers/agent-triggers-configuration';
import { AgentKnowledgeBaseManager } from '@/components/agents/knowledge-base/agent-knowledge-base-manager';
import { AgentWorkflowsConfiguration } from '@/components/agents/workflows/agent-workflows-configuration';
import { AgentVersionSwitcher } from '@/components/agents/agent-version-switcher';
import { CreateVersionButton } from '@/components/agents/create-version-button';
import { useAgentVersionData } from '../../../../../hooks/use-agent-version-data';
import { useAgentVersionStore } from '../../../../../lib/stores/agent-version-store';

interface FormData {
  name: string;
  description: string;
  system_prompt: string;
  agentpress_tools: any;
  configured_mcps: any[];
  custom_mcps: any[];
  is_default: boolean;
  avatar: string;
  avatar_color: string;
}

export default function AgentConfigurationPageRefactored() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;

  // Use modular hooks
  const { agent, versionData, isViewingOldVersion, isLoading, error } = useAgentVersionData({ agentId });
  
  // Debug logging
  console.log('[Agent Config] Loading state:', { isLoading, error, agentId });
  const { hasUnsavedChanges, setHasUnsavedChanges } = useAgentVersionStore();
  
  const updateAgentMutation = useUpdateAgent();
  const createVersionMutation = useCreateAgentVersion();
  const activateVersionMutation = useActivateAgentVersion();

  // State management
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    system_prompt: '',
    agentpress_tools: {},
    configured_mcps: [],
    custom_mcps: [],
    is_default: false,
    avatar: '',
    avatar_color: '',
  });

  const [originalData, setOriginalData] = useState<FormData>(formData);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('agent-builder');

  // Initialize form data from agent/version data
  useEffect(() => {
    if (!agent) return;
    
    console.log('[Agent Config] Agent data:', agent);
    console.log('[Agent Config] Version data:', versionData);
    
    // Determine the source of configuration data
    let configSource = agent;
    
    // If we have explicit version data (from URL param), use it
    if (versionData) {
      configSource = versionData;
    } 
    // If no URL param but agent has current_version data, use that
    else if (agent.current_version) {
      configSource = agent.current_version;
    }
    
    console.log('[Agent Config] Config source:', configSource);
    
    const initialData: FormData = {
      name: agent.name || '',
      description: agent.description || '',
      system_prompt: configSource.system_prompt || '',
      agentpress_tools: configSource.agentpress_tools || {},
      configured_mcps: configSource.configured_mcps || [],
      custom_mcps: configSource.custom_mcps || [],
      is_default: agent.is_default || false,
      avatar: agent.avatar || '',
      avatar_color: agent.avatar_color || '',
    };
    
    setFormData(initialData);
    setOriginalData(initialData);
  }, [agent, versionData]);

  useEffect(() => {
    const hasChanges = JSON.stringify(formData) !== JSON.stringify(originalData);
    setHasUnsavedChanges(hasChanges);
  }, [formData, originalData, setHasUnsavedChanges]);

  const handleSave = useCallback(async () => {
    if (!agent || isViewingOldVersion) return;
    
    setIsSaving(true);
    try {
      const normalizedCustomMcps = (formData.custom_mcps || []).map(mcp => ({
        name: mcp.name || 'Unnamed MCP',
        type: mcp.type || mcp.customType || 'sse',
        config: mcp.config || {},
        enabledTools: Array.isArray(mcp.enabledTools) ? mcp.enabledTools : [],
      }));
      await createVersionMutation.mutateAsync({
        agentId,
        data: {
          system_prompt: formData.system_prompt,
          configured_mcps: formData.configured_mcps,
          custom_mcps: normalizedCustomMcps,
          agentpress_tools: formData.agentpress_tools,
          description: 'Manual save'
        }
      });
      await updateAgentMutation.mutateAsync({
        agentId,
        name: formData.name,
        description: formData.description,
        is_default: formData.is_default,
        avatar: formData.avatar,
        avatar_color: formData.avatar_color
      });
      
      setOriginalData(formData);
      toast.success('Changes saved successfully');
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  }, [agent, formData, isViewingOldVersion, agentId, createVersionMutation, updateAgentMutation]);

  const handleFieldChange = useCallback((field: keyof FormData, value: any) => {
    if (isViewingOldVersion) {
      toast.error('Cannot edit old versions. Please activate this version first to make changes.');
      return;
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  }, [isViewingOldVersion]);

  const handleMCPChange = useCallback((updates: { configured_mcps: any[]; custom_mcps: any[] }) => {
    if (isViewingOldVersion) {
      toast.error('Cannot edit old versions. Please activate this version first to make changes.');
      return;
    }
    setFormData(prev => ({
      ...prev,
      configured_mcps: updates.configured_mcps,
      custom_mcps: updates.custom_mcps
    }));
  }, [isViewingOldVersion]);

  const handleStyleChange = useCallback((emoji: string, color: string) => {
    if (isViewingOldVersion) {
      toast.error('Cannot edit old versions. Please activate this version first to make changes.');
      return;
    }
    setFormData(prev => ({
      ...prev,
      avatar: emoji,
      avatar_color: color
    }));
  }, [isViewingOldVersion]);

  // Version activation handler
  const handleActivateVersion = useCallback(async (versionId: string) => {
    try {
      await activateVersionMutation.mutateAsync({ agentId, versionId });
      toast.success('Version activated successfully');
      // Refresh page without version param
      router.push(`/agents/config/${agentId}`);
    } catch (error) {
      toast.error('Failed to activate version');
    }
  }, [agentId, activateVersionMutation, router]);

  // Auto-switch to configuration tab when viewing old versions
  useEffect(() => {
    if (isViewingOldVersion && activeTab === 'agent-builder') {
      setActiveTab('configuration');
    }
  }, [isViewingOldVersion, activeTab]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Alert variant="destructive">
          <AlertDescription>
            {error.message || 'Failed to load agent configuration'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Alert>
          <AlertDescription>Agent not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Use version data when viewing old version, otherwise use form data
  const displayData = isViewingOldVersion && versionData ? {
    name: agent?.name || '',
    description: agent?.description || '',
    system_prompt: versionData.system_prompt || '',
    agentpress_tools: versionData.agentpress_tools || {},
    configured_mcps: versionData.configured_mcps || [],
    custom_mcps: versionData.custom_mcps || [],
    is_default: agent?.is_default || false,
    avatar: agent?.avatar || '',
    avatar_color: agent?.avatar_color || '',
  } : formData;

  const currentStyle = displayData.avatar && displayData.avatar_color
    ? { avatar: displayData.avatar, color: displayData.avatar_color }
    : getAgentAvatar(agentId);

  const previewAgent = {
    ...agent,
    ...displayData,
    agent_id: agentId,
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <div className="hidden md:flex w-full h-full">
          <div className="w-1/2 border-r bg-background h-full flex flex-col">
            <div className="h-full flex flex-col">
              <div className="flex justify-between items-center mb-4 p-4 border-b">
                <div className="flex items-center gap-2">
                  <AgentVersionSwitcher
                    agentId={agentId}
                    currentVersionId={agent?.current_version_id}
                    currentFormData={{
                      system_prompt: formData.system_prompt,
                      configured_mcps: formData.configured_mcps,
                      custom_mcps: formData.custom_mcps,
                      agentpress_tools: formData.agentpress_tools
                    }}
                  />
                  <CreateVersionButton
                    agentId={agentId}
                    currentFormData={{
                      system_prompt: formData.system_prompt,
                      configured_mcps: formData.configured_mcps,
                      custom_mcps: formData.custom_mcps,
                      agentpress_tools: formData.agentpress_tools
                    }}
                    hasChanges={hasUnsavedChanges && !isViewingOldVersion}
                    onVersionCreated={() => {
                      setOriginalData(formData);
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  {hasUnsavedChanges && !isViewingOldVersion && (
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save Changes
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col overflow-hidden -mt-4">
                <div className="flex-shrink-0 space-y-6 px-4 mt-2">
                  {isViewingOldVersion && (
                    <Alert className="mb-4">
                      <Eye className="h-4 w-4" />
                      <div className="flex items-center justify-between w-full">
                        <AlertDescription>
                          You are viewing a read-only version. To make changes, please activate this version or switch back to the current version.
                        </AlertDescription>
                        <div className="ml-4 flex items-center gap-2">
                          {versionData && (
                            <Badge className="text-xs">
                              {versionData.version_name}
                            </Badge>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => versionData && handleActivateVersion(versionData.version_id)}
                            disabled={activateVersionMutation.isPending}
                          >
                            {activateVersionMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                            Set as Current
                          </Button>
                        </div>
                      </div>
                    </Alert>
                  )}
                </div>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
                  <div className="flex-shrink-0 space-y-4 px-4 py-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StylePicker
                            currentEmoji={currentStyle.avatar}
                            currentColor={currentStyle.color}
                            onStyleChange={handleStyleChange}
                            agentId={agentId}
                          >
                            <div className="h-10 w-10 rounded-xl flex items-center justify-center gap-2" style={{ backgroundColor: currentStyle.color }}>
                              <div className="text-lg font-medium">{currentStyle.avatar}</div>
                            </div>
                          </StylePicker>
                          <EditableText
                            value={displayData.name}
                            onSave={(value) => handleFieldChange('name', value)}
                            className="text-md font-semibold bg-transparent"
                            placeholder="Click to add agent name..."
                            disabled={isViewingOldVersion}
                          />
                        </div>
                        <TabsList className="grid grid-cols-2">
                          <TabsTrigger 
                            value="agent-builder" 
                            disabled={isViewingOldVersion}
                            className={isViewingOldVersion ? "opacity-50 cursor-not-allowed" : ""}
                          >
                            Agent Builder
                          </TabsTrigger>
                          <TabsTrigger value="configuration">Configuration</TabsTrigger>
                        </TabsList>
                      </div>
                    </div>

                    <TabsContent value="agent-builder" className="flex-1 h-0 px-4">
                      {isViewingOldVersion ? (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center space-y-4 max-w-md">
                            <div className="text-6xl">🔒</div>
                            <div>
                              <h3 className="text-lg font-semibold text-muted-foreground">Agent Builder Disabled</h3>
                              <p className="text-sm text-muted-foreground mt-2">
                                The Agent Builder is only available for the current version. 
                                To use the Agent Builder, please activate this version first.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <AgentBuilderChat 
                          agentId={agentId}
                          formData={displayData}
                          handleFieldChange={handleFieldChange}
                          handleStyleChange={handleStyleChange}
                          currentStyle={currentStyle}
                        />
                      )}
                    </TabsContent>
                    {activeTab === 'configuration' && (
                      <div className='px-4'>
                        <ExpandableMarkdownEditor
                          value={displayData.system_prompt}
                          onSave={(value) => handleFieldChange('system_prompt', value)}
                          placeholder="Click to set system instructions..."
                          title="System Instructions"
                          disabled={isViewingOldVersion}
                        />
                      </div>
                    )}
                    <TabsContent value="configuration" className="flex-1 h-0 overflow-y-auto px-4">
                      <Accordion type="single" collapsible defaultValue="system" className='space-y-2'>
                        <AccordionItem className='border rounded-xl px-4' value="tools">
                          <AccordionTrigger>
                            <div className='flex items-center gap-2'>
                              <div className='bg-muted rounded-full h-8 w-8 flex items-center justify-center'>
                                <Wrench className='h-4 w-4' />
                              </div>
                              Tools
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <AgentToolsConfiguration
                              tools={displayData.agentpress_tools}
                              onToolsChange={(tools) => handleFieldChange('agentpress_tools', tools)}
                            />
                          </AccordionContent>
                        </AccordionItem>

                        <AccordionItem className='border rounded-xl px-4' value="integrations">
                          <AccordionTrigger>
                            <div className='flex items-center gap-2'>
                              <div className='bg-muted rounded-full h-8 w-8 flex items-center justify-center'>
                                <Server className='h-4 w-4' />
                              </div>
                              Integrations
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <AgentMCPConfiguration
                              configuredMCPs={displayData.configured_mcps}
                              customMCPs={displayData.custom_mcps}
                              onMCPChange={handleMCPChange}
                              agentId={agentId}
                              versionData={{
                                configured_mcps: displayData.configured_mcps,
                                custom_mcps: displayData.custom_mcps,
                                system_prompt: displayData.system_prompt,
                                agentpress_tools: displayData.agentpress_tools
                              }}
                              saveMode="callback"
                              versionId={versionData?.version_id}
                            />
                          </AccordionContent>
                        </AccordionItem>

                        <AccordionItem className='border rounded-xl px-4' value="knowledge">
                          <AccordionTrigger>
                            <div className='flex items-center gap-2'>
                              <div className='bg-muted rounded-full h-8 w-8 flex items-center justify-center'>
                                <BookOpen className='h-4 w-4' />
                              </div>
                              Knowledge Base
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <AgentKnowledgeBaseManager
                              agentId={agentId}
                              agentName={displayData.name || 'Agent'}
                            />
                          </AccordionContent>
                        </AccordionItem>

                        <AccordionItem className='border rounded-xl px-4' value="workflows">
                          <AccordionTrigger>
                            <div className='flex items-center gap-2'>
                              <div className='bg-muted rounded-full h-8 w-8 flex items-center justify-center'>
                                <Workflow className='h-4 w-4' />
                              </div>
                              Workflows
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <AgentWorkflowsConfiguration
                              agentId={agentId}
                              agentName={displayData.name || 'Agent'}
                            />
                          </AccordionContent>
                        </AccordionItem>

                        <AccordionItem className='border rounded-xl px-4' value="triggers">
                          <AccordionTrigger>
                            <div className='flex items-center gap-2'>
                              <div className='bg-muted rounded-full h-8 w-8 flex items-center justify-center'>
                                <Zap className='h-4 w-4' />
                              </div>
                              Triggers
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <AgentTriggersConfiguration agentId={agentId} />
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </TabsContent>
                  </Tabs>
              </div>
            </div>
          </div>

          <div className="w-1/2 overflow-y-auto">
            {previewAgent && <AgentPreview agent={previewAgent} />}
          </div>
        </div>

        <div className="md:hidden flex flex-col h-full w-full">
          <div className="flex-1 overflow-y-auto p-4">
          </div>

          <Drawer open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
            <DrawerTrigger asChild>
              <Button 
                className="fixed bottom-4 right-4 rounded-full shadow-lg"
                size="icon"
              >
                <Eye className="h-4 w-4" />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Agent Preview</DrawerTitle>
              </DrawerHeader>
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {previewAgent && <AgentPreview agent={previewAgent} />}
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>
    </div>
  );
} 