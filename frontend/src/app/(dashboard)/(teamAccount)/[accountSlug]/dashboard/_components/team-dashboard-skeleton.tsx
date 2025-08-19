import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function TeamDashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="h-16 w-16 bg-gray-200 rounded-full"></div>
          <div>
            <div className="h-8 w-48 bg-gray-200 rounded mb-2"></div>
            <div className="h-4 w-32 bg-gray-200 rounded mb-2"></div>
            <div className="flex gap-2">
              <div className="h-6 w-24 bg-gray-200 rounded"></div>
              <div className="h-6 w-32 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
        <div className="h-10 w-32 bg-gray-200 rounded"></div>
      </div>

      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-24 bg-gray-200 rounded"></div>
              <div className="h-4 w-4 bg-gray-200 rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-gray-200 rounded mb-1"></div>
              <div className="h-3 w-32 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Content Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat History Skeleton */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="h-6 w-48 bg-gray-200 rounded mb-2"></div>
              <div className="h-4 w-64 bg-gray-200 rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-3 p-3 border rounded-lg">
                    <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Side Panel Skeleton */}
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-5 w-32 bg-gray-200 rounded"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
