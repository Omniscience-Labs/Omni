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
  RefreshCw,
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
  // Auth for session token
  const { session } = useAuth();

  // File navigation state
  const [currentPath, setCurrentPath] = useState('/workspace');
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

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
    refreshCache
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

  // Helper function to navigate to a folder - COMPLETELY FIXED
  const navigateToFolder = useCallback(
    (folder: FileInfo) => {
      if (!folder.is_dir) return;

      // Ensure the path is properly normalized
      const normalizedPath = normalizePath(folder.path);

      // Log before and after states for debugging
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

  // Helper function to check if content is a Blob (type-safe version of instanceof)
  const isBlob = (value: any): value is Blob => {
    return Boolean(
      value &&
      typeof value === 'object' &&
      'size' in value &&
      'type' in value &&
      typeof value.size === 'number' &&
      typeof value.type === 'string'
    );
  };

  // Core file opening function - Defined early
  const openFile = useCallback(
    async (file: FileInfo) => {
      if (file.is_dir) {
        navigateToFolder(file);
        return;
      }

      // Skip if already selected and content exists
      if (selectedFilePath === file.path && rawContent) {
        console.log(`[FILE VIEWER] File already loaded: ${file.path}`);
        return;
      }

      console.log(`[FILE VIEWER] Opening file: ${file.path}`);

      // Try direct cache access first for instant loading
      const { found, content, contentType } = directlyAccessCache(file.path);

      // Clear previous state FIRST
      clearSelectedFile();

      // Set loading state immediately for UX
      setIsLoadingContent(true);
      setSelectedFilePath(file.path);

      // Set the loading ref to track current operation
      loadingFileRef.current = file.path;

      // If found in cache, return it immediately
      if (found) {
        console.log(`[FILE VIEWER] Using directly accessed cache for ${file.path}`);
        setRawContent(content);

        // Determine how to prepare content for the renderer
        if (typeof content === 'string') {
          // For blob URLs (they're strings that start with 'blob:')
          if (content.startsWith('blob:')) {
            console.log(
              `[FILE VIEWER] Setting blob URL directly: ${content}`,
            );
            setTextContentForRenderer(null);
            setBlobUrlForRenderer(content);
          } else {
            // Regular text content
            console.log(
              `[FILE VIEWER] Setting text content directly for renderer.`,
            );
            setTextContentForRenderer(content);
            setBlobUrlForRenderer(null); // Ensure no blob URL is set
          }
        } else if (isBlob(content)) {
          console.log(
            `[FILE VIEWER] Content is a Blob. Creating blob URL.`,
          );
          // Create a blob URL for binary content
          const url = URL.createObjectURL(content);
          console.log(`[FILE VIEWER] Created blob URL: ${url}`);
          setTextContentForRenderer(null);
          setBlobUrlForRenderer(url);
        } else if (typeof content === 'object' && content !== null) {
          console.log(
            `[FILE VIEWER] Content is another object type. Will handle appropriately.`,
          );
          setTextContentForRenderer(null); // Clear any previous text content
          setBlobUrlForRenderer(null);
        } else {
          console.warn('[FILE VIEWER] Unexpected content type received.');
          setContentError('Received unexpected content type.');
        }

        setIsLoadingContent(false);
        loadingFileRef.current = null;
        return;
      }

      // Not in cache, load from API
      try {
        // Check if we have a valid session token
        if (!session?.access_token) {
          throw new Error('Authentication token missing. Please refresh the page and login again.');
        }

        // Start timer for performance logging
        const startTime = performance.now();

        // Fetch content using the cached file utility
        const content = await getCachedFile(
          sandboxId,
          file.path,
          {
            contentType: contentType as 'text' | 'blob' | 'json', // Cast to expected type
            force: false, // Use cache if available
            token: session.access_token, // Pass the token explicitly
          }
        );

        const loadTime = Math.round(performance.now() - startTime);
        console.log(
          `[FILE VIEWER] Received content for ${file.path} in ${loadTime}ms (${typeof content})`,
        );

        // Critical check: Ensure the file we just loaded is still the one selected
        if (loadingFileRef.current !== file.path) {
          console.log(
            `[FILE VIEWER] Selection changed during loading, aborting. Loading: ${loadingFileRef.current}, Expected: ${file.path}`,
          );
          setIsLoadingContent(false); // Still need to stop loading indicator
          return; // Abort state update
        }

        // Store raw content
        setRawContent(content);

        // Determine how to prepare content for the renderer
        if (typeof content === 'string') {
          // For blob URLs (they're strings that start with 'blob:')
          if (content.startsWith('blob:')) {
            console.log(
              `[FILE VIEWER] Setting blob URL directly: ${content}`,
            );
            setTextContentForRenderer(null);
            setBlobUrlForRenderer(content);
          } else {
            // Regular text content
            console.log(
              `[FILE VIEWER] Setting text content directly for renderer.`,
            );
            setTextContentForRenderer(content);
            setBlobUrlForRenderer(null); // Ensure no blob URL is set
          }
        } else if (isBlob(content)) {
          console.log(
            `[FILE VIEWER] Content is a Blob. Creating blob URL.`,
          );
          // Create a blob URL for binary content
          const url = URL.createObjectURL(content);
          console.log(`[FILE VIEWER] Created blob URL: ${url}`);
          setTextContentForRenderer(null);
          setBlobUrlForRenderer(url);
        } else if (typeof content === 'object' && content !== null) {
          console.log(
            `[FILE VIEWER] Content is another object type. Will handle appropriately.`,
          );
          setTextContentForRenderer(null); // Clear any previous text content
          setBlobUrlForRenderer(null);
        } else {
          console.warn('[FILE VIEWER] Unexpected content type received.');
          setContentError('Received unexpected content type.');
        }

        setIsLoadingContent(false);
      } catch (error) {
        console.error(`[FILE VIEWER] Error loading file:`, error);

        // Only update error if this file is still the one being loaded
        if (loadingFileRef.current === file.path) {
          // Check if it's an auth error
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('Authentication token required') ||
            errorMessage.includes('Authentication token missing')) {
            toast.error('Authentication error. Please refresh and login again.');
            setContentError('Authentication error. Please refresh the page and login again.');
          } else {
            setContentError(`Failed to load file: ${errorMessage}`);
          }
          setIsLoadingContent(false);
          setRawContent(null); // Clear raw content on error
        }
      } finally {
        // Clear the loading ref if it matches the current operation
        if (loadingFileRef.current === file.path) {
          loadingFileRef.current = null;
        }
      }
    },
    [
      sandboxId,
      selectedFilePath,
      rawContent,
      navigateToFolder,
      clearSelectedFile,
      directlyAccessCache,
      session?.access_token,
    ],
  );

  // Navigate to a specific path in the breadcrumb
  const navigateToBreadcrumb = useCallback(
    (path: string) => {
      const normalizedPath = normalizePath(path);
      console.log(
        `[FILE VIEWER] Navigating to breadcrumb path: ${path} → ${normalizedPath}`,
      );
      clearSelectedFile();
      setCurrentPath(normalizedPath);
    },
    [normalizePath, clearSelectedFile],
  );

  // Helper function to navigate to home
  const navigateHome = useCallback(() => {
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

  // Handle initial file path - Runs ONLY ONCE on open if initialFilePath is provided
  useEffect(() => {
    // Only run if modal is open, initial path is provided, AND it hasn't been processed yet
    if (open && initialFilePath && !initialPathProcessed) {
      console.log(
        `[FILE VIEWER] useEffect[initialFilePath]: Processing initial path: ${initialFilePath}`,
      );

      // Normalize the initial path
      const fullPath = normalizePath(initialFilePath);
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
      if (initialFilePath) {
        console.log(`[FILE VIEWER] Attempting to load initial file directly from cache: ${initialFilePath}`);

        // Create a temporary FileInfo object for the initial file
        const initialFile: FileInfo = {
          name: fileName,
          path: fullPath,
          is_dir: false,
          size: 0,
          mod_time: new Date().toISOString(),
        };

        // Use openFile to load the content properly
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
  }, [open, initialFilePath, initialPathProcessed, normalizePath, currentPath, openFile]);

  // Add a function to refresh the current file
  const refreshCurrentFile = useCallback(() => {
    if (!selectedFilePath) return;

    console.log(`[FILE VIEWER] Force refreshing file: ${selectedFilePath}`);

    // Create temporary FileInfo object for the current file
    const currentFile: FileInfo = {
      name: selectedFilePath.split('/').pop() || '',
      path: selectedFilePath,
      is_dir: false,
      size: 0,
      mod_time: new Date().toISOString(),
    };

    // Normalize the path for consistent cache key
    let normalizedPath = selectedFilePath;
    if (!normalizedPath.startsWith('/workspace')) {
      normalizedPath = `/workspace/${normalizedPath.startsWith('/') ? normalizedPath.substring(1) : normalizedPath}`;
    }

    // Force delete the cache entry to ensure a fresh fetch
    const detectedContentType = FileCache.getContentTypeFromPath(normalizedPath);
    const cacheKey = `${sandboxId}:${normalizedPath}:${detectedContentType}`;

    console.log(`[FILE VIEWER] Deleting cache entry: ${cacheKey}`);
    FileCache.delete(cacheKey);

    // Reload the file
    openFile(currentFile);
  }, [selectedFilePath, sandboxId, openFile]);

  // Effect to handle blob URL generation for binary content
  useEffect(() => {
    // Use our isBlob helper function to check if rawContent is a Blob
    if (rawContent && isBlob(rawContent) && selectedFilePath) {
      // Create a blob URL for binary content
      const url = URL.createObjectURL(rawContent);
      console.log(`[FILE VIEWER] Created blob URL: ${url} for ${selectedFilePath}`);
      setBlobUrlForRenderer(url);

      // Clean up previous URL when component unmounts or URL changes
      return () => {
        if (blobUrlForRenderer) {
          console.log(`[FILE VIEWER] Revoking blob URL: ${blobUrlForRenderer}`);
          URL.revokeObjectURL(blobUrlForRenderer);
        }
      };
    }
  }, [rawContent, selectedFilePath, blobUrlForRenderer, isBlob]);

  // Effect to handle cached file content updates
  useEffect(() => {
    if (selectedFilePath && !isLoadingContent) {
      if (isCachedFileLoading) {
        setIsLoadingContent(true);
      } else if (cachedFileError) {
        setContentError(`Failed to load file: ${cachedFileError.message}`);
        setIsLoadingContent(false);
      } else if (cachedFileContent) {
        setRawContent(cachedFileContent);

        if (typeof cachedFileContent === 'string') {
          // For blob URLs (they're strings that start with 'blob:')
          if (cachedFileContent.startsWith('blob:')) {
            console.log(`[FILE VIEWER] Setting cached blob URL directly: ${cachedFileContent}`);
            setTextContentForRenderer(null);
            setBlobUrlForRenderer(cachedFileContent);
          } else {
            // Regular text content
            setTextContentForRenderer(cachedFileContent);
            setBlobUrlForRenderer(null);
          }
        } else if (cachedFileContent && isBlob(cachedFileContent)) {
          // Use our isBlob helper for safer type checking
          const url = URL.createObjectURL(cachedFileContent);
          console.log(`[FILE VIEWER] Created blob URL from cached Blob: ${url}`);
          setTextContentForRenderer(null);
          setBlobUrlForRenderer(url);
        }

        setIsLoadingContent(false);
      }
    }
  }, [selectedFilePath, cachedFileContent, isCachedFileLoading, cachedFileError, isLoadingContent, isBlob]);

  // Handle file download - Define after helpers
  const handleDownload = useCallback(async () => {
    if (!selectedFilePath || isDownloading) return;

    setIsDownloading(true);

    try {
      // Check if we have a valid session token for fresh downloads
      if (!rawContent && !session?.access_token) {
        throw new Error('Authentication token missing. Please refresh the page and login again.');
      }

      // Use cached content if available
      if (rawContent) {
        const blob =
          rawContent instanceof Blob
            ? rawContent
            : new Blob([rawContent], { type: 'text/plain' });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = selectedFilePath.split('/').pop() || 'file';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url); // Clean up the URL

        toast.success('File downloaded');
      } else {
        // Fetch directly from cache if not in state
        const content = await getCachedFile(
          sandboxId,
          selectedFilePath,
          {
            force: true, // Force fresh download
            token: session.access_token, // Pass the token explicitly
          }
        );

        const blob =
          content instanceof Blob ? content : new Blob([String(content)]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = selectedFilePath.split('/').pop() || 'file';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url); // Clean up the URL

        toast.success('File downloaded');
      }
    } catch (error) {
      console.error('Download failed:', error);

      // Check if it's an auth error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Authentication token required') ||
        errorMessage.includes('Authentication token missing')) {
        toast.error('Authentication error. Please refresh and login again.');
      } else {
        toast.error(`Failed to download file: ${errorMessage}`);
      }
    } finally {
      setIsDownloading(false);
    }
  }, [selectedFilePath, isDownloading, rawContent, sandboxId, session?.access_token]);

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

  // Handle modal closing - clean up resources
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        console.log(
          '[FILE VIEWER] handleOpenChange: Modal closing, resetting state.',
        );
        clearSelectedFile();
        setCurrentPath('/workspace'); // Reset path to root
        setFiles([]);
        setInitialPathProcessed(false); // Reset the processed flag
        setIsInitialLoad(true); // Reset the initial load flag
      }
      onOpenChange(open);
    },
    [onOpenChange, clearSelectedFile, setIsInitialLoad],
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

  // Load files when modal opens or path changes - Refined
  useEffect(() => {
    if (!open || !sandboxId) {
      return; // Don't load if modal is closed or no sandbox ID
    }

    const loadFiles = async () => {
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

        console.log(
          `[FILE VIEWER] useEffect[currentPath]: Got ${filesData?.length || 0} files for ${currentPath}`,
        );
        setFiles(filesData || []);

        // After the first load, set isInitialLoad to false
        if (isInitialLoad) {
          setIsInitialLoad(false);
        }
      } catch (error) {
        console.error('Failed to load files:', error);
        toast.error('Failed to load files');
        setFiles([]);
      } finally {
        setIsLoadingFiles(false);
      }
    };

    loadFiles();
    // Dependency: Only re-run when open, sandboxId, or currentPath changes
  }, [open, sandboxId, currentPath, isInitialLoad]);

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

                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshCurrentFile}
                  disabled={isLoadingContent}
                  className="h-8 gap-1"
                  title="Refresh file"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="hidden sm:inline">Refresh</span>
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
