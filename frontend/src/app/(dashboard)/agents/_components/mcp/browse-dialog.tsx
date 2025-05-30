import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search } from 'lucide-react';
import { usePopularMCPServers, usePopularMCPServersV2, useMCPServers } from '@/hooks/react-query/mcp/use-mcp-servers';
import { McpServerCard } from './mcp-server-card';
import { CategorySidebar } from './category-sidebar';
import { SearchResults } from './search-results';
import { CategorizedServersList } from './categorized-servers';
import { McpListLoader } from './_loaders/mcp-list-loader';

interface BrowseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onServerSelect: (server: any) => void;
}

export const BrowseDialog: React.FC<BrowseDialogProps> = ({
  open,
  onOpenChange,
  onServerSelect,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { data: popularServers } = usePopularMCPServers();
  const { data: popularServersV2, isLoading: isLoadingV2 } = usePopularMCPServersV2();
  const { data: searchResults, isLoading: isSearching } = useMCPServers(
    searchQuery.length > 2 ? searchQuery : undefined
  );

  const categories = popularServersV2?.success ? Object.keys(popularServersV2.categorized) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Browse MCP Servers</DialogTitle>
          <DialogDescription>
            Discover and add Model Context Protocol servers from Smithery
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search MCP servers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex flex-1 gap-4 overflow-hidden">
          {!searchQuery && categories.length > 0 && (
            <CategorySidebar
              categories={categories}
              selectedCategory={selectedCategory}
              onCategorySelect={setSelectedCategory}
              categorizedServers={popularServersV2?.categorized || {}}
            />
          )}
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-4 p-1">
                {searchQuery && (
                  <SearchResults
                    searchResults={searchResults}
                    isSearching={isSearching}
                    onServerSelect={onServerSelect}
                  />
                )}
                {!searchQuery && (
                  <>
                    {isLoadingV2 ? (
                      <McpListLoader />
                    ) : popularServersV2?.success ? (
                      <CategorizedServersList
                        categorizedServers={popularServersV2.categorized}
                        selectedCategory={selectedCategory}
                        onServerSelect={onServerSelect}
                        onCategorySelect={setSelectedCategory}
                      />
                    ) : popularServers ? (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-muted-foreground">Popular Servers</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {popularServers.servers.map((server) => (
                            <McpServerCard
                              key={server.qualifiedName}
                              server={server}
                              onClick={onServerSelect}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};