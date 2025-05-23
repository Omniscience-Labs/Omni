'use client';

import { useState, useEffect, useRef, Fragment, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  File,
  Folder,
  FolderOpen,
  Upload,
  Download,
  ChevronRight,
  Home,
  ChevronLeft,
  Loader,
  AlertTriangle,
  FileText,
  ChevronDown,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileRenderer,
  getFileTypeFromExtension,
} from '@/components/file-renderers';
import {
  listSandboxFiles,
  getSandboxFileContent,
  type FileInfo,
  Project,
} from '@/lib/api';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useCachedFile, getCachedFile, FileCache } from '@/hooks/use-cached-file';

// Define API_URL
const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

interface FileViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sandboxId: string;
  initialFilePath?: string | null;
  project?: Project;
}

export function FileViewerModal({
  open,
  onOpenChange,
  sandboxId,
  initialFilePath,
  project,
}: FileViewerModalProps) {
  // Safely handle initialFilePath to ensure it's a string or null
  const safeInitialFilePath = typeof initialFilePath === 'string' ? initialFilePath : null;

  // Auth for session token
  const { session } = useAuth();

  // File navigation state
  const [currentPath, setCurrentPath] = useState('/workspace');
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Add a navigation lock to prevent race conditions
  const [isNavigationLocked, setIsNavigationLocked] = useState(false);
  const currentNavigationRef = useRef<string | null>(null);

  // File content state
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [rawContent, setRawContent] = useState<string | Blob | null>(null);
  const [textContentForRenderer, setTextContentForRenderer] = useState<
    string | null
  >(null);
  const [blobUrlForRenderer, setBlobUrlForRenderer] = useState<string | null>(
    null,
  );
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  // Add a ref to track current loading operation
  const loadingFileRef = useRef<string | null>(null);

  // Use the cached file hook for the selected file
  const {
    data: cachedFileContent,
    isLoading: isCachedFileLoading,
    error: cachedFileError,
  } = useCachedFile(
    sandboxId,
    selectedFilePath,
    {
      contentType: 'text', // Default to text, we'll handle binary later
    }
  );

  // Utility state
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State to track if initial path has been processed
  const [initialPathProcessed, setInitialPathProcessed] = useState(false);

  // Project state
  const [projectWithSandbox, setProjectWithSandbox] = useState<
    Project | undefined
  >(project);

  // Add state for PDF export
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const markdownContainerRef = useRef<HTMLDivElement>(null);
  const markdownRef = useRef<HTMLDivElement>(null);

  // Add state for print orientation
  const [pdfOrientation, setPdfOrientation] = useState<
    'portrait' | 'landscape'
  >('portrait');

  // Add a ref to track active download URLs
  const activeDownloadUrls = useRef<Set<string>>(new Set());

  // Setup project with sandbox URL if not provided directly
  useEffect(() => {
    if (project) {
      setProjectWithSandbox(project);
    }
  }, [project, sandboxId]);

  // Function to ensure a path starts with /workspace - Defined early
  const normalizePath = useCallback((path: unknown): string => {
    // Explicitly check if the path is a non-empty string
    if (typeof path !== 'string' || !path) {
      console.warn(
        `[FILE VIEWER] normalizePath received non-string or empty value:`,
        path,
        `Returning '/workspace'`,
      );
      return '/workspace';
    }
    // Now we know path is a string
    return path.startsWith('/workspace')
      ? path
      : `/workspace/${path.replace(/^\//, '')}`;
  }, []);

  // Helper function to check if a value is a Blob (type-safe version of instanceof)
  const isBlob = (value: any): value is Blob => {
    return value instanceof Blob;
  };

  // Helper function to clear the selected file
  const clearSelectedFile = useCallback(() => {
    setSelectedFilePath(null);
    setRawContent(null);
    setTextContentForRenderer(null); // Clear derived text content
    setBlobUrlForRenderer(null); // Clear derived blob URL
    setContentError(null);
    setIsLoadingContent(false);
    loadingFileRef.current = null; // Clear the loading ref
  }, []);

  // Forward declaration for openFile - will be defined below but referenced first
  // Core file opening function
  const openFile = useCallback(
    async (file: FileInfo) => {
      if (file.is_dir) {
        // Since navigateToFolder is defined below, we can safely call it
        // We define navigateToFolder first, then use it in openFile
        // For directories, just navigate to that folder
        if (!file.is_dir) return;

        // Ensure the path is properly normalized
        const normalizedPath = normalizePath(file.path);

        // Always navigate to the folder to ensure breadcrumbs update correctly
        console.log(
          `[FILE VIEWER] Navigating to folder: ${file.path} → ${normalizedPath}`,
        );
        console.log(
          `[FILE VIEWER] Current path before navigation: ${currentPath}`,
        );

        // Clear selected file when navigating
        clearSelectedFile();

        // Update path state - must happen after clearing selection
        setCurrentPath(normalizedPath);
        return;
      }

      // Skip if already selected and content exists
      if (selectedFilePath === file.path && rawContent) {
        console.log(`[FILE VIEWER] File already loaded: ${file.path}`);
        return;
      }

      console.log(`[FILE VIEWER] Opening file: ${file.path}`);

      // Check if this is an image or PDF file
      const isImageFile = FileCache.isImageFile(file.path);
      const isPdfFile = FileCache.isPdfFile(file.path);

      // Check for Office documents and other binary files
      const extension = file.path.split('.').pop()?.toLowerCase();
      const isOfficeFile = ['xlsx', 'xls', 'docx', 'doc', 'pptx', 'ppt'].includes(extension || '');

      if (isImageFile) {
        console.log(`[FILE VIEWER][IMAGE DEBUG] Opening image file: ${file.path}`);
      } else if (isPdfFile) {
        console.log(`[FILE VIEWER] Opening PDF file: ${file.path}`);
      } else if (isOfficeFile) {
        console.log(`[FILE VIEWER] Opening Office document: ${file.path} (${extension})`);
      }

      // Clear previous state FIRST
      clearSelectedFile();

      // Set loading state immediately for UX
      setIsLoadingContent(true);
      setSelectedFilePath(file.path);

      // Set the loading ref to track current operation
      loadingFileRef.current = file.path;

      try {
        // For PDFs and Office documents, always use blob content type
        const contentType = isPdfFile || isOfficeFile ? 'blob' : FileCache.getContentTypeFromPath(file.path);

        console.log(`[FILE VIEWER] Fetching content for ${file.path} with content type: ${contentType}`);

        // Fetch content using the cached file utility
        const content = await getCachedFile(
          sandboxId,
          file.path,
          {
            contentType: contentType as 'text' | 'blob' | 'json',
            force: isPdfFile, // Force refresh for PDFs to ensure we get a blob
            token: session?.access_token,
          }
        );



        // Critical check: Ensure the file we just loaded is still the one selected
        if (loadingFileRef.current !== file.path) {
          console.log(
            `[FILE VIEWER] Selection changed during loading, aborting. Loading: ${loadingFileRef.current}, Expected: ${file.path}`,
          );
          setIsLoadingContent(false);
          return;
        }

        // Store raw content
        setRawContent(content);

        // Handle content based on type
        if (typeof content === 'string') {
          if (content.startsWith('blob:')) {
            console.log(`[FILE VIEWER] Setting blob URL directly: ${content}`);
            setTextContentForRenderer(null);
            setBlobUrlForRenderer(content);
          } else if (isPdfFile || isOfficeFile) {
            // For PDFs and Office files, we should never get here as they should be handled as blobs
            console.error(`[FILE VIEWER] Received binary file content as string instead of blob, length: ${content.length}`);
            console.log(`[FILE VIEWER] First 100 chars of content: ${content.substring(0, 100)}`);

            // Try one more time with explicit blob type and force refresh
            console.log(`[FILE VIEWER] Retrying binary file fetch with explicit blob type and force refresh`);
            const binaryBlob = await getCachedFile(
              sandboxId,
              file.path,
              {
                contentType: 'blob',
                force: true,
                token: session.access_token,
              }
            );

            if (typeof binaryBlob === 'string' && binaryBlob.startsWith('blob:')) {
              console.log(`[FILE VIEWER] Successfully got blob URL on retry: ${binaryBlob}`);
              setTextContentForRenderer(null);
              setBlobUrlForRenderer(binaryBlob);
            } else {
              throw new Error('Failed to load binary file in correct format after retry');
            }
          } else {
            console.log(`[FILE VIEWER] Setting text content directly for renderer.`);
            setTextContentForRenderer(content);
            setBlobUrlForRenderer(null);
          }
        } else if (isBlob(content)) {
          console.log(`[FILE VIEWER] Content is a Blob. Creating blob URL.`);
          const url = URL.createObjectURL(content);
          console.log(`[FILE VIEWER] Created blob URL: ${url}`);
          setTextContentForRenderer(null);
          setBlobUrlForRenderer(url);
        }

        setIsLoadingContent(false);
      } catch (error) {
        console.error(`[FILE VIEWER] Error loading file:`, error);
        if (loadingFileRef.current === file.path) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('Authentication token required') ||
            errorMessage.includes('Authentication token missing')) {
            toast.error('Authentication error. Please refresh and login again.');
            setContentError('Authentication error. Please refresh the page and login again.');
          } else {
            setContentError(`Failed to load file: ${errorMessage}`);
          }
          setIsLoadingContent(false);
          setRawContent(null);
        }
      } finally {
        if (loadingFileRef.current === file.path) {
          loadingFileRef.current = null;
        }
      }
    },
    [
      sandboxId,
      selectedFilePath,
      rawContent,
      clearSelectedFile,
      session?.access_token,
      currentPath,
      normalizePath,
    ],
  );

  // Load files when modal opens or path changes - Refined
  useEffect(() => {
    if (!open || !sandboxId) {
      return; // Don't load if modal is closed or no sandbox ID
    }

    // Skip repeated loads for the same path
    if (isLoadingFiles && currentNavigationRef.current === currentPath) {
      console.log(`[FILE VIEWER] Already loading ${currentPath}, skipping duplicate load`);
      return;
    }

    // Track current navigation
    currentNavigationRef.current = currentPath;
    console.log(`[FILE VIEWER] Starting navigation to: ${currentPath}`);

    const loadTimeout = setTimeout(async () => {
      setIsLoadingFiles(true);
      console.log(
        `[FILE VIEWER] useEffect[currentPath]: Triggered. Loading files for path: ${currentPath}`,
      );
      try {
        // Log cache status
        console.log(`[FILE VIEWER] Checking cache for directory listing at ${currentPath}`);

        // Create a cache key for this directory listing
        const dirCacheKey = `${sandboxId}:directory:${currentPath}`;

        // Check if we have this directory listing cached
        let filesData;
        if (FileCache.has(dirCacheKey) && !isInitialLoad) {
          console.log(`[FILE VIEWER] Using cached directory listing for ${currentPath}`);
          filesData = FileCache.get(dirCacheKey);
        } else {
          console.log(`[FILE VIEWER] Cache miss, fetching directory listing from API for ${currentPath}`);
          filesData = await listSandboxFiles(sandboxId, currentPath);

          // Cache the directory listing
          if (filesData && Array.isArray(filesData)) {
            console.log(`[FILE VIEWER] Caching directory listing: ${filesData.length} files`);
            FileCache.set(dirCacheKey, filesData);
          }
        }

        // Only update files if we're still on the same path
        if (currentNavigationRef.current === currentPath) {
          console.log(
            `[FILE VIEWER] useEffect[currentPath]: Got ${filesData?.length || 0} files for ${currentPath}`,
          );
          setFiles(filesData || []);
        } else {
          console.log(`[FILE VIEWER] Path changed during loading, aborting file update for ${currentPath}`);
        }

        // After the first load, set isInitialLoad to false
        if (isInitialLoad) {
          setIsInitialLoad(false);
        }
      } catch (error) {
        console.error('Failed to load files:', error);
        toast.error('Failed to load files');
        if (currentNavigationRef.current === currentPath) {
          setFiles([]);
        }
      } finally {
        // Only clear loading state if we're still working with the current path
        if (currentNavigationRef.current === currentPath) {
          setIsLoadingFiles(false);
          console.log(`[FILE VIEWER] Completed loading for: ${currentPath}`);
        }
      }
    }, 50); // Short delay to allow state updates to settle

    return () => clearTimeout(loadTimeout);
    // Dependency: Only re-run when open, sandboxId, currentPath changes
  }, [open, sandboxId, currentPath, isInitialLoad, isLoadingFiles]);

  // Helper function to navigate to a folder
  const navigateToFolder = useCallback(
    (folder: FileInfo) => {
      if (!folder.is_dir) return;

      // Ensure the path is properly normalized
      const normalizedPath = normalizePath(folder.path);

      // Always navigate to the folder to ensure breadcrumbs update correctly
      console.log(
        `[FILE VIEWER] Navigating to folder: ${folder.path} → ${normalizedPath}`,
      );
      console.log(
        `[FILE VIEWER] Current path before navigation: ${currentPath}`,
      );

      // Clear selected file when navigating
      clearSelectedFile();

      // Update path state - must happen after clearing selection
      setCurrentPath(normalizedPath);
    },
    [normalizePath, clearSelectedFile, currentPath],
  );

  // Navigate to a specific path in the breadcrumb
  const navigateToBreadcrumb = useCallback(
    (path: string) => {
      const normalizedPath = normalizePath(path);

      // Always navigate when clicking breadcrumbs to ensure proper update
      console.log(
        `[FILE VIEWER] Navigating to breadcrumb path: ${path} → ${normalizedPath}`,
      );

      // Clear selected file and set path
      clearSelectedFile();
      setCurrentPath(normalizedPath);
    },
    [normalizePath, clearSelectedFile],
  );

  // Helper function to navigate to home
  const navigateHome = useCallback(() => {
    // Always navigate home when clicked to ensure consistent behavior
    console.log('[FILE VIEWER] Navigating home from:', currentPath);

    clearSelectedFile();
    setCurrentPath('/workspace');
  }, [clearSelectedFile, currentPath]);

  // Function to generate breadcrumb segments from a path
  const getBreadcrumbSegments = useCallback(
    (path: string) => {
      // Ensure we're working with a normalized path
      const normalizedPath = normalizePath(path);

      // Remove /workspace prefix and split by /
      const cleanPath = normalizedPath.replace(/^\/workspace\/?/, '');
      if (!cleanPath) return [];

      const parts = cleanPath.split('/').filter(Boolean);
      let currentPath = '/workspace';

      return parts.map((part, index) => {
        currentPath = `${currentPath}/${part}`;
        return {
          name: part,
          path: currentPath,
          isLast: index === parts.length - 1,
        };
      });
    },
    [normalizePath],
  );

  // Add a helper to directly interact with the raw cache
  const directlyAccessCache = useCallback(
    (filePath: string): {
      found: boolean;
      content: any;
      contentType: string;
    } => {
      // Normalize the path for consistent cache key
      let normalizedPath = filePath;
      if (!normalizedPath.startsWith('/workspace')) {
        normalizedPath = `/workspace/${normalizedPath.startsWith('/') ? normalizedPath.substring(1) : normalizedPath}`;
      }

      // Detect the appropriate content type based on file extension
      const detectedContentType = FileCache.getContentTypeFromPath(filePath);

      // Create cache key with detected content type
      const cacheKey = `${sandboxId}:${normalizedPath}:${detectedContentType}`;
      console.log(`[FILE VIEWER] Checking cache for key: ${cacheKey}`);

      if (FileCache.has(cacheKey)) {
        const cachedContent = FileCache.get(cacheKey);
        console.log(`[FILE VIEWER] Direct cache hit for ${normalizedPath} (${detectedContentType})`);
        return { found: true, content: cachedContent, contentType: detectedContentType };
      }

      console.log(`[FILE VIEWER] Cache miss for key: ${cacheKey}`);
      return { found: false, content: null, contentType: detectedContentType };
    },
    [sandboxId],
  );

  // Handle initial file path - Runs ONLY ONCE on open if initialFilePath is provided
  useEffect(() => {
    // Only run if modal is open, initial path is provided, AND it hasn't been processed yet
    if (open && safeInitialFilePath && !initialPathProcessed) {
      console.log(
        `[FILE VIEWER] useEffect[initialFilePath]: Processing initial path: ${safeInitialFilePath}`,
      );

      // Normalize the initial path
      const fullPath = normalizePath(safeInitialFilePath);
      const lastSlashIndex = fullPath.lastIndexOf('/');
      const directoryPath =
        lastSlashIndex > 0
          ? fullPath.substring(0, lastSlashIndex)
          : '/workspace';
      const fileName =
        lastSlashIndex >= 0 ? fullPath.substring(lastSlashIndex + 1) : '';

      console.log(
        `[FILE VIEWER] useEffect[initialFilePath]: Normalized Path: ${fullPath}, Directory: ${directoryPath}, File: ${fileName}`,
      );

      // Set the current path to the target directory
      // This will trigger the other useEffect to load files for this directory
      if (currentPath !== directoryPath) {
        console.log(
          `[FILE VIEWER] useEffect[initialFilePath]: Setting current path to ${directoryPath}`,
        );
        setCurrentPath(directoryPath);
      }

      // Try to load the file directly from cache if possible
      if (safeInitialFilePath) {
        console.log(`[FILE VIEWER] Attempting to load initial file directly from cache: ${safeInitialFilePath}`);

        // Create a temporary FileInfo object for the initial file
        const initialFile: FileInfo = {
          name: fileName,
          path: fullPath,
          is_dir: false,
          size: 0,
          mod_time: new Date().toISOString(),
        };

        // Now that openFile is defined first, we can call it directly
        console.log(`[FILE VIEWER] Opening initial file: ${fullPath}`);
        openFile(initialFile);
      }

      // Mark the initial path as processed so this doesn't run again
      setInitialPathProcessed(true);
    } else if (!open) {
      // Reset the processed flag when the modal closes
      console.log(
        '[FILE VIEWER] useEffect[initialFilePath]: Modal closed, resetting initialPathProcessed flag.',
      );
      setInitialPathProcessed(false);
    }
  }, [open, safeInitialFilePath, initialPathProcessed, normalizePath, currentPath, openFile]);

  // Fix the useEffect that's causing infinite rendering by using a stable reference check
  // Replace the problematic useEffect around line 369
  useEffect(() => {
    // Only create a blob URL if we have raw content that is a Blob AND we don't already have a blob URL
    // This prevents the infinite loop of creating URLs → triggering renders → creating more URLs
    if (rawContent && isBlob(rawContent) && selectedFilePath && !blobUrlForRenderer) {
      // Check if this is an image file
      const isImageFile = selectedFilePath.match(/\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i);

      // Create a blob URL for binary content
      const url = URL.createObjectURL(rawContent);

      if (isImageFile) {
        console.log(`[FILE VIEWER][IMAGE DEBUG] Created new blob URL: ${url} for image: ${selectedFilePath}`);
        console.log(`[FILE VIEWER][IMAGE DEBUG] Image blob size: ${rawContent.size} bytes, type: ${rawContent.type}`);
      } else {
        console.log(`[FILE VIEWER] Created blob URL: ${url} for ${selectedFilePath}`);
      }

      setBlobUrlForRenderer(url);
    }

    // Clean up previous URL when component unmounts or URL changes
    return () => {
      if (blobUrlForRenderer) {
        console.log(`[FILE VIEWER] Revoking blob URL on cleanup: ${blobUrlForRenderer}`);
        URL.revokeObjectURL(blobUrlForRenderer);
      }
    };
  }, [rawContent, selectedFilePath, isBlob, blobUrlForRenderer]);

  // Effect to handle cached file content updates
  useEffect(() => {
    if (!selectedFilePath) return;

    // Only update loading state if it's different from what we expect
    if (isCachedFileLoading && !isLoadingContent) {
      setIsLoadingContent(true);
    } else if (!isCachedFileLoading && isLoadingContent) {
      if (cachedFileError) {
        setContentError(`Failed to load file: ${cachedFileError.message}`);
      } else if (cachedFileContent !== null) {
        console.log(`[FILE VIEWER] Received cached content type: ${typeof cachedFileContent}`);
        console.log(`[FILE VIEWER] Received cached content is Blob: ${isBlob(cachedFileContent)}`);
        console.log(`[FILE VIEWER] Received cached content is string: ${typeof cachedFileContent === 'string'}`);
        console.log(`[FILE VIEWER] Received cached content starts with blob: ${typeof cachedFileContent === 'string' && cachedFileContent.startsWith('blob:')}`);

        // Check if this is a PDF file or Office file
        const isPdfFile = FileCache.isPdfFile(selectedFilePath);
        const extension = selectedFilePath.split('.').pop()?.toLowerCase();
        const isOfficeFile = ['xlsx', 'xls', 'docx', 'doc', 'pptx', 'ppt'].includes(extension || '');

        if (isPdfFile || isOfficeFile) {
          // For PDFs and Office files, handle specially to ensure it's always a blob URL
          if (typeof cachedFileContent === 'string' && cachedFileContent.startsWith('blob:')) {
            console.log(`[FILE VIEWER] Using existing blob URL for binary file`);
            setBlobUrlForRenderer(cachedFileContent);
            setTextContentForRenderer(null);
          } else if (isBlob(cachedFileContent)) {
            console.log(`[FILE VIEWER] Creating new blob URL from cached binary blob`);
            const url = URL.createObjectURL(cachedFileContent);
            setBlobUrlForRenderer(url);
            setTextContentForRenderer(null);
          } else {
            // If we somehow got text content for a binary file, force a refresh with blob type
            console.log(`[FILE VIEWER] Invalid binary content type, forcing refresh with blob type`);

            // Force refresh with blob type
            (async () => {
              try {
                console.log(`[FILE VIEWER] Explicitly fetching binary file as blob`);

                const binaryContent = await getCachedFile(
                  sandboxId,
                  selectedFilePath,
                  {
                    contentType: 'blob',
                    force: true,
                    token: session?.access_token
                  }
                );

                if (typeof binaryContent === 'string' && binaryContent.startsWith('blob:')) {
                  console.log(`[FILE VIEWER] Received correct blob URL for binary file: ${binaryContent}`);
                  setBlobUrlForRenderer(binaryContent);
                  setTextContentForRenderer(null);
                } else {
                  console.error(`[FILE VIEWER] Failed to get correct binary format after retry`);
                  setContentError('Failed to load file in correct format');
                }
              } catch (err) {
                console.error(`[FILE VIEWER] Error loading binary file:`, err);
                setContentError(`Failed to load file: ${err instanceof Error ? err.message : String(err)}`);
              } finally {
                setIsLoadingContent(false);
              }
            })();

            return; // Skip the rest since we're handling loading manually
          }
        } else {
          // For non-PDF files, handle as before
          setRawContent(cachedFileContent);

          if (typeof cachedFileContent === 'string') {
            if (cachedFileContent.startsWith('blob:')) {
              setTextContentForRenderer(null);
              setBlobUrlForRenderer(cachedFileContent);
            } else {
              setTextContentForRenderer(cachedFileContent);
              setBlobUrlForRenderer(null);
            }
          } else if (cachedFileContent && isBlob(cachedFileContent)) {
            const url = URL.createObjectURL(cachedFileContent);
            setTextContentForRenderer(null);
            setBlobUrlForRenderer(url);
          }
        }
      }
      setIsLoadingContent(false);
    }
  }, [selectedFilePath, cachedFileContent, isCachedFileLoading, cachedFileError, isLoadingContent, isBlob, openFile, sandboxId, session?.access_token]);

  // Modify the cleanup effect to respect active downloads
  useEffect(() => {
    return () => {
      if (blobUrlForRenderer && !isDownloading && !activeDownloadUrls.current.has(blobUrlForRenderer)) {
        console.log(`[FILE VIEWER] Revoking blob URL on cleanup: ${blobUrlForRenderer}`);
        URL.revokeObjectURL(blobUrlForRenderer);
      }
    };
  }, [blobUrlForRenderer, isDownloading]);

  // Modify handleOpenChange to respect active downloads
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        console.log('[FILE VIEWER] handleOpenChange: Modal closing, resetting state.');

        // Only revoke if not downloading and not an active download URL
        if (blobUrlForRenderer && !isDownloading && !activeDownloadUrls.current.has(blobUrlForRenderer)) {
          console.log(`[FILE VIEWER] Manually revoking blob URL on modal close: ${blobUrlForRenderer}`);
          URL.revokeObjectURL(blobUrlForRenderer);
        }

        clearSelectedFile();
        setCurrentPath('/workspace');
        setFiles([]);
        setInitialPathProcessed(false);
        setIsInitialLoad(true);
      }
      onOpenChange(open);
    },
    [onOpenChange, clearSelectedFile, setIsInitialLoad, blobUrlForRenderer, isDownloading],
  );

  // Helper to check if file is markdown
  const isMarkdownFile = useCallback((filePath: string | null) => {
    return filePath ? filePath.toLowerCase().endsWith('.md') : false;
  }, []);

  // Handle PDF export for markdown files
  const handleExportPdf = useCallback(
    async (orientation: 'portrait' | 'landscape' = 'portrait') => {
      if (
        !selectedFilePath ||
        isExportingPdf ||
        !isMarkdownFile(selectedFilePath)
      )
        return;

      setIsExportingPdf(true);

      try {
        // Use the ref to access the markdown content directly
        if (!markdownRef.current) {
          throw new Error('Markdown content not found');
        }

        // Create a standalone document for printing
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          throw new Error(
            'Unable to open print window. Please check if popup blocker is enabled.',
          );
        }

        // Get the base URL for resolving relative URLs
        const baseUrl = window.location.origin;

        // Generate HTML content
        const fileName = selectedFilePath.split('/').pop() || 'document';
        const pdfName = fileName.replace(/\.md$/, '');

        // Extract content
        const markdownContent = markdownRef.current.innerHTML;

        // Generate a full HTML document with controlled styles
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${pdfName}</title>
          <style>
            @media print {
              @page { 
                size: ${orientation === 'landscape' ? 'A4 landscape' : 'A4'};
                margin: 15mm;
              }
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
            body {
              font-family: 'Helvetica', 'Arial', sans-serif;
              font-size: 12pt;
              color: #333;
              line-height: 1.5;
              padding: 20px;
              max-width: 100%;
              margin: 0 auto;
              background: white;
            }
            h1 { font-size: 24pt; margin-top: 20pt; margin-bottom: 12pt; }
            h2 { font-size: 20pt; margin-top: 18pt; margin-bottom: 10pt; }
            h3 { font-size: 16pt; margin-top: 16pt; margin-bottom: 8pt; }
            h4, h5, h6 { font-weight: bold; margin-top: 12pt; margin-bottom: 6pt; }
            p { margin: 8pt 0; }
            pre, code {
              font-family: 'Courier New', monospace;
              background-color: #f5f5f5;
              border-radius: 3pt;
              padding: 2pt 4pt;
              font-size: 10pt;
            }
            pre {
              padding: 8pt;
              margin: 8pt 0;
              overflow-x: auto;
              white-space: pre-wrap;
            }
            code {
              white-space: pre-wrap;
            }
            img {
              max-width: 100%;
              height: auto;
            }
            a {
              color: #0066cc;
              text-decoration: underline;
            }
            ul, ol {
              padding-left: 20pt;
              margin: 8pt 0;
            }
            blockquote {
              margin: 8pt 0;
              padding-left: 12pt;
              border-left: 4pt solid #ddd;
              color: #666;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              margin: 12pt 0;
            }
            th, td {
              border: 1pt solid #ddd;
              padding: 6pt;
              text-align: left;
            }
            th {
              background-color: #f5f5f5;
              font-weight: bold;
            }
            /* Syntax highlighting basic styles */
            .hljs-keyword, .hljs-selector-tag { color: #569cd6; }
            .hljs-literal, .hljs-number { color: #b5cea8; }
            .hljs-string { color: #ce9178; }
            .hljs-comment { color: #6a9955; }
            .hljs-attribute, .hljs-attr { color: #9cdcfe; }
            .hljs-function, .hljs-name { color: #dcdcaa; }
            .hljs-title.class_ { color: #4ec9b0; }
            .markdown-content pre { background-color: #f8f8f8; }
          </style>
        </head>
        <body>
          <div class="markdown-content">
            ${markdownContent}
          </div>
          <script>
            // Remove any complex CSS variables or functions that might cause issues
            document.querySelectorAll('[style]').forEach(el => {
              const style = el.getAttribute('style');
              if (style && (style.includes('oklch') || style.includes('var(--') || style.includes('hsl('))) {
                // Replace complex color values with simple ones or remove them
                el.setAttribute('style', style
                  .replace(/color:.*?(;|$)/g, 'color: #333;')
                  .replace(/background-color:.*?(;|$)/g, 'background-color: transparent;')
                );
              }
            });
            
            // Print automatically when loaded
            window.onload = () => {
              setTimeout(() => {
                window.print();
                setTimeout(() => window.close(), 500);
              }, 300);
            };
          </script>
        </body>
        </html>
      `;

        // Write the HTML content to the new window
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();

        toast.success('PDF export initiated. Check your print dialog.');
      } catch (error) {
        console.error('PDF export failed:', error);
        toast.error(
          `Failed to export PDF: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        setIsExportingPdf(false);
      }
    },
    [selectedFilePath, isExportingPdf, isMarkdownFile],
  );

  // Handle file download - streamlined for performance
  const handleDownload = async () => {
    if (!selectedFilePath || isDownloading) return;

    try {
      setIsDownloading(true);

      // Get file metadata
      const fileName = selectedFilePath.split('/').pop() || 'file';
      const mimeType = FileCache.getMimeTypeFromPath?.(selectedFilePath) || 'application/octet-stream';

      // Use rawContent if available
      if (rawContent) {
        let blob: Blob;

        if (typeof rawContent === 'string') {
          if (rawContent.startsWith('blob:')) {
            // If it's a blob URL, get directly from server to avoid CORS issues
            const response = await fetch(
              `${process.env.NEXT_PUBLIC_BACKEND_URL}/sandboxes/${sandboxId}/files/content?path=${encodeURIComponent(selectedFilePath)}`,
              { headers: { 'Authorization': `Bearer ${session?.access_token}` } }
            );

            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            blob = await response.blob();
          } else {
            // Text content
            blob = new Blob([rawContent], { type: mimeType });
          }
        } else if (rawContent instanceof Blob) {
          // Already a blob
          blob = rawContent;
        } else {
          // Unknown format, stringify
          blob = new Blob([JSON.stringify(rawContent)], { type: 'application/json' });
        }

        // Ensure correct MIME type
        if (blob.type !== mimeType) {
          blob = new Blob([blob], { type: mimeType });
        }

        downloadBlob(blob, fileName);
        return;
      }

      // Get from server if no raw content
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/sandboxes/${sandboxId}/files/content?path=${encodeURIComponent(selectedFilePath)}`,
        { headers: { 'Authorization': `Bearer ${session?.access_token}` } }
      );

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const blob = await response.blob();
      const finalBlob = new Blob([blob], { type: mimeType });
      downloadBlob(finalBlob, fileName);

    } catch (error) {
      console.error('[FILE VIEWER] Download error:', error);
      toast.error(`Failed to download file: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsDownloading(false);
    }
  };

  // Helper function to download a blob
  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Track URL and schedule cleanup
    activeDownloadUrls.current.add(url);
    setTimeout(() => {
      URL.revokeObjectURL(url);
      activeDownloadUrls.current.delete(url);
    }, 10000);

    toast.success('Download started');
  };

  // Handle file upload - Define after helpers
  const handleUpload = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  // Process uploaded file - Define after helpers
  const processUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files || event.target.files.length === 0) return;

      const file = event.target.files[0];
      setIsUploading(true);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', `${currentPath}/${file.name}`);

        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error('No access token available');
        }

        const response = await fetch(
          `${API_URL}/sandboxes/${sandboxId}/files`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            body: formData,
          },
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(error || 'Upload failed');
        }

        // Reload the file list
        const filesData = await listSandboxFiles(sandboxId, currentPath);
        setFiles(filesData);

        toast.success(`Uploaded: ${file.name}`);
      } catch (error) {
        console.error('Upload failed:', error);
        toast.error(
          `Upload failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        setIsUploading(false);
        if (event.target) event.target.value = '';
      }
    },
    [currentPath, sandboxId],
  );

  // --- Render --- //
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[90vw] md:max-w-[1200px] w-[95vw] h-[90vh] max-h-[900px] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-2 border-b flex-shrink-0">
          <DialogTitle className="text-lg font-semibold">
            Workspace Files
          </DialogTitle>
        </DialogHeader>

        {/* Navigation Bar */}
        <div className="px-4 py-2 border-b flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={navigateHome}
            className="h-8 w-8"
            title="Go to home directory"
          >
            <Home className="h-4 w-4" />
          </Button>

          <div className="flex items-center overflow-x-auto flex-1 min-w-0 scrollbar-hide whitespace-nowrap">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-sm font-medium min-w-fit flex-shrink-0"
              onClick={navigateHome}
            >
              home
            </Button>

            {currentPath !== '/workspace' && (
              <>
                {getBreadcrumbSegments(currentPath).map((segment, index) => (
                  <Fragment key={segment.path}>
                    <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground opacity-50 flex-shrink-0" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-sm font-medium truncate max-w-[200px]"
                      onClick={() => navigateToBreadcrumb(segment.path)}
                    >
                      {segment.name}
                    </Button>
                  </Fragment>
                ))}
              </>
            )}

            {selectedFilePath && (
              <>
                <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground opacity-50 flex-shrink-0" />
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">
                    {selectedFilePath.split('/').pop()}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {selectedFilePath && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  disabled={isDownloading || isLoadingContent}
                  className="h-8 gap-1"
                >
                  {isDownloading ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Download</span>
                </Button>

                {/* Replace the Export as PDF button with a dropdown */}
                {isMarkdownFile(selectedFilePath) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          isExportingPdf ||
                          isLoadingContent ||
                          contentError !== null
                        }
                        className="h-8 gap-1"
                      >
                        {isExportingPdf ? (
                          <Loader className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline">Export as PDF</span>
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleExportPdf('portrait')}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <span className="rotate-90">⬌</span> Portrait
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleExportPdf('landscape')}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <span>⬌</span> Landscape
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            )}

            {!selectedFilePath && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUpload}
                disabled={isUploading}
                className="h-8 gap-1"
              >
                {isUploading ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Upload</span>
              </Button>
            )}

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={processUpload}
              disabled={isUploading}
            />
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {selectedFilePath ? (
            /* File Viewer */
            <div className="h-full w-full overflow-auto">
              {isLoadingContent ? (
                <div className="h-full w-full flex flex-col items-center justify-center">
                  <Loader className="h-8 w-8 animate-spin text-primary mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Loading file{selectedFilePath ? `: ${selectedFilePath.split('/').pop()}` : '...'}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    {(() => {
                      // Normalize the path for consistent cache checks
                      if (!selectedFilePath) return "Preparing...";

                      let normalizedPath = selectedFilePath;
                      if (!normalizedPath.startsWith('/workspace')) {
                        normalizedPath = `/workspace/${normalizedPath.startsWith('/') ? normalizedPath.substring(1) : normalizedPath}`;
                      }

                      // Detect the appropriate content type based on file extension
                      const detectedContentType = FileCache.getContentTypeFromPath(normalizedPath);

                      // Check for cache with the correct content type
                      const isCached = FileCache.has(`${sandboxId}:${normalizedPath}:${detectedContentType}`);

                      return isCached
                        ? "Using cached version"
                        : "Fetching from server";
                    })()}
                  </p>
                </div>
              ) : contentError ? (
                <div className="h-full w-full flex items-center justify-center p-4">
                  <div className="max-w-md p-6 text-center border rounded-lg bg-muted/10">
                    <AlertTriangle className="h-10 w-10 text-orange-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">
                      Error Loading File
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {contentError}
                    </p>
                    <div className="flex justify-center gap-3">
                      <Button
                        onClick={() => {
                          setContentError(null);
                          setIsLoadingContent(true);
                          openFile({
                            path: selectedFilePath,
                            name: selectedFilePath.split('/').pop() || '',
                            is_dir: false,
                            size: 0,
                            mod_time: new Date().toISOString(),
                          } as FileInfo);
                        }}
                      >
                        Retry
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          clearSelectedFile();
                        }}
                      >
                        Back to Files
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full w-full relative">
                  <FileRenderer
                    key={selectedFilePath}
                    content={textContentForRenderer}
                    binaryUrl={blobUrlForRenderer}
                    fileName={selectedFilePath}
                    className="h-full w-full"
                    project={projectWithSandbox}
                    markdownRef={
                      isMarkdownFile(selectedFilePath) ? markdownRef : undefined
                    }
                    onDownload={handleDownload}
                    isDownloading={isDownloading}
                  />
                </div>
              )}
            </div>
          ) : (
            /* File Explorer */
            <div className="h-full w-full">
              {isLoadingFiles ? (
                <div className="h-full w-full flex items-center justify-center">
                  <Loader className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : files.length === 0 ? (
                <div className="h-full w-full flex flex-col items-center justify-center">
                  <Folder className="h-12 w-12 mb-2 text-muted-foreground opacity-30" />
                  <p className="text-sm text-muted-foreground">
                    Directory is empty
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-full w-full p-2">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-4">
                    {files.map((file) => (
                      <button
                        key={file.path}
                        className={`flex flex-col items-center p-3 rounded-lg border hover:bg-muted/50 transition-colors ${selectedFilePath === file.path
                          ? 'bg-muted border-primary/20'
                          : ''
                          }`}
                        onClick={() => {
                          if (file.is_dir) {
                            console.log(
                              `[FILE VIEWER] Folder clicked: ${file.name}, path: ${file.path}`,
                            );
                            navigateToFolder(file);
                          } else {
                            openFile(file);
                          }
                        }}
                      >
                        <div className="w-12 h-12 flex items-center justify-center mb-1">
                          {file.is_dir ? (
                            <Folder className="h-9 w-9 text-blue-500" />
                          ) : (
                            <File className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                        <span className="text-xs text-center font-medium truncate max-w-full">
                          {file.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
