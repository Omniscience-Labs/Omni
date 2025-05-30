import React from 'react';
import { McpSearchLoader } from './_loaders/mcp-search-loader';
import { McpServerCard } from './mcp-server-card';

interface SearchResultsProps {
  searchResults: any;
  isSearching: boolean;
  onServerSelect: (server: any) => void;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  searchResults,
  isSearching,
  onServerSelect,
}) => {
  if (isSearching) {
    return <McpSearchLoader />;
  }

  if (!searchResults?.servers || searchResults.servers.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">No servers found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">
        Search Results ({searchResults.pagination.totalCount})
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {searchResults.servers.map((server) => (
          <McpServerCard
            key={server.qualifiedName}
            server={server}
            onClick={onServerSelect}
          />
        ))}
      </div>
    </div>
  );
};