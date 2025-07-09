import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export const McpSearchLoader: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index} className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-6 w-6 rounded" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <div className="flex items-center gap-4">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-3" />
                </div>
              </div>
              <Skeleton className="h-4 w-4" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
