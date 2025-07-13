'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GitBranch, ChevronDown, Clock, RotateCcw, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAgentVersions, useActivateAgentVersion, useCreateAgentVersion } from '@/hooks/react-query/agents/use-agent-versions';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { AgentVersion } from '@/hooks/react-query/agents/utils';

interface AgentVersionSwitcherProps {
  agentId: string;
  currentVersionId?: string | null;
  currentFormData: {
    system_prompt: string;
    configured_mcps: any[];
    custom_mcps: any[];
    agentpress_tools: Record<string, any>;
  };
}

export function AgentVersionSwitcher({ 
  agentId, 
  currentVersionId,
  currentFormData 
}: AgentVersionSwitcherProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const versionParam = searchParams.get('version');
  
  const { data: versions, isLoading } = useAgentVersions(agentId);
  const activateVersionMutation = useActivateAgentVersion();
  const createVersionMutation = useCreateAgentVersion();
  
  const [showRollbackDialog, setShowRollbackDialog] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<AgentVersion | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const viewingVersionId = versionParam || currentVersionId;
  const viewingVersion = versions?.find(v => v.version_id === viewingVersionId) || versions?.[0];

  const canRollback = viewingVersion && viewingVersion.version_number > 1;

  const handleVersionSelect = async (version: AgentVersion) => {
    if (version.version_id === viewingVersionId) return;
    const params = new URLSearchParams(searchParams.toString());
    if (version.version_id === currentVersionId) {
      params.delete('version');
    } else {
      params.set('version', version.version_id);
    }
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    router.push(newUrl);
    if (version.version_id !== currentVersionId) {
      toast.success(`Viewing ${version.version_name} (read-only)`);
    }
  };

  const handleRollback = async () => {
    if (!selectedVersion || !viewingVersion) return;
    
    setIsRollingBack(true);
    try {
      const newVersion = await createVersionMutation.mutateAsync({
        agentId,
        data: {
          system_prompt: selectedVersion.system_prompt,
          configured_mcps: selectedVersion.configured_mcps,
          custom_mcps: selectedVersion.custom_mcps,
          agentpress_tools: selectedVersion.agentpress_tools,
          description: `Rolled back from ${viewingVersion.version_name} to ${selectedVersion.version_name}`
        }
      });
      await activateVersionMutation.mutateAsync({ 
        agentId, 
        versionId: newVersion.version_id 
      });
      
      const params = new URLSearchParams(searchParams.toString());
      params.delete('version');
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      router.push(newUrl);

      setShowRollbackDialog(false);
      toast.success(`Rolled back to ${selectedVersion.version_name} configuration`);
    } catch (error) {
      console.error('Failed to rollback:', error);
      toast.error('Failed to rollback version');
    } finally {
      setIsRollingBack(false);
    }
  };

  const openRollbackDialog = (version: AgentVersion) => {
    setSelectedVersion(version);
    setShowRollbackDialog(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading versions...</span>
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <GitBranch className="h-4 w-4" />
            {viewingVersion ? (
              <>
                {viewingVersion.version_name}
                {viewingVersionId === currentVersionId && (
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                )}
              </>
            ) : (
              'Select Version'
            )}
            <ChevronDown className="h-4 w-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel>Version History</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          <div className="max-h-96 overflow-y-auto">
            {versions.map((version) => {
              const isViewing = version.version_id === viewingVersionId;
              const isCurrent = version.version_id === currentVersionId;
              
              return (
                <div key={version.version_id} className="relative">
                  <DropdownMenuItem
                    onClick={() => handleVersionSelect(version)}
                    className={`cursor-pointer ${isViewing ? 'bg-accent' : ''}`}
                  >
                    <div className="flex items-start justify-between w-full">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{version.version_name}</span>
                          {isCurrent && (
                            <Badge variant="default" className="text-xs">
                              Current
                            </Badge>
                          )}
                          {isViewing && !isCurrent && (
                            <Badge variant="outline" className="text-xs">
                              Viewing
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        {version.change_description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {version.change_description}
                          </p>
                        )}
                      </div>
                      
                      {isViewing && (
                        <Check className="h-4 w-4 text-primary ml-2" />
                      )}
                    </div>
                  </DropdownMenuItem>
                  
                  {!isViewing && version.version_number < (viewingVersion?.version_number || 0) && canRollback && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openRollbackDialog(version);
                      }}
                      className="absolute right-2 top-2"
                      title={`Rollback to ${version.version_name}`}
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          
          {versions.length === 1 && (
            <div className="p-2">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This is the first version. Make changes to create a new version.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rollback Confirmation Dialog */}
      <Dialog open={showRollbackDialog} onOpenChange={setShowRollbackDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollback to {selectedVersion?.version_name}</DialogTitle>
            <DialogDescription>
              This will create a new version with the configuration from {selectedVersion?.version_name}.
              Your current changes will be preserved in the current version.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Note:</strong> This action will create a new version (v{(versions?.[0]?.version_number || 0) + 1}) 
                with the selected configuration. You can always switch back to any previous version.
              </AlertDescription>
            </Alert>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRollbackDialog(false)}
              disabled={isRollingBack}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRollback}
              disabled={isRollingBack}
            >
              {isRollingBack ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rolling back...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Confirm Rollback
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
} 