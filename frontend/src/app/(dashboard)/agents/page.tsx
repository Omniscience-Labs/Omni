'use client';

import React, { useState, useMemo } from 'react';
import { PlusCircle, MessagesSquare, AlertCircle, Settings, Trash2, Star, StarOff, Search, Filter, SortAsc, SortDesc, X, Calendar, Wrench, Grid3X3, List, Plus, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu';
import { CreateAgentDialog } from './_components/create-agent-dialog';
import { UpdateAgentDialog } from './_components/update-agent-dialog';
import { getToolDisplayName } from './_data/tools';
import { useAgents, useUpdateAgent, useDeleteAgent, useOptimisticAgentUpdate } from '@/hooks/react-query/agents/use-agents';

type SortOption = 'name' | 'created_at' | 'updated_at' | 'tools_count';
type SortOrder = 'asc' | 'desc';
type ViewMode = 'grid' | 'list';

interface FilterOptions {
  hasDefaultAgent: boolean;
  hasMcpTools: boolean;
  hasAgentpressTools: boolean;
  selectedTools: string[];
}

export default function AgentsPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filters, setFilters] = useState<FilterOptions>({
    hasDefaultAgent: false,
    hasMcpTools: false,
    hasAgentpressTools: false,
    selectedTools: []
  });

  const { 
    data: agents = [], 
    isLoading, 
    error,
    refetch: loadAgents 
  } = useAgents();
  
  const updateAgentMutation = useUpdateAgent();
  const deleteAgentMutation = useDeleteAgent();
  const { optimisticallyUpdateAgent, revertOptimisticUpdate } = useOptimisticAgentUpdate();

  // Get all available tools for filtering
  const allTools = useMemo(() => {
    const toolsSet = new Set<string>();
    agents.forEach(agent => {
      agent.configured_mcps?.forEach(mcp => toolsSet.add(`mcp:${mcp.name}`));
      Object.entries(agent.agentpress_tools || {}).forEach(([tool, toolData]) => {
        if (toolData && typeof toolData === 'object' && 'enabled' in toolData && toolData.enabled) {
          toolsSet.add(`agentpress:${tool}`);
        }
      });
    });
    return Array.from(toolsSet).sort();
  }, [agents]);

  // Filter and sort agents
  const filteredAndSortedAgents = useMemo(() => {
    let filtered = agents.filter(agent => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = agent.name.toLowerCase().includes(query);
        const matchesDescription = agent.description?.toLowerCase().includes(query);
        if (!matchesName && !matchesDescription) return false;
      }

      // Default agent filter
      if (filters.hasDefaultAgent && !agent.is_default) return false;

      // MCP tools filter
      if (filters.hasMcpTools && (!agent.configured_mcps || agent.configured_mcps.length === 0)) return false;

      // AgentPress tools filter
      if (filters.hasAgentpressTools) {
        const hasEnabledTools = Object.values(agent.agentpress_tools || {}).some(
          toolData => toolData && typeof toolData === 'object' && 'enabled' in toolData && toolData.enabled
        );
        if (!hasEnabledTools) return false;
      }

      // Specific tools filter
      if (filters.selectedTools.length > 0) {
        const agentTools = new Set<string>();
        agent.configured_mcps?.forEach(mcp => agentTools.add(`mcp:${mcp.name}`));
        Object.entries(agent.agentpress_tools || {}).forEach(([tool, toolData]) => {
          if (toolData && typeof toolData === 'object' && 'enabled' in toolData && toolData.enabled) {
            agentTools.add(`agentpress:${tool}`);
          }
        });
        
        const hasSelectedTool = filters.selectedTools.some(tool => agentTools.has(tool));
        if (!hasSelectedTool) return false;
      }

      return true;
    });

    // Sort agents
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'updated_at':
          comparison = new Date(a.updated_at || a.created_at).getTime() - new Date(b.updated_at || b.created_at).getTime();
          break;
        case 'tools_count':
          const aToolsCount = (a.configured_mcps?.length || 0) + 
            Object.values(a.agentpress_tools || {}).filter(toolData => 
              toolData && typeof toolData === 'object' && 'enabled' in toolData && toolData.enabled
            ).length;
          const bToolsCount = (b.configured_mcps?.length || 0) + 
            Object.values(b.agentpress_tools || {}).filter(toolData => 
              toolData && typeof toolData === 'object' && 'enabled' in toolData && toolData.enabled
            ).length;
          comparison = aToolsCount - bToolsCount;
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [agents, searchQuery, sortBy, sortOrder, filters]);

  const handleDeleteAgent = async (agentId: string) => {
    try {
      await deleteAgentMutation.mutateAsync(agentId);
    } catch (error) {
      console.error('Error deleting agent:', error);
    }
  };

  const handleToggleDefault = async (agentId: string, currentDefault: boolean) => {
    optimisticallyUpdateAgent(agentId, { is_default: !currentDefault });
    try {
      await updateAgentMutation.mutateAsync({
        agentId,
        is_default: !currentDefault
      });
    } catch (error) {
      revertOptimisticUpdate(agentId);
      console.error('Error updating agent:', error);
    }
  };

  const handleEditAgent = (agentId: string) => {
    setEditingAgentId(agentId);
    setEditDialogOpen(true);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setFilters({
      hasDefaultAgent: false,
      hasMcpTools: false,
      hasAgentpressTools: false,
      selectedTools: []
    });
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.hasDefaultAgent) count++;
    if (filters.hasMcpTools) count++;
    if (filters.hasAgentpressTools) count++;
    count += filters.selectedTools.length;
    return count;
  }, [filters]);

  if (error) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'An error occurred loading agents'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Your Agents
            </h1>
            <p className="text-md text-muted-foreground max-w-2xl">
              Create and manage your AI agents with custom instructions and tools
            </p>
          </div>
          <Button 
            onClick={() => setCreateDialogOpen(true)}
            className="self-start sm:self-center"
          >
            <Plus className="h-5 w-5" />
            New Agent
          </Button>
        </div>

        {/* Search and Filter Controls */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-1">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* Sort */}
            <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="created_at">Created Date</SelectItem>
                <SelectItem value="updated_at">Updated Date</SelectItem>
                <SelectItem value="tools_count">Tools Count</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-3"
            >
              {sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="relative">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter
                  {activeFiltersCount > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 w-5 rounded-full p-0 text-xs">
                      {activeFiltersCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Filter by</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={filters.hasMcpTools}
                  onCheckedChange={(checked) => 
                    setFilters(prev => ({ ...prev, hasMcpTools: checked }))
                  }
                >
                  <Wrench className="h-4 w-4" />
                  Has MCP tools
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.hasAgentpressTools}
                  onCheckedChange={(checked) => 
                    setFilters(prev => ({ ...prev, hasAgentpressTools: checked }))
                  }
                >
                  <Settings className="h-4 w-4" />
                  Has AgentPress tools
                </DropdownMenuCheckboxItem>
                {activeFiltersCount > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={clearFilters}>
                      <X className="h-4 w-4" />
                      Clear filters
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* View Mode Toggle */}
            <div className="flex border rounded-md">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="rounded-r-none border-r"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="rounded-l-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Results Info */}
        {!isLoading && agents.length > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {filteredAndSortedAgents.length} of {agents.length} agents
              {searchQuery && ` for "${searchQuery}"`}
            </span>
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-auto p-0">
                Clear all filters
              </Button>
            )}
          </div>
        )}

        {isLoading ? (
          <div className={viewMode === 'grid' ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3" : "space-y-4"}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className={viewMode === 'grid' ? "h-64" : "h-32"}>
                <CardHeader className="pb-4">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full mt-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardHeader>
                {viewMode === 'grid' && (
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-20" />
                      <div className="flex gap-2">
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-5 w-20" />
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-4">
                      <Skeleton className="h-3 w-24" />
                      <div className="flex gap-1">
                        <Skeleton className="h-8 w-8" />
                        <Skeleton className="h-8 w-8" />
                        <Skeleton className="h-8 w-8" />
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        ) : filteredAndSortedAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="flex flex-col items-center text-center max-w-md space-y-6">
              <div className="rounded-full bg-muted p-6">
                {agents.length === 0 ? (
                  <Bot className="h-12 w-12 text-muted-foreground" />
                ) : (
                  <Search className="h-12 w-12 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl font-semibold text-foreground">
                  {agents.length === 0 ? 'No agents yet' : 'No agents found'}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {agents.length === 0 ? (
                    'Create your first agent to start automating tasks with custom instructions and tools. Configure custom AgentPress capabilities to fine tune agent according to your needs.'
                  ) : (
                    'No agents match your current search and filter criteria. Try adjusting your filters or search terms.'
                  )}
                </p>
              </div>
              {agents.length === 0 ? (
                <Button 
                  size="lg" 
                  onClick={() => setCreateDialogOpen(true)}
                  className="mt-4"
                >
                  <Plus className="h-5 w-5" />
                  Create your first agent
                </Button>
              ) : (
                <Button 
                  variant="outline"
                  onClick={clearFilters}
                  className="mt-4"
                >
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3" : "space-y-4"}>
            {filteredAndSortedAgents.map((agent) => (
              <Card 
                key={agent.agent_id} 
                className={`group transition-all duration-200 border-border/50 hover:border-border ${
                  viewMode === 'list' ? 'flex-row' : ''
                }`}
              >
                <CardHeader className={`${viewMode === 'list' ? 'flex-1' : ''} pb-4`}>
                  <div className={`space-y-3 ${viewMode === 'list' ? 'flex flex-col justify-between h-full' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-xl font-semibold text-foreground leading-tight flex items-center gap-2 group-hover:text-primary transition-colors">
                        <span className="line-clamp-2">{agent.name}</span>
                        {agent.is_default && (
                          <Badge variant="secondary" className="text-xs font-medium shrink-0">
                            <Star className="h-3 w-3 mr-1 fill-current" />
                            Default
                          </Badge>
                        )}
                      </CardTitle>
                      {viewMode === 'list' && (
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleEditAgent(agent.agent_id)}
                            title="Edit agent"
                          >
                            <Settings className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          {!agent.is_default && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                                  disabled={deleteAgentMutation.isPending}
                                  title="Delete agent"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="max-w-md">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-xl">Delete Agent</AlertDialogTitle>
                                  <AlertDialogDescription className="text-muted-foreground">
                                    Are you sure you want to delete &quot;{agent.name}&quot;? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteAgent(agent.agent_id)}
                                    disabled={deleteAgentMutation.isPending}
                                    className="bg-destructive hover:bg-destructive/90"
                                  >
                                    {deleteAgentMutation.isPending ? 'Deleting...' : 'Delete'}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      )}
                    </div>
                    {agent.description && (
                      <CardDescription className="text-sm text-muted-foreground line-clamp-2">
                        {agent.description}
                      </CardDescription>
                    )}
                  </div>
                </CardHeader>
                {viewMode === 'grid' && (
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">Tools</p>
                      <div className="flex gap-2 flex-wrap">
                        {agent.configured_mcps?.map(mcp => (
                          <Badge key={mcp.name} variant="outline" className="text-xs">
                            {getToolDisplayName(`mcp:${mcp.name}`)}
                          </Badge>
                        ))}
                        {Object.entries(agent.agentpress_tools || {}).map(([tool, toolData]) => {
                          if (toolData && typeof toolData === 'object' && 'enabled' in toolData && toolData.enabled) {
                            return (
                              <Badge key={tool} variant="outline" className="text-xs">
                                {getToolDisplayName(`agentpress:${tool}`)}
                              </Badge>
                            );
                          }
                          return null;
                        })}
                        {(!agent.configured_mcps || agent.configured_mcps.length === 0) && 
                         (!agent.agentpress_tools || Object.values(agent.agentpress_tools).every(toolData => !toolData || typeof toolData !== 'object' || !('enabled' in toolData) || !toolData.enabled)) && (
                          <span className="text-xs text-muted-foreground">No tools configured</span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-4">
                      <p className="text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3 inline mr-1" />
                        {new Date(agent.created_at).toLocaleDateString()}
                      </p>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleEditAgent(agent.agent_id)}
                          title="Edit agent"
                        >
                          <Settings className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        {!agent.is_default && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                                disabled={deleteAgentMutation.isPending}
                                title="Delete agent"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="max-w-md">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-xl">Delete Agent</AlertDialogTitle>
                                <AlertDialogDescription className="text-muted-foreground">
                                  Are you sure you want to delete &quot;{agent.name}&quot;? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteAgent(agent.agent_id)}
                                  disabled={deleteAgentMutation.isPending}
                                  className="bg-destructive hover:bg-destructive/90"
                                >
                                  {deleteAgentMutation.isPending ? 'Deleting...' : 'Delete'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}

        <CreateAgentDialog
          isOpen={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onAgentCreated={loadAgents}
        />

        <UpdateAgentDialog
          agentId={editingAgentId}
          isOpen={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setEditingAgentId(null);
          }}
          onAgentUpdated={loadAgents}
        />
      </div>
    </div>
  );
}