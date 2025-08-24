import { useEffect, useRef, useCallback } from 'react';
import { Project } from '@/lib/api';

export function useVncPreloader(project: Project | null) {
  const preloadedIframeRef = useRef<HTMLIFrameElement | null>(null);
  const isPreloadedRef = useRef(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxRetriesRef = useRef(0);
  const isRetryingRef = useRef(false);

  const startPreloading = useCallback((vncUrl: string) => {
    // Prevent multiple simultaneous preload attempts
    if (isRetryingRef.current || isPreloadedRef.current) {
      return;
    }

    isRetryingRef.current = true;

    // Create hidden iframe for preloading
    const iframe = document.createElement('iframe');
    iframe.src = vncUrl;
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    iframe.style.width = '1024px';
    iframe.style.height = '768px';
    iframe.style.border = '0';
    iframe.title = 'VNC Preloader';

    // Set a timeout to detect if iframe fails to load (for 502 errors)
    const loadTimeout = setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      
      // Retry if we haven't exceeded max retries
      if (maxRetriesRef.current < 10) {
        maxRetriesRef.current++;
        isRetryingRef.current = false;
        
        // Exponential backoff: 2s, 3s, 4.5s, 6.75s, etc. (max 15s)
        const delay = Math.min(2000 * Math.pow(1.5, maxRetriesRef.current - 1), 15000);
        retryTimeoutRef.current = setTimeout(() => {
          startPreloading(vncUrl);
        }, delay);
      } else {
        isRetryingRef.current = false;
      }
    }, 5000); // 5 second timeout

    // Handle successful iframe load
    iframe.onload = () => {
      clearTimeout(loadTimeout);
      isPreloadedRef.current = true;
      isRetryingRef.current = false;
      preloadedIframeRef.current = iframe;
    };

    // Handle iframe load errors and 502 responses
    iframe.onerror = () => {
      clearTimeout(loadTimeout);
      
      // Clean up current iframe
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      
      console.log(`[VNC] Connection error for iframe, retrying... (attempt ${maxRetriesRef.current + 1}/10)`);
      
      // Retry if we haven't exceeded max retries
      if (maxRetriesRef.current < 10) {
        maxRetriesRef.current++;
        isRetryingRef.current = false;
        
        // Exponential backoff with jitter to avoid thundering herd
        const baseDelay = 2000 * Math.pow(1.5, maxRetriesRef.current - 1);
        const jitter = Math.random() * 1000;
        const delay = Math.min(baseDelay + jitter, 30000); // Increased max delay
        
        retryTimeoutRef.current = setTimeout(() => {
          startPreloading(vncUrl);
        }, delay);
      } else {
        console.warn(`[VNC] Max retries (10) exceeded for VNC connection`);
        isRetryingRef.current = false;
      }
    };

    // Add to DOM to start loading
    document.body.appendChild(iframe);
  }, []);

  useEffect(() => {
    // Only preload if we have project data with VNC info and haven't started preloading yet
    if (!project?.sandbox?.vnc_preview || !project?.sandbox?.pass || isPreloadedRef.current || isRetryingRef.current) {
      return;
    }

    const vncUrl = `${project.sandbox.vnc_preview}/vnc_lite.html?password=${project.sandbox.pass}&autoconnect=true&scale=local&width=1024&height=768`;

    // Reset retry counter for new project
    maxRetriesRef.current = 0;
    isRetryingRef.current = false;

    // Start the preloading process with a longer delay to let the sandbox fully initialize
    const initialDelay = setTimeout(() => {
      startPreloading(vncUrl);
    }, 5000); // Increased to 5 seconds to give sandbox time to start all services

    // Cleanup function
    return () => {
      clearTimeout(initialDelay);
      
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      
      if (preloadedIframeRef.current && preloadedIframeRef.current.parentNode) {
        preloadedIframeRef.current.parentNode.removeChild(preloadedIframeRef.current);
        preloadedIframeRef.current = null;
      }
      
      isPreloadedRef.current = false;
      isRetryingRef.current = false;
      maxRetriesRef.current = 0;
    };
  }, [project?.sandbox?.vnc_preview, project?.sandbox?.pass, startPreloading]);

  return {
    isPreloaded: isPreloadedRef.current,
    preloadedIframe: preloadedIframeRef.current
  };
} 