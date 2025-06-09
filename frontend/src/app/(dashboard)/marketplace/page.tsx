'use client';

import React, { useState, useMemo } from 'react';
import { Search, Download, Star, Calendar, User, Tags, TrendingUp, Shield, CheckCircle, Loader2, Settings, Wrench, AlertTriangle, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { getAgentAvatar } from '../agents/_utils/get-agent-style';
import { Skeleton } from '@/components/ui/skeleton';

import { 
  useMarketplaceTemplates, 
  useInstallTemplate,
  useUserCredentials
} from '@/hooks/react-query/secure-mcp/use-secure-mcp';

type SortOption = 'newest' | 'popular' | 'most_downloaded' | 'name';

interface MarketplaceTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  download_count: number;
  creator_name: string;
  created_at: string;
  marketplace_published_at?: string;
  avatar?: string;
  avatar_color?: string;
  template_id: string;
  mcp_requirements?: Array<{
    qualified_name: string;
    display_name: string;
    enabled_tools?: string[];
    required_config: string[];
    custom_type?: 'sse' | 'http';
  }>;
  metadata?: {
    source_agent_id?: string;
    source_version_id?: string;
    source_version_name?: string;
  };
}

interface SetupStep {
  id: string;
  title: string;
  description: string;
  type: 'credential' | 'custom_server';
  service_name: string;
  qualified_name: string;
  required_fields: Array<{
    key: string;
    label: string;
    type: 'text' | 'url' | 'password';
    placeholder: string;
    description?: string;
  }>;
  custom_type?: 'sse' | 'http';
}

interface InstallDialogProps {
  item: MarketplaceTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (item: MarketplaceTemplate, instanceName?: string, customMcpConfigs?: Record<string, Record<string, any>>) => void;
  isInstalling: boolean;
}

const InstallDialog: React.FC<InstallDialogProps> = ({ 
  item, 
  open, 
  onOpenChange, 
  onInstall, 
  isInstalling
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [instanceName, setInstanceName] = useState('');
  const [setupData, setSetupData] = useState<Record<string, Record<string, string>>>({});
  const [isCheckingRequirements, setIsCheckingRequirements] = useState(false);
  const [setupSteps, setSetupSteps] = useState<SetupStep[]>([]);
  const [missingCredentials, setMissingCredentials] = useState<string[]>([]);

  const { data: userCredentials } = useUserCredentials();

  React.useEffect(() => {
    if (item && open) {
      setInstanceName(`${item.name}`);
      checkRequirementsAndSetupSteps();
    }
  }, [item, open, userCredentials]);

  const checkRequirementsAndSetupSteps = async () => {
    if (!item?.mcp_requirements) return;
    
    setIsCheckingRequirements(true);
    const userCredNames = new Set(userCredentials?.map(cred => cred.mcp_qualified_name) || []);
    const steps: SetupStep[] = [];
    const missing: string[] = [];

    const customServers = item.mcp_requirements.filter(req => req.custom_type);
    const regularServices = item.mcp_requirements.filter(req => !req.custom_type);

    for (const req of regularServices) {
      if (!userCredNames.has(req.qualified_name)) {
        missing.push(req.display_name);
      }
    }

    for (const req of customServers) {
      steps.push({
        id: req.qualified_name,
        title: `Configure ${req.display_name}`,
        description: `Enter your ${req.display_name} server URL to connect this agent.`,
        type: 'custom_server',
        service_name: req.display_name,
        qualified_name: req.qualified_name,
        custom_type: req.custom_type,
        required_fields: req.required_config.map(key => ({
          key,
          label: key === 'url' ? `${req.display_name} Server URL` : key,
          type: key === 'url' ? 'url' : 'text',
          placeholder: key === 'url' ? `https://your-${req.display_name.toLowerCase()}-server.com` : `Enter your ${key}`,
          description: key === 'url' ? `Your personal ${req.display_name} server endpoint` : undefined
        }))
      });
    }

    setSetupSteps(steps);
    setMissingCredentials(missing);
    setIsCheckingRequirements(false);
  };

  const handleFieldChange = (stepId: string, fieldKey: string, value: string) => {
    setSetupData(prev => ({
      ...prev,
      [stepId]: {
        ...prev[stepId],
        [fieldKey]: value
      }
    }));
  };

  const isCurrentStepComplete = (): boolean => {
    if (setupSteps.length === 0) return true;
    if (currentStep >= setupSteps.length) return true;
    
    const step = setupSteps[currentStep];
    const stepData = setupData[step.id] || {};
    
    return step.required_fields.every(field => {
      const value = stepData[field.key];
      return value && value.trim().length > 0;
    });
  };

  const handleNext = () => {
    if (currentStep < setupSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleInstall();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleInstall = async () => {
    if (!item) return;

    const customMcpConfigs: Record<string, Record<string, any>> = {};
    setupSteps.forEach(step => {
      if (step.type === 'custom_server') {
        customMcpConfigs[step.qualified_name] = setupData[step.id] || {};
      }
    });
    
    onInstall(item, instanceName, customMcpConfigs);
  };

  const canInstall = () => {
    if (!item) return false;
    if (!instanceName.trim()) return false;
    if (missingCredentials.length > 0) return false;
    if (setupSteps.length > 0 && currentStep < setupSteps.length) return false;
    return true;
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
              <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            Install {item.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {isCheckingRequirements ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Checking what you need...</p>
            </div>
          ) : missingCredentials.length > 0 ? (
            <div className="space-y-6">
              <Alert className="border-destructive/50 bg-destructive/10 dark:bg-destructive/5 text-destructive">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <AlertTitle className="text-destructive">Missing API Credentials</AlertTitle>
                <AlertDescription className="text-destructive/80">
                  This agent requires API credentials for the following services:
                </AlertDescription>
              </Alert>
              
              <div className="space-y-3">
                {missingCredentials.map((serviceName) => (
                  <Card key={serviceName} className="border-destructive/20 shadow-none bg-transparent">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        </div>
                        <span className="font-medium">{serviceName}</span>
                      </div>
                      <Badge variant="destructive">Missing</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : setupSteps.length === 0 ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <Input
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="Enter a name for this agent"
                  className="h-11"
                />
              </div>
              
              <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/50">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  All requirements are configured. Ready to install!
                </AlertDescription>
              </Alert>
            </div>
          ) : currentStep < setupSteps.length ? (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                        {currentStep + 1}
                      </div>
                      <h3 className="font-semibold text-base">{setupSteps[currentStep].title}</h3>
                      {setupSteps[currentStep].custom_type && (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                          {setupSteps[currentStep].custom_type?.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {setupSteps[currentStep].description}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {setupSteps[currentStep].required_fields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {field.label}
                      </label>
                      <Input
                        type={field.type}
                        placeholder={field.placeholder}
                        value={setupData[setupSteps[currentStep].id]?.[field.key] || ''}
                        onChange={(e) => handleFieldChange(setupSteps[currentStep].id, field.key, e.target.value)}
                        className="h-11"
                      />
                      {field.description && (
                        <p className="text-xs text-muted-foreground">{field.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {setupSteps.map((_, index) => (
                    <div
                      key={index}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        index <= currentStep ? 'bg-primary' : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Step {currentStep + 1} of {setupSteps.length}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="space-y-1 flex-1">
                  <h3 className="font-semibold text-base">Almost done!</h3>
                  <p className="text-sm text-muted-foreground">
                    Give your agent a name and we'll set everything up.
                  </p>
                </div>
              </div>

              <div className="ml-12 space-y-3">
                <Input
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="Enter a name for this agent"
                  className="h-11"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-3">
          {missingCredentials.length > 0 ? (
            <div className="flex gap-3 w-full justify-end">
              <Button 
                variant="outline" 
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => window.open('/settings/credentials', '_blank')}
              >
                <Settings className="h-4 w-4" />
                Set Up Credentials
              </Button>
            </div>
          ) : (
            <div className="flex gap-3 w-full justify-end">
              {currentStep > 0 && (
                <Button variant="outline" onClick={handleBack} className="flex-1">
                  Back
                </Button>
              )}
              
              {setupSteps.length === 0 ? (
                <Button 
                  onClick={handleInstall}
                  disabled={isInstalling || !canInstall()}
                >
                  {isInstalling ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Install Agent
                    </>
                  )}
                </Button>
              ) : currentStep < setupSteps.length ? (
                <Button 
                  onClick={handleNext}
                  disabled={!isCurrentStepComplete()}
                >
                  Continue
                </Button>
              ) : (
                <Button 
                  onClick={handleInstall}
                  disabled={isInstalling || !canInstall()}
                >
                  {isInstalling ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Install Agent
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface MissingCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missingCredentials: Array<{
    qualified_name: string;
    display_name: string;
    required_config: string[];
  }>;
  templateName: string;
}

const MissingCredentialsDialog: React.FC<MissingCredentialsDialogProps> = ({
  open,
  onOpenChange,
  missingCredentials,
  templateName
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Missing Credentials</DialogTitle>
          <DialogDescription>
            "{templateName}" requires MCP credentials that you haven't set up yet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You need to configure credentials for the following MCP services before installing this agent.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            {missingCredentials.map((cred) => (
              <Card key={cred.qualified_name}>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">{cred.display_name}</h4>
                    <p className="text-sm text-muted-foreground">{cred.qualified_name}</p>
                    <div className="flex flex-wrap gap-1">
                      {cred.required_config.map((config) => (
                        <Badge key={config} variant="outline" className="text-xs">
                          {config}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => window.open('/settings/credentials', '_blank')}>
            <Settings className="h-4 w-4 mr-2" />
            Set Up Credentials
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function MarketplacePage() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [installingItemId, setInstallingItemId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MarketplaceTemplate | null>(null);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [showMissingCredsDialog, setShowMissingCredsDialog] = useState(false);
  const [missingCredentials, setMissingCredentials] = useState<any[]>([]);

  // Secure marketplace data (all templates are now secure)
  const secureQueryParams = useMemo(() => ({
    limit: 20,
    offset: (page - 1) * 20,
    search: searchQuery || undefined,
    tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined,
  }), [page, searchQuery, selectedTags]);

  const { data: secureTemplates, isLoading } = useMarketplaceTemplates(secureQueryParams);
  const { data: userCredentials } = useUserCredentials();
  const installTemplateMutation = useInstallTemplate();

  // Transform secure templates data
  const marketplaceItems = useMemo(() => {
    const items: MarketplaceTemplate[] = [];

    // Add secure templates (all items are now secure)
    if (secureTemplates) {
      secureTemplates.forEach(template => {
        items.push({
          id: template.template_id,
          name: template.name,
          description: template.description,
          tags: template.tags || [],
          download_count: template.download_count || 0,
          creator_name: template.creator_name || 'Anonymous',
          created_at: template.created_at,
          marketplace_published_at: template.marketplace_published_at,
          avatar: template.avatar,
          avatar_color: template.avatar_color,
          template_id: template.template_id,
          mcp_requirements: template.mcp_requirements,
          metadata: template.metadata,
        });
      });
    }

    // Sort items
    return items.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.marketplace_published_at || b.created_at).getTime() - 
                 new Date(a.marketplace_published_at || a.created_at).getTime();
        case 'popular':
        case 'most_downloaded':
          return b.download_count - a.download_count;
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  }, [secureTemplates, sortBy]);

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedTags, sortBy]);

  const getUserCredentialNames = () => {
    return new Set(userCredentials?.map(cred => cred.mcp_qualified_name) || []);
  };

  const getItemCredentialStatus = (item: MarketplaceTemplate) => {
    if (!item.mcp_requirements) {
      return { hasAllCredentials: true, missingCount: 0, totalRequired: 0 };
    }

    const userCredNames = getUserCredentialNames();
    const missingCreds = item.mcp_requirements.filter(req => {
      if (req.custom_type) {
        const customPattern = `custom_${req.custom_type}_`;
        return !Array.from(userCredNames).some(credName => 
          credName.startsWith(customPattern) && 
          credName.includes(req.display_name.toLowerCase().replace(/\s+/g, '_'))
        );
      }
      return !userCredNames.has(req.qualified_name);
    });
    
    return {
      hasAllCredentials: missingCreds.length === 0,
      missingCount: missingCreds.length,
      totalRequired: item.mcp_requirements.length
    };
  };

  const handleItemClick = (item: MarketplaceTemplate) => {
    setSelectedItem(item);
    setShowInstallDialog(true);
  };

  const handleInstallClick = (item: MarketplaceTemplate, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedItem(item);
    setShowInstallDialog(true);
  };

  const handleInstall = async (item: MarketplaceTemplate, instanceName?: string, customMcpConfigs?: Record<string, Record<string, any>>) => {
    setInstallingItemId(item.id);
    
    try {
      const result = await installTemplateMutation.mutateAsync({
        template_id: item.template_id,
        instance_name: instanceName,
        custom_mcp_configs: customMcpConfigs
      });

      if (result.status === 'installed') {
        toast.success('Agent installed successfully!');
        setShowInstallDialog(false);
      } else if (result.status === 'configs_required') {
        // Handle missing regular credentials
        if (result.missing_regular_credentials && result.missing_regular_credentials.length > 0) {
          setMissingCredentials(result.missing_regular_credentials);
          setShowInstallDialog(false);
          setShowMissingCredsDialog(true);
          return;
        }
        
        // Handle missing custom configs - this should be handled by the install dialog
        if (result.missing_custom_configs && result.missing_custom_configs.length > 0) {
          toast.error('Please provide all required custom MCP server configurations');
          return;
        }
      }
    } catch (error: any) {
      if (error.message?.includes('already in your library')) {
        toast.error('This agent is already in your library');
      } else {
        toast.error(error.message || 'Failed to install agent');
      }
    } finally {
      setInstallingItemId(null);
    }
  };

  const handleTagFilter = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const getItemStyling = (item: MarketplaceTemplate) => {
    if (item.avatar && item.avatar_color) {
      return {
        avatar: item.avatar,
        color: item.avatar_color,
      };
    }
    return getAgentAvatar(item.id);
  };

  const allTags = React.useMemo(() => {
    const tags = new Set<string>();
    marketplaceItems.forEach(item => {
      item.tags?.forEach(tag => tags.add(tag));
    });
    return Array.from(tags);
  }, [marketplaceItems]);

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Agent Marketplace
            </h1>
            <p className="text-md text-muted-foreground max-w-2xl">
              Discover and install secure AI agent templates created by the community
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search agent templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Newest First
                </div>
              </SelectItem>
              <SelectItem value="popular">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  Most Popular
                </div>
              </SelectItem>
              <SelectItem value="most_downloaded">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Most Downloaded
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {allTags.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Filter by tags:</p>
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => (
                <Badge
                  key={tag}
                  variant={selectedTags.includes(tag) ? "default" : "outline"}
                  className="cursor-pointer hover:bg-primary/80"
                  onClick={() => handleTagFilter(tag)}
                >
                  <Tags className="h-3 w-3 mr-1" />
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          {isLoading ? (
            "Loading marketplace..."
          ) : (
            `${marketplaceItems.length} secure template${marketplaceItems.length !== 1 ? 's' : ''} found`
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-neutral-100 dark:bg-sidebar border border-border rounded-2xl overflow-hidden">
                <Skeleton className="h-50" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-5 rounded" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 rounded" />
                    <Skeleton className="h-4 rounded w-3/4" />
                  </div>
                  <Skeleton className="h-8" />
                </div>
              </div>
            ))}
          </div>
        ) : marketplaceItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {searchQuery || selectedTags.length > 0
                ? "No templates found matching your criteria. Try adjusting your search or filters."
                : "No secure agent templates are currently available in the marketplace."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {marketplaceItems.map((item) => {
              const { avatar, color } = getItemStyling(item);
              const credentialStatus = getItemCredentialStatus(item);
              
              return (
                <div 
                  key={item.id} 
                  className="bg-neutral-100 dark:bg-sidebar border border-border rounded-2xl overflow-hidden hover:bg-muted/50 transition-all duration-200 cursor-pointer group flex flex-col h-full"
                  onClick={() => handleItemClick(item)}
                >
                  <div className={`h-50 flex items-center justify-center relative`} style={{ backgroundColor: color }}>
                    <div className="text-4xl">
                      {avatar}
                    </div>
                    <div className="absolute top-3 right-3 flex gap-2">
                      <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm px-2 py-1 rounded-full">
                        <Download className="h-3 w-3 text-white" />
                        <span className="text-white text-xs font-medium">{item.download_count}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-foreground font-medium text-lg line-clamp-1 flex-1">
                        {item.name}
                      </h3>
                      {item.metadata?.source_version_name && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          <GitBranch className="h-3 w-3" />
                          {item.metadata.source_version_name}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                      {item.description || 'No description available'}
                    </p>
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {item.tags.slice(0, 2).map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {item.tags.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{item.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="space-y-1 mb-4">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span>By {item.creator_name}</span>
                      </div>
                      {item.marketplace_published_at && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{new Date(item.marketplace_published_at).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>

                    <Button 
                      onClick={(e) => handleInstallClick(item, e)}
                      disabled={installingItemId === item.id}
                      className="w-full transition-opacity mt-auto"
                      size="sm"
                    >
                      {installingItemId === item.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Installing...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4" />
                          Install Template
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <InstallDialog
        item={selectedItem}
        open={showInstallDialog}
        onOpenChange={setShowInstallDialog}
        onInstall={handleInstall}
        isInstalling={installingItemId === selectedItem?.id}
      />

      <MissingCredentialsDialog
        open={showMissingCredsDialog}
        onOpenChange={setShowMissingCredsDialog}
        missingCredentials={missingCredentials}
        templateName={selectedItem?.name || ''}
      />
    </div>
  );
}