import React from 'react';
import { Button } from '@/components/ui/button';

interface ResultsInfoProps {
  isLoading: boolean;
  totalAgents: number;
  filteredCount: number;
  searchQuery: string;
  activeFiltersCount: number;
  clearFilters: () => void;
}

export const ResultsInfo = ({
  isLoading,
  totalAgents,
  filteredCount,
  searchQuery,
  activeFiltersCount,
  clearFilters
}: ResultsInfoProps) => {
  if (isLoading || totalAgents === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Showing {filteredCount} of {totalAgents} agents
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