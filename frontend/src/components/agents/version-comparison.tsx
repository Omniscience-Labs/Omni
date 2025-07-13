'use client';

import React, { useState, useMemo } from 'react';
import { Loader2, GitBranch, ArrowLeftRight, Check, X, Plus, Minus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAgentVersions } from '@/hooks/react-query/agents/use-agent-versions';
import { AgentVersion } from '@/hooks/react-query/agents/utils';
import { Textarea } from '@/components/ui/textarea';

interface VersionComparisonProps {
  agentId: string;
  onClose?: () => void;
  onActivateVersion?: (versionId: string) => void;
}

interface VersionDifference {
  field: string;
  type: 'added' | 'removed' | 'modified';
  oldValue?: any;
  newValue?: any;
}

export function VersionComparison({ agentId, onClose, onActivateVersion }: VersionComparisonProps) {
  const { data: versions = [], isLoading } = useAgentVersions(agentId);
  const [version1Id, setVersion1Id] = useState<string>('');
  const [version2Id, setVersion2Id] = useState<string>('');
  
  const version1 = versions.find(v => v.version_id === version1Id);
  const version2 = versions.find(v => v.version_id === version2Id);
  
  const differences = useMemo(() => {
    if (!version1 || !version2) return [];
    
    const diffs: VersionDifference[] = [];
    
    // Compare system prompts
    if (version1.system_prompt !== version2.system_prompt) {
      diffs.push({
        field: 'System Prompt',
        type: 'modified',
        oldValue: version1.system_prompt,
        newValue: version2.system_prompt
      });
    }
    
    // Compare tools
    const tools1 = new Set(Object.keys(version1.agentpress_tools || {}));
    const tools2 = new Set(Object.keys(version2.agentpress_tools || {}));
    
    // Added tools
    for (const tool of tools2) {
      if (!tools1.has(tool)) {
        diffs.push({
          field: `Tool: ${tool}`,
          type: 'added',
          newValue: version2.agentpress_tools[tool]
        });
      }
    }
    
    // Removed tools
    for (const tool of tools1) {
      if (!tools2.has(tool)) {
        diffs.push({
          field: `Tool: ${tool}`,
          type: 'removed',
          oldValue: version1.agentpress_tools[tool]
        });
      }
    }
    
    // Modified tools
    for (const tool of tools1) {
      if (tools2.has(tool) && 
          JSON.stringify(version1.agentpress_tools[tool]) !== JSON.stringify(version2.agentpress_tools[tool])) {
        diffs.push({
          field: `Tool: ${tool}`,
          type: 'modified',
          oldValue: version1.agentpress_tools[tool],
          newValue: version2.agentpress_tools[tool]
        });
      }
    }
    
    // Compare MCPs
    const mcps1Count = (version1.configured_mcps?.length || 0) + (version1.custom_mcps?.length || 0);
    const mcps2Count = (version2.configured_mcps?.length || 0) + (version2.custom_mcps?.length || 0);
    
    if (mcps1Count !== mcps2Count) {
      diffs.push({
        field: 'MCP Integrations',
        type: 'modified',
        oldValue: `${mcps1Count} integrations`,
        newValue: `${mcps2Count} integrations`
      });
    }
    
    return diffs;
  }, [version1, version2]);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          <h2 className="text-2xl font-semibold">Compare Versions</h2>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Version 1</Label>
          <Select value={version1Id} onValueChange={setVersion1Id}>
            <SelectTrigger>
              <SelectValue placeholder="Select version" />
            </SelectTrigger>
            <SelectContent>
              {versions.map((version) => (
                <SelectItem key={version.version_id} value={version.version_id}>
                  {version.version_name} - {new Date(version.created_at).toLocaleDateString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label>Version 2</Label>
          <Select value={version2Id} onValueChange={setVersion2Id}>
            <SelectTrigger>
              <SelectValue placeholder="Select version" />
            </SelectTrigger>
            <SelectContent>
              {versions.map((version) => (
                <SelectItem key={version.version_id} value={version.version_id}>
                  {version.version_name} - {new Date(version.created_at).toLocaleDateString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {version1 && version2 && (
        <div className="space-y-4">
          {differences.length === 0 ? (
            <Alert>
              <AlertDescription>
                These versions are identical.
              </AlertDescription>
            </Alert>
          ) : (
            <Tabs defaultValue="summary">
              <TabsList>
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="system-prompt">System Prompt</TabsTrigger>
                <TabsTrigger value="tools">Tools</TabsTrigger>
              </TabsList>
              
              <TabsContent value="summary">
                <Card>
                  <CardHeader>
                    <CardTitle>Differences Summary</CardTitle>
                    <CardDescription>
                      {differences.length} difference{differences.length !== 1 ? 's' : ''} found
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-96">
                      <div className="space-y-2">
                        {differences.map((diff, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted">
                            {diff.type === 'added' && <Plus className="h-4 w-4 text-green-500" />}
                            {diff.type === 'removed' && <Minus className="h-4 w-4 text-red-500" />}
                            {diff.type === 'modified' && <RefreshCw className="h-4 w-4 text-yellow-500" />}
                            <span className="font-medium">{diff.field}</span>
                            {diff.type === 'modified' && (
                              <span className="text-sm text-muted-foreground">
                                {diff.oldValue} → {diff.newValue}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="system-prompt">
                {version1.system_prompt !== version2.system_prompt ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="mb-2">Version 1: {version1.version_name}</Label>
                      <Textarea
                        value={version1.system_prompt}
                        readOnly
                        className="h-96 font-mono text-sm"
                      />
                    </div>
                    <div>
                      <Label className="mb-2">Version 2: {version2.version_name}</Label>
                      <Textarea
                        value={version2.system_prompt}
                        readOnly
                        className="h-96 font-mono text-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <AlertDescription>
                      System prompts are identical.
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>
              
              <TabsContent value="tools">
                <Card>
                  <CardHeader>
                    <CardTitle>Tool Differences</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {differences
                        .filter(diff => diff.field.startsWith('Tool:'))
                        .map((diff, index) => (
                          <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-2">
                              {diff.type === 'added' && <Plus className="h-4 w-4 text-green-500" />}
                              {diff.type === 'removed' && <Minus className="h-4 w-4 text-red-500" />}
                              {diff.type === 'modified' && <RefreshCw className="h-4 w-4 text-yellow-500" />}
                              <span className="font-medium">{diff.field.replace('Tool: ', '')}</span>
                            </div>
                            <Badge variant={diff.type === 'added' ? 'default' : diff.type === 'removed' ? 'destructive' : 'secondary'}>
                              {diff.type}
                            </Badge>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
          
          {onActivateVersion && (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => onActivateVersion(version1Id)}
                disabled={version1.is_active}
              >
                Activate {version1.version_name}
              </Button>
              <Button
                variant="outline"
                onClick={() => onActivateVersion(version2Id)}
                disabled={version2.is_active}
              >
                Activate {version2.version_name}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 