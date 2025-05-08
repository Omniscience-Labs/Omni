'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Code, Monitor, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HtmlRendererProps {
    content: string;
    previewUrl: string;
    className?: string;
}

/**
 * HTML renderer that supports both preview (iframe) and code view modes
 */
export function HtmlRenderer({
    content,
    previewUrl,
    className
}: HtmlRendererProps) {
    const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');

    return (
        <div className={cn('w-full h-full flex flex-col', className)}>
            {/* Toggle controls */}
            <div className="bg-muted/50 border-b border-border p-1 flex justify-end gap-1">
                <Button
                    variant={viewMode === 'preview' ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setViewMode('preview')}
                >
                    <Monitor className="h-3.5 w-3.5 mr-1" />
                    Preview
                </Button>
                <Button
                    variant={viewMode === 'code' ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setViewMode('code')}
                >
                    <Code className="h-3.5 w-3.5 mr-1" />
                    Code
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 px-0"
                    onClick={() => window.open(previewUrl, '_blank')}
                    title="Open in new tab"
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Content area */}
            <div className="flex-1 min-h-0 relative">
                {viewMode === 'preview' ? (
                    <div className="w-full h-full">
                        <iframe
                            srcDoc={content}
                            title="HTML Preview"
                            className="w-full h-full border-0"
                            sandbox="allow-same-origin allow-scripts"
                        />
                    </div>
                ) : (
                    <ScrollArea className="w-full h-full">
                        <pre className="p-4 overflow-auto">
                            <code className="text-sm">{content}</code>
                        </pre>
                    </ScrollArea>
                )}
            </div>
        </div>
    );
} 