'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { X, Settings2, Brain, Database, Zap, Workflow, Bot } from 'lucide-react';
import { AgentMCPConfiguration } from './agent-mcp-configuration';
import { AgentTriggersConfiguration } from './triggers/agent-triggers-configuration';
import { AgentWorkflowsConfiguration } from './workflows/agent-workflows-configuration';
import { AgentKnowledgeBaseManager } from './knowledge-base/agent-knowledge-base-manager';
import { AgentToolsConfiguration } from './agent-tools-configuration';
import { useAgent, useUpdateAgent } from '@/hooks/react-query/agents/use-agents';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface AgentConfigModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAgentId?: string;
  onAgentSelect?: (agentId: string | undefined) => void;
  initialTab?: string;
}

export const AgentConfigModal: React.FC<AgentConfigModalProps> = ({
  isOpen,
  onOpenChange,
  selectedAgentId,
  onAgentSelect,
  initialTab = 'integrations'
}) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructionsValue, setInstructionsValue] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  
  const { data: agent, isLoading } = useAgent(selectedAgentId || '');
  const updateAgentMutation = useUpdateAgent();
  const router = useRouter();

  const handleAgentSelect = (agentId: string | undefined) => {
    onAgentSelect?.(agentId);
  };

  // Update local state when agent data changes
  React.useEffect(() => {
    if (agent) {
      setAgentName(agent.name || '');
      setAgentDescription(agent.description || '');
      setInstructionsValue(agent.system_prompt || '');
    }
  }, [agent]);

  const handleSaveInstructions = async () => {
    if (!selectedAgentId) return;
    
    try {
      await updateAgentMutation.mutateAsync({
        agentId: selectedAgentId,
        name: agentName,
        description: agentDescription,
        system_prompt: instructionsValue
      });
      toast.success('Agent updated successfully');
      setEditingInstructions(false);
    } catch (error) {
      toast.error('Failed to update agent');
    }
  };

  const handleToolsChange = async (tools: Record<string, { enabled: boolean; description: string }>) => {
    if (!selectedAgentId) return;
    
    try {
      await updateAgentMutation.mutateAsync({
        agentId: selectedAgentId,
        agentpress_tools: tools
      });
      toast.success('Tools updated successfully');
    } catch (error) {
      toast.error('Failed to update tools');
    }
  };

  const handleMCPChange = async (mcps: any) => {
    if (!selectedAgentId) return;
    
    try {
      await updateAgentMutation.mutateAsync({
        agentId: selectedAgentId,
        configured_mcps: mcps.configured_mcps || [],
        custom_mcps: mcps.custom_mcps || []
      });
      toast.success('Integrations updated successfully');
    } catch (error) {
      toast.error('Failed to update integrations');
    }
  };

  const displayName = agent?.name || 'Suna';

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0 pb-2">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Agent Configuration
              </DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Agent Selector */}
            <div className="flex-shrink-0 border-b pb-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* <AgentSelector
                    selectedAgentId={selectedAgentId}
                    onAgentSelect={handleAgentSelect}
                    className="min-w-[250px]"
                  /> */}
                </div>
                                 {selectedAgentId && (
                   <div className="flex items-center gap-2">
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => router.push(`/agents/config/${selectedAgentId}`)}
                       className="flex items-center gap-2"
                     >
                       <Settings2 className="h-4 w-4" />
                       Edit Agent
                     </Button>
                   </div>
                 )}
              </div>
            </div>

            {/* Configuration Tabs */}
            <div className="flex-1 overflow-hidden">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                <TabsList className="grid w-full grid-cols-6 flex-shrink-0">
                  <TabsTrigger value="integrations" className="flex items-center gap-2">
                    <span className="hidden sm:inline">Integrations</span>
                  </TabsTrigger>
                  <TabsTrigger value="tools" className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Tools</span>
                  </TabsTrigger>
                  <TabsTrigger value="instructions" className="flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    <span className="hidden sm:inline">Instructions</span>
                  </TabsTrigger>
                  <TabsTrigger value="knowledge" className="flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    <span className="hidden sm:inline">Knowledge Base</span>
                  </TabsTrigger>
                  <TabsTrigger value="triggers" className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    <span className="hidden sm:inline">Triggers</span>
                  </TabsTrigger>
                  <TabsTrigger value="workflows" className="flex items-center gap-2">
                    <Workflow className="h-4 w-4" />
                    <span className="hidden sm:inline">Workflows</span>
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-hidden mt-4">
                  <TabsContent value="integrations" className="h-full m-0 overflow-y-auto">
                    <div className="space-y-4">
                      <div className="text-center py-8">
                        <h3 className="text-lg font-semibold mb-2">MCP Integrations</h3>
                        <p className="text-muted-foreground mb-4">
                          Connect your agent to external services and tools
                        </p>
                        {selectedAgentId && (
                          <AgentMCPConfiguration
                            configuredMCPs={agent?.configured_mcps || []}
                            customMCPs={agent?.custom_mcps || []}
                            onMCPChange={handleMCPChange}
                          />
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="tools" className="h-full m-0 overflow-y-auto">
                    <div className="space-y-4 p-4">
                      {selectedAgentId ? (
                        <div className="max-w-4xl">
                          <div className="mb-4">
                            <h3 className="text-lg font-semibold mb-2">Standard Tools</h3>
                            <p className="text-muted-foreground mb-4">
                              Configure the built-in tools available to your agent
                            </p>
                          </div>
                          <AgentToolsConfiguration
                            tools={agent?.agentpress_tools || {}}
                            onToolsChange={handleToolsChange}
                          />
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Settings2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                          <h3 className="text-lg font-semibold mb-2">Standard Tools</h3>
                          <p className="text-muted-foreground mb-4">
                            Select an agent to configure its tools
                          </p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="instructions" className="h-full m-0 overflow-y-auto">
                    <div className="space-y-4 p-4">
                      {selectedAgentId ? (
                        <div className="max-w-2xl">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="agent-name">Agent Name</Label>
                              <Input
                                id="agent-name"
                                value={agentName}
                                onChange={(e) => setAgentName(e.target.value)}
                                placeholder="Enter agent name"
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <Label htmlFor="agent-description">Description</Label>
                              <Input
                                id="agent-description"
                                value={agentDescription}
                                onChange={(e) => setAgentDescription(e.target.value)}
                                placeholder="Brief description of the agent"
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <Label htmlFor="system-instructions">System Instructions</Label>
                              <Textarea
                                id="system-instructions"
                                value={instructionsValue}
                                onChange={(e) => setInstructionsValue(e.target.value)}
                                placeholder="Describe the agent's role, behavior, and expertise..."
                                className="min-h-[200px]"
                              />
                            </div>
                            
                            <div className="flex gap-2">
                              <Button
                                onClick={handleSaveInstructions}
                                disabled={updateAgentMutation.isPending}
                              >
                                {updateAgentMutation.isPending ? 'Saving...' : 'Save Changes'}
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setAgentName(agent?.name || '');
                                  setAgentDescription(agent?.description || '');
                                  setInstructionsValue(agent?.system_prompt || '');
                                }}
                              >
                                Reset
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                          <h3 className="text-lg font-semibold mb-2">System Instructions</h3>
                          <p className="text-muted-foreground mb-4">
                            Select an agent to configure its instructions
                          </p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="knowledge" className="h-full m-0 overflow-y-auto">
                    <div className="space-y-4">
                      {selectedAgentId ? (
                        <AgentKnowledgeBaseManager
                          agentId={selectedAgentId}
                          agentName={agentName}
                        />
                      ) : (
                        <div className="text-center py-8">
                          <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                          <h3 className="text-lg font-semibold mb-2">Knowledge Base</h3>
                          <p className="text-muted-foreground mb-4">
                            Select an agent to manage its knowledge base
                          </p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="triggers" className="h-full m-0 overflow-y-auto">
                    <div className="space-y-4">
                      {selectedAgentId ? (
                        <AgentTriggersConfiguration agentId={selectedAgentId} />
                      ) : (
                        <div className="text-center py-8">
                          <Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                          <h3 className="text-lg font-semibold mb-2">Triggers</h3>
                          <p className="text-muted-foreground mb-4">
                            Select an agent to configure its triggers
                          </p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="workflows" className="h-full m-0 overflow-y-auto">
                    <div className="space-y-4">
                      {selectedAgentId ? (
                        <AgentWorkflowsConfiguration
                          agentId={selectedAgentId}
                          agentName={agentName}
                        />
                      ) : (
                        <div className="text-center py-8">
                          <Workflow className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                          <h3 className="text-lg font-semibold mb-2">Workflows</h3>
                          <p className="text-muted-foreground mb-4">
                            Select an agent to configure its workflows
                          </p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}; 