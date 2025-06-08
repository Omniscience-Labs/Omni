'use client';

import React, { useState, useMemo } from 'react';
import { Search, Download, Star, Calendar, User, Tags, TrendingUp, Globe, Shield, AlertTriangle, CheckCircle, Loader2, Settings, X, Wrench, Zap, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { getAgentAvatar } from '../agents/_utils/get-agent-style';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination } from '../agents/_components/pagination';
import Link from 'next/link';
import { useMediaQuery } from '@/hooks/use-media-query';

import { useMarketplaceAgents, useAddAgentToLibrary } from '@/hooks/react-query/marketplace/use-marketplace';

import { 
  useMarketplaceTemplates, 
  useInstallTemplate,
  useUserCredentials
} from '@/hooks/react-query/secure-mcp/use-secure-mcp';

type SortOption = 'newest' | 'popular' | 'most_downloaded' | 'name';
type ViewMode = 'all' | 'legacy' | 'secure';

interface UnifiedMarketplaceItem {
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
  type: 'legacy' | 'secure';
  agent_id?: string;
  template_id?: string;
  mcp_requirements?: Array<{
    qualified_name: string;
    display_name: string;
    enabled_tools?: string[];
    required_config: string[];
    custom_type?: 'sse' | 'http';
  }>;
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
  item: UnifiedMarketplaceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (item: UnifiedMarketplaceItem, instanceName?: string, customMcpConfigs?: Record<string, Record<string, any>>) => void;
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
      if (item.type === 'secure') {
        setInstanceName(`${item.name}`);
        checkRequirementsAndSetupSteps();
      } else {
        setInstanceName('');
        setSetupSteps([]);
        setMissingCredentials([]);
      }
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

    if (item.type === 'legacy' && item.agent_id) {
      onInstall(item, instanceName);
      return;
    }

    const customMcpConfigs: Record<string, Record<string, any>> = {};
    setupSteps.forEach(step => {
      if (step.type === 'custom_server') {
        customMcpConfigs[step.qualified_name] = setupData[step.id] || {};
      }
    });
    
    onInstall(item, instanceName, customMcpConfigs);
  };

  const canInstall = () => {
    if (!item || item.type !== 'secure') return true;
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
            {item.type === 'secure' ? (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                  <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                Install {item.name}
              </>
            ) : (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/20">
                  <Download className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                Add {item.name}
              </>
            )}
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
                    <CardContent className="flex items-center justify-between p-4 py-0">
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
              {item.type === 'secure' && (
                <div className="space-y-3">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Agent Name
                  </label>
                  <Input
                    value={instanceName}
                    onChange={(e) => setInstanceName(e.target.value)}
                    placeholder="Enter a name for this agent"
                    className="h-11"
                  />
                </div>
              )}
              
              <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/50">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  {item.type === 'secure' 
                    ? "All requirements are configured. Ready to install!"
                    : "This agent will be added to your library."
                  }
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
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Agent Name
                </label>
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
                      {item.type === 'secure' ? 'Installing...' : 'Adding...'}
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      {item.type === 'secure' ? 'Install Agent' : 'Add to Library'}
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
          <Button asChild>
            <Link href="/settings/credentials">
              <Settings className="h-4 w-4 mr-2" />
              Set Up Credentials
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface AgentDetailsProps {
  item: UnifiedMarketplaceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (item: UnifiedMarketplaceItem, instanceName?: string) => void;
  isInstalling: boolean;
  credentialStatus?: {
    hasAllCredentials: boolean;
    missingCount: number;
    totalRequired: number;
  };
}

const getItemStyling = (item: UnifiedMarketplaceItem) => {
  if (item.avatar && item.avatar_color) {
    return {
      avatar: item.avatar,
      color: item.avatar_color,
    };
  }
  return getAgentAvatar(item.id);
};

const AgentDetailsContent: React.FC<{
  item: UnifiedMarketplaceItem;
  instanceName: string;
  setInstanceName: (name: string) => void;
}> = ({ item, instanceName, setInstanceName }) => {
  const { avatar, color } = getItemStyling(item);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div 
            className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ backgroundColor: color }}
          >
            {avatar}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-semibold">{item.name}</h2>
              {item.type === 'secure' ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <Shield className="h-3 w-3 mr-1" />
                  Secure
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Legacy
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">{item.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="h-4 w-4" />
            <span>By {item.creator_name}</span>
          </div>
          <div className="flex items-center gap-1">
            <Download className="h-4 w-4" />
            <span>{item.download_count} downloads</span>
          </div>
          {item.marketplace_published_at && (
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{new Date(item.marketplace_published_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {item.tags.map(tag => (
              <Badge key={tag} variant="outline">
                <Tags className="h-3 w-3 mr-1" />
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {item.type === 'secure' && item.mcp_requirements && item.mcp_requirements.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-md font-medium">Required MCP Services</h3>
          </div>
          
                      <div className="space-y-3">
              {item.mcp_requirements.map((req) => (
                <Card key={req.qualified_name} className="border-border/50">
                  <CardContent className="p-4 py-0">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-primary/10">
                            <Zap className="h-4 w-4 text-primary" />
                          </div>
                          <h4 className="font-medium">{req.display_name}</h4>
                          {req.custom_type && (
                            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                              Custom {req.custom_type.toUpperCase()}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {req.custom_type ? (
                            <span>Requires your own {req.custom_type.toUpperCase()} server URL</span>
                          ) : (
                            <span>Requires: {req.required_config.join(', ')}</span>
                          )}
                        </div>
                        {req.enabled_tools && req.enabled_tools.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {req.enabled_tools.map(tool => (
                              <Badge key={tool} variant="outline" className="text-xs">
                                <Wrench className="h-3 w-3 mr-1" />
                                {tool}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>


        </div>
      )}

      {item.type === 'legacy' && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This is a legacy agent that may contain embedded API keys. Consider using secure templates for better security.
          </AlertDescription>
        </Alert>
      )}

      {item.type === 'secure' && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Agent Name</label>
          <Input
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            placeholder="Enter a name for your agent"
          />
        </div>
      )}
    </div>
  );
};

export default function UnifiedMarketplacePage() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [installingItemId, setInstallingItemId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<UnifiedMarketplaceItem | null>(null);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [showDetailsSheet, setShowDetailsSheet] = useState(false);
  const [showMissingCredsDialog, setShowMissingCredsDialog] = useState(false);
  const [missingCredentials, setMissingCredentials] = useState<any[]>([]);

  // Legacy marketplace data
  const legacyQueryParams = useMemo(() => ({
    page,
    limit: 20,
    search: searchQuery || undefined,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    sort_by: sortBy
  }), [page, searchQuery, selectedTags, sortBy]);

  const { data: legacyAgentsResponse, isLoading: isLoadingLegacy } = useMarketplaceAgents(
    viewMode === 'secure' ? { page: 1, limit: 0 } : legacyQueryParams
  );
  const addToLibraryMutation = useAddAgentToLibrary();

  // Secure marketplace data
  const secureQueryParams = useMemo(() => ({
    limit: 20,
    offset: (page - 1) * 20,
    search: searchQuery || undefined,
    tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined,
  }), [page, searchQuery, selectedTags]);

  const { data: secureTemplates, isLoading: isLoadingSecure } = useMarketplaceTemplates(
    viewMode === 'legacy' ? { limit: 0, offset: 0 } : secureQueryParams
  );
  const { data: userCredentials } = useUserCredentials();
  const installTemplateMutation = useInstallTemplate();

  // Combine and transform data
  const unifiedItems = useMemo(() => {
    const items: UnifiedMarketplaceItem[] = [];

    // Add legacy agents
    if (legacyAgentsResponse?.agents && viewMode !== 'secure') {
      legacyAgentsResponse.agents.forEach(agent => {
        items.push({
          id: `legacy_${agent.agent_id}`,
          name: agent.name,
          description: agent.description,
          tags: agent.tags || [],
          download_count: agent.download_count || 0,
          creator_name: agent.creator_name,
          created_at: agent.created_at,
          marketplace_published_at: agent.marketplace_published_at,
          avatar: agent.avatar,
          avatar_color: agent.avatar_color,
          type: 'legacy',
          agent_id: agent.agent_id,
        });
      });
    }

    // Add secure templates
    if (secureTemplates && viewMode !== 'legacy') {
      secureTemplates.forEach(template => {
        items.push({
          id: `secure_${template.template_id}`,
          name: template.name,
          description: template.description,
          tags: template.tags || [],
          download_count: template.download_count || 0,
          creator_name: template.creator_name || 'Anonymous',
          created_at: template.created_at,
          marketplace_published_at: template.marketplace_published_at,
          avatar: template.avatar,
          avatar_color: template.avatar_color,
          type: 'secure',
          template_id: template.template_id,
          mcp_requirements: template.mcp_requirements,
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
  }, [legacyAgentsResponse, secureTemplates, sortBy, viewMode]);

  const isLoading = isLoadingLegacy || isLoadingSecure;
  const pagination = legacyAgentsResponse?.pagination;

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedTags, sortBy, viewMode]);

  const getUserCredentialNames = () => {
    return new Set(userCredentials?.map(cred => cred.mcp_qualified_name) || []);
  };

  const getItemCredentialStatus = (item: UnifiedMarketplaceItem) => {
    if (item.type !== 'secure' || !item.mcp_requirements) {
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

  const handleItemClick = (item: UnifiedMarketplaceItem) => {
    setSelectedItem(item);
    setShowDetailsSheet(true);
  };

  const handleInstallClick = (item: UnifiedMarketplaceItem, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedItem(item);
    setShowInstallDialog(true);
  };

  const handleInstall = async (item: UnifiedMarketplaceItem, instanceName?: string, customMcpConfigs?: Record<string, Record<string, any>>) => {
    setInstallingItemId(item.id);
    
    try {
      if (item.type === 'legacy' && item.agent_id) {
        await addToLibraryMutation.mutateAsync(item.agent_id);
        toast.success(`${item.name} has been added to your library!`);
        setShowInstallDialog(false);
        setShowDetailsSheet(false);
      } else if (item.type === 'secure' && item.template_id) {
        const result = await installTemplateMutation.mutateAsync({
          template_id: item.template_id,
          instance_name: instanceName,
          custom_mcp_configs: customMcpConfigs
        });

        if (result.status === 'installed') {
          toast.success('Agent installed successfully!');
          setShowInstallDialog(false);
          setShowDetailsSheet(false);
        } else if (result.status === 'configs_required') {
          // Handle missing regular credentials
          if (result.missing_regular_credentials && result.missing_regular_credentials.length > 0) {
            setMissingCredentials(result.missing_regular_credentials);
            setShowInstallDialog(false);
            setShowDetailsSheet(false);
            setShowMissingCredsDialog(true);
            return;
          }
          
          // Handle missing custom configs - this should be handled by the install dialog
          if (result.missing_custom_configs && result.missing_custom_configs.length > 0) {
            toast.error('Please provide all required custom MCP server configurations');
            return;
          }
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

  const getItemStyling = (item: UnifiedMarketplaceItem) => {
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
    unifiedItems.forEach(item => {
      item.tags?.forEach(tag => tags.add(tag));
    });
    return Array.from(tags);
  }, [unifiedItems]);

  const getSecureCount = () => unifiedItems.filter(item => item.type === 'secure').length;
  const getLegacyCount = () => unifiedItems.filter(item => item.type === 'legacy').length;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Agent Marketplace
            </h1>
            <p className="text-md text-muted-foreground max-w-2xl">
              Discover and add powerful AI agents created by the community
            </p>
          </div>

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
            <Link href="/settings/credentials" className="underline">
                Manage your credentials →
              </Link>
            </AlertDescription>
          </Alert>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search agents and templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="View" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  All ({unifiedItems.length})
                </div>
              </SelectItem>
              <SelectItem value="secure">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Secure ({getSecureCount()})
                </div>
              </SelectItem>
              <SelectItem value="legacy">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Legacy ({getLegacyCount()})
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          
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
            `${unifiedItems.length} item${unifiedItems.length !== 1 ? 's' : ''} found`
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
        ) : unifiedItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {searchQuery || selectedTags.length > 0
                ? "No items found matching your criteria. Try adjusting your search or filters."
                : "No agents or templates are currently available in the marketplace."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {unifiedItems.map((item) => {
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
                    <div className="absolute bottom-3 left-3">
                      {item.type === 'secure' ? (
                        <Badge variant="outline" className="bg-green-500/20 backdrop-blur-sm text-white border-green-300/20">
                          <Shield className="h-3 w-3 mr-1" />
                          Secure
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-500/20 backdrop-blur-sm text-white border-amber-300/20">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Legacy
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-4 flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-foreground font-medium text-lg line-clamp-1 flex-1">
                        {item.name}
                      </h3>
                    </div>
                    <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                      {item.description || 'No description available'}
                    </p>
                    
                    {item.type === 'secure' && item.mcp_requirements && item.mcp_requirements.length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            MCP Services ({item.mcp_requirements.length})
                          </span>
                          {credentialStatus.hasAllCredentials ? (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 text-amber-500" />
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {item.mcp_requirements.slice(0, 2).map(req => (
                            <Badge key={req.qualified_name} variant="outline" className="text-xs">
                              {req.display_name}
                            </Badge>
                          ))}
                          {item.mcp_requirements.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{item.mcp_requirements.length - 2}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

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
                          {item.type === 'secure' ? 'Installing...' : 'Adding...'}
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-2" />
                          {item.type === 'secure' ? 'Install' : 'Add to Library'}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pagination && pagination.pages > 1 && viewMode !== 'secure' && (
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.pages}
            onPageChange={setPage}
            isLoading={isLoading}
          />
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