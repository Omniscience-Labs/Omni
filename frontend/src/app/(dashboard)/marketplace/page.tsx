'use client';

import React, { useState } from 'react';
import { Search, Download, Star, Calendar, User, Tags, TrendingUp, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMarketplaceAgents, useAddAgentToLibrary } from '@/hooks/react-query/marketplace/use-marketplace';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { getAgentAvatar } from '../agents/_utils/get-agent-style';

type SortOption = 'newest' | 'popular' | 'most_downloaded';

export default function MarketplacePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  
  const { data: agents = [], isLoading, error } = useMarketplaceAgents({
    search: searchQuery,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    sort: sortBy
  });
  
  const addToLibraryMutation = useAddAgentToLibrary();

  const handleAddToLibrary = async (agentId: string, agentName: string) => {
    try {
      await addToLibraryMutation.mutateAsync(agentId);
      toast.success(`${agentName} has been added to your library!`);
    } catch (error: any) {
      if (error.message?.includes('already in your library')) {
        toast.error('This agent is already in your library');
      } else {
        toast.error('Failed to add agent to library');
      }
    }
  };

  const handleTagFilter = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const getAgentStyling = (agent: any) => {
    if (agent.avatar && agent.avatar_color) {
      return {
        avatar: agent.avatar,
        color: agent.avatar_color,
      };
    }
    return getAgentAvatar(agent.agent_id);
  };

  // Get all unique tags from agents
  const allTags = React.useMemo(() => {
    const tags = new Set<string>();
    agents.forEach(agent => {
      agent.tags?.forEach(tag => tags.add(tag));
    });
    return Array.from(tags);
  }, [agents]);

  if (error) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load marketplace agents. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Agent Marketplace
            </h1>
            <p className="text-md text-muted-foreground max-w-2xl">
              Discover and add powerful AI agents created by the community to your personal library
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Newest First
                </div>
              </SelectItem>
              <SelectItem value="popular">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  Most Popular
                </div>
              </SelectItem>
              <SelectItem value="most_downloaded">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Most Downloaded
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {allTags.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Filter by tags:</p>
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => (
                <Badge
                  key={tag}
                  variant={selectedTags.includes(tag) ? "default" : "outline"}
                  className="cursor-pointer hover:bg-primary/80"
                  onClick={() => handleTagFilter(tag)}
                >
                  <Tags className="h-3 w-3 mr-1" />
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          {isLoading ? (
            "Loading agents..."
          ) : (
            `${agents.length} agent${agents.length !== 1 ? 's' : ''} found`
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-neutral-100 dark:bg-sidebar border border-border rounded-2xl overflow-hidden animate-pulse">
                <div className="h-50 bg-muted" />
                <div className="p-4 space-y-3">
                  <div className="h-5 bg-muted rounded" />
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded" />
                    <div className="h-4 bg-muted rounded w-3/4" />
                  </div>
                  <div className="h-8 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {searchQuery || selectedTags.length > 0
                ? "No agents found matching your criteria. Try adjusting your search or filters."
                : "No agents are currently available in the marketplace."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {agents.map((agent) => {
              const { avatar, color } = getAgentStyling(agent);
              
              return (
                <div 
                  key={agent.agent_id} 
                  className="bg-neutral-100 dark:bg-sidebar border border-border rounded-2xl overflow-hidden hover:bg-muted/50 transition-all duration-200 cursor-pointer group"
                >
                  <div className={`h-50 flex items-center justify-center relative`} style={{ backgroundColor: color }}>
                    <div className="text-4xl">
                      {avatar}
                    </div>
                    <div className="absolute top-3 right-3 flex gap-2">
                      <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm px-2 py-1 rounded-full">
                        <Download className="h-3 w-3 text-white" />
                        <span className="text-white text-xs font-medium">{agent.download_count || 0}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-foreground font-medium text-lg line-clamp-1 flex-1">
                        {agent.name}
                      </h3>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        <Globe className="h-3 w-3 mr-1" />
                        Public
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                      {agent.description || 'No description available'}
                    </p>
                    
                    {/* Tags */}
                    {agent.tags && agent.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {agent.tags.slice(0, 2).map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {agent.tags.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{agent.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                    
                    {/* Metadata */}
                    <div className="space-y-1 mb-4">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span>By {agent.creator_name}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(agent.marketplace_published_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    
                    {/* Add to Library Button */}
                    <Button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToLibrary(agent.agent_id, agent.name);
                      }}
                      disabled={addToLibraryMutation.isPending}
                      className="w-full transition-opacity"
                      size="sm"
                    >
                      {addToLibraryMutation.isPending ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-background border-t-transparent mr-2" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <Download className="h-3 w-3" />
                          Add to Library
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}