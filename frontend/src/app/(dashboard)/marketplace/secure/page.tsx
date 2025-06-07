'use client';

import React, { useState, useMemo } from 'react';
import { Search, Download, Star, Calendar, User, Tags, TrendingUp, Shield, AlertTriangle, CheckCircle, Loader2, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { getAgentAvatar } from '../../agents/_utils/get-agent-style';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination } from '../../agents/_components/pagination';
import { 
  useMarketplaceTemplates, 
  useInstallTemplate,
  useUserCredentials,
  type AgentTemplate,
  type InstallationResponse 
} from '@/hooks/react-query/secure-mcp/use-secure-mcp';
import Link from 'next/link';

interface InstallDialogProps {
  template: AgentTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (templateId: string, instanceName?: string) => void;
  isInstalling: boolean;
}

const InstallDialog: React.FC<InstallDialogProps> = ({ 
  template, 
  open, 
  onOpenChange, 
  onInstall, 
  isInstalling 
}) => {
  const [instanceName, setInstanceName] = useState('');

  React.useEffect(() => {
    if (template) {
      setInstanceName(`${template.name} (My Copy)`);
    }
  }, [template]);

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Install Agent Template</DialogTitle>
          <DialogDescription>
            Install "{template.name}" to your agent library
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Agent Name</label>
            <Input
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              placeholder="Enter a name for your agent"
            />
          </div>

          {template.mcp_requirements.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Required MCP Services</label>
              <div className="space-y-2">
                {template.mcp_requirements.map((req) => (
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
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  This agent requires MCP credentials. If you haven't set them up yet, you'll be prompted to configure them.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => onInstall(template.template_id, instanceName)}
            disabled={!instanceName.trim() || isInstalling}
          >
            {isInstalling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Installing...
              </>
            ) : (
              'Install Agent'
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
              Set Up Credentials
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function SecureMarketplacePage() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [installingTemplateId, setInstallingTemplateId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [showMissingCredsDialog, setShowMissingCredsDialog] = useState(false);
  const [missingCredentials, setMissingCredentials] = useState<any[]>([]);

  const queryParams = useMemo(() => ({
    limit: 20,
    offset: (page - 1) * 20,
    search: searchQuery || undefined,
    tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined,
  }), [page, searchQuery, selectedTags]);

  const { data: templates, isLoading, error } = useMarketplaceTemplates(queryParams);
  console.log(templates);
  const { data: userCredentials } = useUserCredentials();
  const installTemplateMutation = useInstallTemplate();

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedTags]);

  const handleInstallClick = (template: AgentTemplate) => {
    setSelectedTemplate(template);
    setShowInstallDialog(true);
  };

  const handleInstall = async (templateId: string, instanceName?: string) => {
    setInstallingTemplateId(templateId);
    try {
      const result = await installTemplateMutation.mutateAsync({
        template_id: templateId,
        instance_name: instanceName
      });

      if (result.status === 'installed') {
        toast.success('Agent installed successfully!');
        setShowInstallDialog(false);
      } else if (result.status === 'credentials_required') {
        setMissingCredentials(result.missing_credentials || []);
        setShowInstallDialog(false);
        setShowMissingCredsDialog(true);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to install agent');
    } finally {
      setInstallingTemplateId(null);
    }
  };

  const handleTagFilter = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const getTemplateStyling = (template: AgentTemplate) => {
    if (template.avatar && template.avatar_color) {
      return {
        avatar: template.avatar,
        color: template.avatar_color,
      };
    }
    return getAgentAvatar(template.template_id);
  };

  const allTags = React.useMemo(() => {
    const tags = new Set<string>();
    templates?.forEach(template => {
      template.tags?.forEach(tag => tags.add(tag));
    });
    return Array.from(tags);
  }, [templates]);

  const getUserCredentialNames = () => {
    return new Set(userCredentials?.map(cred => cred.mcp_qualified_name) || []);
  };

  const getTemplateCredentialStatus = (template: AgentTemplate) => {
    const userCredNames = getUserCredentialNames();
    const requiredCreds = template.mcp_requirements.map(req => req.qualified_name);
    const missingCreds = requiredCreds.filter(cred => !userCredNames.has(cred));
    
    return {
      hasAllCredentials: missingCreds.length === 0,
      missingCount: missingCreds.length,
      totalRequired: requiredCreds.length
    };
  };

  if (error) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load marketplace templates. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Secure Agent Marketplace
              </h1>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <Shield className="h-3 w-3 mr-1" />
                Secure
              </Badge>
              <div className="ml-auto">
                <Button asChild variant="outline" className="gap-2">
                  <Link href="/marketplace">
                    <Store className="h-4 w-4" />
                    Regular Marketplace
                  </Link>
                </Button>
              </div>
            </div>
            <p className="text-md text-muted-foreground max-w-2xl">
              Discover and install secure AI agent templates. Your credentials stay private and encrypted.
            </p>
          </div>

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              These agent templates use your own encrypted credentials. No API keys are shared or exposed.
              <Link href="/settings/credentials" className="ml-2 underline">
                Manage your credentials →
              </Link>
            </AlertDescription>
          </Alert>
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
            "Loading templates..."
          ) : (
            `${templates?.length || 0} template${templates?.length !== 1 ? 's' : ''} found`
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
        ) : templates?.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {searchQuery || selectedTags.length > 0
                ? "No templates found matching your criteria. Try adjusting your search or filters."
                : "No agent templates are currently available in the marketplace."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {templates?.map((template) => {
              const { avatar, color } = getTemplateStyling(template);
              const credentialStatus = getTemplateCredentialStatus(template);
              
              return (
                <div 
                  key={template.template_id} 
                  className="bg-neutral-100 dark:bg-sidebar border border-border rounded-2xl overflow-hidden hover:bg-muted/50 transition-all duration-200 cursor-pointer group flex flex-col h-full"
                >
                  <div className={`h-50 flex items-center justify-center relative`} style={{ backgroundColor: color }}>
                    <div className="text-4xl">
                      {avatar}
                    </div>
                    <div className="absolute top-3 right-3 flex gap-2">
                      <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm px-2 py-1 rounded-full">
                        <Download className="h-3 w-3 text-white" />
                        <span className="text-white text-xs font-medium">{template.download_count || 0}</span>
                      </div>
                    </div>
                    <div className="absolute bottom-3 left-3">
                      <Badge variant="secondary" className="bg-white/20 backdrop-blur-sm text-white border-white/20">
                        <Shield className="h-3 w-3 mr-1" />
                        Secure
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="p-4 flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-foreground font-medium text-lg line-clamp-1 flex-1">
                        {template.name}
                      </h3>
                    </div>
                    <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                      {template.description || 'No description available'}
                    </p>
                    
                    {template.mcp_requirements.length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            MCP Services ({template.mcp_requirements.length})
                          </span>
                          {credentialStatus.hasAllCredentials ? (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 text-amber-500" />
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {template.mcp_requirements.slice(0, 2).map(req => (
                            <Badge key={req.qualified_name} variant="outline" className="text-xs">
                              {req.display_name}
                            </Badge>
                          ))}
                          {template.mcp_requirements.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{template.mcp_requirements.length - 2}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

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
                        <User className="h-3 w-3" />
                        <span>By {template.creator_name || 'Anonymous'}</span>
                      </div>
                      {template.marketplace_published_at && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{new Date(template.marketplace_published_at).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>

                    <Button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInstallClick(template);
                      }}
                      disabled={installingTemplateId === template.template_id}
                      className="w-full transition-opacity mt-auto"
                      size="sm"
                    >
                      {installingTemplateId === template.template_id ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin mr-2" />
                          Installing...
                        </>
                      ) : (
                        <>
                          <Download className="h-3 w-3 mr-2" />
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

        <InstallDialog
          template={selectedTemplate}
          open={showInstallDialog}
          onOpenChange={setShowInstallDialog}
          onInstall={handleInstall}
          isInstalling={installingTemplateId === selectedTemplate?.template_id}
        />

        <MissingCredentialsDialog
          open={showMissingCredsDialog}
          onOpenChange={setShowMissingCredsDialog}
          missingCredentials={missingCredentials}
          templateName={selectedTemplate?.name || ''}
        />
      </div>
    </div>
  );
} 