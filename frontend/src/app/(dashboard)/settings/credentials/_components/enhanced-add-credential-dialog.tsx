import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, ChevronLeft, ChevronRight, Shield, Loader2, ArrowLeft, Key, ExternalLink } from 'lucide-react';
import { usePopularMCPServersV2, useMCPServers, useMCPServerDetails } from '@/hooks/react-query/mcp/use-mcp-servers';
import { useStoreCredential, type StoreCredentialRequest } from '@/hooks/react-query/secure-mcp/use-secure-mcp';
import { toast } from 'sonner';

interface EnhancedAddCredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface MCPServerCardProps {
  server: any;
  onClick: (server: any) => void;
}

const MCPServerCard: React.FC<MCPServerCardProps> = ({ server, onClick }) => {
  const displayName = server.displayName || server.name;
  const iconUrl = server.iconUrl || server.logo;
  
  return (
    <div 
      className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={() => onClick(server)}
    >
      <div className="flex items-start gap-3">
        {iconUrl && (
          <img 
            src={iconUrl} 
            alt={`${displayName} logo`}
            className="w-8 h-8 rounded-md object-cover flex-shrink-0"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-sm truncate">{displayName}</h4>
            {server.verified && (
              <Badge variant="secondary" className="text-xs">Verified</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
            {server.description}
          </p>
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs">
              {server.qualifiedName}
            </Badge>
            {(server.useCount || server.stars) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>⭐</span>
                <span>{server.useCount || server.stars}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface CategorySidebarProps {
  categories: string[];
  selectedCategory: string | null;
  onCategorySelect: (category: string | null) => void;
  categorizedServers: Record<string, any[]>;
}

const CategorySidebar: React.FC<CategorySidebarProps> = ({
  categories,
  selectedCategory,
  onCategorySelect,
  categorizedServers
}) => {
  return (
    <div className="w-48 pr-4">
      <h3 className="font-medium text-sm mb-3">Categories</h3>
      <div className="space-y-1">
        <button
          onClick={() => onCategorySelect(null)}
          className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors ${
            selectedCategory === null 
              ? 'bg-muted-foreground/10 text-foreground' 
              : 'hover:bg-muted'
          }`}
        >
          All Servers
        </button>
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => onCategorySelect(category)}
            className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors flex items-center justify-between ${
              selectedCategory === category 
                ? 'bg-muted-foreground/10 text-foreground' 
                : 'hover:bg-muted'
            }`}
          >
            <span className="truncate">{category}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export const EnhancedAddCredentialDialog: React.FC<EnhancedAddCredentialDialogProps> = ({ 
  open, 
  onOpenChange, 
  onSuccess 
}) => {
  const [step, setStep] = useState<'browse' | 'configure'>('browse');
  const [selectedServer, setSelectedServer] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [formData, setFormData] = useState<{
    display_name: string;
    config: Record<string, string>;
  }>({
    display_name: '',
    config: {}
  });

  const { data: popularServersV2, isLoading: isLoadingV2 } = usePopularMCPServersV2(currentPage, pageSize);
  const { data: searchResults, isLoading: isSearching } = useMCPServers(
    searchQuery.length > 2 ? searchQuery : undefined
  );
  const { data: serverDetails, isLoading: isLoadingDetails } = useMCPServerDetails(
    selectedServer?.qualifiedName, 
    !!selectedServer
  );
  const storeCredentialMutation = useStoreCredential();

  const categories = popularServersV2?.success ? Object.keys(popularServersV2.categorized) : [];

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (open) {
      setCurrentPage(1);
      setSelectedCategory(null);
      setSearchQuery('');
      setStep('browse');
      setSelectedServer(null);
      setFormData({ display_name: '', config: {} });
    }
  }, [open]);

  const handleServerSelect = (server: any) => {
    const normalizedServer = {
      ...server,
      displayName: server.displayName || server.name,
      qualifiedName: server.qualifiedName,
      iconUrl: server.iconUrl || server.logo,
      sourceUrl: server.sourceUrl || server.homepage
    };
    
    setSelectedServer(normalizedServer);
    setFormData({
      display_name: normalizedServer.displayName,
      config: {}
    });
    setStep('configure');
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

  const handleSubmit = async () => {
    if (!selectedServer) return;

    try {
      const request: StoreCredentialRequest = {
        mcp_qualified_name: selectedServer.qualifiedName,
        display_name: formData.display_name,
        config: formData.config
      };

      await storeCredentialMutation.mutateAsync(request);
      toast.success('Credential stored successfully!');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to store credential');
    }
  };

  const handleBack = () => {
    setStep('browse');
    setSelectedServer(null);
  };

  const getConfigSchema = () => {
    return serverDetails?.connections?.[0]?.configSchema;
  };

  const getConfigProperties = () => {
    const schema = getConfigSchema();
    return schema?.properties || {};
  };

  const getRequiredFields = () => {
    const schema = getConfigSchema();
    return schema?.required || [];
  };

  const isFieldRequired = (fieldName: string) => {
    return getRequiredFields().includes(fieldName);
  };

  const getServersToDisplay = () => {
    if (searchQuery && searchResults) {
      return searchResults.servers || [];
    }

    if (!popularServersV2?.success) return [];

    if (selectedCategory) {
      return popularServersV2.categorized[selectedCategory] || [];
    }

    // Flatten all servers from all categories
    return Object.values(popularServersV2.categorized).flat();
  };

  const serversToDisplay = getServersToDisplay();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === 'browse' ? 'Add MCP Credential' : `Configure ${selectedServer?.displayName}`}
          </DialogTitle>
          <DialogDescription>
            {step === 'browse' 
              ? 'Select an MCP server to configure credentials for'
              : 'Enter your API credentials for this MCP server'
            }
          </DialogDescription>
        </DialogHeader>

        {step === 'browse' && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search MCP servers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex flex-1 gap-4 overflow-hidden">
              {!searchQuery && categories.length > 0 && (
                <CategorySidebar
                  categories={categories}
                  selectedCategory={selectedCategory}
                  onCategorySelect={setSelectedCategory}
                  categorizedServers={popularServersV2?.categorized || {}}
                />
              )}
              
              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-1">
                    {(isLoadingV2 || isSearching) ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        <span>Loading MCP servers...</span>
                      </div>
                    ) : serversToDisplay.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        {searchQuery ? 'No servers found matching your search.' : 'No servers available.'}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {serversToDisplay.map((server) => (
                          <MCPServerCard
                            key={server.qualifiedName}
                            server={server}
                            onClick={handleServerSelect}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {!searchQuery && popularServersV2?.success && popularServersV2.pagination && (
              <div className="flex items-center justify-between border-t pt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, popularServersV2.pagination.totalCount)} of {popularServersV2.pagination.totalCount} servers
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {popularServersV2.pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(popularServersV2.pagination.totalPages, prev + 1))}
                    disabled={currentPage >= popularServersV2.pagination.totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {step === 'configure' && selectedServer && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              {selectedServer.iconUrl && (
                <img 
                  src={selectedServer.iconUrl} 
                  alt={`${selectedServer.displayName} logo`}
                  className="w-12 h-12 rounded-md object-cover"
                />
              )}
              <div>
                <h3 className="font-medium">{selectedServer.displayName}</h3>
                <p className="text-sm text-muted-foreground">{selectedServer.qualifiedName}</p>
                {selectedServer.sourceUrl && (
                  <a 
                    href={selectedServer.sourceUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                  >
                    View Documentation <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            {isLoadingDetails ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Loading server configuration...</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="display_name">Display Name</Label>
                  <Input
                    id="display_name"
                    value={formData.display_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                    placeholder="Enter a display name for this credential"
                  />
                </div>

                {Object.keys(getConfigProperties()).length > 0 ? (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">Connection Settings</h3>
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
                    Your credentials will be encrypted and stored securely. They will only be used when you run agents that require this MCP server.
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'configure' && (
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
          <Button 
            onClick={step === 'browse' ? () => onOpenChange(false) : handleSubmit}
            disabled={step === 'configure' && (
              !formData.display_name || 
              (getRequiredFields().length > 0 && 
               getRequiredFields().some(field => !formData.config[field])) ||
              storeCredentialMutation.isPending
            )}
          >
            {step === 'browse' ? 'Cancel' : 
             storeCredentialMutation.isPending ? (
               <>
                 <Loader2 className="h-4 w-4 animate-spin mr-2" />
                 Storing...
               </>
             ) : 'Store Credential'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 