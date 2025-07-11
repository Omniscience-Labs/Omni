'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Bot, ShoppingBag, FileText, Plus, Search, Download, User, Calendar, Tags, Shield, Star, Globe, GlobeLock, GitBranch, Eye, Edit2, Loader2, AlertCircle, AlertTriangle, CheckCircle, MailCheck, Settings, Wrench, Key, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';

// Import hooks and components from existing pages
import { useAgents, useUpdateAgent, useDeleteAgent, useOptimisticAgentUpdate, useCreateNewAgent } from '@/hooks/react-query/agents/use-agents';
import { useMarketplaceTemplates, useInstallTemplate, useMyTemplates, useUnpublishTemplate, usePublishTemplate } from '@/hooks/react-query/secure-mcp/use-secure-mcp';
import { useCreateCredentialProfile, type CreateCredentialProfileRequest } from '@/hooks/react-query/mcp/use-credential-profiles';
import { useMCPServerDetails } from '@/hooks/react-query/mcp/use-mcp-servers';
import { usePipedreamProfiles } from '@/hooks/react-query/pipedream/use-pipedream-profiles';
import { useFeatureFlag } from '@/lib/feature-flags';

// Import components from existing pages
import { SearchAndFilters } from '../../../components/agents/search-and-filters';
import { ResultsInfo } from '../../../components/agents/results-info';
import { EmptyState } from '../../../components/agents/empty-state';
import { AgentsGrid } from '../../../components/agents/agents-grid';
import { LoadingState } from '../../../components/agents/loading-state';
import { Pagination } from '../../../components/agents/pagination';
import { CredentialProfileSelector } from '@/components/workflows/CredentialProfileSelector';
import { CredentialProfileSelector as PipedreamCredentialProfileSelector } from '@/components/agents/pipedream/credential-profile-selector';

// Import utilities
import { getAgentAvatar } from '../../../lib/utils/get-agent-style';
import { generateRandomAvatar } from '../../../lib/utils/_avatar-generator';
import { DEFAULT_AGENTPRESS_TOOLS } from '../../../components/agents/tools';
import { AgentsParams } from '@/hooks/react-query/agents/utils';

type ViewMode = 'grid' | 'list';
type AgentSortOption = 'name' | 'created_at' | 'updated_at' | 'tools_count';
type MarketplaceSortOption = 'newest' | 'popular' | 'most_downloaded' | 'name';
type SortOrder = 'asc' | 'desc';

interface FilterOptions {
  hasDefaultAgent: boolean;
  hasMcpTools: boolean;
  hasAgentpressTools: boolean;
  selectedTools: string[];
}

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
  is_kortix_team?: boolean;
  mcp_requirements?: Array<{
    qualified_name: string;
    display_name: string;
    enabled_tools?: string[];
    required_config: string[];
    custom_type?: 'sse' | 'http' | 'pipedream';
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
  type: 'credential_profile' | 'custom_server' | 'pipedream_profile';
  service_name: string;
  qualified_name: string;
  required_fields?: Array<{
    key: string;
    label: string;
    type: 'text' | 'url' | 'password';
    placeholder: string;
    description?: string;
  }>;
  custom_type?: 'sse' | 'http' | 'pipedream'; 
  app_slug?: string;
  app_name?: string;
}

interface PublishDialogData {
  templateId: string;
  templateName: string;
  currentTags: string[];
}

interface MissingProfile {
  qualified_name: string;
  display_name: string;
  required_config: string[];
}



interface InstallDialogProps {
  item: MarketplaceTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (item: MarketplaceTemplate, instanceName?: string, profileMappings?: Record<string, string>, customMcpConfigs?: Record<string, Record<string, any>>) => Promise<void>;
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
  const [profileMappings, setProfileMappings] = useState<Record<string, string>>({});
  const [pipedreamProfileMappings, setPipedreamProfileMappings] = useState<Record<string, string>>({});
  const [isCheckingRequirements, setIsCheckingRequirements] = useState(false);
  const [setupSteps, setSetupSteps] = useState<SetupStep[]>([]);
  const [missingProfiles, setMissingProfiles] = useState<MissingProfile[]>([]);
  const [showCreateProfileDialog, setShowCreateProfileDialog] = useState(false);
  const [createProfileForQualifiedName, setCreateProfileForQualifiedName] = useState<string>('');
  const [createProfileForDisplayName, setCreateProfileForDisplayName] = useState<string>('');
  const [formData, setFormData] = useState<{
    profile_name: string;
    display_name: string;
    config: Record<string, string>;
    is_default: boolean;
  }>({
    profile_name: '',
    display_name: '',
    config: {},
    is_default: false
  });

  const createProfileMutation = useCreateCredentialProfile();
  const { data: serverDetails } = useMCPServerDetails(createProfileForQualifiedName);
  const { data: pipedreamProfiles } = usePipedreamProfiles();

  React.useEffect(() => {
    if (item && open) {
      setInstanceName(`${item.name}`);
      setSetupData({});
      setProfileMappings({});
      setPipedreamProfileMappings({});
      setIsCheckingRequirements(true);
      setMissingProfiles([]);
      checkRequirementsAndSetupSteps();
    }
  }, [item, open]);

  const refreshRequirements = React.useCallback(() => {
    if (item && open) {
      setIsCheckingRequirements(true);
      checkRequirementsAndSetupSteps();
    }
  }, [item, open]);

  const checkRequirementsAndSetupSteps = async () => {
    if (!item?.mcp_requirements) return;
    
    const steps: SetupStep[] = [];
    
    // First, separate Pipedream services (custom_type === "pipedream")
    const pipedreamServices = item.mcp_requirements.filter(req => 
      req.custom_type === 'pipedream'
    );
    
    // Then, get custom servers (custom_type exists but is not "pipedream")
    const customServers = item.mcp_requirements.filter(req => 
      req.custom_type && req.custom_type !== 'pipedream'
    );
    
    // Finally, get regular services (no custom_type)
    const regularServices = item.mcp_requirements.filter(req => 
      !req.custom_type
    );

    for (const req of pipedreamServices) {
      const appSlug = req.qualified_name; // Use the full qualified_name as app_slug
      steps.push({
        id: req.qualified_name,
        title: `Select Pipedream Profile for ${req.display_name}`,
        description: `Choose a Pipedream credential profile for ${req.display_name}.`,
        type: 'pipedream_profile',
        service_name: req.display_name,
        qualified_name: req.qualified_name,
        app_slug: appSlug,
      });
    }

    for (const req of regularServices) {
      steps.push({
        id: req.qualified_name,
        title: `Select Credential Profile for ${req.display_name}`,
        description: `Choose or create a credential profile for ${req.display_name}.`,
        type: 'credential_profile',
        service_name: req.display_name,
        qualified_name: req.qualified_name,
      });
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
    setMissingProfiles([]); 
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

  const handleProfileSelect = (qualifiedName: string, profileId: string | null) => {
    setProfileMappings(prev => ({
      ...prev,
      [qualifiedName]: profileId || ''
    }));
  };

  const handlePipedreamProfileSelect = (qualifiedName: string, profileId: string | null) => {
    setPipedreamProfileMappings(prev => ({
      ...prev,
      [qualifiedName]: profileId || ''
    }));
  };

  const handleCreateNewProfile = (qualifiedName: string, displayName: string) => {
    setCreateProfileForQualifiedName(qualifiedName);
    setCreateProfileForDisplayName(displayName);
    setFormData({
      profile_name: `${displayName} Profile`,
      display_name: displayName,
      config: {},
      is_default: false
    });
    setShowCreateProfileDialog(true);
  };

  const getConfigProperties = () => {
    const schema = serverDetails?.connections?.[0]?.configSchema;
    return schema?.properties || {};
  };

  const getRequiredFields = () => {
    const schema = serverDetails?.connections?.[0]?.configSchema;
    return schema?.required || [];
  };

  const isFieldRequired = (fieldName: string) => {
    return getRequiredFields().includes(fieldName);
  };

  const handleConfigChange = (key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      config: {
        ...prev.config,
        [key]: value
      }
    }));
  };

  const handleCreateSubmit = async () => {
    try {
      const request: CreateCredentialProfileRequest = {
        mcp_qualified_name: createProfileForQualifiedName,
        profile_name: formData.profile_name,
        display_name: formData.display_name,
        config: formData.config,
        is_default: formData.is_default
      };

      const response = await createProfileMutation.mutateAsync(request);
      toast.success('Credential profile created successfully!');
      
      setProfileMappings(prev => ({
        ...prev,
        [createProfileForQualifiedName]: response.profile_id || 'new-profile'
      }));
      
      setShowCreateProfileDialog(false);
      refreshRequirements();
      
      setFormData({
        profile_name: '',
        display_name: '',
        config: {},
        is_default: false
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to create credential profile');
    }
  };

  const isCurrentStepComplete = (): boolean => {
    if (setupSteps.length === 0) return true;
    if (currentStep >= setupSteps.length) return true;
    
    const step = setupSteps[currentStep];
    
    if (step.type === 'credential_profile') {
      return !!profileMappings[step.qualified_name];
    } else if (step.type === 'pipedream_profile') {
      return !!pipedreamProfileMappings[step.qualified_name];
    } else if (step.type === 'custom_server') {
      const stepData = setupData[step.id] || {};
      return step.required_fields?.every(field => {
        const value = stepData[field.key];
        return value && value.trim().length > 0;
      }) || false;
    }
    
    return false;
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

    setupSteps.forEach(step => {
      if (step.type === 'pipedream_profile') {
        const profileId = pipedreamProfileMappings[step.qualified_name];
        if (profileId) {
          customMcpConfigs[step.qualified_name] = {
            url: 'https://remote.mcp.pipedream.net',
            headers: {
              'x-pd-app-slug': step.app_slug,
            },
            profile_id: profileId
          };
        }
      }
    });
    
    const regularProfileMappings = { ...profileMappings };
    await onInstall(item, instanceName, regularProfileMappings, customMcpConfigs);
  };

  const canInstall = () => {
    if (!item) return false;
    if (!instanceName.trim()) return false;
    
    const regularRequirements = item.mcp_requirements?.filter(req => 
      !req.custom_type
    ) || [];
    const missingProfileMappings = regularRequirements.filter(req => !profileMappings[req.qualified_name]);
    if (missingProfileMappings.length > 0) return false;
    
    const pipedreamRequirements = item.mcp_requirements?.filter(req => 
      req.custom_type === 'pipedream'
    ) || [];
    const missingPipedreamMappings = pipedreamRequirements.filter(req => !pipedreamProfileMappings[req.qualified_name]);
    if (missingPipedreamMappings.length > 0) return false;
    
    if (setupSteps.length > 0 && currentStep < setupSteps.length) return false;
    return true;
  };

  if (!item) return null;

  const currentStepData = setupSteps[currentStep];

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
              <p className="text-sm text-muted-foreground">Checking requirements...</p>
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
                      <h3 className="font-semibold text-base">{currentStepData.title}</h3>
                      {currentStepData.custom_type && (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                          {currentStepData.custom_type?.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {currentStepData.type === 'credential_profile' ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <CredentialProfileSelector
                            mcpQualifiedName={currentStepData.qualified_name}
                            mcpDisplayName={currentStepData.service_name}
                            selectedProfileId={profileMappings[currentStepData.qualified_name]}
                            onProfileSelect={(profileId, profile) => {
                              handleProfileSelect(currentStepData.qualified_name, profileId);
                              if (profile && !profileMappings[currentStepData.qualified_name]) {
                                refreshRequirements();
                              }
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleCreateNewProfile(currentStepData.qualified_name, currentStepData.service_name)}
                        >
                          <Plus className="h-4 w-4" />
                          Create New Profile
                        </Button>
                      </div>
                    </div>
                  ) : currentStepData.type === 'pipedream_profile' ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <PipedreamCredentialProfileSelector
                          appSlug={currentStepData.app_slug || ''}
                          appName={currentStepData.service_name}
                          selectedProfileId={pipedreamProfileMappings[currentStepData.qualified_name]}
                          onProfileSelect={(profileId) => {
                            handlePipedreamProfileSelect(currentStepData.qualified_name, profileId);
                          }}
                        />
                      </div>
                      {!pipedreamProfiles?.some(p => 
                        p.app_slug === currentStepData.app_slug && p.is_connected
                      ) && (
                        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                          <p>No connected Pipedream profiles found for {currentStepData.service_name}.</p>
                          <p className="mt-1">Create and connect a profile in the credentials section first.</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    currentStepData.required_fields?.map((field) => (
                      <div key={field.key} className="space-y-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          {field.label}
                        </label>
                        <Input
                          type={field.type}
                          placeholder={field.placeholder}
                          value={setupData[currentStepData.id]?.[field.key] || ''}
                          onChange={(e) => handleFieldChange(currentStepData.id, field.key, e.target.value)}
                          className="h-11"
                        />
                        {field.description && (
                          <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                      </div>
                    ))
                  )}
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
        </DialogFooter>
      </DialogContent>

      {/* Create Profile Dialog */}
      <Dialog open={showCreateProfileDialog} onOpenChange={setShowCreateProfileDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Create Credential Profile
            </DialogTitle>
            <DialogDescription>
              Create a new credential profile for <strong>{createProfileForDisplayName}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 flex-1 overflow-y-auto">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="profile_name">Profile Name *</Label>
                  <Input
                    id="profile_name"
                    value={formData.profile_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, profile_name: e.target.value }))}
                    placeholder="Enter a name for this profile"
                  />
                  <p className="text-xs text-muted-foreground">
                    This helps you identify different configurations for the same MCP server
                  </p>
                </div>
              </div>

              {Object.keys(getConfigProperties()).length > 0 ? (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Connection Settings
                  </h3>
                  {Object.entries(getConfigProperties()).map(([key, schema]: [string, any]) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={key}>
                        {schema.title || key}
                        {isFieldRequired(key) && (
                          <span className="text-destructive ml-1">*</span>
                        )}
                      </Label>
                      <Input
                        id={key}
                        type={schema.format === 'password' ? 'password' : 'text'}
                        placeholder={schema.description || `Enter ${key}`}
                        value={formData.config[key] || ''}
                        onChange={(e) => handleConfigChange(key, e.target.value)}
                      />
                      {schema.description && (
                        <p className="text-xs text-muted-foreground">{schema.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <Alert>
                  <Key className="h-4 w-4" />
                  <AlertDescription>
                    This MCP server doesn't require any API credentials to use.
                  </AlertDescription>
                </Alert>
              )}

              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Your credentials will be encrypted and stored securely. You can create multiple profiles for the same MCP server to handle different use cases.
                </AlertDescription>
              </Alert>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateProfileDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateSubmit}
              disabled={!formData.profile_name.trim() || createProfileMutation.isPending}
            >
              {createProfileMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Profile
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default function AgentsPage() {
  const { enabled: customAgentsEnabled, loading: agentsFlagLoading } = useFeatureFlag("custom_agents");
  const { enabled: agentMarketplaceEnabled, loading: marketplaceFlagLoading } = useFeatureFlag("agent_marketplace");
  const router = useRouter();
  const flagLoading = agentsFlagLoading || marketplaceFlagLoading;

  useEffect(() => {
    if (!flagLoading && !customAgentsEnabled) {
      router.replace("/dashboard");
    }
  }, [flagLoading, customAgentsEnabled, router]);

  const [activeTab, setActiveTab] = useState("my-agents");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  // My Agents state
  const [agentsPage, setAgentsPage] = useState(1);
  const [agentsSearchQuery, setAgentsSearchQuery] = useState('');
  const [agentsSortBy, setAgentsSortBy] = useState<AgentSortOption>('created_at');
  const [agentsSortOrder, setAgentsSortOrder] = useState<SortOrder>('desc');
  const [agentsFilters, setAgentsFilters] = useState<FilterOptions>({
    hasDefaultAgent: false,
    hasMcpTools: false,
    hasAgentpressTools: false,
    selectedTools: []
  });

  // Marketplace state
  const [marketplacePage, setMarketplacePage] = useState(1);
  const [marketplaceSearchQuery, setMarketplaceSearchQuery] = useState('');
  const [marketplaceSelectedTags, setMarketplaceSelectedTags] = useState<string[]>([]);
  const [marketplaceSortBy, setMarketplaceSortBy] = useState<MarketplaceSortOption>('newest');
  const [installingItemId, setInstallingItemId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MarketplaceTemplate | null>(null);
  const [showInstallDialog, setShowInstallDialog] = useState(false);

  // Templates state
  const [templatesActioningId, setTemplatesActioningId] = useState<string | null>(null);
  const [publishDialog, setPublishDialog] = useState<PublishDialogData | null>(null);
  const [publishTags, setPublishTags] = useState('');

  // Build query parameters for agents
  const agentsQueryParams: AgentsParams = useMemo(() => {
    const params: AgentsParams = {
      page: agentsPage,
      limit: 20,
      search: agentsSearchQuery || undefined,
      sort_by: agentsSortBy,
      sort_order: agentsSortOrder,
    };

    if (agentsFilters.hasDefaultAgent) {
      params.has_default = true;
    }
    if (agentsFilters.hasMcpTools) {
      params.has_mcp_tools = true;
    }
    if (agentsFilters.hasAgentpressTools) {
      params.has_agentpress_tools = true;
    }
    if (agentsFilters.selectedTools.length > 0) {
      params.tools = agentsFilters.selectedTools.join(',');
    }

    return params;
  }, [agentsPage, agentsSearchQuery, agentsSortBy, agentsSortOrder, agentsFilters]);

  // Build query parameters for marketplace
  const marketplaceQueryParams = useMemo(() => ({
    limit: 20,
    offset: (marketplacePage - 1) * 20,
    search: marketplaceSearchQuery || undefined,
    tags: marketplaceSelectedTags.length > 0 ? marketplaceSelectedTags.join(',') : undefined,
  }), [marketplacePage, marketplaceSearchQuery, marketplaceSelectedTags]);

  // API hooks
  const { data: agentsResponse, isLoading: agentsLoading, error: agentsError, refetch: loadAgents } = useAgents(agentsQueryParams);
  const { data: marketplaceTemplates, isLoading: marketplaceLoading } = useMarketplaceTemplates(marketplaceQueryParams);
  const { data: myTemplates, isLoading: templatesLoading, error: templatesError } = useMyTemplates();
  
  const updateAgentMutation = useUpdateAgent();
  const deleteAgentMutation = useDeleteAgent();
  const createNewAgentMutation = useCreateNewAgent();
  const { optimisticallyUpdateAgent, revertOptimisticUpdate } = useOptimisticAgentUpdate();
  const installTemplateMutation = useInstallTemplate();
  const unpublishMutation = useUnpublishTemplate();
  const publishMutation = usePublishTemplate();

  const agents = agentsResponse?.agents || [];
  const agentsPagination = agentsResponse?.pagination;

  // Transform marketplace templates data
  const { kortixTeamItems, communityItems } = useMemo(() => {
    const kortixItems: MarketplaceTemplate[] = [];
    const communityItems: MarketplaceTemplate[] = [];

    if (marketplaceTemplates) {
      marketplaceTemplates.forEach(template => {
        const item: MarketplaceTemplate = {
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
          is_kortix_team: template.is_kortix_team,
          mcp_requirements: template.mcp_requirements,
          metadata: template.metadata,
        };

        if (template.is_kortix_team) {
          kortixItems.push(item);
        } else {
          communityItems.push(item);
        }
      });
    }

    const sortItems = (items: MarketplaceTemplate[]) => {
      return items.sort((a, b) => {
        switch (marketplaceSortBy) {
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
    };

    return {
      kortixTeamItems: sortItems(kortixItems),
      communityItems: sortItems(communityItems)
    };
  }, [marketplaceTemplates, marketplaceSortBy]);

  const allMarketplaceItems = useMemo(() => {
    return [...kortixTeamItems, ...communityItems];
  }, [kortixTeamItems, communityItems]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    allMarketplaceItems.forEach(item => {
      item.tags?.forEach(tag => tags.add(tag));
    });
    return Array.from(tags);
  }, [allMarketplaceItems]);

  const allTools = useMemo(() => {
    const toolsSet = new Set<string>();
    agents.forEach(agent => {
      agent.configured_mcps?.forEach(mcp => toolsSet.add(`mcp:${mcp.name}`));
      Object.entries(agent.agentpress_tools || {}).forEach(([tool, toolData]) => {
        if (toolData && typeof toolData === 'object' && 'enabled' in toolData && toolData.enabled) {
          toolsSet.add(`agentpress:${tool}`);
        }
      });
    });
    return Array.from(toolsSet).sort();
  }, [agents]);

  const agentsActiveFiltersCount = useMemo(() => {
    let count = 0;
    if (agentsFilters.hasDefaultAgent) count++;
    if (agentsFilters.hasMcpTools) count++;
    if (agentsFilters.hasAgentpressTools) count++;
    count += agentsFilters.selectedTools.length;
    return count;
  }, [agentsFilters]);

  const clearAgentsFilters = () => {
    setAgentsSearchQuery('');
    setAgentsFilters({
      hasDefaultAgent: false,
      hasMcpTools: false,
      hasAgentpressTools: false,
      selectedTools: []
    });
    setAgentsPage(1);
  };

  const clearMarketplaceFilters = () => {
    setMarketplaceSearchQuery('');
    setMarketplaceSelectedTags([]);
    setMarketplacePage(1);
  };

  // Reset pages when search or filters change
  useEffect(() => {
    setAgentsPage(1);
  }, [agentsSearchQuery, agentsSortBy, agentsSortOrder, agentsFilters]);

  useEffect(() => {
    setMarketplacePage(1);
  }, [marketplaceSearchQuery, marketplaceSelectedTags, marketplaceSortBy]);

  // Agent handlers
  const handleDeleteAgent = async (agentId: string) => {
    try {
      await deleteAgentMutation.mutateAsync(agentId);
    } catch (error) {
      console.error('Error deleting agent:', error);
    }
  };

  const handleToggleDefault = async (agentId: string, currentDefault: boolean) => {
    optimisticallyUpdateAgent(agentId, { is_default: !currentDefault });
    try {
      await updateAgentMutation.mutateAsync({
        agentId,
        is_default: !currentDefault
      });
    } catch (error) {
      revertOptimisticUpdate(agentId);
      console.error('Error updating agent:', error);
    }
  };

  const handleEditAgent = (agentId: string) => {
    setEditingAgentId(agentId);
    setEditDialogOpen(true);
  };

  const handleCreateNewAgent = () => {
    createNewAgentMutation.mutate();
  };

  // Marketplace handlers
  const handleInstallClick = (item: MarketplaceTemplate, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedItem(item);
    setShowInstallDialog(true);
  };

  const handleInstall = async (
    item: MarketplaceTemplate, 
    instanceName?: string, 
    profileMappings?: Record<string, string>, 
    customMcpConfigs?: Record<string, Record<string, any>>
  ) => {
    setInstallingItemId(item.id);
    
    try {
      if (!instanceName || instanceName.trim() === '') {
        toast.error('Please provide a name for the agent');
        return;
      }

      const regularRequirements = item.mcp_requirements?.filter(req => 
        !req.custom_type
      ) || [];
      const missingProfiles = regularRequirements.filter(req => 
        !profileMappings || !profileMappings[req.qualified_name] || profileMappings[req.qualified_name].trim() === ''
      );
      
      if (missingProfiles.length > 0) {
        const missingNames = missingProfiles.map(req => req.display_name).join(', ');
        toast.error(`Please select credential profiles for: ${missingNames}`);
        return;
      }

      const customRequirements = item.mcp_requirements?.filter(req => 
        req.custom_type && req.custom_type !== 'pipedream'
      ) || [];
      const missingCustomConfigs = customRequirements.filter(req => 
        !customMcpConfigs || !customMcpConfigs[req.qualified_name] || 
        req.required_config.some(field => !customMcpConfigs[req.qualified_name][field]?.trim())
      );
      
      if (missingCustomConfigs.length > 0) {
        const missingNames = missingCustomConfigs.map(req => req.display_name).join(', ');
        toast.error(`Please provide all required configuration for: ${missingNames}`);
        return;
      }

      // Check if all Pipedream services have custom MCP configs
      const pipedreamRequirements = item.mcp_requirements?.filter(req => 
        req.custom_type === 'pipedream'
      ) || [];
      const missingPipedreamConfigs = pipedreamRequirements.filter(req => 
        !customMcpConfigs || !customMcpConfigs[req.qualified_name] || 
        !customMcpConfigs[req.qualified_name].profile_id
      );
      
      if (missingPipedreamConfigs.length > 0) {
        const missingNames = missingPipedreamConfigs.map(req => req.display_name).join(', ');
        toast.error(`Please select Pipedream profiles for: ${missingNames}`);
        return;
      }

      const result = await installTemplateMutation.mutateAsync({
        template_id: item.template_id,
        instance_name: instanceName,
        profile_mappings: profileMappings,
        custom_mcp_configs: customMcpConfigs
      });

      console.log('Profile mappings being sent:', profileMappings);
      console.log('Custom MCP configs being sent:', customMcpConfigs);
      console.log('Item MCP requirements:', item.mcp_requirements);

      if (result.status === 'installed') {
        toast.success(`Agent "${instanceName}" installed successfully!`);
        setShowInstallDialog(false);
        setActiveTab('my-agents');
      } else if (result.status === 'configs_required') {
        toast.error('Please provide all required configurations');
        return;
      } else {
        toast.error('Unexpected response from server. Please try again.');
        return;
      }
    } catch (error: any) {
      console.error('Installation error:', error);
      
      // Handle specific error types
      if (error.message?.includes('already in your library')) {
        toast.error('This agent is already in your library');
      } else if (error.message?.includes('Credential profile not found')) {
        toast.error('One or more selected credential profiles could not be found. Please refresh and try again.');
      } else if (error.message?.includes('Missing credential profile')) {
        toast.error('Please select credential profiles for all required services');
      } else if (error.message?.includes('Invalid credential profile')) {
        toast.error('One or more selected credential profiles are invalid. Please select valid profiles.');
      } else if (error.message?.includes('inactive')) {
        toast.error('One or more selected credential profiles are inactive. Please select active profiles.');
      } else if (error.message?.includes('Template not found')) {
        toast.error('This agent template is no longer available');
      } else if (error.message?.includes('Access denied')) {
        toast.error('You do not have permission to install this agent');
      } else {
        toast.error(error.message || 'Failed to install agent. Please try again.');
      }
    } finally {
      setInstallingItemId(null);
    }
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

  // Template handlers
  const handleUnpublish = async (templateId: string, templateName: string) => {
    try {
      setTemplatesActioningId(templateId);
      await unpublishMutation.mutateAsync(templateId);
      toast.success(`${templateName} has been unpublished from the marketplace`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to unpublish template');
    } finally {
      setTemplatesActioningId(null);
    }
  };

  const openPublishDialog = (template: any) => {
    setPublishDialog({
      templateId: template.template_id,
      templateName: template.name,
      currentTags: template.tags || []
    });
    setPublishTags((template.tags || []).join(', '));
  };

  const handlePublish = async () => {
    if (!publishDialog) return;

    try {
      setTemplatesActioningId(publishDialog.templateId);
      
      const tags = publishTags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      await publishMutation.mutateAsync({
        template_id: publishDialog.templateId,
        tags: tags.length > 0 ? tags : undefined
      });
      
      toast.success(`${publishDialog.templateName} has been published to the marketplace`);
      setPublishDialog(null);
      setPublishTags('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to publish template');
    } finally {
      setTemplatesActioningId(null);
    }
  };

  const getTemplateStyling = (template: any) => {
    if (template.avatar && template.avatar_color) {
      return {
        avatar: template.avatar,
        color: template.avatar_color,
      };
    }
    return getAgentAvatar(template.template_id);
  };

  if (flagLoading) {
    return (
      <div className="container max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Agents
            </h1>
            <p className="text-md text-muted-foreground max-w-2xl">
              Create, manage, and discover AI agents
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="p-2 bg-neutral-100 dark:bg-sidebar rounded-2xl overflow-hidden group">
              <div className="h-24 flex items-center justify-center relative bg-gradient-to-br from-opacity-90 to-opacity-100">
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
              <div className="space-y-2 mt-4 mb-4">
                <Skeleton className="h-6 w-32 rounded" />
                <Skeleton className="h-4 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!customAgentsEnabled) {
    return null;
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-8">
        {/* Header */}
        <div className="w-full space-y-4 bg-gradient-to-b from-primary/10 to-primary/5 border rounded-xl h-60 flex items-center justify-center">
          <div className="space-y-4">
            <div className="space-y-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <Bot className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Agents
                </h1>
              </div>
              <p className="text-md text-muted-foreground max-w-2xl">
                Create, manage, and discover powerful AI agents
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="my-agents" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              My Agents
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Marketplace
            </TabsTrigger>
            <TabsTrigger value="my-templates" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              My Templates
            </TabsTrigger>
          </TabsList>

          {/* My Agents Tab */}
          <TabsContent value="my-agents" className="space-y-6">
            <SearchAndFilters
              searchQuery={agentsSearchQuery}
              setSearchQuery={setAgentsSearchQuery}
              sortBy={agentsSortBy}
              setSortBy={setAgentsSortBy}
              sortOrder={agentsSortOrder}
              setSortOrder={setAgentsSortOrder}
              filters={agentsFilters}
              setFilters={setAgentsFilters}
              activeFiltersCount={agentsActiveFiltersCount}
              clearFilters={clearAgentsFilters}
              viewMode={viewMode}
              setViewMode={setViewMode}
              allTools={allTools}
            />

            <div className="flex items-center justify-between">
              <ResultsInfo
                isLoading={agentsLoading}
                totalAgents={agentsPagination?.total || 0}
                filteredCount={agents.length}
                currentPage={agentsPagination?.page || 1}
                totalPages={agentsPagination?.pages || 1}
              />
              <Button onClick={handleCreateNewAgent} className="shrink-0">
                <Plus className="h-4 w-4 mr-2" />
                Create Agent
              </Button>
            </div>

            {agentsLoading ? (
              <LoadingState viewMode={viewMode} />
            ) : agents.length === 0 ? (
              <EmptyState
                hasAgents={(agentsPagination?.total || 0) > 0}
                onCreateAgent={handleCreateNewAgent}
                onClearFilters={clearAgentsFilters}
              />
            ) : (
              <AgentsGrid
                agents={agents}
                onEditAgent={handleEditAgent}
                onDeleteAgent={handleDeleteAgent}
                onToggleDefault={handleToggleDefault}
                deleteAgentMutation={deleteAgentMutation}
              />
            )}

            {agentsPagination && agentsPagination.pages > 1 && (
              <Pagination
                currentPage={agentsPagination.page}
                totalPages={agentsPagination.pages}
                onPageChange={setAgentsPage}
                isLoading={agentsLoading}
              />
            )}
          </TabsContent>

          {/* Marketplace Tab */}
          <TabsContent value="marketplace" className="space-y-6">
            <div className="flex flex-col gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search agents..."
                  value={marketplaceSearchQuery}
                  onChange={(e) => setMarketplaceSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              {marketplaceLoading ? (
                "Loading marketplace..."
              ) : (
                `${allMarketplaceItems.length} template${allMarketplaceItems.length !== 1 ? 's' : ''} found`
              )}
            </div>

            {marketplaceLoading ? (
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
            ) : allMarketplaceItems.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {marketplaceSearchQuery || marketplaceSelectedTags.length > 0
                    ? "No templates found matching your criteria. Try adjusting your search or filters."
                    : "No agent templates are currently available in the marketplace."}
                </p>
              </div>
            ) : (
              <div className="space-y-12">
                {kortixTeamItems.length > 0 && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/20">
                        <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">Agents from Kortix Team</h2>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {kortixTeamItems.map((item) => {
                        const { avatar, color } = getItemStyling(item);
                        return (
                          <div 
                            key={item.id} 
                            className="bg-neutral-100 dark:bg-sidebar border border-border rounded-2xl overflow-hidden hover:bg-muted/50 transition-all duration-200 cursor-pointer group flex flex-col h-full"
                            onClick={() => handleInstallClick(item)}
                          >
                            <div className="p-4">
                              <div className={`h-12 w-12 flex items-center justify-center rounded-lg`} style={{ backgroundColor: color }}>
                                <div className="text-2xl">
                                  {avatar}
                                </div>
                              </div>
                            </div>
                            <div className="p-4 -mt-4 flex flex-col flex-1">
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
                              <div className="mb-4 w-full flex justify-between">
                                <div className="space-y-1">
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
                                <div className="flex items-center gap-1">
                                  <Download className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground text-xs font-medium">{item.download_count}</span>
                                </div>
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
                                    Add to Library
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {communityItems.length > 0 && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                        <User className="h-4 w-4 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">Agents from Community</h2>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {communityItems.map((item) => {
                        const { avatar, color } = getItemStyling(item);
                        return (
                          <div 
                            key={item.id} 
                            className="bg-neutral-100 dark:bg-sidebar border border-border rounded-2xl overflow-hidden hover:bg-muted/50 transition-all duration-200 cursor-pointer group flex flex-col h-full"
                            onClick={() => handleInstallClick(item)}
                          >
                            <div className="p-4">
                              <div className={`h-12 w-12 flex items-center justify-center rounded-lg`} style={{ backgroundColor: color }}>
                                <div className="text-2xl">
                                  {avatar}
                                </div>
                              </div>
                            </div>
                            <div className="p-4 -mt-4 flex flex-col flex-1">
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
                              <div className="mb-4 w-full flex justify-between">
                                <div className="space-y-1">
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
                                <div className="flex items-center gap-1">
                                  <Download className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground text-xs font-medium">{item.download_count}</span>
                                </div>
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
                                    Add to Library
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* My Templates Tab */}
          <TabsContent value="my-templates" className="space-y-6">
            {templatesError ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Failed to load your templates. Please try again later.
                </AlertDescription>
              </Alert>
            ) : templatesLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-neutral-100 dark:bg-sidebar border border-border rounded-2xl overflow-hidden">
                    <Skeleton className="h-32 w-full" />
                    <div className="p-4 space-y-3">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : myTemplates?.length === 0 ? (
              <div className="text-center py-12">
                <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Globe className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No templates yet</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Create your first secure agent template to share with the community while keeping your credentials safe.
                </p>
                <Button onClick={() => setActiveTab('my-agents')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Agent
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {myTemplates?.map((template) => {
                  const { avatar, color } = getTemplateStyling(template);
                  const isActioning = templatesActioningId === template.template_id;
                  
                  return (
                    <div 
                      key={template.template_id} 
                      className="bg-neutral-100 dark:bg-sidebar border border-border rounded-2xl overflow-hidden hover:bg-muted/50 transition-all duration-200 flex flex-col h-full"
                    >
                      <div className={`h-32 flex items-center justify-center relative`} style={{ backgroundColor: color }}>
                        <div className="text-4xl">
                          {avatar}
                        </div>
                        <div className="absolute top-2 right-2">
                          {template.is_public ? (
                            <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
                              <Globe className="h-3 w-3 mr-1" />
                              Public
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-gray-100 text-gray-700 border-gray-200">
                              <GlobeLock className="h-3 w-3 mr-1" />
                              Private
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="p-4 flex flex-col flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-foreground font-medium text-lg line-clamp-1 flex-1">
                            {template.name}
                          </h3>
                          {template.metadata?.source_version_name && (
                            <Badge variant="secondary" className="text-xs shrink-0">
                              <GitBranch className="h-3 w-3" />
                              {template.metadata.source_version_name}
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                          {template.description || 'No description available'}
                        </p>
                        
                        {template.tags && template.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {template.tags.slice(0, 2).map(tag => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {template.tags.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{template.tags.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}

                        <div className="space-y-1 mb-4">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>Created {new Date(template.created_at).toLocaleDateString()}</span>
                          </div>
                          {template.is_public && template.marketplace_published_at && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Globe className="h-3 w-3" />
                              <span>Published {new Date(template.marketplace_published_at).toLocaleDateString()}</span>
                            </div>
                          )}
                          {template.is_public && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Download className="h-3 w-3" />
                              <span>{template.download_count} downloads</span>
                            </div>
                          )}
                        </div>

                        <div className="mt-auto space-y-2">
                          {template.is_public ? (
                            <>
                              <Button
                                onClick={() => handleUnpublish(template.template_id, template.name)}
                                disabled={isActioning}
                                variant="outline"
                                className="w-full"
                                size="sm"
                              >
                                {isActioning ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin mr-2" />
                                    Unpublishing...
                                  </>
                                ) : (
                                  <>
                                    <GlobeLock className="h-3 w-3 mr-2" />
                                    Make Private
                                  </>
                                )}
                              </Button>
                              <Button
                                onClick={() => setActiveTab('marketplace')}
                                variant="ghost"
                                size="sm"
                                className="w-full"
                              >
                                <Eye className="h-3 w-3 mr-2" />
                                View in Marketplace
                              </Button>
                            </>
                          ) : (
                            <Button
                              onClick={() => openPublishDialog(template)}
                              disabled={isActioning}
                              variant="default"
                              className="w-full"
                              size="sm"
                            >
                              {isActioning ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin mr-2" />
                                  Publishing...
                                </>
                              ) : (
                                <>
                                  <Globe className="h-3 w-3 mr-2" />
                                  Publish to Marketplace
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Publish Dialog */}
        <Dialog open={!!publishDialog} onOpenChange={() => setPublishDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Publish Template to Marketplace</DialogTitle>
              <DialogDescription>
                Make "{publishDialog?.templateName}" available for the community to discover and install.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="tags">Tags (optional)</Label>
                <Input
                  id="tags"
                  placeholder="automation, productivity, data-analysis"
                  value={publishTags}
                  onChange={(e) => setPublishTags(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Separate tags with commas to help users discover your template
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setPublishDialog(null)}
                disabled={!!templatesActioningId}
              >
                Cancel
              </Button>
              <Button
                onClick={handlePublish}
                disabled={!!templatesActioningId}
              >
                {templatesActioningId ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4 mr-2" />
                    Publish Template
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Marketplace Dialogs */}
        <InstallDialog
          item={selectedItem}
          open={showInstallDialog}
          onOpenChange={setShowInstallDialog}
          onInstall={handleInstall}
          isInstalling={installingItemId === selectedItem?.id}
        />
      </div>
    </div>
  );
}