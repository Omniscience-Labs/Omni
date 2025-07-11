import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, User, CheckCircle2, Plus, X, Settings, Star, Sparkles, TrendingUp, Filter, ChevronRight, ChevronLeft, Zap } from 'lucide-react';
import { usePipedreamApps } from '@/hooks/react-query/pipedream/use-pipedream';
import { usePipedreamProfiles } from '@/hooks/react-query/pipedream/use-pipedream-profiles';
import { PipedreamConnector } from './pipedream-connector';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { PipedreamProfile } from '@/components/agents/pipedream/pipedream-types';
import { useQueryClient } from '@tanstack/react-query';
import type { PipedreamApp } from '@/hooks/react-query/pipedream/utils';

interface PipedreamRegistryProps {
  onProfileSelected?: (profile: PipedreamProfile) => void;
  onToolsSelected?: (profileId: string, selectedTools: string[], appName: string, appSlug: string) => void;
  onAppSelected?: (app: { app_slug: string; app_name: string }) => void;
  mode?: 'full' | 'simple';
  onClose?: () => void;
}

const categoryEmojis: Record<string, string> = {
  'All': '🌟',
  'Communication': '💬',
  'Artificial Intelligence (AI)': '🤖',
  'Social Media': '📱',
  'CRM': '👥',
  'Marketing': '📈',
  'Analytics': '📊',
  'Commerce': '📊',
  'Databases': '🗄️',
  'File Storage': '🗂️',
  'Help Desk & Support': '🎧',
  'Infrastructure & Cloud': '🌐',
  'E-commerce': '🛒',
  'Developer Tools': '🔧',
  'Web & App Development': '🌐',
  'Business Management': '💼',
  'Productivity': '⚡',
  'Finance': '💰',
  'Email': '📧',
  'Project Management': '📋',
  'Storage': '💾',
  'AI/ML': '🤖',
  'Data & Databases': '🗄️',
  'Video': '🎥',
  'Calendar': '📅',
  'Forms': '📝',
  'Security': '🔒',
  'HR': '👔',
  'Sales': '💼',
  'Support': '🎧',
  'Design': '🎨',
  'Business Intelligence': '📈',
  'Automation': '🔄',
  'News': '📰',
  'Weather': '🌤️',
  'Travel': '✈️',
  'Education': '🎓',
  'Health': '🏥',
};

export const PipedreamRegistry: React.FC<PipedreamRegistryProps> = ({
  onProfileSelected,
  onToolsSelected,
  onAppSelected,
  mode = 'full',
  onClose
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [after, setAfter] = useState<string | undefined>(undefined);
  const [paginationHistory, setPaginationHistory] = useState<string[]>([]);
  const [showStreamlinedConnector, setShowStreamlinedConnector] = useState(false);
  const [selectedAppForConnection, setSelectedAppForConnection] = useState<PipedreamApp | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const queryClient = useQueryClient();
  const { data: appsData, isLoading, error, refetch } = usePipedreamApps(after, search);
  const { data: profiles } = usePipedreamProfiles();
  
  const { data: allAppsData } = usePipedreamApps(undefined, '');

  // Get all apps data for categories and matching
  const allApps = useMemo(() => {
    return allAppsData?.apps || [];
  }, [allAppsData?.apps]);

  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    allApps.forEach((app: PipedreamApp) => {
      app.categories.forEach(cat => categorySet.add(cat));
    });
    const sortedCategories = Array.from(categorySet).sort();
    return ['All', ...sortedCategories];
  }, [allApps]);

  const connectedProfiles = useMemo(() => {
    return profiles?.filter(p => p.is_connected) || [];
  }, [profiles]);

  const filteredAppsData = useMemo(() => {
    if (!appsData) return appsData;
    
    if (selectedCategory === 'All') {
      return appsData;
    }
    
    const filteredApps = appsData.apps.filter((app: PipedreamApp) => 
      app.categories.includes(selectedCategory)
    );
    
    return {
      ...appsData,
      apps: filteredApps,
      page_info: {
        ...appsData.page_info,
        count: filteredApps.length
      }
    };
  }, [appsData, selectedCategory]);

  const popularApps = useMemo(() => {
    return allApps
      .filter((app: PipedreamApp) => app.featured_weight > 0)
      .sort((a: PipedreamApp, b: PipedreamApp) => b.featured_weight - a.featured_weight)
      .slice(0, 6);
  }, [allApps]);

  // Create apps from connected profiles with images from registry
  const connectedApps = useMemo(() => {
    return connectedProfiles.map(profile => {
      // Try to find the app in the registry by matching name_slug
      const registryApp = allApps.find(app => 
        app.name_slug === profile.app_slug || 
        app.name.toLowerCase() === profile.app_name.toLowerCase()
      );
      
      return {
        id: profile.profile_id,
        name: profile.app_name,
        name_slug: profile.app_slug,
        auth_type: "keys",
        description: `Access your ${profile.app_name} workspace and tools`,
        img_src: registryApp?.img_src || "",
        custom_fields_json: registryApp?.custom_fields_json || "[]",
        categories: registryApp?.categories || [],
        featured_weight: 0,
        connect: {
          allowed_domains: registryApp?.connect?.allowed_domains || null,
          base_proxy_target_url: registryApp?.connect?.base_proxy_target_url || "",
          proxy_enabled: registryApp?.connect?.proxy_enabled || false,
        },
      };
    });
  }, [connectedProfiles, allApps]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setAfter(undefined);
    setPaginationHistory([]);
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setAfter(undefined);
    setPaginationHistory([]);
  };

  const handleNextPage = () => {
    if (appsData?.page_info?.end_cursor) {
      if (after) {
        setPaginationHistory(prev => [...prev, after]);
      } else {
        setPaginationHistory(prev => [...prev, 'FIRST_PAGE']);
      }
      setAfter(appsData.page_info.end_cursor);
    }
  };

  const handlePrevPage = () => {
    if (paginationHistory.length > 0) {
      const newHistory = [...paginationHistory];
      const previousCursor = newHistory.pop();
      setPaginationHistory(newHistory);
      
      if (previousCursor === 'FIRST_PAGE') {
        setAfter(undefined);
      } else {
        setAfter(previousCursor);
      }
    }
  };

  const resetPagination = () => {
    setAfter(undefined);
    setPaginationHistory([]);
  };

  const handleProfileSelect = async (profileId: string | null, app: PipedreamApp) => {
    if (!profileId) return;
    
    const profile = profiles?.find(p => p.profile_id === profileId);
    if (!profile) return;

    if (!profile.is_connected) {
      toast.error('Please connect this profile first');
      return;
    }

    setSelectedAppForConnection(app);
    setShowStreamlinedConnector(true);
    onProfileSelected?.(profile);
  };

  const handleConnectionComplete = (profileId: string, selectedTools: string[], appName: string, appSlug: string) => {
    if (onToolsSelected) {
      onToolsSelected(profileId, selectedTools, appName, appSlug);
      toast.success(`Added ${selectedTools.length} tools from ${appName}!`);
    }
  };

  const handleConnectApp = (app: PipedreamApp) => {
    setSelectedAppForConnection(app);
    setShowStreamlinedConnector(true);
    onClose?.();
  };

  const getAppProfiles = (appSlug: string) => {
    return profiles?.filter(p => p.app_slug === appSlug && p.is_active) || [];
  };

  const AppCard: React.FC<{ app: PipedreamApp; compact?: boolean }> = ({ app, compact = false }) => {
    const appProfiles = useMemo(() => getAppProfiles(app.name_slug), [app.name_slug]);
    const connectedProfiles = useMemo(() => appProfiles.filter(p => p.is_connected), [appProfiles]);
    const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(undefined);

    return (
      <Card className="group p-0">
        <CardContent className={cn("p-4", compact && "p-3")}>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 relative">
              <div className={cn(
                "rounded-lg flex items-center justify-center text-primary font-semibold overflow-hidden",
                compact ? "h-6 w-6 text-sm" : "h-8 w-8 text-base"
              )}>
                {app.img_src ? (
                  <img
                    src={app.img_src}
                    alt={app.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <span className={cn(
                  "font-semibold",
                  app.img_src ? "hidden" : "block"
                )}>
                  {app.name.charAt(0).toUpperCase()}
                </span>
              </div>
              {connectedProfiles.length > 0 && (
                <div className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 flex items-center justify-center rounded-full">
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h3 className={cn(
                    "font-medium text-sm text-gray-900 dark:text-white"
                  )}>
                    {app.name}
                  </h3>
                </div>
              </div>
              <p className={cn(
                "text-gray-600 text-xs dark:text-gray-400 line-clamp-2 mb-3",
              )}>
                {app.description}
              </p>
              {!compact && app.categories.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {app.categories.slice(0, 2).map((category) => (
                    <Badge 
                      key={category} 
                      variant="outline" 
                      className="text-xs px-1.5 py-0.5 bg-gray-50 hover:bg-gray-100 cursor-pointer border-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCategorySelect(category);
                      }}
                    >
                      {categoryEmojis[category] || '🔧'} {category}
                    </Badge>
                  ))}
                  {app.categories.length > 2 && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      +{app.categories.length - 2}
                    </Badge>
                  )}
                </div>
              )}
              <div>
                {mode === 'simple' ? (
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAppSelected?.({ app_slug: app.name_slug, app_name: app.name });
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    Connect
                  </Button>
                ) : (
                  <>
                    {connectedProfiles.length > 0 ? (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConnectApp(app);
                        }}
                        className="bg-purple-500 hover:bg-purple-600 text-white"
                      >
                        <Zap className="h-3 w-3" />
                        Add Tools
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConnectApp(app);
                        }}
                      >
                        <Plus className="h-3 w-3" />
                        Connect
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const Sidebar: React.FC<{
    isCollapsed: boolean;
    onToggle: () => void;
    categories: string[];
    selectedCategory: string;
    onCategorySelect: (category: string) => void;
    allApps: PipedreamApp[];
  }> = ({ isCollapsed, onToggle, categories, selectedCategory, onCategorySelect, allApps }) => (
    <div className="border-r bg-sidebar flex-shrink-0 sticky top-0 h-[calc(100vh-12vh)] overflow-hidden">
      <div className="p-3 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn(
              "overflow-hidden transition-all duration-300 ease-in-out",
              isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
            )}>
              <h3 className="font-semibold text-sm whitespace-nowrap">Categories</h3>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-7 w-7"
          >
            <ChevronRight className={cn(
              "h-3 w-3 transition-transform duration-300 ease-in-out",
              isCollapsed ? "rotate-0" : "rotate-180"
            )} />
          </Button>
        </div>
      </div>
      
      <div className="p-2 space-y-0.5 flex-1 overflow-y-auto">
        {categories.map((category) => {
          const categoryCount = category === 'All' 
            ? allApps.length
            : allApps.filter((app: PipedreamApp) => 
                app.categories.includes(category)
              ).length;
          
          const isActive = selectedCategory === category;
          const emoji = categoryEmojis[category] || '🔧';
          
          return (
            <button
              key={category}
              onClick={() => onCategorySelect(category)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all duration-200 overflow-hidden",
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "hover:bg-primary/5"
              )}
              title={isCollapsed ? category : undefined}
            >
              <span className="text-sm flex-shrink-0">{emoji}</span>
              <div className={cn(
                "flex items-center justify-between flex-1 min-w-0 overflow-hidden transition-all duration-300 ease-in-out",
                isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
              )}>
                <span className="text-sm truncate whitespace-nowrap">{category}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

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
    <div className="h-full flex">
      <div className={cn(
        "transition-all duration-300 ease-in-out",
        sidebarCollapsed ? "w-12" : "w-62"
      )}>
        <Sidebar 
          isCollapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          categories={categories}
          selectedCategory={selectedCategory}
          onCategorySelect={handleCategorySelect}
          allApps={allApps}
        />
      </div>
      <div className="flex-1 relative">
        <div className="absolute top-0 left-0 right-0 z-10 border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Integrations</h1>
                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-400 text-xs">
                    <Sparkles className="h-3 w-3" />
                    New
                  </Badge>
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Connect your favorite tools and automate workflows
                </p>
              </div>
            </div>
          </div>
          <div className="mt-3 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search 2700+ apps..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10 h-9 focus:border-primary/50 focus:ring-primary/20 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>
        
        <div className="absolute inset-0 pt-[120px] pb-[60px]">
          <div className="h-full overflow-y-auto p-4">
            <div className="max-w-6xl mx-auto">
              {connectedApps.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <h2 className="text-md font-semibold text-gray-900 dark:text-white">My Connections</h2>
                    <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200 dark:border-green-900 dark:bg-green-900/20 dark:text-green-400 text-xs">
                      {connectedApps.length}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {connectedApps.map((app) => (
                      <AppCard key={app.id} app={app} />
                    ))}
                  </div>
                </div>
              )}
              
              {selectedCategory === 'All' ? (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    <h2 className="text-md font-semibold text-gray-900 dark:text-white">Popular</h2>
                    <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200 dark:border-orange-900 dark:bg-orange-900/20 dark:text-orange-400 text-xs">
                      <Star className="h-3 w-3 mr-1" />
                      Recommended
                    </Badge>
                  </div>
                </div>
              ) : (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{categoryEmojis[selectedCategory] || '🔧'}</span>
                    <h2 className="text-md font-medium text-gray-900 dark:text-white">{selectedCategory}</h2>
                  </div>
                </div>
              )}
              
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Loading integrations...</span>
                  </div>
                </div>
              ) : filteredAppsData?.apps && filteredAppsData.apps.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredAppsData.apps.map((app: PipedreamApp) => (
                      <AppCard key={app.id} app={app} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">🔍</div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No integrations found</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 max-w-md mx-auto">
                    {selectedCategory !== 'All' 
                      ? `No integrations found in "${selectedCategory}" category. Try a different category or search term.` 
                      : "Try adjusting your search criteria or browse our popular integrations."
                    }
                  </p>
                  <Button
                    onClick={() => {
                      setSearch('');
                      setSelectedCategory('All');
                      resetPagination();
                    }}
                    variant="outline"
                    size="sm"
                    className="bg-primary hover:bg-primary/90 text-white"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {filteredAppsData?.apps && filteredAppsData.apps.length > 0 && (paginationHistory.length > 0 || appsData?.page_info?.has_more) && (
          <div className="absolute bottom-0 left-0 right-0 z-10 border-t px-4 py-3 bg-background">
            <div className="flex items-center justify-end gap-4">
              <div className="flex items-center gap-2">
                <Button
                  onClick={handlePrevPage}
                  disabled={isLoading || paginationHistory.length === 0}
                  variant="outline"
                  size="sm"
                  className="h-9 px-3"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <div className="flex flex-col items-center gap-1 px-4 py-2 text-sm rounded-lg border">
                  <div className="font-medium text-gray-900 dark:text-white">
                    Page {paginationHistory.length + 1}
                  </div>
                </div>
                
                <Button
                  onClick={handleNextPage}
                  disabled={isLoading || !appsData?.page_info?.has_more}
                  variant="outline"
                  size="sm"
                  className="h-9 px-3"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </>
                  ) : (
                    <>
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      {selectedAppForConnection && (
        <PipedreamConnector
          app={selectedAppForConnection}
          open={showStreamlinedConnector}
          onOpenChange={setShowStreamlinedConnector}
          onComplete={handleConnectionComplete}
        />
      )}
    </div>
  );
}; 