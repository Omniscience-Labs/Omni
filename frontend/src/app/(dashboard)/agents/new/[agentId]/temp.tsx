'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2, Settings2, Sparkles, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAgent, useUpdateAgent } from '@/hooks/react-query/agents/use-agents';
import { AgentMCPConfiguration } from '../../_components/agent-mcp-configuration';
import { toast } from 'sonner';
import { AgentToolsConfiguration } from '../../_components/agent-tools-configuration';
import { AgentPreview } from '../../_components/agent-preview';
import { cn } from '@/lib/utils';
import { getAgentAvatar } from '../../_utils/get-agent-style';

export default function AgentConfigurationPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;

  const { data: agent, isLoading, error } = useAgent(agentId);
  const updateAgentMutation = useUpdateAgent();
  const { avatar, color } = getAgentAvatar(agentId);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    system_prompt: '',
    agentpress_tools: {},
    configured_mcps: [],
    is_default: false,
  });

  useEffect(() => {
    if (agent) {
      setFormData({
        name: agent.name || '',
        description: agent.description || '',
        system_prompt: agent.system_prompt || '',
        agentpress_tools: agent.agentpress_tools || {},
        configured_mcps: agent.configured_mcps || [],
        is_default: agent.is_default || false,
      });
    }
  }, [agent]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    try {
      await updateAgentMutation.mutateAsync({
        agentId,
        ...formData
      });
      toast.success('Agent updated successfully');
    } catch (error) {
      console.error('Error updating agent:', error);
      toast.error('Failed to update agent');
    }
  };

  const handleBack = () => {
    router.push('/agents');
  };

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
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Agent not found</h2>
          <p className="text-muted-foreground mb-4">The agent you're looking for doesn't exist.</p>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Agents
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/2 border-r bg-background overflow-y-auto">
          <div className="p-12 space-y-6">
            <div className='flex items-center'>
              <div className={cn(color, 'h-16 w-16 flex items-center justify-center rounded-md text-2xl')}>
                {avatar}
              </div>
              <div className='flex flex-col ml-3'>
                <h1 className='text-xl font-semibold'>{formData.name}</h1>
                <p className='text-muted-foreground'>{formData.description}</p>
              </div>
            </div>
            <div className='flex flex-col'>
              <Textarea
                placeholder='Set system instructions..'
                value={formData.system_prompt}
                onChange={(e) => handleInputChange('system_prompt', e.target.value)}
                className='resize-none min-h-[300px] border-none focus-visible:ring-0 shadow-none px-0'
              />
            </div>
            {/* <Card>
              <CardHeader>
                <CardTitle className="text-lg">Basic Information</CardTitle>
                <CardDescription>
                  Configure your agent's name, description, and core instructions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="agent-name">Agent Name</Label>
                  <Input
                    id="agent-name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="e.g., Research Assistant"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agent-description">Description</Label>
                  <Input
                    id="agent-description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Brief description of the agent"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="system-prompt">System Instructions</Label>
                  <Textarea
                    id="system-prompt"
                    value={formData.system_prompt}
                    onChange={(e) => handleInputChange('system_prompt', e.target.value)}
                    placeholder="Describe the agent's role, behavior, and expertise..."
                    className="min-h-[200px] resize-none"
                  />
                </div>
              </CardContent>
            </Card> */}

            {/* <Tabs defaultValue="tools" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="tools" className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  AgentPress Tools
                </TabsTrigger>
                <TabsTrigger value="mcp" className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  MCP Servers
                </TabsTrigger>
              </TabsList>

              <TabsContent value="tools">
                <AgentToolsConfiguration
                  tools={formData.agentpress_tools}
                  onToolsChange={(tools) => handleInputChange('agentpress_tools', tools)}
                />
              </TabsContent>

              <TabsContent value="mcp">
                <AgentMCPConfiguration
                  mcps={formData.configured_mcps}
                  onMCPsChange={(mcps) => handleInputChange('configured_mcps', mcps)}
                />
              </TabsContent>
            </Tabs> */}
          </div>
        </div>

        <div className="w-1/2 bg-muted/30 overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Preview</h2>
            </div>
            <AgentPreview agent={{ ...agent, ...formData }} />
          </div>
        </div>
      </div>
    </div>
  );
}
