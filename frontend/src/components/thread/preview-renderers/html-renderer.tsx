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