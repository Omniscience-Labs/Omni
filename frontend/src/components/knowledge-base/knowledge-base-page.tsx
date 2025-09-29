'use client';

import React, { useState, useRef } from 'react';
import { toast } from 'sonner';
import { KBDeleteConfirmDialog } from './kb-delete-confirm-dialog';
import { FileUploadModal } from './file-upload-modal';
import { EditSummaryModal } from './edit-summary-modal';
import { createClient } from '@/lib/supabase/client';
import { getSandboxFileContent } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FileNameValidator } from '@/lib/validation';
import type { 
    KnowledgeBaseEntry, 
    CloudKBEntry
} from '@/types/knowledge-base';
import type { Folder, TreeItem, FileEntry } from '@/types/knowledge-base';
import {
    ENTRY_TYPE_FILE,
    ENTRY_TYPE_CLOUD_KB,
    CLOUD_KB_ID_PREFIX,
    getCloudKBId,
    extractCloudKBId,
    isCloudKBId,
    isCloudKBEntry
} from '@/types/knowledge-base';
import {
    FolderIcon,
    FileIcon,
    PlusIcon,
    UploadIcon,
    TrashIcon,
    FolderPlusIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    MoreVerticalIcon,
    Database,
    Loader2,
    SearchIcon
} from 'lucide-react';
import { KnowledgeBasePageHeader } from './knowledge-base-header';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensors,
    useSensor,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    useDroppable,
    useDraggable,
} from '@dnd-kit/core';
import { Skeleton } from '@/components/ui/skeleton';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SharedTreeItem, FileDragOverlay } from '@/components/knowledge-base/shared-kb-tree';
import { KBFilePreviewModal } from './kb-file-preview-modal';

// Get backend URL from environment variables
const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

// Helper function to get file extension and type
const getFileTypeInfo = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    const fileType = extension.toUpperCase();

    // Define color scheme based on file type
    const getTypeColor = (ext: string) => {
        switch (ext) {
            case 'pdf': return 'bg-red-100 text-red-700 border-red-200';
            case 'doc':
            case 'docx': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'ppt':
            case 'pptx': return 'bg-orange-100 text-orange-700 border-orange-200';
            case 'xls':
            case 'xlsx': return 'bg-green-100 text-green-700 border-green-200';
            case 'txt': return 'bg-gray-100 text-gray-700 border-gray-200';
            case 'jpg':
            case 'jpeg':
            case 'png':
            case 'gif': return 'bg-purple-100 text-purple-700 border-purple-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    return {
        extension: fileType,
        colorClass: getTypeColor(extension)
    };
};

// Helper function to format date
const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays} days ago`;

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
};

// Draggable Cloud Knowledge Base Component
const DraggableCloudKB = ({ kb, isMoving, onSelect }: { 
    kb: CloudKBEntry, 
    isMoving: boolean, 
    onSelect: (item: TreeItem) => void 
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        isDragging,
    } = useDraggable({
        id: getCloudKBId(kb.entry_id),
    });

    const style = {
        transform: `translate3d(${transform?.x ?? 0}px, ${transform?.y ?? 0}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className={`group cursor-pointer ${isMoving ? 'opacity-50' : ''}`}
            onClick={() => {
                if (!isDragging) {
                    onSelect({
                        id: getCloudKBId(kb.entry_id),
                        type: 'file',
                        name: kb.name,
                        data: kb,
                    });
                }
            }}
        >
            <div className="p-4 border border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-900/10 rounded-lg hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                            <Database className="h-3 w-3 mr-1" />
                            CLOUD
                        </div>
                    </div>
                    
                    <div className="space-y-1">
                        <p className="text-xs font-medium text-foreground truncate" title={kb.name}>
                            {kb.name}
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                            {formatDate(kb.created_at)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Local interface for simplified entry display (recent files)
interface Entry {
    entry_id: string;
    filename: string;
    summary?: string;
    file_size: number;
    created_at: string;
}

// Extended TreeItem type for this component (includes Entry for compatibility)
type LocalTreeItem = TreeItem & {
    data?: Folder | Entry | KnowledgeBaseEntry;
};

// Hooks for API calls
const useKnowledgeFolders = () => {
    const [folders, setFolders] = useState<Folder[]>([]);
    const [recentFiles, setRecentFiles] = useState<Entry[]>([]);
    const [llamacloudKBs, setLlamacloudKBs] = useState<CloudKBEntry[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchFolders = async () => {
        try {
            const supabase = createClient();

            // Fetch folders directly using Supabase client with RLS
            const { data: foldersData, error: foldersError } = await supabase
                .from('knowledge_base_folders')
                .select('folder_id, name, description, created_at')
                .order('created_at', { ascending: false });

            if (foldersError) {
                console.error('Supabase error fetching folders:', foldersError);
                return;
            }

            // Fetch recent files (last 6 files across all folders)
            const { data: recentFilesData, error: recentError } = await supabase
                .from('knowledge_base_entries')
                .select('entry_id, filename, summary, file_size, created_at, folder_id')
                .order('created_at', { ascending: false })
                .limit(6);

            if (recentError) {
                console.error('Supabase error fetching recent files:', recentError);
            } else {
                setRecentFiles(recentFilesData || []);
            }

            // Get entry counts for each folder
            const foldersWithCounts = await Promise.all(
                foldersData.map(async (folder) => {
                    const { count, error: countError } = await supabase
                        .from('knowledge_base_entries')
                        .select('*', { count: 'exact', head: true })
                        .eq('folder_id', folder.folder_id);

                    if (countError) {
                        console.error('Error counting entries:', countError);
                    }

                    return {
                        folder_id: folder.folder_id,
                        name: folder.name,
                        description: folder.description,
                        entry_count: count || 0,
                        created_at: folder.created_at
                    };
                })
            );

            setFolders(foldersWithCounts);

            // Fetch global LlamaCloud knowledge bases at root level (not in folders)
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
                try {
                    const kbResponse = await fetch(`${API_URL}/knowledge-base/llamacloud/root`, {
                        headers: {
                            'Authorization': `Bearer ${session.access_token}`,
                            'Content-Type': 'application/json',
                        },
                    });
                    
                    if (kbResponse.ok) {
                        const kbData = await kbResponse.json();
                        setLlamacloudKBs(kbData.entries || []);
                    }
                } catch (kbError) {
                    console.error('Failed to fetch root LlamaCloud KBs:', kbError);
                }
            }
        } catch (error) {
            console.error('Failed to fetch folders:', error);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        fetchFolders();
    }, []);

    return { folders, recentFiles, llamacloudKBs, loading, refetch: fetchFolders };
};

export function KnowledgeBasePage() {
    const [treeData, setTreeData] = useState<LocalTreeItem[]>([]);
    const [folderEntries, setFolderEntries] = useState<{ [folderId: string]: Entry[] }>({});
    const [loadingFolders, setLoadingFolders] = useState<{ [folderId: string]: boolean }>({});
    const [movingFiles, setMovingFiles] = useState<{ [fileId: string]: boolean }>({});
    const [selectedItem, setSelectedItem] = useState<TreeItem | null>(null);
    const [editingFolder, setEditingFolder] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [validationError, setValidationError] = useState<string | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const editInputRef = useRef<HTMLInputElement>(null);
    const isOperationInProgress = useRef(false);


    // Cloud KB dialog state  
    const [cloudKBDialog, setCloudKBDialog] = useState<{
        isOpen: boolean;
        name: string;
        indexName: string;
        description: string;
        isCreating: boolean;
    }>({
        isOpen: false,
        name: '',
        indexName: '',
        description: '',
        isCreating: false,
    });

    // Delete confirmation state
    const [deleteConfirm, setDeleteConfirm] = useState<{
        isOpen: boolean;
        item: { id: string; name: string; type: 'folder' | 'file' } | null;
        isDeleting: boolean;
    }>({
        isOpen: false,
        item: null,
        isDeleting: false,
    });

    // Upload status state for native file drops
    const [uploadStatus, setUploadStatus] = useState<{
        [folderId: string]: {
            isUploading: boolean;
            progress: number;
            currentFile?: string;
            totalFiles?: number;
            completedFiles?: number;
        };
    }>({});

    // Edit summary modal state
    const [editSummaryModal, setEditSummaryModal] = useState<{
        isOpen: boolean;
        fileId: string;
        fileName: string;
        currentSummary: string;
    }>({
        isOpen: false,
        fileId: '',
        fileName: '',
        currentSummary: '',
    });

    // File preview modal state (only for files, not cloud KBs)
    const [filePreviewModal, setFilePreviewModal] = useState<{
        isOpen: boolean;
        file: (Entry | FileEntry) | null;
    }>({
        isOpen: false,
        file: null,
    });

    const { folders, recentFiles, llamacloudKBs, loading: foldersLoading, refetch: refetchFolders } = useKnowledgeFolders();

    // Cleanup movingFiles state periodically to prevent memory leaks
    React.useEffect(() => {
        const cleanup = () => {
            setMovingFiles(prev => {
                const active = Object.entries(prev).filter(([_, isMoving]) => isMoving);
                return Object.fromEntries(active);
            });
        };

        const interval = setInterval(cleanup, 60000); // Cleanup every minute
        return () => clearInterval(interval);
    }, []);

    // Filter data based on search query
    const filteredData: { folders: LocalTreeItem[]; llamacloudKBs: CloudKBEntry[] } = React.useMemo(() => {
        if (!searchQuery.trim()) {
            return { folders: treeData, llamacloudKBs };
        }

        const query = searchQuery.toLowerCase().trim();
        
        // Filter LlamaCloud KBs
        const filteredCloudKBs = llamacloudKBs.filter(kb => 
            kb.name.toLowerCase().includes(query) ||
            kb.description?.toLowerCase().includes(query) ||
            kb.index_name?.toLowerCase().includes(query)
        );

        // Filter tree data (folders and their files)
        const filteredFolders = treeData.map(folder => {
            const folderMatches = folder.name.toLowerCase().includes(query) ||
                                (folder.data && 'description' in folder.data && folder.data.description?.toLowerCase().includes(query));
            
            const filteredChildren = (folder.children || []).filter(child =>
                child.name.toLowerCase().includes(query) ||
                (child.data && 'summary' in child.data && child.data.summary?.toLowerCase().includes(query))
            );

            // Include folder if it matches or has matching children
            if (folderMatches || filteredChildren.length > 0) {
                return {
                    ...folder,
                    children: filteredChildren,
                    expanded: filteredChildren.length > 0 ? true : folder.expanded // Auto-expand if has matching children
                };
            }
            return null;
        }).filter(item => item !== null) as LocalTreeItem[];

        return { 
            folders: filteredFolders, 
            llamacloudKBs: filteredCloudKBs 
        };
    }, [treeData, llamacloudKBs, searchQuery]);

    // DND Sensors
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Build tree structure
    React.useEffect(() => {
        const buildTree = () => {
            const tree: LocalTreeItem[] = folders.map(folder => {
                // Preserve existing expanded state
                const existingFolder = treeData.find(item => item.id === folder.folder_id);
                const isExpanded = existingFolder?.expanded || false;

                const children = (folderEntries[folder.folder_id]?.map(entry => ({
                    id: entry.entry_id,
                    type: 'file' as const,
                    name: entry.filename,
                    parentId: folder.folder_id,
                    data: entry,
                })) || []) as LocalTreeItem[];

                return {
                    id: folder.folder_id,
                    type: 'folder' as const,
                    name: folder.name,
                    data: folder,
                    children,
                    expanded: isExpanded,
                };
            });
            setTreeData(tree);
        };

        buildTree();
    }, [folders, folderEntries]);

    const handleCreateFolder = async () => {
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            if (!session?.access_token) {
                toast.error('Authentication error');
                return;
            }

            // Create folder using API - backend will handle unique naming
            const response = await fetch(`${API_URL}/knowledge-base/folders`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: 'Untitled Folder'
                })
            });

            if (response.ok) {
                const newFolder = await response.json();
                toast.success('Folder created successfully');
                refetchFolders();
                // Start editing the new folder immediately
                setTimeout(() => {
                    setEditingFolder(newFolder.folder_id);
                    setEditingName(newFolder.name);
                }, 100);
            } else {
                const errorData = await response.json().catch(() => null);
                toast.error(errorData?.detail || 'Failed to create folder');
            }
        } catch (error) {
            console.error('Error creating folder:', error);
            toast.error('Failed to create folder');
        }
    };

    const handleAddCloudKB = () => {
        setCloudKBDialog({
            isOpen: true,
            name: '',
            indexName: '',
            description: '',
            isCreating: false,
        });
    };


    const createCloudKB = async () => {
        if (!cloudKBDialog.name.trim() || !cloudKBDialog.indexName.trim()) return;

        setCloudKBDialog(prev => ({ ...prev, isCreating: true }));
        
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            
            if (!session?.access_token) {
                toast.error('Please log in to create cloud knowledge bases');
                return;
            }

            const response = await fetch(`${API_URL}/knowledge-base/llamacloud`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: cloudKBDialog.name.trim(),
                    index_name: cloudKBDialog.indexName.trim(),
                    description: cloudKBDialog.description.trim() || null,
                }),
            });

            if (response.ok) {
                toast.success('Cloud Knowledge Base created successfully');
                setCloudKBDialog({
                    isOpen: false,
                    name: '',
                    indexName: '',
                    description: '',
                    isCreating: false,
                });
                refetchFolders(); // This now also fetches LlamaCloud KBs
            } else {
                const error = await response.text();
                toast.error(`Failed to create cloud knowledge base: ${error}`);
            }
        } catch (error) {
            toast.error('Failed to create cloud knowledge base');
            console.error('Create cloud KB error:', error);
        } finally {
            setCloudKBDialog(prev => ({ ...prev, isCreating: false }));
        }
    };

    const handleFileSelect = (item: TreeItem) => {
        if (item.type === 'file' && item.data && 'entry_id' in item.data && 'filename' in item.data && item.data.filename) {
            setFilePreviewModal({
                isOpen: true,
                file: item.data as Entry | FileEntry,
            });
        } else {
            setSelectedItem(item);
        }
    };

    const handleStartEdit = (folderId: string, currentName: string) => {
        setEditingFolder(folderId);
        setEditingName(currentName);
        setValidationError(null);
        setTimeout(() => {
            editInputRef.current?.focus();
            editInputRef.current?.select();
        }, 0);
    };

    const handleEditChange = (newName: string) => {
        setEditingName(newName);

        // Real-time validation
        const existingNames = folders
            .map(f => f.name)
            .filter(name => name !== folders.find(f => f.folder_id === editingFolder)?.name);

        const nameValidation = FileNameValidator.validateName(newName, 'folder');
        const hasConflict = nameValidation.isValid && FileNameValidator.checkNameConflict(newName, existingNames);
        const isValid = nameValidation.isValid && !hasConflict;
        const errorMessage = hasConflict
            ? 'A folder with this name already exists'
            : FileNameValidator.getFriendlyErrorMessage(newName, 'folder');

        setValidationError(isValid ? null : errorMessage);
    };

    const handleFinishEdit = async () => {
        if (!editingFolder || !editingName.trim()) {
            setEditingFolder(null);
            return;
        }

        const trimmedName = editingName.trim();

        // Validate the name
        const existingNames = folders.map(f => f.name).filter(name => name !== folders.find(f => f.folder_id === editingFolder)?.name);
        const nameValidation = FileNameValidator.validateName(trimmedName, 'folder');
        const hasConflict = nameValidation.isValid && FileNameValidator.checkNameConflict(trimmedName, existingNames);
        const isValid = nameValidation.isValid && !hasConflict;

        if (!isValid) {
            const errorMessage = hasConflict
                ? 'A folder with this name already exists'
                : FileNameValidator.getFriendlyErrorMessage(trimmedName, 'folder');
            toast.error(errorMessage);
            return;
        }

        try {
            const supabase = createClient();

            // Update folder name directly using Supabase client
            const { error } = await supabase
                .from('knowledge_base_folders')
                .update({ name: trimmedName })
                .eq('folder_id', editingFolder);

            if (error) {
                console.error('Supabase error:', error);
                if (error.message?.includes('duplicate') || error.code === '23505') {
                    toast.error('A folder with this name already exists');
                } else {
                    toast.error('Failed to rename folder');
                }
            } else {
                toast.success('Folder renamed successfully');
                refetchFolders();
            }
        } catch (error) {
            console.error('Error renaming folder:', error);
            toast.error('Failed to rename folder');
        }

        setEditingFolder(null);
        setEditingName('');
        setValidationError(null);
    };

    const handleEditKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleFinishEdit();
        } else if (e.key === 'Escape') {
            setEditingFolder(null);
            setEditingName('');
            setValidationError(null);
        }
    };

    const fetchFolderEntries = async (folderId: string) => {
        setLoadingFolders(prev => ({ ...prev, [folderId]: true }));

        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            if (!session?.access_token) {
                throw new Error('No session found');
            }

            const response = await fetch(`${API_URL}/knowledge-base/folders/${folderId}/entries`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Download response status:', response.status);
                console.log('Download result:', data);
                
                // Extract the entries array from the response
                const entries = data.entries || data;
                if (!Array.isArray(entries)) {
                    console.error('Expected entries to be an array, got:', typeof entries, entries);
                }
                setFolderEntries(prev => ({ ...prev, [folderId]: Array.isArray(entries) ? entries : [] }));
            } else {
                console.error('Failed to fetch folder entries:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('Failed to fetch entries:', error);
        } finally {
            setLoadingFolders(prev => ({ ...prev, [folderId]: false }));
        }
    };

    const handleExpand = async (folderId: string) => {
        const folder = treeData.find(item => item.id === folderId);
        const isCurrentlyExpanded = folder?.expanded;

        setTreeData(prev =>
            prev.map(item =>
                item.id === folderId
                    ? { ...item, expanded: !item.expanded }
                    : item
            )
        );

        // Fetch entries if expanding and not already loaded
        if (folder && !isCurrentlyExpanded && !folderEntries[folderId]) {
            await fetchFolderEntries(folderId);
        }

        // Clear loading state if collapsing
        if (isCurrentlyExpanded) {
            setLoadingFolders(prev => ({ ...prev, [folderId]: false }));
        }
    };

    const handleDelete = (id: string, type: 'folder' | 'file') => {
        const item = treeData.flatMap(folder => [folder, ...(folder.children || [])])
            .find(item => item.id === id);

        if (!item) return;

        setDeleteConfirm({
            isOpen: true,
            item: { id, name: item.name, type },
            isDeleting: false,
        });
    };

    const confirmDelete = async () => {
        if (!deleteConfirm.item) return;

        const { id, type } = deleteConfirm.item;

        setDeleteConfirm(prev => ({ ...prev, isDeleting: true }));

        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            if (!session?.access_token) {
                throw new Error('No session found');
            }

            const endpoint = type === 'folder'
                ? `${API_URL}/knowledge-base/folders/${id}`
                : `${API_URL}/knowledge-base/entries/${id}`;

            const response = await fetch(endpoint, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                toast.success(`${type === 'folder' ? 'Folder' : 'File'} deleted`);
                refetchFolders();

                if (type === 'folder') {
                    if (selectedItem?.id === id) {
                        setSelectedItem(null);
                    }
                } else {
                    // Also reload folder entries for immediate UI update
                    const parentFolder = treeData.find(folder =>
                        folder.children?.some(child => child.id === id)
                    );
                    if (parentFolder) {
                        await fetchFolderEntries(parentFolder.id);
                    }
                }
            } else {
                toast.error(`Failed to delete ${type}`);
            }
        } catch (error) {
            toast.error(`Failed to delete ${type}`);
        } finally {
            setDeleteConfirm({
                isOpen: false,
                item: null,
                isDeleting: false,
            });
        }
    };

    const handleEditSummary = (fileId: string, fileName: string, currentSummary: string) => {
        setEditSummaryModal({
            isOpen: true,
            fileId,
            fileName,
            currentSummary,
        });
    };

    const handleSaveSummary = async (newSummary: string) => {
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            if (!session?.access_token) {
                throw new Error('No session found');
            }

            const response = await fetch(`${API_URL}/knowledge-base/entries/${editSummaryModal.fileId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    summary: newSummary
                })
            });

            if (response.ok) {
                toast.success('Summary updated successfully');
                // Refresh the folder entries to show updated summary
                const fileItem = treeData.flatMap(folder => folder.children || []).find(file => file.id === editSummaryModal.fileId);
                if (fileItem?.parentId) {
                    await fetchFolderEntries(fileItem.parentId);
                }
                refetchFolders();
            } else {
                const errorData = await response.json().catch(() => null);
                toast.error(errorData?.detail || 'Failed to update summary');
            }
        } catch (error) {
            console.error('Error updating summary:', error);
            toast.error('Failed to update summary');
        }
    };

    const handleNativeFileDrop = async (files: FileList, folderId: string) => {
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            if (!session?.access_token) {
                throw new Error('No session found');
            }

            const fileArray = Array.from(files);
            const totalFiles = fileArray.length;

            // Initialize upload status
            setUploadStatus(prev => ({
                ...prev,
                [folderId]: {
                    isUploading: true,
                    progress: 0,
                    totalFiles,
                    completedFiles: 0,
                    currentFile: fileArray[0]?.name
                }
            }));

            // Upload files one by one
            let successCount = 0;
            let limitErrorShown = false;

            for (let i = 0; i < fileArray.length; i++) {
                const file = fileArray[i];

                // Validate filename before upload
                const validation = FileNameValidator.validateName(file.name, 'file');
                if (!validation.isValid) {
                    toast.error(`Invalid filename "${file.name}": ${FileNameValidator.getFriendlyErrorMessage(file.name, 'file')}`);
                    continue;
                }

                // Update current file status
                setUploadStatus(prev => ({
                    ...prev,
                    [folderId]: {
                        ...prev[folderId],
                        currentFile: file.name,
                        progress: (i / totalFiles) * 100
                    }
                }));

                try {
                    const formData = new FormData();
                    formData.append('file', file);

                    const response = await fetch(`${API_URL}/knowledge-base/folders/${folderId}/upload`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${session.access_token}`,
                        },
                        body: formData
                    });

                    if (response.ok) {
                        const result = await response.json();
                        successCount++;

                        // Show info about filename changes
                        if (result.filename_changed) {
                            toast.info(`File "${result.original_filename}" was renamed to "${result.final_filename}" to avoid conflicts`);
                        }
                    } else {
                        // Handle specific error cases
                        if (response.status === 413) {
                            if (!limitErrorShown) {
                                try {
                                    const errorData = await response.json();
                                    toast.error(`Knowledge base limit exceeded: ${errorData.detail || 'Total file size limit (50MB) exceeded'}`);
                                } catch {
                                    toast.error('Knowledge base limit exceeded: Total file size limit (50MB) exceeded');
                                }
                                limitErrorShown = true;
                            }
                        } else if (response.status === 400) {
                            try {
                                const errorData = await response.json();
                                toast.error(`Failed to upload ${file.name}: ${errorData.detail}`);
                            } catch {
                                toast.error(`Failed to upload ${file.name}: Invalid file`);
                            }
                        } else {
                            toast.error(`Failed to upload ${file.name}: Error ${response.status}`);
                            console.error(`Failed to upload ${file.name}:`, response.status);
                        }
                    }
                } catch (fileError) {
                    toast.error(`Error uploading ${file.name}`);
                    console.error(`Error uploading ${file.name}:`, fileError);
                }

                // Update completed count
                setUploadStatus(prev => ({
                    ...prev,
                    [folderId]: {
                        ...prev[folderId],
                        completedFiles: i + 1,
                        progress: ((i + 1) / totalFiles) * 100
                    }
                }));
            }

            // Clear upload status after a short delay
            setTimeout(() => {
                setUploadStatus(prev => {
                    const newStatus = { ...prev };
                    delete newStatus[folderId];
                    return newStatus;
                });
            }, 3000);

            if (successCount === totalFiles) {
                toast.success(`Successfully uploaded ${successCount} file(s)`);
            } else if (successCount > 0) {
                toast.success(`Uploaded ${successCount} of ${totalFiles} files`);
            } else {
                toast.error('Failed to upload files');
            }

            // Refresh the folder contents
            refetchFolders();
            // Also refresh the specific folder's entries to show new files immediately
            await fetchFolderEntries(folderId);

        } catch (error) {
            console.error('Error uploading files:', error);
            toast.error('Failed to upload files');

            // Clear upload status on error
            setUploadStatus(prev => {
                const newStatus = { ...prev };
                delete newStatus[folderId];
                return newStatus;
            });
        }
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (!over || active.id === over.id) {
            setActiveId(null);
            return;
        }

        // Handle internal DND - get the actual item IDs
        const activeItemId = active.id.toString();
        const overItemId = over.id.toString().replace('droppable-', ''); // Remove droppable prefix if present

        // Check if active item is a cloud knowledge base (from root level)
        if (isCloudKBId(activeItemId)) {
            const kbId = extractCloudKBId(activeItemId);
            const cloudKBItem = llamacloudKBs.find(kb => kb.entry_id === kbId);
            
            if (cloudKBItem) {
                // Moving cloud knowledge base to folder
                const overItem = treeData.find(item => item.id === overItemId);
                if (overItem && overItem.type === 'folder') {
                    handleMoveCloudKB(cloudKBItem.entry_id, overItem.id);
                } else {
                    // Invalid drop target
                    toast.error('Cloud knowledge bases can only be dropped on folders');
                }
            }
            setActiveId(null);
            return;
        }

        const activeItem = treeData.flatMap(folder => [folder, ...(folder.children || [])]).find(item => item.id === activeItemId);
        const overItem = treeData.flatMap(folder => [folder, ...(folder.children || [])]).find(item => item.id === overItemId);

        if (!activeItem || !overItem) {
            setActiveId(null);
            return;
        }

        // File to folder: Move file to different folder
        if (activeItem.type === 'file' && overItem.type === 'folder') {
            handleMoveFile(activeItem.id, overItem.id);
        } else {
            // Invalid combination
            toast.error('Files can only be moved to folders');
        }

        setActiveId(null);
    };

    const handleMoveFile = async (fileId: string, targetFolderId: string) => {
        // Prevent concurrent operations
        if (isOperationInProgress.current) {
            return;
        }
        
        isOperationInProgress.current = true;
        setMovingFiles(prev => ({ ...prev, [fileId]: true }));

        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            if (!session?.access_token) {
                toast.error('Authentication required. Please log in again.');
                isOperationInProgress.current = false;
                setMovingFiles(prev => ({ ...prev, [fileId]: false }));
                return;
            }

            const response = await fetch(`${API_URL}/knowledge-base/entries/${fileId}/move`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    folder_id: targetFolderId
                })
            });

            if (response.ok) {
                toast.success('File moved successfully');
                refetchFolders();
                
                // Refresh folder entries for both source and target folders
                const movedItem = treeData.flatMap(folder => folder.children || []).find(file => file.id === fileId);
                if (movedItem?.parentId) {
                    try {
                        await fetchFolderEntries(movedItem.parentId);
                    } catch (fetchError) {
                        console.error('Failed to refresh source folder:', fetchError);
                    }
                }
                
                try {
                    await fetchFolderEntries(targetFolderId);
                } catch (fetchError) {
                    console.error('Failed to refresh target folder:', fetchError);
                }
            } else {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                const errorMessage = errorData.detail || errorData.message || 'Failed to move file';
                toast.error(errorMessage);
            }
        } catch (error) {
            console.error('Move file error:', error);
            const message = error instanceof Error ? error.message : 'Failed to move file';
            toast.error(message);
        } finally {
            setMovingFiles(prev => ({ ...prev, [fileId]: false }));
            isOperationInProgress.current = false;
        }
    };

    const handleMoveCloudKB = async (kbId: string, targetFolderId: string) => {
        // Prevent concurrent operations
        if (isOperationInProgress.current) {
            return;
        }
        
        isOperationInProgress.current = true;
        const movingKey = getCloudKBId(kbId);
        setMovingFiles(prev => ({ ...prev, [movingKey]: true }));

        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            if (!session?.access_token) {
                toast.error('Authentication required. Please log in again.');
                isOperationInProgress.current = false;
                setMovingFiles(prev => ({ ...prev, [movingKey]: false }));
                return;
            }

            const response = await fetch(`${API_URL}/knowledge-base/llamacloud/${kbId}/move`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    folder_id: targetFolderId
                })
            });

            if (response.ok) {
                const data = await response.json();
                toast.success('Cloud knowledge base moved successfully');
                
                // Refresh data
                refetchFolders(); // This will refresh both folders and root-level cloud KBs
                
                // Refresh target folder entries to show the moved cloud KB
                try {
                    await fetchFolderEntries(targetFolderId);
                } catch (fetchError) {
                    console.error('Failed to refresh folder entries:', fetchError);
                    // Non-critical error, don't show to user
                }
            } else {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                const errorMessage = errorData.detail || errorData.message || 'Failed to move cloud knowledge base';
                toast.error(errorMessage);
            }
        } catch (error) {
            console.error('Move cloud KB error:', error);
            const message = error instanceof Error ? error.message : 'Failed to move cloud knowledge base';
            toast.error(message);
        } finally {
            setMovingFiles(prev => ({ ...prev, [movingKey]: false }));
            isOperationInProgress.current = false;
        }
    };

    if (foldersLoading) {
        return (
            <div className="h-screen flex flex-col bg-background">
                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-7xl mx-auto p-6">
                        {/* Header Skeleton */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <Skeleton className="h-9 w-48 mb-2" />
                                    <Skeleton className="h-5 w-96" />
                                </div>
                                <div className="flex gap-3">
                                    <Skeleton className="h-10 w-32" />
                                    <Skeleton className="h-10 w-32" />
                                </div>
                            </div>
                            <Skeleton className="h-10 w-80" />
                        </div>

                        {/* Content Skeleton */}
                        <div className="space-y-6">
                            <Skeleton className="h-6 w-32" />
                            <div className="space-y-4">
                                <Skeleton className="h-16 w-full" />
                                <Skeleton className="h-16 w-full" />
                                <Skeleton className="h-16 w-full" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="min-h-screen">
                <div className="container mx-auto max-w-7xl px-4 py-8">
                    <KnowledgeBasePageHeader />
                </div>
                <div className="container mx-auto max-w-7xl px-4 py-2">
                    <div className="w-full min-h-[calc(100vh-300px)]">
                        {/* Header Section */}
                        <div className="flex justify-between items-start mb-8">
                            <div className="space-y-3">
                                <div>
                                    <h2 className="text-xl font-semibold text-foreground">Knowledge Base</h2>
                                    <p className="text-sm text-muted-foreground">
                                        Organize documents and files for AI agents to search and reference
                                    </p>
                                </div>
                                {/* Search Input */}
                                <div className="relative w-96">
                                    <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search folders, files, and cloud knowledge bases..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <Button variant="outline" onClick={handleAddCloudKB}>
                                    <Database className="h-4 w-4 mr-2" />
                                    Cloud Knowledge Base
                                </Button>
                                <Button variant="outline" onClick={handleCreateFolder}>
                                    <FolderPlusIcon className="h-4 w-4 mr-2" />
                                    New Folder
                                </Button>
                                <FileUploadModal
                                    folders={folders}
                                    onUploadComplete={refetchFolders}
                                />
                            </div>
                        </div>

                        {/* Main Content */}
                        <div 
                            className="space-y-8"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                // Only prevent default - don't show any message since folders handle their own drops
                            }}
                        >
                            {/* Recent Files Section - Mix files and LlamaCloud KBs */}
                            {((recentFiles && recentFiles.length > 0) || (llamacloudKBs && llamacloudKBs.length > 0)) && (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <h3 className="text-lg font-medium text-foreground">Recent Items</h3>
                                        <p className="text-sm text-muted-foreground">Recently uploaded documents and cloud knowledge bases</p>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-8">
                                        {/* Regular Files */}
                                        {recentFiles.slice(0, (llamacloudKBs.length > 0 ? 4 : 6)).map((file) => {
                                            const fileInfo = getFileTypeInfo(file.filename);
                                            return (
                                                <div
                                                    key={`file-${file.entry_id}`}
                                                    className="group cursor-pointer"
                                                    onClick={() => setFilePreviewModal({
                                                        isOpen: true,
                                                        file: file,
                                                    })}
                                                >
                                                    <div className="p-4 border border-border rounded-lg hover:shadow-md hover:border-border/80 transition-all duration-200">
                                                        <div className="space-y-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${fileInfo.colorClass}`}>
                                                                    {fileInfo.extension}
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="space-y-1">
                                                                <p className="text-xs font-medium text-foreground truncate" title={file.filename}>
                                                                    {file.filename}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {formatDate(file.created_at)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* LlamaCloud Knowledge Bases as Draggable Items */}
                                        {filteredData.llamacloudKBs.map((kb) => (
                                            <DraggableCloudKB
                                                key={getCloudKBId(kb.entry_id)}
                                                kb={kb}
                                                isMoving={movingFiles[getCloudKBId(kb.entry_id)] || false}
                                                onSelect={setSelectedItem}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Folders Tree Structure */}
                            {treeData.length > 0 && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-lg font-medium text-foreground">All Folders</h3>
                                        <span className="text-xs text-muted-foreground">
                                            {folders.length} folders
                                        </span>
                                    </div>
                                    <DndContext
                                        sensors={sensors}
                                        collisionDetection={closestCenter}
                                        onDragStart={handleDragStart}
                                        onDragEnd={handleDragEnd}
                                    >
                                        <SortableContext
                                            items={[]} // No sorting - only drag files to folders
                                            strategy={verticalListSortingStrategy}
                                        >
                                            {searchQuery.trim() && filteredData.folders.length === 0 && filteredData.llamacloudKBs.length === 0 ? (
                                                <div className="text-center py-12">
                                                    <SearchIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                                    <h3 className="text-lg font-medium text-foreground mb-2">No results found</h3>
                                                    <p className="text-sm text-muted-foreground">
                                                        No folders, files, or cloud knowledge bases match "{searchQuery}"
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {filteredData.folders.map((item) => (
                                                    <SharedTreeItem
                                                        key={item.id}
                                                        item={item}
                                                        onExpand={handleExpand}
                                                        onSelect={handleFileSelect}
                                                        enableDnd={true}
                                                        enableActions={true}
                                                        enableEdit={true}
                                                        onDelete={handleDelete}
                                                        onEditSummary={handleEditSummary}
                                                        editingFolder={editingFolder}
                                                        editingName={editingName}
                                                        onStartEdit={handleStartEdit}
                                                        onFinishEdit={handleFinishEdit}
                                                        onEditChange={handleEditChange}
                                                        onEditKeyPress={handleEditKeyPress}
                                                        editInputRef={editInputRef}
                                                        onNativeFileDrop={handleNativeFileDrop}
                                                        uploadStatus={uploadStatus[item.id]}
                                                        validationError={editingFolder === item.id ? validationError : null}
                                                        isLoadingEntries={loadingFolders[item.id]}
                                                        movingFiles={movingFiles}
                                                    />
                                                ))}
                                                </div>
                                            )}
                                        </SortableContext>

                                        <DragOverlay>
                                            {activeId ? (() => {
                                                const activeIdStr = activeId.toString();
                                                
                                                // Check if it's a cloud knowledge base being dragged
                                                if (isCloudKBId(activeIdStr)) {
                                                    const kbId = extractCloudKBId(activeIdStr);
                                                    const cloudKB = llamacloudKBs.find(kb => kb.entry_id === kbId);
                                                    if (cloudKB) {
                                                        return (
                                                            <div className="bg-background border rounded-lg p-3 shadow-lg">
                                                                <div className="flex items-center gap-2">
                                                                    <Database className="h-4 w-4 text-blue-500" />
                                                                    <span className="font-medium text-sm">
                                                                        {cloudKB.name}
                                                                    </span>
                                                                    <div className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border bg-blue-100 text-blue-700 border-blue-200">
                                                                        CLOUD
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                }

                                                // Find the active item in the tree data
                                                const findActiveItem = (items: any[]): any => {
                                                    for (const item of items) {
                                                        if (item.id === activeId) return item;
                                                        if (item.children) {
                                                            const found = findActiveItem(item.children);
                                                            if (found) return found;
                                                        }
                                                    }
                                                    return null;
                                                };

                                                const activeItem = findActiveItem(treeData);

                                                if (activeItem?.type === 'file') {
                                                    return <FileDragOverlay item={activeItem} />;
                                                } else {
                                                    return (
                                                        <div className="bg-background border rounded-lg p-3">
                                                            <div className="flex items-center gap-2">
                                                                <FolderIcon className="h-4 w-4 text-blue-500" />
                                                                <span className="font-medium text-sm">
                                                                    {activeItem?.name}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                            })() : null}
                                        </DragOverlay>
                                    </DndContext>
                                </div>
                            )}

                            {/* Empty State */}
                            {treeData.length === 0 && (!llamacloudKBs || llamacloudKBs.length === 0) && !foldersLoading && (
                                <div className="text-center py-16 space-y-6">
                                    <div className="mx-auto w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center">
                                        <FolderIcon className="h-12 w-12 text-muted-foreground/50" />
                                                            </div>
                                    <div className="space-y-2">
                                        <h3 className="text-lg font-semibold text-foreground">No knowledge base content yet</h3>
                                        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                                            Create folders for documents or add Cloud Knowledge Bases to get started.
                                        </p>
                                                        </div>
                                    <Button size="lg" onClick={handleCreateFolder}>
                                        <FolderPlusIcon className="mr-2 h-5 w-5" />
                                        Create First Folder
                                        </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

                {/* Modals */}
                <KBDeleteConfirmDialog
                    isOpen={deleteConfirm.isOpen}
                    onClose={() => setDeleteConfirm({ isOpen: false, item: null, isDeleting: false })}
                onConfirm={confirmDelete}
                    itemName={deleteConfirm.item?.name || ''}
                    itemType={deleteConfirm.item?.type || 'file'}
                    isDeleting={deleteConfirm.isDeleting}
                />

                <EditSummaryModal
                    isOpen={editSummaryModal.isOpen}
                    onClose={() => setEditSummaryModal({ isOpen: false, fileId: '', fileName: '', currentSummary: '' })}
                onSave={handleSaveSummary}
                    fileName={editSummaryModal.fileName}
                    currentSummary={editSummaryModal.currentSummary}
                />

                {filePreviewModal.file && filePreviewModal.file.filename && (
                    <KBFilePreviewModal
                        isOpen={filePreviewModal.isOpen}
                        onClose={() => setFilePreviewModal({ isOpen: false, file: null })}
                        file={filePreviewModal.file as { entry_id: string; filename: string; summary?: string; file_size?: number; created_at: string }}
                        onEditSummary={handleEditSummary}
                    />
                )}


            {/* Cloud Knowledge Base Dialog */}
            <Dialog open={cloudKBDialog.isOpen} onOpenChange={(open) => setCloudKBDialog(prev => ({ ...prev, isOpen: open }))}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Database className="h-5 w-5" />
                            Add Cloud Knowledge Base
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="kb-name">Knowledge Base Name</Label>
                            <Input
                                id="kb-name"
                                placeholder="e.g., Documentation"
                                value={cloudKBDialog.name}
                                onChange={(e) => setCloudKBDialog(prev => ({ ...prev, name: e.target.value }))}
                                disabled={cloudKBDialog.isCreating}
                            />
                        </div>
                        <div>
                            <Label htmlFor="kb-index">LlamaCloud Index Name</Label>
                            <Input
                                id="kb-index"
                                placeholder="Enter your LlamaCloud index identifier..."
                                value={cloudKBDialog.indexName}
                                onChange={(e) => setCloudKBDialog(prev => ({ ...prev, indexName: e.target.value }))}
                                disabled={cloudKBDialog.isCreating}
                            />
                        </div>
                        <div>
                            <Label htmlFor="kb-description">Description (Optional)</Label>
                            <Textarea
                                id="kb-description"
                                placeholder="What information does this knowledge base contain?"
                                value={cloudKBDialog.description}
                                onChange={(e) => setCloudKBDialog(prev => ({ ...prev, description: e.target.value }))}
                                disabled={cloudKBDialog.isCreating}
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button 
                            variant="outline" 
                            onClick={() => setCloudKBDialog(prev => ({ ...prev, isOpen: false }))}
                            disabled={cloudKBDialog.isCreating}
                        >
                            Cancel
                        </Button>
                        <Button 
                            onClick={createCloudKB}
                            disabled={!cloudKBDialog.name.trim() || !cloudKBDialog.indexName.trim() || cloudKBDialog.isCreating}
                        >
                            {cloudKBDialog.isCreating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            Add Knowledge Base
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
