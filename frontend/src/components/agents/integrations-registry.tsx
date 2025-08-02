import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Sparkles, Zap } from 'lucide-react';
import { PipedreamRegistry } from './pipedream/pipedream-registry';
import { ComposioRegistry } from './composio/composio-registry';

interface IntegrationsRegistryProps {
  showAgentSelector?: boolean;
  selectedAgentId?: string;
  onAgentChange?: (agentId: string | undefined) => void;
  onToolsSelected?: (profileId: string, selectedTools: string[], appName: string, appSlug: string) => void;
  onClose?: () => void;
  initialTab?: 'pipedream' | 'composio';
}

export const IntegrationsRegistry: React.FC<IntegrationsRegistryProps> = ({
  showAgentSelector = true,
  selectedAgentId,
  onAgentChange,
  onToolsSelected,
  onClose,
  initialTab = 'pipedream'
}) => {
  const [activeTab, setActiveTab] = useState<'pipedream' | 'composio'>(initialTab);

  const handleTabChange = (value: string) => {
    setActiveTab(value as 'pipedream' | 'composio');
  };

  return (
    <div className="h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="h-full flex flex-col">
        <div className="flex-shrink-0 border-b bg-background px-6 py-4">
          <TabsList className="grid w-full grid-cols-2 bg-muted/50">
            <TabsTrigger 
              value="pipedream" 
              className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Sparkles className="h-4 w-4" />
              <span>Pipedream</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full dark:bg-blue-900/20 dark:text-blue-400">
                2700+
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="composio" 
              className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Zap className="h-4 w-4" />
              <span>Composio</span>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full dark:bg-green-900/20 dark:text-green-400">
                500+
              </span>
            </TabsTrigger>
          </TabsList>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <TabsContent value="pipedream" className="h-full m-0">
            <PipedreamRegistry
              showAgentSelector={showAgentSelector}
              selectedAgentId={selectedAgentId}
              onAgentChange={onAgentChange}
              onToolsSelected={onToolsSelected}
              onClose={onClose}
            />
          </TabsContent>
          
          <TabsContent value="composio" className="h-full m-0">
            <ComposioRegistry
              onClose={onClose}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}; 