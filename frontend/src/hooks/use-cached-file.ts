import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';

// Global cache to persist between component mounts
const fileCache = new Map<string, {
  content: any; // Could be string content, blob URLs, or other file data
  timestamp: number;
  type: 'content' | 'url' | 'error';
}>();

// Cache expiration time in milliseconds (default: 5 minutes)
const CACHE_EXPIRATION = 5 * 60 * 1000;

/**
 * Normalize a file path to ensure consistent caching
 * @param path The file path to normalize
 * @returns Normalized path starting with /workspace/
 */
function normalizePath(path: string): string {
  if (!path) return '/workspace';
  
  // Ensure path starts with /workspace
  if (!path.startsWith('/workspace')) {
    path = `/workspace/${path.startsWith('/') ? path.substring(1) : path}`;
  }
  
  // Handle Unicode escape sequences like \u0308
  try {
    path = path.replace(/\\u([0-9a-fA-F]{4})/g, (_, hexCode) => {
      return String.fromCharCode(parseInt(hexCode, 16));
    });
  } catch (e) {
    console.error('Error processing Unicode escapes in path:', e);
  }
  
  return path;
}

/**
 * Generate a consistent cache key for a file
 * @param sandboxId The sandbox ID
 * @param path The file path (will be normalized)
 * @returns A consistent cache key
 */
function getCacheKey(sandboxId: string, path: string): string {
  const normalizedPath = normalizePath(path);
  return `${sandboxId}:${normalizedPath}`;
}

/**
 * Custom hook that fetches and caches file content with authentication support
 * @param sandboxId The sandbox ID to fetch from
 * @param filePath The path to the file
 * @param options Additional options including cache expiration and content type
 * @returns The cached or freshly fetched file content
 */
export function useCachedFile<T = string>(
  sandboxId?: string,
  filePath?: string,
  options: {
    expiration?: number;
    contentType?: 'json' | 'text' | 'blob' | 'arrayBuffer' | 'base64';
    processFn?: (data: any) => T;
  } = {}
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { session } = useAuth();

  // Calculate cache key from sandbox ID and file path
  const cacheKey = sandboxId && filePath
    ? getCacheKey(sandboxId, filePath)
    : null;

  // Create a cached fetch function
  const getCachedFile = async (key: string, force = false) => {
    // Check if we have a valid cached version
    const cached = fileCache.get(key);
    const now = Date.now();
    const expiration = options.expiration || CACHE_EXPIRATION;
    
    if (!force && cached && now - cached.timestamp < expiration) {
      console.log(`[FILE CACHE] Returning cached content for ${key}`);
      
      // Special handling for cached blobs - return a fresh URL
      if (FileCache.isImageFile(filePath || '') && cached.content instanceof Blob) {
        console.log(`[FILE CACHE] Creating fresh blob URL for cached image`);
        const blobUrl = URL.createObjectURL(cached.content);
        // Update the cache with the new blob URL to avoid creating multiple URLs for the same blob
        console.log(`[FILE CACHE] Updating cache with fresh blob URL: ${blobUrl}`);
        fileCache.set(key, {
          content: blobUrl,
          timestamp: now,
          type: 'url'
        });
        return blobUrl;
      } else if (cached.type === 'url' && typeof cached.content === 'string' && cached.content.startsWith('blob:')) {
        // For blob URLs, verify they're still valid
        try {
          // This is a simple check that won't actually fetch the blob, just verify the URL is valid
          const xhr = new XMLHttpRequest();
          xhr.open('HEAD', cached.content, false);
          xhr.send();
          return cached.content;
        } catch (err) {
          console.warn(`[FILE CACHE] Cached blob URL is invalid, will refetch: ${err}`);
          // Force a refetch
          force = true;
        }
      }
      
      return cached.content;
    }
    console.log(`[FILE CACHE] Fetching fresh content for ${key}`);
    // Fetch fresh content if no cache or expired
    setIsLoading(true);
    try {
      // Use normalized path consistently
      const normalizedPath = normalizePath(filePath || '');
      
      const url = new URL(`${process.env.NEXT_PUBLIC_BACKEND_URL}/sandboxes/${sandboxId}/files/content`);
      
      // Properly encode the path parameter for UTF-8 support
      url.searchParams.append('path', normalizedPath);
      
      // Fetch with authentication
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
      }
      
      // Process content based on contentType
      let content;
      let cacheType: 'content' | 'url' | 'error' = 'content';
      
      // Check if this is an image file
      const shouldHandleAsImage = FileCache.isImageFile(filePath || '') && (options.contentType === 'blob' || !options.contentType);
      
      switch (options.contentType) {
        case 'json':
          content = await response.json();
          break;
        case 'blob':
          // Get the blob
          const blob = await response.blob();
          
          if (shouldHandleAsImage) {
            // For images, store the raw blob in cache
            console.log(`[FILE CACHE] Storing raw blob for image in cache (${blob.size} bytes)`);
            
            // Store the raw blob in cache
            fileCache.set(key, {
              content: blob,
              timestamp: now,
              type: 'content'
            });
            
            // But return a URL for immediate use
            const blobUrl = URL.createObjectURL(blob);
            console.log(`[FILE CACHE] Created fresh blob URL for immediate use: ${blobUrl}`);
            return blobUrl; // Return early since we've already cached
          } else {
            // For non-images, create and return a blob URL
            content = URL.createObjectURL(blob);
            cacheType = 'url';
          }
          break;
        case 'arrayBuffer':
          content = await response.arrayBuffer();
          break;
        case 'base64':
          const buffer = await response.arrayBuffer();
          content = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          break;
        case 'text':
        default:
          content = await response.text();
          break;
      }
      
      // Only cache if we haven't already cached (for images)
      if (!shouldHandleAsImage || options.contentType !== 'blob') {
        fileCache.set(key, {
          content,
          timestamp: now,
          type: cacheType
        });
      }
      
      return content;
    } catch (err: any) {
      // Cache the error to prevent repeated failing requests
      fileCache.set(key, {
        content: null,
        timestamp: Date.now(),
        type: 'error'
      });
      
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Function to force refresh the cache
  const refreshCache = async () => {
    if (!cacheKey) return null;
    try {
      const freshData = await getCachedFile(cacheKey, true);
      setData(freshData);
      return freshData;
    } catch (err: any) {
      setError(err);
      return null;
    }
  };

  // Function to get data from cache first, then network if needed
  const getFileContent = async () => {
    if (!cacheKey) return;
    
    try {
      // First check if we have cached data
      const cachedItem = fileCache.get(cacheKey);
      if (cachedItem) {
        // Set data from cache immediately
        setData(cachedItem.content);
        
        // If cache is expired, refresh in background
        if (Date.now() - cachedItem.timestamp > (options.expiration || CACHE_EXPIRATION)) {
          getCachedFile(cacheKey, true)
            .then(freshData => setData(freshData))
            .catch(err => console.error("Background refresh failed:", err));
        }
      } else {
        // No cache, load fresh
        setIsLoading(true);
        const content = await getCachedFile(cacheKey);
        setData(content);
      }
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (sandboxId && filePath) {
      getFileContent();
    } else {
      // Reset state if we don't have necessary params
      setData(null);
      setIsLoading(false);
      setError(null);
    }
    
    // Clean up any blob URLs when component unmounts
    return () => {
      if (cacheKey) {
        const cachedData = fileCache.get(cacheKey);
        if (cachedData?.type === 'url') {
          // Only revoke if it's a URL type (created URL instead of raw blob)
          const cachedUrl = cachedData.content;
          if (typeof cachedUrl === 'string' && cachedUrl.startsWith('blob:')) {
            console.log(`[FILE CACHE][IMAGE DEBUG] Cleaning up blob URL on unmount: ${cachedUrl} for key ${cacheKey}`);
            URL.revokeObjectURL(cachedUrl);
          }
        }
      }
    };
  }, [sandboxId, filePath, options.contentType]);

  // Expose the cache manipulation functions
  return {
    data,
    isLoading,
    error,
    refreshCache,
    getCachedFile: (key?: string, force = false) => {
      return key ? getCachedFile(key, force) : (cacheKey ? getCachedFile(cacheKey, force) : Promise.resolve(null));
    },
    // Helper function for direct cache access
    getFromCache: (key: string) => fileCache.get(key)?.content || null,
    // Static version for direct imports
    cache: fileCache
  };
}

// Static functions for direct cache manipulation without hooks
export const FileCache = {
  get: (key: string) => fileCache.get(key)?.content || null,
  
  set: (key: string, content: any, type: 'content' | 'url' | 'error' = 'content') => {
    fileCache.set(key, {
      content,
      timestamp: Date.now(),
      type
    });
  },
  
  has: (key: string) => fileCache.has(key),
  
  clear: () => fileCache.clear(),
  
  delete: (key: string) => fileCache.delete(key),
  
  // Helper function to determine content type from file extension
  getContentTypeFromPath: (path: string): 'text' | 'blob' | 'json' => {
    const extension = path.split('.').pop()?.toLowerCase();
    
    // Image files and PDFs - ALWAYS return blob
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'pdf'].includes(extension || '')) {
      return 'blob';
    }
    
    // Other binary files
    if (['zip', 'mp3', 'mp4', 'webm', 'ogg', 'wav'].includes(extension || '')) {
      return 'blob';
    }
    
    // JSON files
    if (extension === 'json') {
      return 'json';
    }
    
    // Default to text for everything else
    return 'text';
  },
  
  // Helper function to check if a file is an image
  isImageFile: (path: string): boolean => {
    const extension = path.split('.').pop()?.toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(extension || '');
  },
  
  // Helper function to check if a file is a PDF
  isPdfFile: (path: string): boolean => {
    const extension = path.split('.').pop()?.toLowerCase();
    return extension === 'pdf';
  },
  
  // Helper function to check if a value is a Blob
  isBlob: (value: any): boolean => {
    return value instanceof Blob;
  },
  
  // Helper function to get the correct content type for a file
  getContentType: (path: string, contentType?: 'text' | 'blob' | 'json'): 'text' | 'blob' | 'json' => {
    // If content type is explicitly provided, use it
    if (contentType) {
      return contentType;
    }
    
    // Otherwise determine from file extension
    return FileCache.getContentTypeFromPath(path);
  },
  
  // Preload files into cache for future use
  preload: async (sandboxId: string, filePaths: string[], token?: string | null) => {
    if (!token) {
      // Try to get token from localStorage if not provided
      try {
        const sessionData = localStorage.getItem('auth');
        if (sessionData) {
          const session = JSON.parse(sessionData);
          token = session.access_token;
        }
      } catch (err) {
        console.error('Failed to get auth token from localStorage:', err);
      }
    }
    
    // Skip preloading if no authentication token available
    if (!token) {
      console.warn('Cannot preload files: No authentication token available');
      return [];
    }
    
    console.log(`[FILE CACHE] Preloading ${filePaths.length} files for sandbox ${sandboxId}`);
    
    return Promise.all(filePaths.map(async (path) => {
      // Handle Unicode escape sequences in paths
      path = path.replace(/\\u([0-9a-fA-F]{4})/g, (_, hexCode) => {
        return String.fromCharCode(parseInt(hexCode, 16));
      });
      
      const normalizedPath = normalizePath(path);
      const key = getCacheKey(sandboxId, path);
      
      if (fileCache.has(key)) {
        console.log(`[FILE CACHE] Already cached: ${normalizedPath}`);
        return fileCache.get(key)?.content;
      }
      
      console.log(`[FILE CACHE] Preloading file: ${normalizedPath}`);
      
      try {        
        const url = new URL(`${process.env.NEXT_PUBLIC_BACKEND_URL}/sandboxes/${sandboxId}/files/content`);
        
        // Properly encode the path parameter for UTF-8 support
        url.searchParams.append('path', normalizedPath);
        
        const response = await fetch(url.toString(), {
          headers: {
            'Authorization': `Bearer ${token}`
          },
        });
        
        if (!response.ok) throw new Error(`Failed to preload file: ${response.status}`);
        
        // Determine how to process the content based on file type
        const extension = path.split('.').pop()?.toLowerCase();
        let content;
        let type: 'content' | 'url' = 'content';
        
        // Binary/image files - use blob URL
        if (['png', 'jpg', 'jpeg', 'gif', 'pdf', 'mp3', 'mp4'].includes(extension || '')) {
          const blob = await response.blob();
          if (FileCache.isImageFile(path)) {
            // For images, store the raw blob
            content = blob;
            type = 'content';
            console.log(`[FILE CACHE] Successfully preloaded image blob: ${normalizedPath} (${blob.size} bytes)`);
          } else {
            // For other binary files, store the URL
            content = URL.createObjectURL(blob);
            type = 'url';
            console.log(`[FILE CACHE] Successfully preloaded blob URL: ${normalizedPath} (${blob.size} bytes)`);
          }
        } 
        // Json files
        else if (extension === 'json') {
          content = await response.json();
          console.log(`[FILE CACHE] Successfully preloaded JSON: ${normalizedPath}`);
        } 
        // Default to text
        else {
          content = await response.text();
          console.log(`[FILE CACHE] Successfully preloaded text: ${normalizedPath} (${content.length} bytes)`);
        }
        
        fileCache.set(key, {
          content,
          timestamp: Date.now(),
          type
        });
        
        return content;
      } catch (err) {
        console.error(`[FILE CACHE] Failed to preload ${normalizedPath}:`, err);
        fileCache.set(key, {
          content: null,
          timestamp: Date.now(),
          type: 'error'
        });
        return null;
      }
    }));
  },
  
  // Helper function to get the correct MIME type for a file
  getMimeType: (path: string): string => {
    const extension = path.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return 'application/pdf';
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'gif':
        return 'image/gif';
      case 'svg':
        return 'image/svg+xml';
      case 'webp':
        return 'image/webp';
      case 'bmp':
        return 'image/bmp';
      case 'ico':
        return 'image/x-icon';
      default:
        return 'application/octet-stream';
    }
  }
};

// Update the getCachedFile function to ensure PDFs are always handled as blobs
export async function getCachedFile(
  sandboxId: string,
  filePath: string,
  options: {
    contentType?: 'json' | 'text' | 'blob' | 'arrayBuffer' | 'base64';
    force?: boolean;
    token?: string;
  } = {}
): Promise<any> {
  // Always use blob for images and PDFs
  const contentType = FileCache.isImageFile(filePath) || FileCache.isPdfFile(filePath) 
    ? 'blob' 
    : (options.contentType || 'text');
  
  // First ensure the file path has any Unicode escape sequences properly handled
  filePath = filePath.replace(/\\u([0-9a-fA-F]{4})/g, (_, hexCode) => {
    return String.fromCharCode(parseInt(hexCode, 16));
  });
  
  const key = getCacheKey(sandboxId, filePath);
  const startTime = performance.now();
  
  // Check if this is an image or PDF file
  const isImageFile = FileCache.isImageFile(filePath);
  const isPdfFile = FileCache.isPdfFile(filePath);
  
  if (isImageFile) {
    console.log(`[FILE CACHE][IMAGE DEBUG] getCachedFile called for image: ${filePath}, force: ${options.force}`);
  } else if (isPdfFile) {
    console.log(`[FILE CACHE] getCachedFile called for PDF: ${filePath}, force: ${options.force}, key: ${key}`);
  }
  
  // Check cache first unless force refresh requested
  if (!options.force && fileCache.has(key)) {
    const cached = fileCache.get(key);
    if (cached && cached.type !== 'error') {
      if (isImageFile || isPdfFile) {
        console.log(`[FILE CACHE] Cached content type for ${isPdfFile ? 'PDF' : 'image'}: ${typeof cached.content}`);
        console.log(`[FILE CACHE] Cached content is Blob: ${cached.content instanceof Blob}`);
        
        // For images and PDFs, we should always have a Blob in cache
        if (cached.content instanceof Blob) {
          console.log(`[FILE CACHE] Creating new blob URL from cached ${isPdfFile ? 'PDF' : 'image'} blob (${cached.content.size} bytes)`);
          const blobUrl = URL.createObjectURL(cached.content);
          console.log(`[FILE CACHE] Created fresh blob URL: ${blobUrl}`);
          return blobUrl;
        } else {
          // If we somehow have a string or other type in cache, force a refresh
          console.log(`[FILE CACHE] Invalid cache content type for ${isPdfFile ? 'PDF' : 'image'}, forcing refresh`);
          // Continue to fetch fresh content
        }
      } else {
        console.log(`[FILE CACHE] Cache hit for ${filePath} (${contentType})`);
        return cached.content;
      }
    }
  }
  
  // Fetch fresh content
  console.log(`[FILE CACHE] Fetching fresh content for ${sandboxId}:${filePath}`);
  
  try {
    const url = new URL(`${process.env.NEXT_PUBLIC_BACKEND_URL}/sandboxes/${sandboxId}/files/content`);
    const normalizedPath = normalizePath(filePath);
    
    // Properly encode the path parameter for UTF-8 characters
    url.searchParams.append('path', normalizedPath);
    
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${options.token}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
    }
    
    // Process content based on contentType
    let content;
    let cacheType: 'content' | 'url' | 'error' = 'content';
    
    switch (contentType) {
      case 'json':
        content = await response.json();
        break;
      case 'blob':
        // Get the blob
        const blob = await response.blob();
        
        if (isImageFile || isPdfFile) {
          // For images and PDFs, store the raw blob in cache
          console.log(`[FILE CACHE] Storing raw blob for ${isPdfFile ? 'PDF' : 'image'} in cache (${blob.size} bytes, type: ${blob.type})`);
          
          // Verify the blob is the correct type for PDFs
          if (isPdfFile && !blob.type.includes('pdf') && blob.size > 0) {
            console.warn(`[FILE CACHE] PDF blob has generic MIME type: ${blob.type} - will correct it automatically`);
            
            // Check if the content looks like a PDF
            const firstBytes = await blob.slice(0, 10).text();
            if (firstBytes.startsWith('%PDF')) {
              console.log(`[FILE CACHE] Content appears to be a PDF despite incorrect MIME type, proceeding`);
              
              // Create a new blob with the correct type
              const correctedBlob = new Blob([await blob.arrayBuffer()], { type: 'application/pdf' });
              console.log(`[FILE CACHE] Created corrected PDF blob with proper MIME type (${correctedBlob.size} bytes)`);
              
              // Store the corrected blob in cache
              const specificKey = `${sandboxId}:${normalizePath(filePath)}:blob`;
              fileCache.set(specificKey, {
                content: correctedBlob,
                timestamp: Date.now(),
                type: 'content'
              });
              
              // Also update the general key
              fileCache.set(key, {
                content: correctedBlob,
                timestamp: Date.now(),
                type: 'content'
              });
              
              // Return a URL for immediate use
              const blobUrl = URL.createObjectURL(correctedBlob);
              console.log(`[FILE CACHE] Created fresh blob URL for corrected PDF: ${blobUrl}`);
              return blobUrl;
            }
          }
          
          // Store the raw blob in cache - using a more specific key that includes content type
          const specificKey = `${sandboxId}:${normalizePath(filePath)}:blob`;
          fileCache.set(specificKey, {
            content: blob,
            timestamp: Date.now(),
            type: 'content'
          });
          
          // Also update the general key
          fileCache.set(key, {
            content: blob,
            timestamp: Date.now(),
            type: 'content'
          });
          
          // But return a URL for immediate use
          const blobUrl = URL.createObjectURL(blob);
          console.log(`[FILE CACHE] Created fresh blob URL for immediate use: ${blobUrl}`);
          return blobUrl; // Return early since we've already cached
        } else {
          // For other binary files, create and return a blob URL
          content = URL.createObjectURL(blob);
          cacheType = 'url';
        }
        break;
      case 'arrayBuffer':
        content = await response.arrayBuffer();
        break;
      case 'base64':
        const buffer = await response.arrayBuffer();
        content = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        break;
      case 'text':
      default:
        content = await response.text();
        break;
    }
    
    // Only cache if we haven't already cached (for images and PDFs)
    if (!isImageFile && !isPdfFile) {
      fileCache.set(key, {
        content,
        timestamp: Date.now(),
        type: cacheType
      });
    }
    
    return content;
  } catch (err: any) {
    // Cache the error to prevent repeated failing requests
    fileCache.set(key, {
      content: null,
      timestamp: Date.now(),
      type: 'error'
    });
    
    throw err;
  }
} 