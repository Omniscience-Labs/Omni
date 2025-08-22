'use client';

import { cn } from '@/lib/utils';
import React, { useCallback, useEffect, useRef, useState } from 'react';

// Global Mermaid cache and initialization state
const mermaidCache = new Map<string, string>();
let mermaidInitialized = false;
let mermaidInstance: any = null;

// Cache management
const MAX_CACHE_SIZE = 50; // Limit cache size to prevent memory issues
const CACHE_CLEANUP_THRESHOLD = 60; // Clean up when cache exceeds this size

function cleanupCache() {
  if (mermaidCache.size > CACHE_CLEANUP_THRESHOLD) {
    // Remove oldest entries (simple LRU-like cleanup)
    const entries = Array.from(mermaidCache.entries());
    const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    toDelete.forEach(([key]) => mermaidCache.delete(key));
    
    console.log(`Mermaid cache cleaned up: removed ${toDelete.length} entries`);
  }
}

// Mermaid configuration - defined once
const MERMAID_CONFIG = {
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'inherit',
  fontSize: 14,
  suppressErrorRendering: true,
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
  },
  sequence: {
    useMaxWidth: true,
  },
  gantt: {
    useMaxWidth: true,
  },
  journey: {
    useMaxWidth: true,
  },
  gitGraph: {
    useMaxWidth: true,
  },
  er: {
    useMaxWidth: true,
  },
  pie: {
    useMaxWidth: true,
  },
  quadrantChart: {
    useMaxWidth: true,
  },
  xyChart: {
    useMaxWidth: true,
  },
  mindmap: {
    useMaxWidth: true,
  },
  timeline: {
    useMaxWidth: true,
  },
} as const;

// Initialize Mermaid once globally
async function initializeMermaid() {
  if (mermaidInitialized && mermaidInstance) {
    return mermaidInstance;
  }

  try {
    mermaidInstance = (await import('mermaid')).default;
    mermaidInstance.initialize(MERMAID_CONFIG);
    mermaidInitialized = true;
    return mermaidInstance;
  } catch (error) {
    console.error('Failed to initialize Mermaid:', error);
    throw error;
  }
}

// Generate cache key for Mermaid diagrams
function generateCacheKey(code: string): string {
  // Simple hash function for caching
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `mermaid_${hash.toString(36)}`;
}

export interface MermaidRendererProps {
  code: string;
  className?: string;
  onRenderFailed?: () => void;
}

export function MermaidRenderer({ code, className, onRenderFailed }: MermaidRendererProps) {
  const [mermaidSvg, setMermaidSvg] = useState<string | null>(null);
  const [mermaidFailed, setMermaidFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mermaidRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // Only trigger once
        }
      },
      {
        rootMargin: '100px', // Start loading 100px before entering viewport
        threshold: 0.1,
      }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Optimized Mermaid rendering with caching
  const renderMermaid = useCallback(async (code: string) => {
    if (!code.trim()) return null;

    // Check cache first
    const cacheKey = generateCacheKey(code);
    const cachedSvg = mermaidCache.get(cacheKey);
    if (cachedSvg) {
      return cachedSvg;
    }

    try {
      // Initialize Mermaid (only once globally)
      const mermaid = await initializeMermaid();

      // Generate unique ID for the diagram
      const diagramId = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

      // Render the diagram
      const { svg } = await mermaid.render(diagramId, code);

      // Cache the result with cleanup
      mermaidCache.set(cacheKey, svg);
      cleanupCache();

      return svg;
    } catch (error) {
      console.error('Mermaid rendering failed, falling back to code display:', error);
      throw error;
    }
  }, []);

  // Mermaid rendering effect (only when visible)
  useEffect(() => {
    if (!isVisible) return;

    let mounted = true;

    const performRender = async () => {
      try {
        setIsLoading(true);
        setMermaidFailed(false);
        setMermaidSvg(null);

        const svg = await renderMermaid(code);

        if (mounted && svg) {
          setMermaidSvg(svg);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setMermaidFailed(true);
          setIsLoading(false);
          onRenderFailed?.();
        }
      }
    };

    performRender();

    return () => {
      mounted = false;
    };
  }, [code, isVisible, renderMermaid, onRenderFailed]);

  // Show placeholder before intersection
  if (!isVisible) {
    return (
      <div 
        ref={containerRef}
        className={cn('flex justify-center items-center p-8 text-muted-foreground border border-dashed border-gray-300 dark:border-gray-600 rounded-md', className)}
      >
        <div className="text-sm">Loading Mermaid diagram...</div>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div 
        ref={containerRef}
        className={cn('flex justify-center items-center p-8 text-muted-foreground', className)}
      >
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-current mr-2"></div>
        Rendering Mermaid diagram...
      </div>
    );
  }

  // Show rendered Mermaid diagram
  if (mermaidSvg && !mermaidFailed) {
    return (
      <div 
        ref={containerRef}
        className={cn('flex justify-center my-4', className)}
      >
        <div
          ref={mermaidRef}
          className="mermaid-diagram max-w-full overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: mermaidSvg }}
          style={{
            maxWidth: '100%',
          }}
        />
      </div>
    );
  }

  // If render failed, the parent component should handle fallback
  return null;
}
