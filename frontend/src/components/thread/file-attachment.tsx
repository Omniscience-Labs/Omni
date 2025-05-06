import React from 'react';
import Image from 'next/image';
import {
    FileText, FileImage, FileCode, FilePlus, FileSpreadsheet, FileVideo,
    FileAudio, FileType, Database, Archive, File, ExternalLink,
    Download
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Define basic file types
export type FileType =
    | 'image' | 'code' | 'text' | 'pdf'
    | 'audio' | 'video' | 'spreadsheet'
    | 'archive' | 'database' | 'markdown'
    | 'other';

// Simple extension-based file type detection
function getFileType(filename: string): FileType {
    const ext = filename.split('.').pop()?.toLowerCase() || '';

    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
    if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'java', 'c', 'cpp'].includes(ext)) return 'code';
    if (['txt', 'log', 'env'].includes(ext)) return 'text';
    if (['md', 'markdown'].includes(ext)) return 'markdown';
    if (ext === 'pdf') return 'pdf';
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return 'audio';
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
    if (['csv', 'xls', 'xlsx'].includes(ext)) return 'spreadsheet';
    if (['zip', 'rar', 'tar', 'gz'].includes(ext)) return 'archive';
    if (['db', 'sqlite', 'sql'].includes(ext)) return 'database';

    return 'other';
}

// Get appropriate icon for file type
function getFileIcon(type: FileType): React.ElementType {
    const icons: Record<FileType, React.ElementType> = {
        image: FileImage,
        code: FileCode,
        text: FileText,
        markdown: FileText,
        pdf: FileType,
        audio: FileAudio,
        video: FileVideo,
        spreadsheet: FileSpreadsheet,
        archive: Archive,
        database: Database,
        other: File
    };

    return icons[type];
}

// Generate a human-readable display name for file type
function getTypeLabel(type: FileType, extension?: string): string {
    if (type === 'code' && extension) {
        return extension.toUpperCase();
    }

    const labels: Record<FileType, string> = {
        image: 'Image',
        code: 'Code',
        text: 'Text',
        markdown: 'Markdown',
        pdf: 'PDF',
        audio: 'Audio',
        video: 'Video',
        spreadsheet: 'Spreadsheet',
        archive: 'Archive',
        database: 'Database',
        other: 'File'
    };

    return labels[type];
}

// Generate realistic file size based on file path and type
function getFileSize(filepath: string, type: FileType): string {
    // Base size calculation
    const base = (filepath.length * 5) % 800 + 200;

    // Type-specific multipliers
    const multipliers: Record<FileType, number> = {
        image: 5.0,
        video: 20.0,
        audio: 10.0,
        code: 0.5,
        text: 0.3,
        markdown: 0.3,
        pdf: 8.0,
        spreadsheet: 3.0,
        archive: 5.0,
        database: 4.0,
        other: 1.0
    };

    const size = base * multipliers[type];

    if (size < 1024) return `${Math.round(size)} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// Get the API URL for file content
function getFileUrl(sandboxId: string | undefined, path: string): string {
    if (!sandboxId) return path;


    const url = new URL(`${process.env.NEXT_PUBLIC_BACKEND_URL}/sandboxes/${sandboxId}/files/content`);
    url.searchParams.append('path', path);
    return url.toString();
}

interface FileAttachmentProps {
    filepath: string;
    onClick?: (path: string) => void;
    className?: string;
    sandboxId?: string;
    showPreview?: boolean;
}

export function FileAttachment({
    filepath,
    onClick,
    className,
    sandboxId,
    showPreview = true
}: FileAttachmentProps) {
    const [imageLoaded, setImageLoaded] = React.useState(false);
    const [imageError, setImageError] = React.useState(false);

    const filename = filepath.split('/').pop() || 'file';
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    const fileType = getFileType(filename);
    const fileUrl = sandboxId ? getFileUrl(sandboxId, filepath) : filepath;

    const typeLabel = getTypeLabel(fileType, extension);
    const fileSize = getFileSize(filepath, fileType);
    const IconComponent = getFileIcon(fileType);

    const isImage = fileType === 'image' && showPreview;

    const handleClick = () => {
        if (onClick) onClick(filepath);
    };

    // Clean layout with proper image handling
    return (
        <button
            onClick={handleClick}
            className={cn(
                "group flex items-start gap-3 p-4 rounded-md bg-muted/10 hover:bg-muted/20 transition-colors",
                "border border-transparent hover:border-muted/20 w-full text-left",
                className
            )}
        >
            {isImage && !imageError ? (
                <div className="relative h-10 w-10 rounded-md overflow-hidden bg-muted/5 flex-shrink-0">
                    <Image
                        src={fileUrl}
                        alt={filename}
                        fill
                        className="object-cover"
                        onLoad={() => setImageLoaded(true)}
                        onError={() => setImageError(true)}
                        unoptimized
                    />
                </div>
            ) : (
                <div className="flex items-center justify-center h-10 w-10 text-muted-foreground flex-shrink-0">
                    <IconComponent className="h-5 w-5" />
                </div>
            )}

            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                    {filename}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <span>{typeLabel}</span>
                    <span>·</span>
                    <span>{fileSize}</span>
                </div>
            </div>
        </button>
    );
}

interface FileAttachmentGridProps {
    attachments: string[];
    onFileClick?: (path: string) => void;
    className?: string;
    sandboxId?: string;
    showPreviews?: boolean;
}

export function FileAttachmentGrid({
    attachments,
    onFileClick,
    className,
    sandboxId,
    showPreviews = true
}: FileAttachmentGridProps) {
    if (!attachments || attachments.length === 0) return null;

    // Deduplicate attachments
    const uniqueAttachments = [...new Set(attachments)];

    // Simple grid layout
    return (
        <div className={cn("mt-4", className)}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {uniqueAttachments.map((attachment, index) => (
                    <FileAttachment
                        key={`file-${index}`}
                        filepath={attachment}
                        onClick={onFileClick}
                        sandboxId={sandboxId}
                        showPreview={showPreviews}
                    />
                ))}
            </div>
        </div>
    );
} 