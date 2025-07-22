import React from 'react';
import { Settings, Wrench, Server, BookOpen, Workflow, Zap } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ExpandableMarkdownEditor } from '@/components/ui/expandable-markdown-editor';
import { AgentToolsConfiguration } from '../agent-tools-configuration';
import { AgentMCPConfiguration } from '../agent-mcp-configuration';
import { AgentKnowledgeBaseManager } from '../knowledge-base/agent-knowledge-base-manager';
import { AgentWorkflowsConfiguration } from '../workflows/agent-workflows-configuration';
import { AgentTriggersConfiguration } from '../triggers/agent-triggers-configuration';
import { toast } from 'sonner';
import { KortixLogo } from '../../sidebar/kortix-logo';

interface ConfigurationTabProps {
  agentId: string;
  displayData: {
    name: string;
    description: string;
    system_prompt: string;
    agentpress_tools: any;
    configured_mcps: any[];
    custom_mcps: any[];
    is_default: boolean;
    avatar: string;
    avatar_color: string;
  };
  versionData?: {
    version_id: string;
    configured_mcps: any[];
    custom_mcps: any[];
    system_prompt: string;
    agentpress_tools: any;
  };
  isViewingOldVersion: boolean;
  onFieldChange: (field: string, value: any) => void;
  onMCPChange: (updates: { configured_mcps: any[]; custom_mcps: any[] }) => void;
  initialAccordion?: string;
  agentMetadata?: {
    is_suna_default?: boolean;
    centrally_managed?: boolean;
    restrictions?: {
      system_prompt_editable?: boolean;
      tools_editable?: boolean;
      name_editable?: boolean;
      description_editable?: boolean;
      mcps_editable?: boolean;
    };
  };
}

export function ConfigurationTab({
  agentId,
  displayData,
  versionData,
  isViewingOldVersion,
  onFieldChange,
  onMCPChange,
  initialAccordion,
  agentMetadata,
}: ConfigurationTabProps) {
  const mapAccordion = (val?: string) => {
    if (val === 'instructions') return 'system';
    if (['system', 'tools', 'integrations', 'knowledge', 'workflows', 'triggers'].includes(val || '')) {
      return val!;
    }
    return 'system';
  };
  const [openAccordion, setOpenAccordion] = React.useState<string>(mapAccordion(initialAccordion));
  React.useEffect(() => {
    if (initialAccordion) {
      setOpenAccordion(mapAccordion(initialAccordion));
    }
  }, [initialAccordion]);

  // Check if this is a Suna default agent and get restrictions
  const isSunaAgent = agentMetadata?.is_suna_default || false;
  const restrictions = agentMetadata?.restrictions || {};
  
  // Determine what's editable based on restrictions and view state
  const isSystemPromptEditable = !isViewingOldVersion && (restrictions.system_prompt_editable !== false);
  const areToolsEditable = !isViewingOldVersion && (restrictions.tools_editable !== false);
  const areMCPsEditable = !isViewingOldVersion && (restrictions.mcps_editable !== false);
  
  // Protected handlers that show toast errors for restricted actions
  const handleSystemPromptChange = (value: string) => {
    if (!isSystemPromptEditable && isSunaAgent) {
      toast.error("System prompt cannot be edited", {
        description: "Suna's system prompt is managed centrally and cannot be changed.",
      });
      return;
    }
    onFieldChange('system_prompt', value);
  };

  return (
    <div className="p-4">
      <Accordion type="single" collapsible value={openAccordion} onValueChange={setOpenAccordion} className="space-y-2">
        <AccordionItem 
          value="system" 
          className="rounded-xl hover:bg-muted/30 border transition-colors duration-200"
        >
          <AccordionTrigger className="hover:no-underline py-4 px-4 [&[data-state=open]]:pb-3">
            <div className="flex items-center gap-3">
              <div className="bg-muted rounded-lg h-9 w-9 flex items-center justify-center">
                <Settings className="h-4 w-4" />
              </div>
              <div className="text-left">
                <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">System Prompt</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">Define agent behavior and goals</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {isSunaAgent && !isSystemPromptEditable && (
              <div className="mb-3 p-3 bg-primary/10 border border-primary-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-primary-800">
                  <div className="text-primary-600">
                    <KortixLogo size={16} />
                  </div>
                  <span className="font-medium">Suna Default Agent</span>
                </div>
                <p className="text-xs text-primary-700 mt-1">
                  The system prompt for Suna is managed centrally and cannot be edited. You can still add integrations and customize other settings.
                </p>
              </div>
            )}
            <ExpandableMarkdownEditor
              value={displayData.system_prompt}
              onSave={handleSystemPromptChange}
              placeholder="Click to set system instructions..."
              title="System Instructions"
              disabled={!isSystemPromptEditable}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem 
          value="tools" 
          className="rounded-xl hover:bg-muted/30 border transition-colors duration-200"
        >
          <AccordionTrigger className="hover:no-underline py-4 px-4 [&[data-state=open]]:pb-3">
            <div className="flex items-center gap-3">
              <div className="bg-muted rounded-lg h-9 w-9 flex items-center justify-center">
                <Wrench className="h-4 w-4" />
              </div>
              <div className="text-left">
                <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">Default Tools</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">Configure default agentpress tools</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {isSunaAgent && !areToolsEditable && (
              <div className="mb-3 p-3 bg-primary/10 border border-primary-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-primary-800">
                  <div className="text-primary-600">
                    <KortixLogo size={16} />
                  </div>
                  <span className="font-medium">Suna Default Tools</span>
                </div>
                <p className="text-xs text-primary-700 mt-1">
                  The default tools for Suna are managed centrally and cannot be modified. These tools are optimized for Suna's capabilities.
                </p>
              </div>
            )}
            <AgentToolsConfiguration
              tools={displayData.agentpress_tools}
              onToolsChange={areToolsEditable ? (tools) => onFieldChange('agentpress_tools', tools) : () => {}}
              disabled={!areToolsEditable}
              isSunaAgent={isSunaAgent}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem 
          value="integrations" 
          className="rounded-xl hover:bg-muted/30 border transition-colors duration-200"
        >
          <AccordionTrigger className="hover:no-underline py-4 px-4 [&[data-state=open]]:pb-3">
            <div className="flex items-center gap-3">
              <div className="bg-muted rounded-lg h-9 w-9 flex items-center justify-center">
                <Server className="h-4 w-4" />
              </div>
              <div className="text-left">
                <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">Integrations</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">Connect external services via MCPs</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <AgentMCPConfiguration
              configuredMCPs={displayData.configured_mcps}
              customMCPs={displayData.custom_mcps}
              onMCPChange={onMCPChange}
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

        <AccordionItem 
          value="knowledge" 
          className="rounded-xl hover:bg-muted/30 border transition-colors duration-200"
        >
          <AccordionTrigger className="hover:no-underline py-4 px-4 [&[data-state=open]]:pb-3">
            <div className="flex items-center gap-3">
              <div className="bg-muted rounded-lg h-9 w-9 flex items-center justify-center">
                <BookOpen className="h-4 w-4" />
              </div>
              <div className="text-left">
                <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">Knowledge Base</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">Upload and manage knowledge for the agent</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <AgentKnowledgeBaseManager
              agentId={agentId}
              agentName={displayData.name || 'Agent'}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem 
          value="workflows" 
          className="rounded-xl hover:bg-muted/30 border transition-colors duration-200"
        >
          <AccordionTrigger className="hover:no-underline py-4 px-4 [&[data-state=open]]:pb-3">
            <div className="flex items-center gap-3">
              <div className="bg-muted rounded-lg h-9 w-9 flex items-center justify-center">
                <Workflow className="h-4 w-4" />
              </div>
              <div className="text-left">
                <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">Workflows</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">Automate complex processes</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <AgentWorkflowsConfiguration
              agentId={agentId}
              agentName={displayData.name || 'Agent'}
            />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem 
          value="triggers" 
          className="rounded-xl hover:bg-muted/30 border transition-colors duration-200"
        >
          <AccordionTrigger className="hover:no-underline py-4 px-4 [&[data-state=open]]:pb-3">
            <div className="flex items-center gap-3">
              <div className="bg-muted rounded-lg h-9 w-9 flex items-center justify-center">
                <Zap className="h-4 w-4" />
              </div>
              <div className="text-left">
                <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">Triggers</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">Set up automated agent runs</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <AgentTriggersConfiguration agentId={agentId} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
