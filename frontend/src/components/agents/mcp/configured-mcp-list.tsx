import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, X, Sparkles, Key, AlertTriangle } from 'lucide-react';
import { MCPConfiguration } from './types';
import { useCredentialProfilesForMcp } from '@/hooks/react-query/mcp/use-credential-profiles';

interface ConfiguredMcpListProps {
  configuredMCPs: MCPConfiguration[];
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}

const MCPConfigurationItem: React.FC<{
  mcp: MCPConfiguration;
  index: number;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}> = ({ mcp, index, onEdit, onRemove }) => {
  const { data: profiles = [] } = useCredentialProfilesForMcp(mcp.qualifiedName);
  const selectedProfile = profiles.find(p => p.profile_id === mcp.selectedProfileId);
  
  const hasDirectConfig = mcp.config && Object.keys(mcp.config).length > 0;
  const hasCredentialProfile = !!mcp.selectedProfileId && !!selectedProfile;
  const needsConfiguration = !hasCredentialProfile && !hasDirectConfig && !mcp.isCustom;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="font-medium text-sm truncate">{mcp.name}</div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{mcp.enabledTools?.length || 0} tools enabled</span>
              {hasCredentialProfile && (
                <div className="flex items-center gap-1">
                  <Key className="h-3 w-3 text-green-600" />
                  <span className="text-green-600 font-medium truncate max-w-24">
                    {selectedProfile.profile_name}
                  </span>
                </div>
              )}
              {hasDirectConfig && !hasCredentialProfile && (
                <div className="flex items-center gap-1">
                  <Key className="h-3 w-3 text-green-600" />
                  <span className="text-green-600 font-medium">Configured</span>
                </div>
              )}
              {needsConfiguration && (
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-600" />
                  <span className="text-amber-600">Needs config</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRemove(index)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

export const ConfiguredMcpList: React.FC<ConfiguredMcpListProps> = ({
  configuredMCPs,
  onEdit,
  onRemove,
}) => {
  if (configuredMCPs.length === 0) return null;

  return (
    <div className="space-y-2">
      {configuredMCPs.map((mcp, index) => (
        <MCPConfigurationItem
          key={index}
          mcp={mcp}
          index={index}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
};