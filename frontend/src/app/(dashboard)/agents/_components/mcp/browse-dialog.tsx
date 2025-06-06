import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(200);

  const { data: popularServers } = usePopularMCPServers();
  const { data: popularServersV2, isLoading: isLoadingV2 } = usePopularMCPServersV2(currentPage, pageSize);
  const { data: searchResults, isLoading: isSearching } = useMCPServers(
    searchQuery.length > 2 ? searchQuery : undefined
  );

  const categories = popularServersV2?.success ? Object.keys(popularServersV2.categorized) : [];

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (open) {
      setCurrentPage(1);
      setSelectedCategory(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Browse MCP Servers</DialogTitle>
          <DialogDescription>
            Discover and add Model Context Protocol servers from Smithery
          </DialogDescription>
        </DialogHeader>
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
        <DialogFooter className='w-full'>
          {!searchQuery && popularServersV2?.success && popularServersV2.pagination && (
            <div className="flex items-center justify-between w-full">
              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, popularServersV2.pagination.totalCount)} of {popularServersV2.pagination.totalCount} servers
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {popularServersV2.pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(popularServersV2.pagination.totalPages, prev + 1))}
                  disabled={currentPage >= popularServersV2.pagination.totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
