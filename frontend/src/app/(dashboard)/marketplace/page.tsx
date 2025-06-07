'use client';

import React, { useState, useMemo } from 'react';
import { Search, Download, Star, Calendar, User, Tags, TrendingUp, Globe, Shield, AlertTriangle, CheckCircle, Loader2, Settings, X, Wrench, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
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
  // Legacy agent fields
  agent_id?: string;
  // Secure template fields
  template_id?: string;
  mcp_requirements?: Array<{
    qualified_name: string;
    display_name: string;
    enabled_tools?: string[];
  }>;
}

interface InstallDialogProps {
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

const InstallDialog: React.FC<InstallDialogProps> = ({ 
  item, 
  open, 
  onOpenChange, 
  onInstall, 
  isInstalling,
  credentialStatus
}) => {
  const [instanceName, setInstanceName] = useState('');

  React.useEffect(() => {
    if (item) {
      if (item.type === 'secure') {
        setInstanceName(`${item.name} (My Copy)`);
      } else {
        setInstanceName('');
      }
    }
  }, [item]);

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {item.type === 'secure' ? 'Install Secure Template' : 'Add Agent to Library'}
            {item.type === 'secure' && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <Shield className="h-3 w-3 mr-1" />
                Secure
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {item.type === 'secure' 
              ? `Install "${item.name}" as a secure agent instance`
              : `Add "${item.name}" to your agent library`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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

          {item.type === 'secure' && item.mcp_requirements && item.mcp_requirements.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Required MCP Services</label>
              <div className="space-y-2">
                {item.mcp_requirements.map((req) => (
                  <div key={req.qualified_name} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <p className="text-sm font-medium">{req.display_name}</p>
                      <p className="text-xs text-muted-foreground">{req.qualified_name}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {req.enabled_tools?.length || 0} tools
                    </Badge>
                  </div>
                ))}
              </div>
              
              {credentialStatus && !credentialStatus.hasAllCredentials && (
                <Alert className='border-destructive/20 bg-destructive/5 text-destructive'>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs text-destructive">
                    You're missing credentials for {credentialStatus.missingCount} of {credentialStatus.totalRequired} required services.
                    <Link href="/settings/credentials" className="ml-1 underline">
                      Set them up first →
                    </Link>
                  </AlertDescription>
                </Alert>
              )}
              
              {credentialStatus && credentialStatus.hasAllCredentials && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    All required credentials are configured. This agent will use your encrypted API keys.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {item.type === 'legacy' && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                This is a legacy agent that may contain embedded API keys. Consider using secure templates for better security.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => onInstall(item, instanceName)}
            disabled={
              isInstalling || 
              (item.type === 'secure' && !instanceName.trim()) ||
              (item.type === 'secure' && credentialStatus && !credentialStatus.hasAllCredentials)
            }
          >
            {isInstalling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {item.type === 'secure' ? 'Installing...' : 'Adding...'}
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                {item.type === 'secure' ? 'Install Agent' : 'Add to Library'}
              </>
            )}
          </Button>
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

const AgentDetailsSheet: React.FC<AgentDetailsProps> = ({ 
  item, 
  open, 
  onOpenChange, 
  onInstall, 
  isInstalling,
  credentialStatus
}) => {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [instanceName, setInstanceName] = useState('');

  React.useEffect(() => {
    if (item) {
      if (item.type === 'secure') {
        setInstanceName(`${item.name} (My Copy)`);
      } else {
        setInstanceName('');
      }
    }
  }, [item]);

  if (!item) return null;
  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto flex flex-col">
          <SheetHeader>
            <SheetTitle>Agent Details</SheetTitle>
            <SheetDescription>
              View details and install this {item.type === 'secure' ? 'secure template' : 'agent'}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 mt-6">
            <AgentDetailsContent
              item={item}
              instanceName={instanceName}
              setInstanceName={setInstanceName}
            />
          </div>
          <div className="border-t p-4 mt-4">
            {credentialStatus && !credentialStatus.hasAllCredentials && (
              <Alert className="border-destructive/20 bg-destructive/5 text-destructive mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm text-destructive">
                  You're missing credentials for {credentialStatus.missingCount} of {credentialStatus.totalRequired} required services.
                  <Link href="/settings/credentials" className="ml-1 underline">
                    Set them up first →
                  </Link>
                </AlertDescription>
              </Alert>
            )}
            <Button 
              onClick={() => onInstall(item, instanceName)}
              disabled={
                isInstalling || 
                (item.type === 'secure' && !instanceName.trim()) ||
                (item.type === 'secure' && credentialStatus && !credentialStatus.hasAllCredentials)
              }
              className="w-full"
              size="lg"
            >
              {isInstalling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {item.type === 'secure' ? 'Installing...' : 'Adding...'}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  {item.type === 'secure' ? 'Install Agent' : 'Add to Library'}
                </>
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-screen flex flex-col">
        <DrawerHeader>
          <DrawerTitle>Agent Details</DrawerTitle>
          <DrawerDescription>
            View details and install this {item.type === 'secure' ? 'secure template' : 'agent'}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-4">
          <AgentDetailsContent
            item={item}
            instanceName={instanceName}
            setInstanceName={setInstanceName}
          />
        </div>
        <div className="border-t p-4 mt-4">
          {credentialStatus && !credentialStatus.hasAllCredentials && (
            <Alert className="border-destructive/20 bg-destructive/5 text-destructive mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm text-destructive">
                You're missing credentials for {credentialStatus.missingCount} of {credentialStatus.totalRequired} required services.
                <Link href="/settings/credentials" className="ml-1 underline">
                  Set them up first →
                </Link>
              </AlertDescription>
            </Alert>
          )}
          <Button 
            onClick={() => onInstall(item, instanceName)}
            disabled={
              isInstalling || 
              (item.type === 'secure' && !instanceName.trim()) ||
              (item.type === 'secure' && credentialStatus && !credentialStatus.hasAllCredentials)
            }
            className="w-full"
            size="lg"
          >
            {isInstalling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {item.type === 'secure' ? 'Installing...' : 'Adding...'}
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                {item.type === 'secure' ? 'Install Agent' : 'Add to Library'}
              </>
            )}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
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
    const requiredCreds = item.mcp_requirements.map(req => req.qualified_name);
    const missingCreds = requiredCreds.filter(cred => !userCredNames.has(cred));
    
    return {
      hasAllCredentials: missingCreds.length === 0,
      missingCount: missingCreds.length,
      totalRequired: requiredCreds.length
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

  const handleInstall = async (item: UnifiedMarketplaceItem, instanceName?: string) => {
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
          instance_name: instanceName
        });

        if (result.status === 'installed') {
          toast.success('Agent installed successfully!');
          setShowInstallDialog(false);
          setShowDetailsSheet(false);
        } else if (result.status === 'credentials_required') {
          setMissingCredentials(result.missing_credentials || []);
          setShowInstallDialog(false);
          setShowDetailsSheet(false);
          setShowMissingCredsDialog(true);
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

      <AgentDetailsSheet
        item={selectedItem}
        open={showDetailsSheet}
        onOpenChange={setShowDetailsSheet}
        onInstall={handleInstall}
        isInstalling={installingItemId === selectedItem?.id}
        credentialStatus={selectedItem ? getItemCredentialStatus(selectedItem) : undefined}
      />

      <InstallDialog
        item={selectedItem}
        open={showInstallDialog}
        onOpenChange={setShowInstallDialog}
        onInstall={handleInstall}
        isInstalling={installingItemId === selectedItem?.id}
        credentialStatus={selectedItem ? getItemCredentialStatus(selectedItem) : undefined}
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