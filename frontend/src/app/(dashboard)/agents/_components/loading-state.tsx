import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface LoadingStateProps {
  viewMode: 'grid' | 'list';
}

export const LoadingState = ({ viewMode }: LoadingStateProps) => {
  const skeletonCount = viewMode === 'grid' ? 6 : 8;
  
  return (
    <div className={viewMode === 'grid' ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3" : "space-y-4"}>
      {Array.from({ length: skeletonCount }, (_, i) => (
        <Card key={i} className={`transition-all duration-200 ${viewMode === 'grid' ? "h-64" : "h-24"}`}>
          <CardHeader className={`pb-4 ${viewMode === 'list' ? 'flex-1' : ''}`}>
            <div className={`space-y-3 ${viewMode === 'list' ? 'flex flex-col justify-between h-full' : ''}`}>
              <div className={`flex items-start justify-between gap-3 ${viewMode === 'list' ? 'w-full' : ''}`}>
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
                {viewMode === 'list' && (
                  <div className="flex gap-1 shrink-0">
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          
          {viewMode === 'grid' && (
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <div className="flex gap-2 flex-wrap">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-border/40">
                <Skeleton className="h-3 w-24" />
                <div className="flex gap-1">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}