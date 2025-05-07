'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

/**
 * Renders markdown content with proper formatting and scrolling
 */
export function MarkdownRenderer({
    content,
    className
}: MarkdownRendererProps) {
    return (
        <ScrollArea className={cn('w-full h-full relative', className)}>
            <div className="p-4 prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        // Simple component mapping for basic styling
                        h1: ({ node, ...props }) => <h1 className="text-2xl font-bold my-4" {...props} />,
                        h2: ({ node, ...props }) => <h2 className="text-xl font-bold my-3" {...props} />,
                        h3: ({ node, ...props }) => <h3 className="text-lg font-bold my-2" {...props} />,
                        a: ({ node, ...props }) => <a className="text-primary hover:underline" {...props} />,
                        p: ({ node, ...props }) => <p className="my-2" {...props} />,
                        ul: ({ node, ...props }) => <ul className="list-disc pl-5 my-2" {...props} />,
                        ol: ({ node, ...props }) => <ol className="list-decimal pl-5 my-2" {...props} />,
                        li: ({ node, ...props }) => <li className="my-1" {...props} />,
                        blockquote: ({ node, ...props }) => (
                            <blockquote className="border-l-4 border-muted pl-4 italic my-2" {...props} />
                        ),
                        img: ({ node, ...props }) => (
                            <img className="max-w-full h-auto rounded-md my-2" {...props} alt={props.alt || ''} />
                        ),
                        pre: ({ node, ...props }) => <pre className="p-2 my-2 bg-muted rounded-md overflow-auto" {...props} />,
                        code: ({ node, className, children, ...props }: any) => {
                            // Check if it's an inline code block
                            const isInline = !className || !/language-(\w+)/.test(className || '');

                            return isInline ? (
                                <code className="bg-muted px-1 py-0.5 rounded text-sm" {...props}>
                                    {children}
                                </code>
                            ) : (
                                <code className={cn("block p-2 text-sm overflow-x-auto", className)} {...props}>
                                    {children}
                                </code>
                            );
                        }
                    }}
                >
                    {content}
                </ReactMarkdown>
            </div>
        </ScrollArea>
    );
} 