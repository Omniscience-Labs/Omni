'use client';

<<<<<<< HEAD
import { useState, useEffect } from 'react';
=======
import React, { useState } from 'react';
>>>>>>> upstream/PRODUCTION
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
<<<<<<< HEAD
import { Skeleton } from '@/components/ui/skeleton';
import { File } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PdfRenderer } from '@/components/thread/preview-renderers/pdf-renderer';
import { HtmlRenderer } from '@/components/thread/preview-renderers/html-renderer';
import { MarkdownRenderer } from '@/components/thread/preview-renderers/file-preview-markdown-renderer';
=======
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FileIcon, Edit, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
>>>>>>> upstream/PRODUCTION

interface KBFilePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    file: {
        entry_id: string;
        filename: string;
<<<<<<< HEAD
        summary?: string;
        file_size?: number;
=======
        summary: string;
        file_size: number;
>>>>>>> upstream/PRODUCTION
        created_at: string;
    };
    onEditSummary: (fileId: string, fileName: string, summary: string) => void;
}

export function KBFilePreviewModal({ isOpen, onClose, file, onEditSummary }: KBFilePreviewModalProps) {
<<<<<<< HEAD
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [binaryBlobUrl, setBinaryBlobUrl] = useState<string | null>(null);

    // File type detection
    const filename = file.filename;
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    const isPdf = extension === 'pdf';
    const isMarkdown = ['md', 'markdown'].includes(extension);
    const isHtml = ['html', 'htm'].includes(extension);
    const isCode = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'css', 'json', 'xml', 'yaml', 'yml'].includes(extension);

    // Renderer mapping like file attachments
    const rendererMap = {
        'html': HtmlRenderer,
        'htm': HtmlRenderer,
        'md': MarkdownRenderer,
        'markdown': MarkdownRenderer,
    };

    // Load file content when modal opens
    useEffect(() => {
        if (isOpen && file.entry_id) {
            loadFileContent();
        } else {
            setFileContent(null);
            if (binaryBlobUrl) {
                URL.revokeObjectURL(binaryBlobUrl);
            }
            setBinaryBlobUrl(null);
        }
    }, [isOpen, file.entry_id]);

    // Cleanup blob URL on unmount
    useEffect(() => {
        return () => {
            if (binaryBlobUrl) {
                URL.revokeObjectURL(binaryBlobUrl);
            }
        };
    }, [binaryBlobUrl]);

    const loadFileContent = async () => {
        setIsLoading(true);
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            if (!session?.access_token) {
                throw new Error('No session found');
            }

            const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';
            console.log('Loading file content for entry_id:', file.entry_id);

            const response = await fetch(`${API_URL}/knowledge-base/entries/${file.entry_id}/download`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('Download response status:', response.status);

            if (response.ok) {
                const result = await response.json();
                console.log('Download result:', result);

                if (result.is_binary) {
                    // For binary files (PDFs), create blob URL like file attachments do
                    const binaryString = atob(result.content);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }

                    // Create blob and blob URL like useImageContent does
                    const blob = new Blob([bytes], {
                        type: 'application/pdf'
                    });
                    const blobUrl = URL.createObjectURL(blob);
                    setBinaryBlobUrl(blobUrl);
                    setFileContent(null);
                } else {
                    setFileContent(result.content);
                    setBinaryBlobUrl(null);
                }
            } else {
                const errorText = await response.text();
                console.error('Download failed:', response.status, errorText);
                setFileContent(`Error loading file: ${response.status} ${errorText}`);
            }
        } catch (error) {
            console.error('Failed to load file content:', error);
            setFileContent(`Error loading file: ${error}`);
        } finally {
            setIsLoading(false);
        }
=======
    const [summary, setSummary] = useState(file.summary);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Reset state when file changes or modal opens
    React.useEffect(() => {
        if (isOpen) {
            setSummary(file.summary);
            setIsEditing(true); // Auto-start editing when modal opens
        }
    }, [isOpen, file.entry_id, file.summary]);

    const handleSave = async () => {
        if (!summary.trim()) {
            toast.error('Summary cannot be empty');
            return;
        }

        setIsSaving(true);
        try {
            // Call the parent's edit summary handler directly
            onEditSummary(file.entry_id, file.filename, summary);
            onClose();
        } catch (error) {
            console.error('Error saving summary:', error);
            toast.error('Failed to save summary');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setSummary(file.summary); // Reset to original
        onClose();
    };

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
>>>>>>> upstream/PRODUCTION
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
<<<<<<< HEAD
            <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>File Preview</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col h-[600px]">
                    {/* File preview - exactly like file browser */}
                    <div className="border rounded-xl overflow-hidden flex flex-col flex-1">
                        <div className="p-2 bg-muted text-sm font-medium border-b">
                            {file.filename}
                        </div>
                        <div className="overflow-y-auto flex-1">
                            {isLoading ? (
                                <div className="space-y-2 p-2">
                                    {[1, 2, 3, 4, 5].map((i) => (
                                        <Skeleton key={i} className="h-4 w-full" />
                                    ))}
                                </div>
                            ) : isPdf && binaryBlobUrl ? (
                                <div className="w-full h-full">
                                    <PdfRenderer url={binaryBlobUrl} className="w-full h-full" />
                                </div>
                            ) : fileContent ? (
                                <div className="p-2 h-full">
                                    {(() => {
                                        // Use appropriate renderer based on file type
                                        const Renderer = rendererMap[extension as keyof typeof rendererMap];

                                        if (Renderer) {
                                            return (
                                                <Renderer
                                                    content={fileContent}
                                                    previewUrl=""
                                                    className="h-full w-full"
                                                />
                                            );
                                        } else if (isCode) {
                                            // For code files, show with syntax highlighting
                                            return (
                                                <pre className="text-xs whitespace-pre-wrap bg-muted/30 p-3 rounded-md overflow-auto h-full">
                                                    <code className={`language-${extension}`}>
                                                        {fileContent}
                                                    </code>
                                                </pre>
                                            );
                                        } else {
                                            // Default text rendering
                                            return (
                                                <pre className="text-xs whitespace-pre-wrap">{fileContent}</pre>
                                            );
                                        }
                                    })()}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                    <File className="h-8 w-8 mb-2" />
                                    <p>Select a file to preview</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

=======
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                            <FileIcon className="h-5 w-5" />
                        </div>
                        <div>
                            <DialogTitle>Edit File Summary</DialogTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                                {file.filename} • {formatFileSize(file.file_size)}
                            </p>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 flex flex-col space-y-4">
                    <div className="flex-1 flex flex-col space-y-2">
                        <Label htmlFor="summary">Summary</Label>
                        <Textarea
                            id="summary"
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
                            placeholder="Enter a description of this file's content..."
                            rows={12}
                            className="resize-none flex-1 min-h-[250px] max-h-[250px]"
                        />
                        <p className="text-xs text-muted-foreground">
                            This summary helps AI agents understand and search for relevant content in this file.
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t flex-shrink-0">
                        <Button
                            variant="outline"
                            onClick={handleCancel}
                            disabled={isSaving}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={!summary.trim() || isSaving}
                            className="gap-2"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Edit className="h-4 w-4" />
                                    Save Summary
                                </>
                            )}
                        </Button>
                    </div>
                </div>
>>>>>>> upstream/PRODUCTION
            </DialogContent>
        </Dialog>
    );
}