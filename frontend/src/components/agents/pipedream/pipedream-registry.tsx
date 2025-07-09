import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, ExternalLink, Zap, Filter, Grid, List, User, CheckCircle2, Plus, X, Settings, Star, Globe, Database, MessageSquare, Mail, Bot, FileText, Calculator, Calendar, Building, Workflow, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { usePipedreamApps } from '@/hooks/react-query/pipedream/use-pipedream';
import { usePipedreamProfiles } from '@/hooks/react-query/pipedream/use-pipedream-profiles';
import { CredentialProfileSelector } from './credential-profile-selector';
import { PipedreamToolSelector } from './pipedream-tool-selector';
import { CredentialProfileManager } from './credential-profile-manager';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { PipedreamProfile } from '@/components/agents/pipedream/pipedream-profiles';
import { useQueryClient } from '@tanstack/react-query';
import { pipedreamKeys } from '@/hooks/react-query/pipedream/keys';

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
  onProfileSelected?: (profile: PipedreamProfile) => void;
  onToolsSelected?: (profileId: string, selectedTools: string[], appName: string, appSlug: string) => void;
  onAppSelected?: (app: { app_slug: string; app_name: string }) => void;
  mode?: 'full' | 'simple';
  onClose?: () => void;
}

const getCategoryIcon = (category: string) => {
  const icons: Record<string, React.ReactNode> = {
    'All': <Globe className="h-4 w-4" />,
    'Storage & Drive': <Database className="h-4 w-4" />,
    'Tasks': <CheckCircle2 className="h-4 w-4" />,
    'Management': <Settings className="h-4 w-4" />,
    'Communication': <MessageSquare className="h-4 w-4" />,
    'Mail': <Mail className="h-4 w-4" />,
    'Automation': <Bot className="h-4 w-4" />,
    'Knowledge': <FileText className="h-4 w-4" />,
    'Finance': <Calculator className="h-4 w-4" />,
    'Calendar': <Calendar className="h-4 w-4" />,
    'Business': <Building className="h-4 w-4" />,
    'Workflow': <Workflow className="h-4 w-4" />,
    'AI': <Sparkles className="h-4 w-4" />,
  };
  return icons[category] || <Grid className="h-4 w-4" />;
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
  const [page, setPage] = useState(1);
  const [showToolSelector, setShowToolSelector] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<PipedreamProfile | null>(null);
  const [showProfileManager, setShowProfileManager] = useState(false);
  const [selectedAppForProfile, setSelectedAppForProfile] = useState<{ app_slug: string; app_name: string } | null>(null);

  const queryClient = useQueryClient();
  const { data: appsData, isLoading, error, refetch } = usePipedreamApps(page, search, selectedCategory === 'All' ? '' : selectedCategory);
  const { data: profiles } = usePipedreamProfiles();
  
  const { data: allAppsData } = usePipedreamApps(1, '', '');

  const categories = useMemo(() => {
    const dataToUse = allAppsData?.apps || appsData?.apps || [];
    const categorySet = new Set<string>();
    dataToUse.forEach((app: PipedreamApp) => {
      app.categories.forEach(cat => categorySet.add(cat));
    });
    const sortedCategories = Array.from(categorySet).sort();
    return ['All', ...sortedCategories];
  }, [allAppsData?.apps, appsData?.apps]);

  const connectedProfiles = useMemo(() => {
    return profiles?.filter(p => p.is_connected) || [];
  }, [profiles]);

  const popularApps = useMemo(() => {
    const dataToUse = allAppsData?.apps || appsData?.apps || [];
    return dataToUse
      .filter((app: PipedreamApp) => app.featured_weight > 0)
      .sort((a: PipedreamApp, b: PipedreamApp) => b.featured_weight - a.featured_weight)
      .slice(0, 6);
  }, [allAppsData?.apps, appsData?.apps]);

  // Create apps from connected profiles for display
  const connectedApps = useMemo(() => {
    return connectedProfiles.map(profile => ({
      id: profile.profile_id,
      name: profile.app_name,
      name_slug: profile.app_slug,
      app_hid: profile.app_slug,
      description: `Access your ${profile.app_name} workspace (Gmail, Calendar, Drive, etc.)`,
      categories: [],
      featured_weight: 0,
      api_docs_url: null,
      status: 1,
    }));
  }, [connectedProfiles]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setPage(1);
  };

  const handleProfileSelect = async (profileId: string | null, app: PipedreamApp) => {
    if (!profileId) return;
    
    const profile = profiles?.find(p => p.profile_id === profileId);
    if (!profile) return;

    if (!profile.is_connected) {
      toast.error('Please connect this profile first');
      return;
    }

    setSelectedProfile(profile);
    setShowToolSelector(true);
    onProfileSelected?.(profile);
  };

  const handleToolsSelected = (selectedTools: string[]) => {
    if (selectedProfile && onToolsSelected) {
      onToolsSelected(selectedProfile.profile_id, selectedTools, selectedProfile.app_name, selectedProfile.app_slug);
      setShowToolSelector(false);
      setSelectedProfile(null);
      toast.success(`Added ${selectedTools.length} tools from ${selectedProfile.app_name}!`);
    }
  };

  const handleCreateProfile = (app: PipedreamApp) => {
    setSelectedAppForProfile({ app_slug: app.name_slug, app_name: app.name });
    setShowProfileManager(true);
  };

  const handleProfileManagerClose = () => {
    setShowProfileManager(false);
    setSelectedAppForProfile(null);
    queryClient.invalidateQueries({ queryKey: pipedreamKeys.profiles.all() });
  };



  const getAppProfiles = (appSlug: string) => {
    return profiles?.filter(p => p.app_slug === appSlug && p.is_active) || [];
  };

  const AppCard: React.FC<{ app: PipedreamApp; compact?: boolean }> = ({ app, compact = false }) => {
    const appProfiles = getAppProfiles(app.name_slug);
    const connectedProfiles = appProfiles.filter(p => p.is_connected);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

    return (
      <Card className="group transition-all duration-200 hover:shadow-md border-border/50 hover:border-border/80 bg-card/50 hover:bg-card/80 w-full">
        <CardContent className={cn("p-4", compact && "p-3")}>
          <div className="flex items-start gap-3 w-full">
            {/* App Logo */}
            <div className="flex-shrink-0">
              <div className={cn(
                "rounded-lg border border-border/50 bg-primary/20 flex items-center justify-center text-primary font-semibold",
                compact ? "h-10 w-10 text-sm" : "h-12 w-12 text-base"
              )}>
                {app.name.charAt(0).toUpperCase()}
              </div>
            </div>
            
            {/* App Details */}
            <div className="flex-1 min-w-0 w-full">
              {/* Header */}
              <div className="flex items-start justify-between mb-2 w-full">
                <h3 className={cn(
                  "font-semibold text-foreground truncate flex-1 pr-2",
                  compact ? "text-sm" : "text-base"
                )}>
                  {app.name}
                </h3>
                {connectedProfiles.length > 0 && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs flex-shrink-0">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                )}
              </div>
              
              {/* Description */}
              <p className={cn(
                "text-muted-foreground line-clamp-2 mb-3 w-full",
                compact ? "text-xs" : "text-sm"
              )}>
                {app.description}
              </p>

              {/* Categories */}
              {!compact && app.categories.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3 w-full">
                  {app.categories.slice(0, 3).map((category) => (
                    <Badge 
                      key={category} 
                      variant="outline" 
                      className="text-xs px-2 py-0.5 bg-muted/30 hover:bg-muted/50 cursor-pointer border-border/50 flex-shrink-0"
                      onClick={() => handleCategorySelect(category)}
                    >
                      {category}
                    </Badge>
                  ))}
                  {app.categories.length > 3 && (
                    <Badge variant="outline" className="text-xs px-2 py-0.5 bg-muted/30 border-border/50 flex-shrink-0">
                      +{app.categories.length - 3}
                    </Badge>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="w-full">
                {mode === 'simple' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAppSelected?.({ app_slug: app.name_slug, app_name: app.name })}
                    className="h-8 text-xs w-full"
                  >
                    Connect App
                  </Button>
                ) : (
                  <>
                    {connectedProfiles.length > 0 ? (
                      <div className="space-y-2 w-full">
                        <CredentialProfileSelector
                          appSlug={app.name_slug}
                          appName={app.name}
                          selectedProfileId={selectedProfileId}
                          onProfileSelect={(profileId) => {
                            setSelectedProfileId(profileId);
                            if (profileId) {
                              handleProfileSelect(profileId, app);
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCreateProfile(app)}
                        className="h-8 text-xs w-full hover:bg-primary/10"
                      >
                        <Plus className="h-3 w-3 mr-1" />
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

  const CategoryTabs = () => (
    <div className="w-full">
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map((category) => {
          const categoryCount = category === 'All' 
            ? (allAppsData?.total_count || appsData?.total_count || 0)
            : (allAppsData?.apps || appsData?.apps || []).filter((app: PipedreamApp) => 
                app.categories.includes(category)
              ).length;
          
          return (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              size="sm"
              onClick={() => handleCategorySelect(category)}
              className={cn(
                "flex items-center gap-1.5 h-8 px-3 text-xs whitespace-nowrap flex-shrink-0",
                selectedCategory === category 
                  ? "bg-primary text-primary-foreground" 
                  : "hover:bg-muted/50"
              )}
            >
              {getCategoryIcon(category)}
              <span>{category}</span>
              {categoryCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-xs bg-muted/50">
                  {categoryCount}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 mb-2">Failed to load integrations</div>
        <Button onClick={() => refetch()} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-6 pb-4 flex-shrink-0">
        <div className="min-w-0 flex-1 pr-4">
          <h2 className="text-xl font-semibold text-foreground truncate">Integrations</h2>
          <p className="text-sm text-muted-foreground">
            Connect your integrations
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 flex-shrink-0">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="px-4 sm:px-6 pb-4 flex-shrink-0">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search integrations..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 h-10 bg-background/50 border-border/50 focus:border-border w-full"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="px-4 sm:px-6 pb-4 flex-shrink-0">
        <CategoryTabs />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 pb-6">
        <div className="max-w-full">
          {/* My Connections */}
          {connectedApps.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">My Connections</h3>
                <Badge variant="secondary" className="bg-muted/50">
                  {connectedApps.length}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Apps and services you've connected
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                {connectedApps.map((app) => (
                  <AppCard key={app.id} app={app} />
                ))}
              </div>
            </div>
          )}

          {/* Popular/Recommended */}
          {popularApps.length > 0 && selectedCategory === 'All' && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Star className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">Popular</h3>
                <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs">
                  Recommended
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Most commonly used integrations to get started quickly
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                {popularApps.map((app: PipedreamApp) => (
                  <AppCard key={app.id} app={app} compact={true} />
                ))}
              </div>
            </div>
          )}

          {/* Current Category Results */}
          {selectedCategory !== 'All' && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                {getCategoryIcon(selectedCategory)}
                <h3 className="font-semibold text-foreground">{selectedCategory}</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {selectedCategory === 'Storage & Drive' && 'Access and manage your files across cloud storage platforms'}
                {selectedCategory === 'Communication' && 'Connect your messaging and communication tools'}
                {selectedCategory === 'Mail' && 'Integrate with your email services and providers'}
                {selectedCategory === 'Tasks' && 'Manage and track your tasks and project workflows'}
                {selectedCategory === 'Management' && 'Connect your business and project management tools'}
                {selectedCategory === 'Automation' && 'Automate workflows with powerful automation tools'}
                {selectedCategory === 'Knowledge' && 'Access your knowledge bases and documentation'}
                {selectedCategory === 'Calendar' && 'Sync and manage your calendar events and schedules'}
                {selectedCategory === 'Finance' && 'Connect your financial and accounting tools'}
                {selectedCategory === 'Business' && 'Integrate with your business and enterprise tools'}
                {selectedCategory === 'Workflow' && 'Streamline your workflows and processes'}
                {selectedCategory === 'AI' && 'Enhance your workflows with AI-powered tools'}
                {!['Storage & Drive', 'Communication', 'Mail', 'Tasks', 'Management', 'Automation', 'Knowledge', 'Calendar', 'Finance', 'Business', 'Workflow', 'AI'].includes(selectedCategory) && 
                  `Explore ${selectedCategory} integrations and tools`}
              </p>
            </div>
          )}

          {/* Apps Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading integrations...</span>
              </div>
            </div>
          ) : appsData?.apps && appsData.apps.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                {appsData.apps.map((app: PipedreamApp) => (
                  <AppCard key={app.id} app={app} />
                ))}
              </div>

              {appsData.page_info && appsData.page_info.has_more && (
                <div className="flex justify-center pt-8">
                  <Button
                    onClick={() => setPage(page + 1)}
                    disabled={isLoading}
                    variant="outline"
                    size="sm"
                    className="h-10"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading...
                      </>
                    ) : (
                      'Load More'
                    )}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">🔍</div>
              <h3 className="text-lg font-medium mb-2">No integrations found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {selectedCategory !== 'All' 
                  ? `No integrations found in "${selectedCategory}" category` 
                  : "Try adjusting your search criteria"
                }
              </p>
              <Button
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('All');
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

      {/* Dialogs */}
      <Dialog open={showToolSelector} onOpenChange={setShowToolSelector}>
        <DialogContent className='max-w-3xl max-h-[80vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Select Tools for {selectedProfile?.app_name}</DialogTitle>
          </DialogHeader>
          <PipedreamToolSelector
            appSlug={selectedProfile?.app_slug || ''}
            profile={selectedProfile}
            onToolsSelected={handleToolsSelected}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showProfileManager} onOpenChange={handleProfileManagerClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Create {selectedAppForProfile?.app_name} Profile
            </DialogTitle>
            <DialogDescription>
              Create a credential profile for {selectedAppForProfile?.app_name} to connect and use its tools
            </DialogDescription>
          </DialogHeader>
          <CredentialProfileManager
            appSlug={selectedAppForProfile?.app_slug}
            appName={selectedAppForProfile?.app_name}
            onProfileSelect={() => {
              queryClient.invalidateQueries({ queryKey: pipedreamKeys.profiles.all() });
              handleProfileManagerClose();
              toast.success(`Profile created for ${selectedAppForProfile?.app_name}!`);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}; 