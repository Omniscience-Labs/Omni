import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { FileAttachment } from './file-attachment';
import { cn } from '@/lib/utils';

interface UploadedFile {
    name: string;
    path: string;
    size: number;
    localUrl?: string;
}

// Union type for layout styles
type LayoutStyle = 'inline' | 'grid';

interface AttachmentGroupProps {
    // Support both path strings and full file objects
    files: (string | UploadedFile)[];
    sandboxId?: string;
    onRemove?: (index: number) => void;
    layout?: LayoutStyle;
    className?: string;
    onFileClick?: (path: string) => void;
    showPreviews?: boolean;
    maxHeight?: string;
    gridImageHeight?: number; // New prop for grid image height
    collapsed?: boolean; // Add new collapsed prop
}

export function AttachmentGroup({
    files,
    sandboxId,
    onRemove,
    layout = 'inline',
    className,
    onFileClick,
    showPreviews = true,
    maxHeight = '216px',
    gridImageHeight = 180, // Increased from 120 for better visibility
    collapsed = true // By default, HTML/MD files are collapsed
}: AttachmentGroupProps) {
    if (!files || files.length === 0) return null;

    // Deduplicate attachments if they are strings
    const uniqueFiles = typeof files[0] === 'string'
        ? [...new Set(files)] as string[]
        : files;

    // Get filepath from either string or UploadedFile
    const getFilePath = (file: string | UploadedFile): string => {
        return typeof file === 'string' ? file : file.path;
    };

    // Ensure path has proper format when clicking
    const handleFileClick = (path: string) => {
        if (onFileClick) {
            // Just pass the path to the parent handler which will call getFileUrl
            onFileClick(path);
        }
    };

    // Get local preview URL if available (for UploadedFile)
    const getLocalPreviewUrl = (file: string | UploadedFile): string | undefined => {
        if (typeof file === 'string') return undefined;
        return !sandboxId ? file.localUrl : undefined;
    };

    // Check if a file is HTML, Markdown, or CSV
    const isPreviewableFile = (file: string | UploadedFile): boolean => {
        const path = getFilePath(file);
        const ext = path.split('.').pop()?.toLowerCase() || '';
        return ext === 'html' || ext === 'htm' || ext === 'md' || ext === 'markdown' || ext === 'csv' || ext === 'tsv';
    };

    // Content based on layout type
    const renderContent = () => {
        if (layout === 'grid') {
            // For grid layout, sort files to put uncollapsed preview files at the end
            const sortedFiles = [...uniqueFiles].sort((a, b) => {
                // Only consider HTML/MD/CSV files special if they're not collapsed
                const aIsSpecial = !collapsed && isPreviewableFile(a);
                const bIsSpecial = !collapsed && isPreviewableFile(b);

                // Put uncollapsed previewable files at the end
                return aIsSpecial === bIsSpecial ? 0 : aIsSpecial ? 1 : -1;
            });

            // Determine if the last item should span full width (odd number of items)
            const shouldLastItemSpanFull = sortedFiles.length % 2 === 1 && sortedFiles.length > 1;

            return (
                <div className={cn(
                    "grid gap-3",
                    // Adjust grid column layout based on number of files and their types 
                    uniqueFiles.length === 1 ? "grid-cols-1" :
                        uniqueFiles.length > 4 ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3" :
                            "grid-cols-1 sm:grid-cols-2",
                    className
                )}>
                    {sortedFiles.map((file, index) => {
                        // Check if the file is an image to apply different styles
                        const path = getFilePath(file);
                        const filename = path.split('/').pop() || '';
                        const isImage = filename.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i) !== null;

                        // Check if it's a previewable file
                        const isPreviewFile = isPreviewableFile(file);

                        // Check if this is the last item and should span the full width
                        const isLastItem = index === sortedFiles.length - 1;
                        const shouldSpanFull = shouldLastItemSpanFull && isLastItem;

                        return (
                            <div
                                key={index}
                                className={cn(
                                    "relative group",
                                    // Make images fill their grid cell properly 
                                    isImage ? "flex items-center justify-center h-full" : ""
                                )}
                                style={{
                                    // If it should span full width or it's an uncollapsed previewable file
                                    gridColumn: shouldSpanFull || (isPreviewFile && !collapsed)
                                        ? '1 / -1'
                                        : 'auto'
                                }}
                            >
                                <FileAttachment
                                    filepath={path}
                                    onClick={handleFileClick}
                                    sandboxId={sandboxId}
                                    showPreview={showPreviews}
                                    localPreviewUrl={getLocalPreviewUrl(file)}
                                    className={cn(
                                        // Apply full width for images in grid so they fill the cell
                                        isImage ? "h-auto min-h-[54px] w-full" : ""
                                    )}
                                    // Pass customStyle for both images and previewable files
                                    customStyle={
                                        isImage ? {
                                            width: '100%', // Full width in grid
                                            height: 'auto', // For compatibility
                                            ...(({ '--attachment-height': `${shouldSpanFull ? Math.floor(gridImageHeight * 1.33) : gridImageHeight}px` }) as React.CSSProperties)
                                        } :
                                            (isPreviewFile && !collapsed) || shouldSpanFull ? {
                                                gridColumn: '1 / -1' // Explicit grid styling for previewable files or full-width items
                                            } : undefined
                                    }
                                    collapsed={collapsed} // Pass collapsed prop
                                />
                                {onRemove && (
                                    <div
                                        className="absolute -top-1 -right-1 h-5 w-5 rounded-full
                                        bg-black dark:bg-white
                                        border-2 border-white/90 dark:border-black/10
                                        text-white dark:text-black flex items-center justify-center
                                        z-30 cursor-pointer"
                                        onClick={() => onRemove(index)}
                                    >
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <div className="flex items-center justify-center w-full h-full">
                                                        <X size={10} strokeWidth={3} />
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent side="top">
                                                    <p>Remove file</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            );
        } else {
            // Inline layout (default) - always collapsed
            return (
                <div className={cn("flex flex-wrap gap-3", className)} style={{ maxHeight }}>
                    {uniqueFiles.map((file, index) => (
                        <div key={index} className="relative group">
                            <FileAttachment
                                filepath={getFilePath(file)}
                                onClick={handleFileClick}
                                sandboxId={sandboxId}
                                showPreview={showPreviews}
                                localPreviewUrl={getLocalPreviewUrl(file)}
                                collapsed={true} // Always collapsed in inline mode
                            // No customStyle for inline layout to keep original heights
                            />
                            {onRemove && (
                                <div
                                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full
                                        bg-black dark:bg-white
                                        border-3 border-sidebar
                                        text-white dark:text-black flex items-center justify-center
                                        z-30 cursor-pointer"
                                    onClick={() => onRemove(index)}
                                >
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className="flex items-center justify-center w-full h-full">
                                                    <X size={10} strokeWidth={3} />
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent side="top">
                                                <p>Remove file</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            );
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={layout === 'inline' ? "mb-3 py-1 px-0.5" : "mt-4"}
            >
                {renderContent()}
            </motion.div>
        </AnimatePresence>
    );
} 