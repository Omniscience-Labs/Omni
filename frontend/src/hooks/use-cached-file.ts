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
      return cached.content;
    }
    console.log(`[FILE CACHE] Fetching fresh content for ${key}`);
    // Fetch fresh content if no cache or expired
    setIsLoading(true);
    try {
      // Use normalized path consistently
      const normalizedPath = normalizePath(filePath || '');
      
      const url = new URL(`${process.env.NEXT_PUBLIC_BACKEND_URL}/sandboxes/${sandboxId}/files/content`);
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
      switch (options.contentType) {
        case 'json':
          content = await response.json();
          break;
        case 'blob':
          content = URL.createObjectURL(await response.blob());
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
      
      // Apply process function if provided
      if (options.processFn) {
        content = options.processFn(content);
      }
      
      // Cache the result
      fileCache.set(key, {
        content,
        timestamp: now,
        type: options.contentType === 'blob' ? 'url' : 'content'
      });
      
      return content;
    } catch (err: any) {
      // Cache the error to prevent repeated failing requests
      fileCache.set(key, {
        content: null,
        timestamp: now,
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
      if (cacheKey && fileCache.get(cacheKey)?.type === 'url') {
        const cachedUrl = fileCache.get(cacheKey)?.content;
        if (typeof cachedUrl === 'string' && cachedUrl.startsWith('blob:')) {
          URL.revokeObjectURL(cachedUrl);
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
    
    // Image files
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(extension || '')) {
      return 'blob';
    }
    
    // Binary files
    if (['pdf', 'zip', 'mp3', 'mp4', 'webm', 'ogg', 'wav'].includes(extension || '')) {
      return 'blob';
    }
    
    // JSON files
    if (extension === 'json') {
      return 'json';
    }
    
    // Default to text for everything else
    return 'text';
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
      const normalizedPath = normalizePath(path);
      const key = getCacheKey(sandboxId, path);
      
      if (fileCache.has(key)) {
        console.log(`[FILE CACHE] Already cached: ${normalizedPath}`);
        return fileCache.get(key)?.content;
      }
      
      console.log(`[FILE CACHE] Preloading file: ${normalizedPath}`);
      
      try {        
        const url = new URL(`${process.env.NEXT_PUBLIC_BACKEND_URL}/sandboxes/${sandboxId}/files/content`);
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
          content = URL.createObjectURL(blob);
          type = 'url';
          console.log(`[FILE CACHE] Successfully preloaded blob: ${normalizedPath} (${blob.size} bytes)`);
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
  }
};

// Helper function to get a cached file without using the hook
export async function getCachedFile(
  sandboxId: string,
  filePath: string,
  options: {
    token?: string;
    contentType?: 'json' | 'text' | 'blob' | 'arrayBuffer' | 'base64';
    force?: boolean;
  } = {}
): Promise<any> {
  const contentType = options.contentType || 'text';
  const key = getCacheKey(sandboxId, filePath);
  const startTime = performance.now();
  
  // Check cache first unless force refresh requested
  if (!options.force && fileCache.has(key)) {
    const cached = fileCache.get(key);
    if (cached && cached.type !== 'error') {
      console.log(`[FILE CACHE] Cache hit for ${filePath} (${contentType})`);
      return cached.content;
    }
  }
  
  console.log(`[FILE CACHE] Cache miss or force refresh for ${filePath} (${contentType})`);
  
  // Get token from options or localStorage if not provided
  let token = options.token;
  if (!token) {
    try {
      const sessionData = localStorage.getItem('auth');
      if (sessionData) {
        const session = JSON.parse(sessionData);
        token = session.access_token;
      }
    } catch (err) {
      console.error('[FILE CACHE] Failed to get auth token from localStorage:', err);
    }
  }
  
  // Throw error if no token available
  if (!token) {
    console.error('[FILE CACHE] Authentication token missing for file:', filePath);
    throw new Error('Authentication token required to fetch file content');
  }
  
  // Fetch fresh content
  try {
    const normalizedPath = normalizePath(filePath);
    
    console.log(`[FILE CACHE] Fetching file from API: ${normalizedPath}`);
    const url = new URL(`${process.env.NEXT_PUBLIC_BACKEND_URL}/sandboxes/${sandboxId}/files/content`);
    url.searchParams.append('path', normalizedPath);
    
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`
      },
    });
    
    if (!response.ok) {
      console.error(`[FILE CACHE] API Error: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
    }
    
    // Process content based on contentType
    let content;
    switch (contentType) {
      case 'json':
        content = await response.json();
        break;
      case 'blob':
        content = URL.createObjectURL(await response.blob());
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
    
    // Cache the result
    fileCache.set(key, {
      content,
      timestamp: Date.now(),
      type: contentType === 'blob' ? 'url' : 'content'
    });
    
    const fetchTime = Math.round(performance.now() - startTime);
    console.log(`[FILE CACHE] Fetched and cached ${filePath} in ${fetchTime}ms`);
    
    return content;
  } catch (err) {
    // Cache the error
    console.error(`[FILE CACHE] Error fetching ${filePath}:`, err);
    fileCache.set(key, {
      content: null,
      timestamp: Date.now(),
      type: 'error'
    });
    
    throw err;
  }
} 