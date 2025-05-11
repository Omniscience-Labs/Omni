'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/AuthProvider';
import { FileCache, getCachedFile } from './use-cached-file';

// Query keys for image content
export const imageContentKeys = {
  all: ['image-content'] as const,
  byPath: (sandboxId: string, path: string) => 
    [...imageContentKeys.all, sandboxId, path] as const,
};

/**
 * Hook to fetch and cache image content with authentication
 */
export function useImageContent(sandboxId?: string, filePath?: string) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { session } = useAuth();

  useEffect(() => {
    if (!sandboxId || !filePath || !session?.access_token) {
      setImageUrl(null);
      return;
    }

    const cacheKey = `${sandboxId}:${filePath}:blob`;
    
    // Check if image is already in cache
    const cached = FileCache.get(cacheKey);
    if (cached) {
      if (typeof cached === 'string' && cached.startsWith('blob:')) {
        setImageUrl(cached);
      } else if (cached instanceof Blob) {
        // If we somehow got a raw blob object, create a URL from it
        const blobUrl = URL.createObjectURL(cached);
        setImageUrl(blobUrl);
        // Store the URL back in the cache
        FileCache.set(cacheKey, blobUrl);
      } else {
        setImageUrl(String(cached));
      }
      return;
    }

    // Otherwise, load and cache the image
    setIsLoading(true);
    getCachedFile(sandboxId, filePath, {
      token: session.access_token,
      contentType: 'blob'
    })
      .then(blobUrl => {
        setImageUrl(blobUrl);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load image:', err);
        setError(err);
        setIsLoading(false);
      });

    // Clean up function to handle component unmount
    return () => {
      // We don't revoke the objectURL here because it's cached
      // The URLs will be revoked when the cache entry is replaced or on page unload
    };
  }, [sandboxId, filePath, session?.access_token]);

  return {
    data: imageUrl,
    isLoading,
    error
  };
}