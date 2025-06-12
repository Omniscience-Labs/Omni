"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Search, 
  Bot,
  Wrench,
  Globe,
  Terminal,
  FileText,
  Eye,
  MessageSquare,
  Cloud,
  Database,
  Send,
  Settings,
  Sparkles,
  Zap
} from "lucide-react";

const agentNodes = [
  {
    id: "agent",
    name: "General Agent",
    description: "Versatile AI agent for various tasks",
    icon: Bot,
    category: "agent",
  },
];

const toolNodes = [
  {
    id: "web_search_tool",
    name: "Web Search",
    description: "Search the web using Tavily API for up-to-date information",
    icon: Globe,
    category: "tools",
  },
  {
    id: "sb_files_tool",
    name: "File Operations",
    description: "Create, read, update, and delete files in workspace",
    icon: FileText,
    category: "tools",
  },
  {
    id: "sb_shell_tool",
    name: "Shell Commands",
    description: "Execute shell commands in sandbox environment",
    icon: Terminal,
    category: "tools",
  },
  {
    id: "sb_vision_tool",
    name: "Vision Analysis",
    description: "Analyze images and visual content with AI",
    icon: Eye,
    category: "tools",
  },
  {
    id: "sb_browser_tool",
    name: "Browser Automation",
    description: "Automate web browser interactions and scraping",
    icon: Globe,
    category: "tools",
  },
  {
    id: "computer_use_tool",
    name: "Computer Use",
    description: "Interact with computer desktop and applications",
    icon: MessageSquare,
    category: "tools",
  },
  {
    id: "message_tool",
    name: "Messaging",
    description: "Send messages and notifications to users",
    icon: MessageSquare,
    category: "tools",
  },
  {
    id: "data_providers_tool",
    name: "Data Providers",
    description: "Access various data sources and APIs",
    icon: Database,
    category: "tools",
  },
  {
    id: "sb_deploy_tool",
    name: "Deployment",
    description: "Deploy applications and services",
    icon: Cloud,
    category: "tools",
  },
  {
    id: "sb_expose_tool",
    name: "Port Exposure",
    description: "Expose local ports for external access",
    icon: Send,
    category: "tools",
  },
  {
    id: "update_agent_tool",
    name: "Agent Updates",
    description: "Update agent configuration and settings",
    icon: Settings,
    category: "tools",
  },
];

interface DraggableNodeProps {
  type: string;
  data: any;
  children: React.ReactNode;
}

function DraggableNode({ type, data, children }: DraggableNodeProps) {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.setData("nodeData", JSON.stringify(data));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      className="cursor-move"
      onDragStart={(event) => onDragStart(event, type)}
      draggable
    >
      {children}
    </div>
  );
}

export default function NodePalette() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>("agent");

  const filteredNodes = useMemo(() => {
    let nodes: any[] = [];
    
    if (!selectedCategory || selectedCategory === "agent") {
      nodes = [...nodes, ...agentNodes];
    }
    if (!selectedCategory || selectedCategory === "tools") {
      nodes = [...nodes, ...toolNodes];
    }

    if (searchQuery) {
      nodes = nodes.filter(node =>
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return nodes;
  }, [searchQuery, selectedCategory]);

  const getNodesByCategory = (category: string) => {
    if (category === "agent") return agentNodes;
    if (category === "tools") return toolNodes;
    return [];
  };

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="p-4 border-b">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Wrench className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Node Library</h3>
            <p className="text-sm text-muted-foreground">Drag to add to workflow</p>
          </div>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 pt-2 pb-4">
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="agent">
                <Bot className="h-4 w-4 mr-2" />
                Agents
              </TabsTrigger>
              <TabsTrigger value="tools">
                <Wrench className="h-4 w-4 mr-2" />
                Tools
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-hidden px-4">
          {selectedCategory === "agent" && (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-muted-foreground">AI Agents</h4>
                <Badge variant="outline" className="text-xs">
                  {agentNodes.length} available
                </Badge>
              </div>
              
              <ScrollArea className="flex-1 overflow-y-auto">
                <div className="space-y-3 pr-3 mb-4">
                  {getNodesByCategory("agent").filter(node => 
                    !searchQuery || 
                    node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    node.description.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((node) => {
                    const Icon = node.icon;
                    return (
                      <DraggableNode
                        key={node.id}
                        type={node.category}
                        data={{
                          label: node.name,
                          nodeId: node.id,
                          config: {},
                        }}
                      >
                        <Card className="group transition-all duration-200 border hover:border-primary/50 cursor-move">
                          <CardHeader className="p-4 py-0">
                            <div className="flex items-start gap-3">
                              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-colors">
                                <Icon className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-sm font-semibold leading-tight">
                                  {node.name}
                                </CardTitle>
                                <CardDescription className="text-xs mt-1 line-clamp-2">
                                  {node.description}
                                </CardDescription>
                              </div>
                            </div>
                          </CardHeader>
                        </Card>
                      </DraggableNode>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {selectedCategory === "tools" && (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-muted-foreground">AgentPress Tools</h4>
                <Badge variant="outline" className="text-xs">
                  <Zap className="h-3 w-3 mr-1" />
                  {toolNodes.length} available
                </Badge>
              </div>
              
              <ScrollArea className="flex-1 overflow-y-auto">
                <div className="space-y-3 pr-3 mb-4">
                  {getNodesByCategory("tools").filter(node => 
                    !searchQuery || 
                    node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    node.description.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((node) => {
                    const Icon = node.icon;
                    return (
                      <DraggableNode
                        key={node.id}
                        type={node.category}
                        data={{
                          label: node.name,
                          nodeId: node.id,
                          config: {},
                        }}
                      >
                        <Card className="group transition-all duration-200 border hover:border-primary/50 cursor-move">
                          <CardHeader className="p-4 py-0">
                            <div className="flex items-start gap-3">
                              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-colors">
                                <Icon className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-sm font-semibold leading-tight">
                                  {node.name}
                                </CardTitle>
                                <CardDescription className="text-xs mt-1 line-clamp-2">
                                  {node.description}
                                </CardDescription>
                              </div>
                            </div>
                          </CardHeader>
                        </Card>
                      </DraggableNode>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {filteredNodes.length} node{filteredNodes.length !== 1 ? 's' : ''} available
            </span>
            <Badge variant="outline" className="text-xs">
              AgentPress
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
} 