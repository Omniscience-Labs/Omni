import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { X, Search, Zap, TrendingUp } from 'lucide-react';
import { useComposioToolkits, type ComposioToolkit } from '@/hooks/react-query/composio/use-composio';
import { cn } from '@/lib/utils';

interface ComposioRegistryProps {
  onClose?: () => void;
}

const AppCardSkeleton = () => (
  <div className="group relative overflow-hidden rounded-2xl border border-border bg-card transition-all">
    <div className="p-6">
      <div className="flex items-center gap-4 mb-4">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="space-y-2 mb-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-full rounded-xl" />
      </div>
    </div>
  </div>
);

const AppsGridSkeleton = ({ count = 8 }: { count?: number }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {Array.from({ length: count }).map((_, index) => (
      <AppCardSkeleton key={index} />
    ))}
  </div>
);

const ComposioAppCard = ({ toolkit }: { toolkit: ComposioToolkit }) => {
  const [imageError, setImageError] = useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  const renderIcon = () => {
    if (toolkit.logo && !imageError) {
      return (
        <img
          src={toolkit.logo}
          alt={toolkit.name}
          className="h-8 w-8 rounded-lg object-contain"
          onError={handleImageError}
          crossOrigin="anonymous"
        />
      );
    }
    
    return <Zap className="h-6 w-6 text-primary" />;
  };

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card hover:bg-accent/50 transition-all hover:shadow-md hover:border-primary/20">
      <div className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center border border-primary/20">
            {renderIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-foreground mb-1 truncate">
              {toolkit.name}
            </h3>
            <div className="flex items-center gap-2">
              {toolkit.auth_schemes.slice(0, 2).map((scheme) => (
                <Badge
                  key={scheme}
                  variant="secondary"
                  className="text-xs px-2 py-0.5 bg-muted/50 text-muted-foreground border-0"
                >
                  {scheme}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {toolkit.description || 'A powerful integration to enhance your agent\'s capabilities.'}
          </p>
          
          {toolkit.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {toolkit.tags.slice(0, 3).map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="text-xs px-2 py-0.5 border-border/50 text-muted-foreground hover:bg-muted/50"
                >
                  {tag}
                </Badge>
              ))}
              {toolkit.tags.length > 3 && (
                <Badge
                  variant="outline"
                  className="text-xs px-2 py-0.5 border-border/50 text-muted-foreground"
                >
                  +{toolkit.tags.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>
        
        <div className="mt-4 pt-4 border-t border-border/50">
          <Button
            size="sm"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
            disabled
          >
            Coming Soon
          </Button>
        </div>
      </div>
    </div>
  );
};

export const ComposioRegistry: React.FC<ComposioRegistryProps> = ({ onClose }) => {
  const [search, setSearch] = useState('');
  
  const { data: toolkits, isLoading, error, refetch } = useComposioToolkits(search.trim() || undefined);

  const handleSearch = (value: string) => {
    setSearch(value);
  };

  const handleClearSearch = () => {
    setSearch('');
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <X className="h-12 w-12 mx-auto mb-2" />
            <p className="text-lg font-semibold">Failed to load integrations</p>
          </div>
          <Button onClick={() => refetch()} className="bg-primary hover:bg-primary/90">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="sticky flex items-center justify-between top-0 z-10 flex-shrink-0 border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-foreground">
                  Composio Integrations
                </h1>
                <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200 dark:border-green-900 dark:bg-green-900/20 dark:text-green-400">
                  OAuth2 Only
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Connect to enterprise-grade applications with OAuth2 authentication
              </p>
            </div>
          </div>
        </div>
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search toolkits..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 h-11 w-full bg-muted/50 border-0 focus:bg-background focus:ring-2 focus:ring-primary/20 rounded-xl transition-all"
          />
          {search && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSearch}
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="max-w-7xl mx-auto space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 border border-primary/20 rounded-lg bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-md font-semibold text-foreground">
                      {search.trim() ? 'Search Results' : 'Available OAuth2 Toolkits'}
                    </h2>
                  </div>
                </div>
              </div>
              
              {isLoading ? (
                <AppsGridSkeleton count={8} />
              ) : toolkits && toolkits.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {toolkits.map((toolkit) => (
                    <ComposioAppCard key={toolkit.slug} toolkit={toolkit} />
                  ))}
                </div>
              ) : (
                <div className="text-center flex flex-col items-center justify-center py-12">
                  <div className="text-6xl mb-4">🔍</div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    No OAuth2 toolkits found
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                    {search.trim() 
                      ? `No OAuth2-enabled toolkits match "${search}". Try a different search term.`
                      : 'No OAuth2-enabled toolkits available at the moment.'
                    }
                  </p>
                  {search.trim() && (
                    <Button
                      onClick={handleClearSearch}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <X className="h-4 w-4" />
                      Clear Search
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 