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
import { FileNameValidator } from '@/lib/validation';
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
    Database
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

interface Folder {
    folder_id: string;
    name: string;
    description?: string;
    entry_count: number;
    created_at: string;
}

interface Entry {
    entry_id: string;
    filename: string;
    summary: string;
    file_size: number;
    created_at: string;
}

interface TreeItem {
    id: string;
    type: 'folder' | 'file';
    name: string;
    parentId?: string;
    data?: Folder | Entry;
    children?: TreeItem[];
    expanded?: boolean;
}

// Hooks for API calls
const useKnowledgeFolders = () => {
    const [folders, setFolders] = useState<Folder[]>([]);
    const [recentFiles, setRecentFiles] = useState<Entry[]>([]);
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
        } catch (error) {
            console.error('Failed to fetch folders:', error);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        fetchFolders();
    }, []);

    return { folders, recentFiles, loading, refetch: fetchFolders };
};

export function KnowledgeBasePage() {
    const [treeData, setTreeData] = useState<TreeItem[]>([]);
    const [folderEntries, setFolderEntries] = useState<{ [folderId: string]: Entry[] }>({});
    const [loadingFolders, setLoadingFolders] = useState<{ [folderId: string]: boolean }>({});
    const [movingFiles, setMovingFiles] = useState<{ [fileId: string]: boolean }>({});
    const [selectedItem, setSelectedItem] = useState<TreeItem | null>(null);
    const [editingFolder, setEditingFolder] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [validationError, setValidationError] = useState<string | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const editInputRef = useRef<HTMLInputElement>(null);

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

    // File preview modal state
    const [filePreviewModal, setFilePreviewModal] = useState<{
        isOpen: boolean;
        file: Entry | null;
    }>({
        isOpen: false,
        file: null,
    });

    const { folders, recentFiles, loading: foldersLoading, refetch: refetchFolders } = useKnowledgeFolders();

    const handleCreateFolder = () => {
        console.log('Create folder clicked');
    };

    const handleAddCloudKB = () => {
        console.log('Add Cloud Knowledge Base clicked');
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
                            <div className="space-y-1">
                                <h2 className="text-xl font-semibold text-foreground">Knowledge Base</h2>
                                <p className="text-sm text-muted-foreground">
                                    Organize documents and files for AI agents to search and reference
                                </p>
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
                        <div className="space-y-8">
                            {/* Recent Files Section */}
                            {recentFiles && recentFiles.length > 0 && (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <h3 className="text-lg font-medium text-foreground">Recent Files</h3>
                                        <p className="text-sm text-muted-foreground">Recently uploaded documents</p>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-8">
                                        {recentFiles.slice(0, 6).map((file) => {
                                            const fileInfo = getFileTypeInfo(file.filename);
                                            return (
                                                <div
                                                    key={file.entry_id}
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
                                    </div>
                                </div>
                            )}

                            {/* Empty State */}
                            {(!folders || folders.length === 0) && !foldersLoading && (
                                <div className="text-center py-16 space-y-6">
                                    <div className="mx-auto w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center">
                                        <FolderIcon className="h-12 w-12 text-muted-foreground/50" />
                                            </div>
                                    <div className="space-y-2">
                                        <h3 className="text-lg font-semibold text-foreground">No folders yet</h3>
                                        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                                            Create your first folder to start organizing your documents and files.
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
                onConfirm={async () => console.log('Delete confirmed')}
                itemName={deleteConfirm.item?.name || ''}
                itemType={deleteConfirm.item?.type || 'file'}
                isDeleting={deleteConfirm.isDeleting}
            />

            <EditSummaryModal
                isOpen={editSummaryModal.isOpen}
                onClose={() => setEditSummaryModal({ isOpen: false, fileId: '', fileName: '', currentSummary: '' })}
                onSave={async (summary: string) => console.log('Summary saved:', summary)}
                fileName={editSummaryModal.fileName}
                currentSummary={editSummaryModal.currentSummary}
            />

            {filePreviewModal.file && (
                <KBFilePreviewModal
                    isOpen={filePreviewModal.isOpen}
                    onClose={() => setFilePreviewModal({ isOpen: false, file: null })}
                    file={filePreviewModal.file}
                    onEditSummary={(fileId: string, fileName: string, summary: string) => console.log('Edit summary:', fileId, fileName, summary)}
                />
            )}
        </div>
    );
}
