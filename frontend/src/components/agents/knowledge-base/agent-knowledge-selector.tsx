'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  FolderIcon,
  Search,
  Database,
  ChevronDown,
  ChevronRight,
  FileIcon,
  Loader2,
} from 'lucide-react';
import {
  useAllUserFolders,
  useAllRootLlamaCloudKBs,
  useAgentUnifiedAssignments,
  useUpdateAgentUnifiedAssignments,
  useFolderEntries,
} from '@/hooks/react-query/knowledge-base/use-knowledge-base-queries';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AgentKnowledgeSelectorProps {
  agentId: string;
}

interface Folder {
  folder_id: string;
  name: string;
  description?: string;
  entry_count?: number;
  created_at: string;
}

interface FolderEntry {
  entry_id: string;
  entry_type: 'file' | 'cloud_kb';
  name: string;
  filename?: string;
  summary?: string;
  file_size?: number;
  index_name?: string;
  created_at: string;
}

interface LlamaCloudKB {
  entry_id: string;
  name: string;
  description?: string;
  index_name: string;
  created_at: string;
}

export function AgentKnowledgeSelector({ agentId }: AgentKnowledgeSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [localAssignments, setLocalAssignments] = useState<{
    folders: Set<string>;
    llamacloud: Set<string>;
  }>({
    folders: new Set(),
    llamacloud: new Set(),
  });

  // Fetch all data
  const { data: foldersData, isLoading: foldersLoading } = useAllUserFolders();
  const { data: llamaCloudData, isLoading: llamaCloudLoading } = useAllRootLlamaCloudKBs();
  const { data: assignmentsData, isLoading: assignmentsLoading } = useAgentUnifiedAssignments(agentId);
  const updateAssignmentsMutation = useUpdateAgentUnifiedAssignments();

  const folders: Folder[] = foldersData || [];
  const llamaCloudKBs: LlamaCloudKB[] = llamaCloudData?.entries || [];

  // Initialize local assignments from server data
  useEffect(() => {
    if (assignmentsData) {
      // For regular entries, we need to map entry_ids back to folder_ids
      // Since the assignments are at the entry level, we'll track which entries are assigned
      const assignedFolderIds = new Set<string>();
      const assignedLlamaCloudIds = new Set<string>();

      // Add all assigned regular entry IDs to folders set
      Object.entries(assignmentsData.regular_assignments).forEach(([entryId, enabled]) => {
        if (enabled) {
          assignedFolderIds.add(entryId);
        }
      });

      // Add all assigned LlamaCloud KB IDs
      Object.entries(assignmentsData.llamacloud_assignments).forEach(([kbId, enabled]) => {
        if (enabled) {
          assignedLlamaCloudIds.add(kbId);
        }
      });

      setLocalAssignments({
        folders: assignedFolderIds,
        llamacloud: assignedLlamaCloudIds,
      });
    }
  }, [assignmentsData]);

  const isLoading = foldersLoading || llamaCloudLoading || assignmentsLoading;

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleFolderToggle = async (folderId: string, entries: FolderEntry[]) => {
    const isCurrentlyAssigned = isFolderAssigned(folderId, entries);
    const newAssignments = new Set(localAssignments.folders);

    if (isCurrentlyAssigned) {
      // Remove all entries of this folder
      entries.forEach(entry => newAssignments.delete(entry.entry_id));
    } else {
      // Add all entries of this folder
      entries.forEach(entry => newAssignments.add(entry.entry_id));
    }

    setLocalAssignments(prev => ({
      ...prev,
      folders: newAssignments,
    }));

    // Update on server
    await updateAssignments(Array.from(newAssignments), Array.from(localAssignments.llamacloud));
  };

  const handleLlamaCloudToggle = async (kbId: string) => {
    const newAssignments = new Set(localAssignments.llamacloud);
    
    if (newAssignments.has(kbId)) {
      newAssignments.delete(kbId);
    } else {
      newAssignments.add(kbId);
    }

    setLocalAssignments(prev => ({
      ...prev,
      llamacloud: newAssignments,
    }));

    // Update on server
    await updateAssignments(Array.from(localAssignments.folders), Array.from(newAssignments));
  };

  const updateAssignments = async (regularEntryIds: string[], llamacloudKbIds: string[]) => {
    try {
      await updateAssignmentsMutation.mutateAsync({
        agentId,
        assignments: {
          regular_entry_ids: regularEntryIds,
          llamacloud_kb_ids: llamacloudKbIds,
        },
      });
    } catch (error) {
      console.error('Failed to update assignments:', error);
      toast.error('Failed to update knowledge base assignments');
    }
  };

  const isFolderAssigned = (folderId: string, entries: FolderEntry[]) => {
    // A folder is considered assigned if all its entries are assigned
    if (entries.length === 0) return false;
    return entries.every(entry => localAssignments.folders.has(entry.entry_id));
  };

  const isFolderPartiallyAssigned = (folderId: string, entries: FolderEntry[]) => {
    // A folder is partially assigned if some but not all entries are assigned
    if (entries.length === 0) return false;
    const assignedCount = entries.filter(entry => localAssignments.folders.has(entry.entry_id)).length;
    return assignedCount > 0 && assignedCount < entries.length;
  };

  // Filter logic
  const filteredFolders = folders.filter(folder =>
    folder.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLlamaCloudKBs = llamaCloudKBs.filter(kb =>
    kb.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search knowledge..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Toggle knowledge sources to make them available to this agent
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {/* Folders */}
        {filteredFolders.map((folder) => (
          <FolderItem
            key={folder.folder_id}
            folder={folder}
            agentId={agentId}
            isExpanded={expandedFolders.has(folder.folder_id)}
            onToggleExpand={() => toggleFolder(folder.folder_id)}
            onToggleAssignment={handleFolderToggle}
            isFolderAssigned={isFolderAssigned}
            isFolderPartiallyAssigned={isFolderPartiallyAssigned}
            localAssignments={localAssignments}
          />
        ))}

        {/* LlamaCloud KBs */}
        {filteredLlamaCloudKBs.map((kb) => (
          <div
            key={kb.entry_id}
            className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <h4 className="text-sm font-medium truncate">{kb.name}</h4>
                  <Badge variant="outline" className="text-xs flex-shrink-0 bg-blue-50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                    CLOUD
                  </Badge>
                </div>
                {kb.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {kb.description}
                  </p>
                )}
              </div>
            </div>
            <Switch
              checked={localAssignments.llamacloud.has(kb.entry_id)}
              onCheckedChange={() => handleLlamaCloudToggle(kb.entry_id)}
              disabled={updateAssignmentsMutation.isPending}
            />
          </div>
        ))}

        {/* Empty state */}
        {filteredFolders.length === 0 && filteredLlamaCloudKBs.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
              <FolderIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium mb-1">No knowledge entries yet</h3>
            <p className="text-xs text-muted-foreground">
              Add documents, files, or cloud knowledge bases to provide<br />
              this agent with specialized context and search capabilities
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Folder item component with lazy loading of entries
function FolderItem({
  folder,
  agentId,
  isExpanded,
  onToggleExpand,
  onToggleAssignment,
  isFolderAssigned,
  isFolderPartiallyAssigned,
  localAssignments,
}: {
  folder: Folder;
  agentId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleAssignment: (folderId: string, entries: FolderEntry[]) => void;
  isFolderAssigned: (folderId: string, entries: FolderEntry[]) => boolean;
  isFolderPartiallyAssigned: (folderId: string, entries: FolderEntry[]) => boolean;
  localAssignments: { folders: Set<string>; llamacloud: Set<string> };
}) {
  const { data: entriesData, isLoading: entriesLoading } = useFolderEntries(
    isExpanded ? folder.folder_id : ''
  );

  const entries: FolderEntry[] = entriesData?.entries || [];
  const isAssigned = isFolderAssigned(folder.folder_id, entries);
  const isPartiallyAssigned = isFolderPartiallyAssigned(folder.folder_id, entries);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <button
            onClick={onToggleExpand}
            className="p-1 hover:bg-muted rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          <div className="p-2 rounded-lg bg-muted border">
            <FolderIcon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <h4 className="text-sm font-medium truncate">{folder.name}</h4>
              {folder.entry_count !== undefined && (
                <Badge variant="outline" className="text-xs flex-shrink-0">
                  {folder.entry_count} {folder.entry_count === 1 ? 'file' : 'files'}
                </Badge>
              )}
            </div>
            {folder.description && (
              <p className="text-xs text-muted-foreground truncate">
                {folder.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isPartiallyAssigned && (
            <Badge variant="secondary" className="text-xs">
              Partial
            </Badge>
          )}
          <Switch
            checked={isAssigned}
            onCheckedChange={() => onToggleAssignment(folder.folder_id, entries)}
            disabled={entriesLoading || entries.length === 0}
          />
        </div>
      </div>

      {/* Expanded folder content */}
      {isExpanded && (
        <div className="border-t px-4 py-2 bg-muted/30">
          {entriesLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading files...</span>
            </div>
          ) : entries.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">
              No files in this folder
            </p>
          ) : (
            <div className="space-y-1">
              {entries.map((entry) => {
                const isCloudKB = entry.entry_type === 'cloud_kb';
                const EntryIcon = isCloudKB ? Database : FileIcon;
                const displayName = entry.name || entry.filename || 'Unnamed';
                
                return (
                  <div
                    key={entry.entry_id}
                    className={cn(
                      "flex items-center space-x-2 p-2 rounded text-xs",
                      localAssignments.folders.has(entry.entry_id)
                        ? "bg-primary/10"
                        : "hover:bg-muted"
                    )}
                  >
                    <EntryIcon 
                      className={cn(
                        "h-3 w-3 flex-shrink-0",
                        isCloudKB ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
                      )} 
                    />
                    <span className="truncate flex-1">{displayName}</span>
                    {isCloudKB && (
                      <Badge variant="outline" className="text-xs py-0 px-1 bg-blue-50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                        CLOUD
                      </Badge>
                    )}
                    {localAssignments.folders.has(entry.entry_id) && (
                      <Badge variant="secondary" className="text-xs py-0 px-1">
                        Enabled
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

