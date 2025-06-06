import React from 'react';
import { Button } from '@/components/ui/button';

interface ResultsInfoProps {
  isLoading: boolean;
  totalAgents: number;
  filteredCount: number;
  searchQuery: string;
  activeFiltersCount: number;
  clearFilters: () => void;
  currentPage?: number;
  totalPages?: number;
}

export const ResultsInfo = ({
  isLoading,
  totalAgents,
  filteredCount,
  searchQuery,
  activeFiltersCount,
  clearFilters,
  currentPage,
  totalPages
}: ResultsInfoProps) => {
  if (isLoading || totalAgents === 0) {
    return null;
  }

  const showingText = () => {
    if (currentPage && totalPages && totalPages > 1) {
      return `Showing page ${currentPage} of ${totalPages} (${totalAgents} total agents)`;
    }
    return `Showing ${filteredCount} of ${totalAgents} agents`;
  };

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {showingText()}
        {searchQuery && ` for "${searchQuery}"`}
      </span>
      {activeFiltersCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-auto p-0">
          Clear all filters
        </Button>
      )}
    </div>
  );
}