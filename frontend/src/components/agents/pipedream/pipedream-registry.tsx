import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, ExternalLink, Zap, Filter, Grid, List } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePipedreamApps } from '@/hooks/react-query/pipedream/use-pipedream';
import { PipedreamConnectButton } from './pipedream-connect-button';
import { PipedreamToolSelector } from './pipedream-tool-selector';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PipedreamApp {
  id: string;
  name: string;
  name_slug: string;
  app_hid: string;
  description: string;
  categories: string[];
  featured_weight: number;
  api_docs_url: string | null;
  status: number;
}

interface PipedreamRegistryProps {
  onAppConnected?: (app: PipedreamApp) => void;
  onToolsSelected?: (appSlug: string, selectedTools: string[]) => void;
}

export const PipedreamRegistry: React.FC<PipedreamRegistryProps> = ({
  onAppConnected,
  onToolsSelected
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showToolSelector, setShowToolSelector] = useState(false);
  const [selectedApp, setSelectedApp] = useState<PipedreamApp | null>(null);

  const { data: appsData, isLoading, error, refetch } = usePipedreamApps(page, search, selectedCategory);
  
  const { data: allAppsData } = usePipedreamApps(1, '', '');

  const categories = useMemo(() => {
    const dataToUse = allAppsData?.apps || appsData?.apps || [];
    const categorySet = new Set<string>();
    dataToUse.forEach((app: PipedreamApp) => {
      app.categories.forEach(cat => categorySet.add(cat));
    });
    return Array.from(categorySet).sort();
  }, [allAppsData?.apps, appsData?.apps]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category === selectedCategory ? '' : category);
    setPage(1);
  };

  const handleAppConnect = async (app: PipedreamApp) => {
    try {
      // Show success message immediately
      toast.success(`Connected to ${app.name}! Loading tools...`);
      
      // Wait a moment for the connection to be processed by Pipedream
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Refresh the tools data to get the latest
      await refetch();
      
      // Open tool selector
      setSelectedApp(app);
      setShowToolSelector(true);
      
      onAppConnected?.(app);
      
    } catch (error) {
      console.error('Failed to handle app connection:', error);
      toast.error('Failed to load tools. Please try again.');
    }
  };

  const handleToolsSelected = (selectedTools: string[]) => {
    if (selectedApp && onToolsSelected) {
      onToolsSelected(selectedApp.name_slug, selectedTools);
      setShowToolSelector(false);
      setSelectedApp(null);
      toast.success(`Added ${selectedTools.length} tools from ${selectedApp.name}!`);
    }
  };

  const getAppLogoUrl = (app: PipedreamApp) => {
    const logoSlug = app.name_slug.toLowerCase();
    return `https://logo.clearbit.com/${logoSlug}.com`;
  };

  const AppCard: React.FC<{ app: PipedreamApp }> = ({ app }) => (
    <Card className="group transition-all duration-200 border-border/50 hover:border-border">
      <CardContent>
        <div className="flex flex-col items-start gap-2.5">
          <div className="flex-shrink-0">
            <div className='h-8 w-8 rounded-md flex items-center justify-center overflow-hidden'>
              <img
                src={getAppLogoUrl(app)}
                alt={`${app.name} logo`}
                className="w-full h-full object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent && !parent.querySelector('.fallback-logo')) {
                    const fallback = document.createElement('div');
                    fallback.className = 'fallback-logo w-6 h-6 rounded bg-primary/20 flex items-center justify-center text-primary font-semibold text-xs';
                    fallback.textContent = app.name.charAt(0).toUpperCase();
                    parent.appendChild(fallback);
                  }
                }}
              />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-1.5">
              <h3 className="font-medium text-sm truncate pr-2">{app.name}</h3>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
              {app.description}
            </p>

            {app.categories.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {app.categories.slice(0, 2).map((category) => (
                  <Badge 
                    key={category} 
                    variant="outline" 
                    className="text-xs px-1.5 py-0.5 bg-muted/50 hover:bg-muted cursor-pointer h-5"
                    onClick={() => handleCategorySelect(category)}
                  >
                    {category}
                  </Badge>
                ))}
                {app.categories.length > 2 && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-muted/50 h-5">
                    +{app.categories.length - 2}
                  </Badge>
                )}
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <PipedreamConnectButton
                app={app.name_slug}
                onConnect={() => handleAppConnect(app)}
                className="flex-1 h-7 text-xs"
              />
              {app.api_docs_url && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(app.api_docs_url!, '_blank')}
                  className="h-7 w-7 p-0"
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 mb-2">Failed to load Pipedream apps</div>
        <Button onClick={() => refetch()} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full max-h-[80vh]">
      <div className="w-56 border-r border-border bg-muted/20 flex flex-col">
        <div className="p-3 border-b border-border">
          <div className="space-y-0.5">
            <button
              onClick={() => handleCategorySelect('')}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors",
                selectedCategory === '' 
                  ? "bg-muted-foreground/20 text-muted-foreground" 
                  : "hover:bg-muted"
              )}
            >
              All Apps
              {(allAppsData?.total_count || appsData?.total_count) && (
                <span className="ml-1 opacity-70">
                  ({(allAppsData?.total_count || appsData?.total_count)?.toLocaleString()})
                </span>
              )}
            </button>
            {categories.map((category) => {
              const categoryCount = (allAppsData?.apps || appsData?.apps || []).filter((app: PipedreamApp) => 
                app.categories.includes(category)
              ).length;
              return (
                <button
                  key={category}
                  onClick={() => handleCategorySelect(category)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors",
                    selectedCategory === category 
                      ? "bg-muted-foreground/20 text-muted-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  {category}
                  <span className="ml-1 opacity-70">
                    ({categoryCount})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border bg-background">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold">Integrations</h2>
              <p className="text-xs text-muted-foreground">
                Connect to thousands of apps to use in your agents
              </p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search apps..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading apps...</span>
              </div>
            </div>
          )}

          {!isLoading && appsData?.apps && appsData.apps.length > 0 && (
            <>
              <div className={cn(
                "gap-3",
                viewMode === 'grid' 
                  ? "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3" 
                  : "space-y-2"
              )}>
                {appsData.apps.map((app: PipedreamApp) => (
                  <AppCard key={app.id} app={app} />
                ))}
              </div>

              {appsData.page_info && appsData.page_info.has_more && (
                <div className="flex justify-center pt-4">
                  <Button
                    onClick={() => setPage(page + 1)}
                    disabled={isLoading}
                    variant="outline"
                    size="sm"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin mr-2" />
                        Loading...
                      </>
                    ) : (
                      'Load More Apps'
                    )}
                  </Button>
                </div>
              )}
            </>
          )}

          {!isLoading && appsData?.apps && appsData.apps.length === 0 && (
            <div className="text-center py-8">
              <div className="text-3xl mb-3">🔍</div>
              <h3 className="text-base font-medium mb-2">No apps found</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {selectedCategory 
                  ? `No apps found in "${selectedCategory}" category` 
                  : "Try adjusting your search criteria"
                }
              </p>
              <Button
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('');
                  setPage(1);
                }}
                variant="outline"
                size="sm"
              >
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showToolSelector} onOpenChange={setShowToolSelector}>
        <DialogContent className='max-w-3xl'>
          <DialogHeader>
            <DialogTitle>Select Tools for {selectedApp?.name}</DialogTitle>
          </DialogHeader>
          <PipedreamToolSelector
            appSlug={selectedApp?.name_slug || ''}
            onToolsSelected={handleToolsSelected}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}; 