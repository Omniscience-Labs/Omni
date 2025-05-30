'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Settings2, Sparkles, Check, Clock, Eye, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerClose } from '@/components/ui/drawer';
import { useAgent, useUpdateAgent } from '@/hooks/react-query/agents/use-agents';
import { AgentMCPConfiguration } from '../../_components/agent-mcp-configuration';
import { toast } from 'sonner';
import { AgentToolsConfiguration } from '../../_components/agent-tools-configuration';
import { AgentPreview } from '../../_components/agent-preview';
import { getAgentAvatar } from '../../_utils/get-agent-style';
import { EditableText } from '@/components/ui/editable';
import { StylePicker } from '../../_components/style-picker';
import { useSidebar } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function AgentConfigurationPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;

  const { data: agent, isLoading, error } = useAgent(agentId);
  const updateAgentMutation = useUpdateAgent();
  const { state, setOpen, setOpenMobile } = useSidebar();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    system_prompt: '',
    agentpress_tools: {},
    configured_mcps: [],
    is_default: false,
    avatar: '',
    avatar_color: '',
  });

  const originalDataRef = useRef<typeof formData | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const accordionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (agent) {
      const agentData = agent as any;
      const initialData = {
        name: agentData.name || '',
        description: agentData.description || '',
        system_prompt: agentData.system_prompt || '',
        agentpress_tools: agentData.agentpress_tools || {},
        configured_mcps: agentData.configured_mcps || [],
        is_default: agentData.is_default || false,
        avatar: agentData.avatar || '',
        avatar_color: agentData.avatar_color || '',
      };
      setFormData(initialData);
      originalDataRef.current = { ...initialData };
    }
  }, [agent]);

  useEffect(() => {
    if (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Access denied') || errorMessage.includes('403')) {
        toast.error('You don\'t have permission to edit this agent');
        router.push('/agents');
        return;
      }
    }
  }, [error, router]);

  const hasDataChanged = useCallback((newData: typeof formData, originalData: typeof formData | null): boolean => {
    if (!originalData) return true;
    if (newData.name !== originalData.name ||
        newData.description !== originalData.description ||
        newData.system_prompt !== originalData.system_prompt ||
        newData.is_default !== originalData.is_default ||
        newData.avatar !== originalData.avatar ||
        newData.avatar_color !== originalData.avatar_color) {
      return true;
    }
    if (JSON.stringify(newData.agentpress_tools) !== JSON.stringify(originalData.agentpress_tools) ||
        JSON.stringify(newData.configured_mcps) !== JSON.stringify(originalData.configured_mcps)) {
      return true;
    }
    return false;
  }, []);

  const saveAgent = useCallback(async (data: typeof formData) => {
    try {
      setSaveStatus('saving');
      await updateAgentMutation.mutateAsync({
        agentId,
        ...data
      });
      originalDataRef.current = { ...data };
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Error updating agent:', error);
      setSaveStatus('error');
      toast.error('Failed to update agent');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [agentId, updateAgentMutation]);

  const debouncedSave = useCallback((data: typeof formData) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    if (!hasDataChanged(data, originalDataRef.current)) {
      return;
    }
    const timer = setTimeout(() => {
      if (hasDataChanged(data, originalDataRef.current)) {
        saveAgent(data);
      }
    }, 500);
    
    setDebounceTimer(timer);
  }, [debounceTimer, saveAgent, hasDataChanged]);

  const handleFieldChange = (field: string, value: any) => {
    const newFormData = {
      ...formData,
      [field]: value
    };
    
    setFormData(newFormData);
    debouncedSave(newFormData);
  };

  const handleBack = () => {
    router.push('/agents');
  };

  // Auto-scroll to accordion when it opens
  const scrollToAccordion = useCallback(() => {
    if (accordionRef.current) {
      accordionRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'end' 
      });
    }
  }, []);

  const handleStyleChange = useCallback((emoji: string, color: string) => {
    const newFormData = {
      ...formData,
      avatar: emoji,
      avatar_color: color,
    };
    setFormData(newFormData);
    debouncedSave(newFormData);
  }, [formData, debouncedSave]);

  // Get current style with fallback to generated defaults
  const getCurrentStyle = useCallback(() => {
    if (formData.avatar && formData.avatar_color) {
      return {
        avatar: formData.avatar,
        color: formData.avatar_color,
      };
    }
    return getAgentAvatar(agentId);
  }, [formData.avatar, formData.avatar_color, agentId]);

  const currentStyle = getCurrentStyle();

  const getSaveStatusBadge = () => {
    const showSaved = saveStatus === 'idle' && !hasDataChanged(formData, originalDataRef.current);
    switch (saveStatus) {
      case 'saving':
        return (
          <Badge variant="secondary" className="flex items-center gap-1 text-amber-700 dark:text-amber-300 bg-amber-600/30 hover:bg-amber-700/40">
            <Clock className="h-3 w-3 animate-pulse" />
            Saving...
          </Badge>
        );
      case 'saved':
        return (
          <Badge variant="default" className="flex items-center gap-1 text-green-700 dark:text-green-300 bg-green-600/30 hover:bg-green-700/40">
            <Check className="h-3 w-3" />
            Saved
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="flex items-center gap-1 text-red-700 dark:text-red-300 bg-red-600/30 hover:bg-red-700/40">
            Error saving
          </Badge>
        );

      default:
        return showSaved ? (
          <Badge variant="default" className="flex items-center gap-1 text-green-700 dark:text-green-300 bg-green-600/30 hover:bg-green-700/40">
            <Check className="h-3 w-3" />
            Saved
          </Badge>
        ) : (
          <Badge variant="destructive" className="flex items-center gap-1 text-red-700 dark:text-red-300 bg-red-600/30 hover:bg-red-700/40">
            Error saving
          </Badge>
        );
    }
  };

  useEffect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [debounceTimer]);

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Loading agent...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isAccessDenied = errorMessage.includes('Access denied') || errorMessage.includes('403');
    
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="text-center space-y-4">
          {isAccessDenied ? (
            <Alert variant="destructive">
              <AlertDescription>
                You don't have permission to edit this agent. You can only edit agents that you created.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-2">Agent not found</h2>
              <p className="text-muted-foreground mb-4">The agent you're looking for doesn't exist.</p>
            </>
          )}
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Agents
          </Button>
        </div>
      </div>
    );
  }

  const ConfigurationContent = () => (
    <div className="p-4 md:p-12 flex flex-col min-h-full justify-between">
      <div className="flex-1">
        <div className="flex-1 flex flex-col">
          <div className="md:hidden flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setOpenMobile(true)}
                    className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-accent"
                  >
                    <Menu className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Open menu</TooltipContent>
              </Tooltip>
              <Button onClick={handleBack} variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="md:hidden flex justify-center">
                {getSaveStatusBadge()}
              </div>
            </div>
            <Drawer open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
              <DrawerTrigger asChild>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4" />
                  Preview
                </Button>
              </DrawerTrigger>
              <DrawerContent className="h-[90vh] bg-muted">
                <DrawerHeader>
                  <DrawerTitle>Agent Preview</DrawerTitle>
                </DrawerHeader>
                <div className="flex-1 overflow-y-auto px-4 pb-4">
                  <AgentPreview agent={{ ...agent, ...formData }} />
                </div>
              </DrawerContent>
            </Drawer>
          </div>

          <div className="hidden md:flex justify-end mb-4">
            {getSaveStatusBadge()}
          </div>

          <div className='flex items-start md:items-center flex-col md:flex-row'>
            <StylePicker 
              agentId={agentId} 
              currentEmoji={currentStyle.avatar}
              currentColor={currentStyle.color}
              onStyleChange={handleStyleChange}
            >
              <div 
                className="flex-shrink-0 h-12 w-12 md:h-16 md:w-16 flex items-center justify-center rounded-2xl text-xl md:text-2xl cursor-pointer hover:opacity-80 transition-opacity mb-3 md:mb-0"
                style={{ backgroundColor: currentStyle.color }}
              >
                {currentStyle.avatar}
              </div>
            </StylePicker>
            <div className='flex flex-col md:ml-3 w-full'>
              <EditableText
                value={formData.name}
                onSave={(value) => handleFieldChange('name', value)}
                className="text-lg md:text-xl font-semibold bg-transparent"
                placeholder="Click to add agent name..."
              />
              <EditableText
                value={formData.description}
                onSave={(value) => handleFieldChange('description', value)}
                className="text-muted-foreground text-sm md:text-base"
                placeholder="Click to add description..."
              />
            </div>
          </div>

          <div className='flex flex-col mt-6 md:mt-8'>
            <div className='text-sm font-semibold text-muted-foreground mb-2'>Instructions</div>
            <EditableText
              value={formData.system_prompt}
              onSave={(value) => handleFieldChange('system_prompt', value)}
              className='bg-transparent hover:bg-transparent border-none focus-visible:ring-0 shadow-none text-sm md:text-base'
              placeholder='Click to set system instructions...'
              multiline={true}
              minHeight="150px"
            />
          </div>
        </div>
      </div>

      <div ref={accordionRef} className="mt-6 border-t">
        <Accordion 
          type="multiple" 
          defaultValue={[]} 
          className="space-y-2"
          onValueChange={scrollToAccordion}
        >
          <AccordionItem value="tools" className="border-b">
            <AccordionTrigger className="hover:no-underline text-sm md:text-base">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                AgentPress Tools
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              <AgentToolsConfiguration
                tools={formData.agentpress_tools}
                onToolsChange={(tools) => handleFieldChange('agentpress_tools', tools)}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="mcp" className="border-b">
            <AccordionTrigger className="hover:no-underline text-sm md:text-base">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                MCP Servers
                <Badge className="ml-auto bg-purple-600/30 text-purple-600 dark:text-purple-300 text-xs">New</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              <AgentMCPConfiguration
                mcps={formData.configured_mcps}
                onMCPsChange={(mcps) => handleFieldChange('configured_mcps', mcps)}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <div className="hidden md:flex w-full">
          <div className="w-1/2 border-r bg-background overflow-y-auto scrollbar-hide">
            <ConfigurationContent />
          </div>
          <div className="w-1/2 overflow-y-auto">
            <AgentPreview agent={{ ...agent, ...formData }} />
          </div>
        </div>
        <div className="md:hidden w-full overflow-y-auto">
          <ConfigurationContent />
        </div>
      </div>
    </div>
  );
}