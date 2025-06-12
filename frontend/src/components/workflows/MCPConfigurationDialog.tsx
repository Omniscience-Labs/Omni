"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Settings, Sparkles, Search, Database, GitBranch, MessageSquare, Hash, FileText, Cloud, Globe } from "lucide-react";

interface MCPServer {
  id: string;
  name: string;
  description: string;
  icon: any;
  configSchema: {
    properties: Record<string, {
      type: string;
      title: string;
      description: string;
      format?: string;
    }>;
    required: string[];
  };
  tools: Array<{
    name: string;
    description: string;
  }>;
}

interface MCPConfiguration {
  id: string;
  name: string;
  config: Record<string, any>;
  enabledTools: string[];
  isConfigured: boolean;
}

interface MCPConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (configurations: MCPConfiguration[]) => void;
  existingConfigurations?: MCPConfiguration[];
}

// Mock MCP servers with their configuration schemas
const mockMCPServers: MCPServer[] = [
  {
    id: "exa",
    name: "Exa Search",
    description: "Advanced web search with AI-powered results",
    icon: Search,
    configSchema: {
      properties: {
        exaApiKey: {
          type: "string",
          title: "Exa API Key",
          description: "Your Exa API key for search functionality",
          format: "password"
        }
      },
      required: ["exaApiKey"]
    },
    tools: [
      { name: "web_search_exa", description: "Search the web with Exa" },
      { name: "find_similar", description: "Find similar content" }
    ]
  },
  {
    id: "github",
    name: "GitHub",
    description: "Access GitHub repositories, issues, and pull requests",
    icon: GitBranch,
    configSchema: {
      properties: {
        githubToken: {
          type: "string",
          title: "GitHub Token",
          description: "Personal access token for GitHub API",
          format: "password"
        },
        defaultOwner: {
          type: "string",
          title: "Default Owner",
          description: "Default repository owner/organization"
        }
      },
      required: ["githubToken"]
    },
    tools: [
      { name: "list_repositories", description: "List repositories" },
      { name: "get_repository", description: "Get repository details" },
      { name: "create_issue", description: "Create a new issue" },
      { name: "list_issues", description: "List repository issues" }
    ]
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send messages and interact with Slack workspaces",
    icon: MessageSquare,
    configSchema: {
      properties: {
        slackToken: {
          type: "string",
          title: "Slack Bot Token",
          description: "Bot token for Slack API (starts with xoxb-)",
          format: "password"
        },
        defaultChannel: {
          type: "string",
          title: "Default Channel",
          description: "Default channel for messages (e.g., #general)"
        }
      },
      required: ["slackToken"]
    },
    tools: [
      { name: "send_message", description: "Send a message to a channel" },
      { name: "list_channels", description: "List available channels" },
      { name: "get_channel_history", description: "Get channel message history" }
    ]
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Execute SQL queries and manage PostgreSQL databases",
    icon: Database,
    configSchema: {
      properties: {
        host: {
          type: "string",
          title: "Host",
          description: "PostgreSQL server host"
        },
        port: {
          type: "string",
          title: "Port",
          description: "PostgreSQL server port (default: 5432)"
        },
        database: {
          type: "string",
          title: "Database",
          description: "Database name"
        },
        username: {
          type: "string",
          title: "Username",
          description: "Database username"
        },
        password: {
          type: "string",
          title: "Password",
          description: "Database password",
          format: "password"
        }
      },
      required: ["host", "database", "username", "password"]
    },
    tools: [
      { name: "execute_query", description: "Execute SQL query" },
      { name: "list_tables", description: "List database tables" },
      { name: "describe_table", description: "Get table schema" }
    ]
  },
  {
    id: "linear",
    name: "Linear",
    description: "Manage Linear issues, projects, and workflows",
    icon: Hash,
    configSchema: {
      properties: {
        linearApiKey: {
          type: "string",
          title: "Linear API Key",
          description: "Your Linear API key",
          format: "password"
        },
        teamId: {
          type: "string",
          title: "Team ID",
          description: "Default team ID for operations"
        }
      },
      required: ["linearApiKey"]
    },
    tools: [
      { name: "create_issue", description: "Create a new issue" },
      { name: "list_issues", description: "List team issues" },
      { name: "update_issue", description: "Update an issue" }
    ]
  }
];

export default function MCPConfigurationDialog({ 
  open, 
  onOpenChange, 
  onSave, 
  existingConfigurations = [] 
}: MCPConfigurationDialogProps) {
  const [configurations, setConfigurations] = useState<MCPConfiguration[]>(existingConfigurations);
  const [selectedServer, setSelectedServer] = useState<MCPServer | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, any>>({});
  const [enabledTools, setEnabledTools] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("browse");

  useEffect(() => {
    setConfigurations(existingConfigurations);
  }, [existingConfigurations]);

  const handleServerSelect = (server: MCPServer) => {
    setSelectedServer(server);
    
    // Load existing configuration if available
    const existingConfig = configurations.find(c => c.id === server.id);
    if (existingConfig) {
      setConfigForm(existingConfig.config);
      setEnabledTools(new Set(existingConfig.enabledTools));
    } else {
      setConfigForm({});
      setEnabledTools(new Set(server.tools.map(t => t.name))); // Enable all tools by default
    }
    
    setActiveTab("configure");
  };

  const handleConfigSave = () => {
    if (!selectedServer) return;

    const newConfig: MCPConfiguration = {
      id: selectedServer.id,
      name: selectedServer.name,
      config: configForm,
      enabledTools: Array.from(enabledTools),
      isConfigured: true
    };

    const updatedConfigurations = configurations.filter(c => c.id !== selectedServer.id);
    updatedConfigurations.push(newConfig);
    
    setConfigurations(updatedConfigurations);
    setSelectedServer(null);
    setActiveTab("browse");
  };

  const handleRemoveConfiguration = (id: string) => {
    setConfigurations(configurations.filter(c => c.id !== id));
  };

  const handleSaveAll = () => {
    onSave(configurations);
    onOpenChange(false);
  };

  const isConfigValid = () => {
    if (!selectedServer) return false;
    
    return selectedServer.configSchema.required.every(field => 
      configForm[field] && configForm[field].trim() !== ""
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Configure MCP Servers</DialogTitle>
          <DialogDescription>
            Set up Model Context Protocol servers for your workflow
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="browse">Browse Servers</TabsTrigger>
            <TabsTrigger value="configure" disabled={!selectedServer}>Configure</TabsTrigger>
            <TabsTrigger value="configured">Configured ({configurations.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="flex-1">
            <ScrollArea className="flex-1">
              <div className="grid grid-cols-2 gap-4 p-1">
                {mockMCPServers.map((server) => {
                  const isConfigured = configurations.some(c => c.id === server.id);
                  return (
                    <Card 
                      key={server.id} 
                      className={`cursor-pointer hover:shadow-md transition-shadow ${isConfigured ? 'ring-2 ring-green-500' : ''}`}
                      onClick={() => handleServerSelect(server)}
                    >
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          <server.icon className="h-6 w-6" />
                          <div className="flex-1">
                            <CardTitle className="text-base">{server.name}</CardTitle>
                            <CardDescription className="text-sm">{server.description}</CardDescription>
                          </div>
                          {isConfigured && (
                            <Badge variant="default" className="bg-green-500">
                              Configured
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xs text-muted-foreground">
                          {server.tools.length} tools available
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="configure" className="flex-1">
            {selectedServer && (
              <div className="flex-1 grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <selectedServer.icon className="h-6 w-6" />
                    <div>
                      <h3 className="font-semibold">{selectedServer.name}</h3>
                      <p className="text-sm text-muted-foreground">{selectedServer.description}</p>
                    </div>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Connection Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {Object.entries(selectedServer.configSchema.properties).map(([key, schema]) => (
                        <div key={key} className="space-y-2">
                          <Label htmlFor={key}>
                            {schema.title}
                            {selectedServer.configSchema.required.includes(key) && (
                              <span className="text-red-500 ml-1">*</span>
                            )}
                          </Label>
                          <Input
                            id={key}
                            type={schema.format === "password" ? "password" : "text"}
                            placeholder={schema.description}
                            value={configForm[key] || ""}
                            onChange={(e) => setConfigForm({ ...configForm, [key]: e.target.value })}
                          />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Available Tools</CardTitle>
                      <CardDescription>
                        Select which tools to enable for this server
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-64">
                        <div className="space-y-3">
                          {selectedServer.tools.map((tool) => (
                            <div key={tool.name} className="flex items-start gap-3 p-3 border rounded-lg">
                              <Switch
                                checked={enabledTools.has(tool.name)}
                                onCheckedChange={(checked) => {
                                  const newTools = new Set(enabledTools);
                                  if (checked) {
                                    newTools.add(tool.name);
                                  } else {
                                    newTools.delete(tool.name);
                                  }
                                  setEnabledTools(newTools);
                                }}
                              />
                              <div className="flex-1">
                                <div className="font-medium text-sm">{tool.name}</div>
                                <div className="text-xs text-muted-foreground">{tool.description}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSelectedServer(null)}>
                      Cancel
                    </Button>
                    <Button onClick={handleConfigSave} disabled={!isConfigValid()}>
                      <Save className="h-4 w-4 mr-2" />
                      Save Configuration
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="configured" className="flex-1">
            <ScrollArea className="flex-1">
              {configurations.length === 0 ? (
                <div className="text-center py-12">
                  <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No MCP Servers Configured</h3>
                  <p className="text-muted-foreground">
                    Configure MCP servers to use them in your workflows
                  </p>
                </div>
              ) : (
                <div className="space-y-4 p-1">
                  {configurations.map((config) => {
                    const server = mockMCPServers.find(s => s.id === config.id);
                    if (!server) return null;

                    return (
                      <Card key={config.id}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <server.icon className="h-6 w-6" />
                              <div>
                                <CardTitle className="text-base">{config.name}</CardTitle>
                                <CardDescription>
                                  {config.enabledTools.length} tools enabled
                                </CardDescription>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleServerSelect(server)}
                              >
                                <Settings className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={() => handleRemoveConfiguration(config.id)}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-1">
                            {config.enabledTools.map((tool) => (
                              <Badge key={tool} variant="secondary" className="text-xs">
                                {tool}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveAll}>
            <Save className="h-4 w-4 mr-2" />
            Save All Configurations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 