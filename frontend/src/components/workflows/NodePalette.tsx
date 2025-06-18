"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
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
  Zap,
  Play,
  Server,
  GitBranch,
  Plus
} from "lucide-react";
import { useMCPServers } from "@/hooks/react-query/mcp/use-mcp-servers";

const inputNodes = [
  {
    id: "inputNode",
    name: "Input",
    description: "Workflow input configuration with prompt and trigger settings",
    icon: Play,
    category: "input",
    required: true,
  },
];

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
  const [selectedCategory, setSelectedCategory] = useState<string | null>("input");
  const [mcpSearchQuery, setMcpSearchQuery] = useState("");

  const { data: mcpServersResponse, isLoading: mcpLoading } = useMCPServers();
  const { data: mcpSearchResults, isLoading: mcpSearchLoading } = useMCPServers(
    mcpSearchQuery.length > 2 ? mcpSearchQuery : undefined
  );
  const mcpServers = mcpServersResponse?.servers || [];

  const filteredNodes = useMemo(() => {
    let nodes: any[] = [];
    
    if (!selectedCategory || selectedCategory === "input") {
      nodes = [...nodes, ...inputNodes];
    }
    if (!selectedCategory || selectedCategory === "agent") {
      nodes = [...nodes, ...agentNodes];
    }
    if (!selectedCategory || selectedCategory === "tools") {
      nodes = [...nodes, ...toolNodes];
    }
    if (!selectedCategory || selectedCategory === "mcp") {
      // Use search results if searching, otherwise use regular MCP servers
      const mcpServersToUse = mcpSearchQuery.length > 2 && mcpSearchResults?.servers 
        ? mcpSearchResults.servers 
        : mcpServers;
      
      nodes = [...nodes, ...mcpServersToUse.map(server => ({
        id: server.qualifiedName,
        name: server.displayName,
        description: server.description,
        icon: Server,
        category: "mcp",
        qualifiedName: server.qualifiedName,
        tools: server.tools || []
      }))];
    }

    if (searchQuery) {
      nodes = nodes.filter(node =>
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return nodes;
  }, [searchQuery, selectedCategory, mcpServers, mcpSearchQuery, mcpSearchResults]);

  const getNodesByCategory = (category: string) => {
    if (category === "input") return inputNodes;
    if (category === "agent") return agentNodes;
    if (category === "tools") return toolNodes;
    if (category === "mcp") {
      // Use search results if searching, otherwise use regular MCP servers
      const mcpServersToUse = mcpSearchQuery.length > 2 && mcpSearchResults?.servers 
        ? mcpSearchResults.servers 
        : mcpServers;
      
      return mcpServersToUse.map(server => ({
        id: server.qualifiedName,
        name: server.displayName,
        description: server.description,
        icon: Server,
        category: "mcp",
        qualifiedName: server.qualifiedName,
        tools: server.tools || [],
        iconUrl: server.iconUrl
      }));
    }
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
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="input">
                <Play className="h-4 w-4" />
                Input
              </TabsTrigger>
              <TabsTrigger value="agent">
                <Bot className="h-4 w-4" />
                Agents
              </TabsTrigger>
              <TabsTrigger value="tools">
                <Wrench className="h-4 w-4" />
                Tools
              </TabsTrigger>
              <TabsTrigger value="mcp">
                <Server className="h-4 w-4" />
                MCP
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-hidden px-4">
          {selectedCategory === "input" && (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-muted-foreground">Workflow Input</h4>
                <Badge variant="outline" className="text-xs">
                  Required
                </Badge>
              </div>
              
              <ScrollArea className="flex-1 overflow-y-auto">
                <div className="space-y-3 pr-3 mb-4">
                  {getNodesByCategory("input").filter(node => 
                    !searchQuery || 
                    node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    node.description.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((node) => {
                    const Icon = node.icon;
                    return (
                      <DraggableNode
                        key={node.id}
                        type="inputNode"
                        data={{
                          label: node.name,
                          prompt: "",
                          trigger_type: "MANUAL",
                          variables: {}
                        }}
                      >
                        <Card className="py-2 group transition-all duration-200 border hover:border-primary/50 cursor-move border-primary/30 bg-primary/5">
                          <CardContent className="p-2 py-0">
                            <div className="flex items-start gap-3">
                              <div className="p-2 rounded-lg bg-primary/20 border border-primary/30 group-hover:bg-primary/30 transition-colors">
                                <Icon className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-sm font-semibold leading-tight flex items-center gap-2">
                                  {node.name}
                                  <Badge variant="outline" className="text-xs">Required</Badge>
                                </CardTitle>
                                <CardDescription className="text-xs line-clamp-2">
                                  {node.description}
                                </CardDescription>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </DraggableNode>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

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
                        <Card className="py-2 group transition-all duration-200 border hover:border-primary/50 cursor-move">
                          <CardContent className="p-2 py-0">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-colors">
                                <Icon className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-sm font-semibold leading-tight">
                                  {node.name}
                                </CardTitle>
                                <CardDescription className="text-xs line-clamp-2">
                                  {node.description}
                                </CardDescription>
                              </div>
                            </div>
                          </CardContent>
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
                          instructions: "",
                        }}
                      >
                        <Card className="py-2 group transition-all duration-200 border hover:border-primary/50 cursor-move">
                          <CardContent className="p-2 py-0">
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
                          </CardContent>
                        </Card>
                      </DraggableNode>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {selectedCategory === "mcp" && (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-muted-foreground">MCP Servers</h4>
                <Badge variant="outline" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  {mcpSearchQuery.length > 2 && mcpSearchResults?.servers 
                    ? mcpSearchResults.servers.length 
                    : mcpServers.length} available
                </Badge>
              </div>
              
              {/* MCP Search Input */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search MCP servers..."
                  value={mcpSearchQuery}
                  onChange={(e) => setMcpSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {mcpLoading || mcpSearchLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : (
                <ScrollArea className="flex-1 overflow-y-auto">
                  <div className="space-y-3 pr-3 mb-4">
                    {/* Custom MCP Option */}
                    <DraggableNode
                      type="mcpNode"
                      data={{
                        label: "Custom MCP Server",
                        nodeId: "custom_mcp",
                        mcpType: "custom",
                        config: {},
                        enabledTools: []
                      }}
                    >
                      <Card className="py-2 group transition-all duration-200 border hover:border-primary/50 cursor-move border-dashed border-primary/30">
                        <CardContent className="p-2 py-0">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 group-hover:bg-purple-500/20 transition-colors">
                              <Plus className="h-5 w-5 text-purple-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-sm font-semibold leading-tight">
                                Custom MCP Server
                              </CardTitle>
                              <CardDescription className="text-xs mt-1 line-clamp-2">
                                Connect to your own MCP server via HTTP or SSE
                              </CardDescription>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </DraggableNode>

                    <Separator className="my-3" />

                    {/* Search Results or Regular MCP Servers */}
                    {mcpSearchQuery.length > 2 && mcpSearchResults?.servers.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No MCP servers found for "{mcpSearchQuery}"</p>
                      </div>
                    ) : (
                      getNodesByCategory("mcp").filter(node => 
                        !searchQuery || 
                        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        node.description.toLowerCase().includes(searchQuery.toLowerCase())
                      ).map((node: any) => (
                        <DraggableNode
                          key={node.id}
                          type="mcpNode"
                          data={{
                            label: node.name,
                            nodeId: node.qualifiedName,
                            mcpType: "smithery",
                            qualifiedName: node.qualifiedName,
                            config: {},
                            enabledTools: [],
                            tools: node.tools,
                            iconUrl: node.iconUrl
                          }}
                        >
                          <Card className="py-2 group transition-all duration-200 border hover:border-primary/50 cursor-move">
                            <CardContent className="p-2 py-0">
                              <div className="flex items-start gap-3">
                                <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 group-hover:bg-purple-500/20 transition-colors">
                                  {node.iconUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img 
                                      src={node.iconUrl} 
                                      alt={node.name}
                                      className="h-5 w-5 rounded"
                                    />
                                  ) : (
                                    <Server className="h-5 w-5 text-purple-500" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <CardTitle className="text-sm font-semibold leading-tight">
                                    {node.name}
                                  </CardTitle>
                                  <CardDescription className="text-xs mt-1 line-clamp-2">
                                    {node.description}
                                  </CardDescription>
                                  {node.tools && node.tools.length > 0 && (
                                    <div className="flex items-center gap-1 mt-1">
                                      <Badge variant="secondary" className="text-xs">
                                        {node.tools.length} tool{node.tools.length !== 1 ? 's' : ''}
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </DraggableNode>
                      ))
                    )}
                  </div>
                </ScrollArea>
              )}
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