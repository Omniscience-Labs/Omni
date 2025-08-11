'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Document, Page, pdfjs } from 'react-pdf';

// Import styles for annotations and text layer
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker (same as main PDF renderer)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

interface PdfRendererProps {
    url?: string | null;
    className?: string;
}

// Minimal inline PDF preview for attachment grid. No toolbar. First page only.
export function PdfRenderer({ url, className }: PdfRendererProps) {
    const [containerWidth, setContainerWidth] = React.useState<number | null>(null);
    const wrapperRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        if (!wrapperRef.current) return;
        const element = wrapperRef.current;
        const setWidth = () => setContainerWidth(element.clientWidth);
        setWidth();
        const observer = new ResizeObserver(() => setWidth());
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    if (!url) {
        return (
            <div className={cn('w-full h-full flex items-center justify-center bg-muted/20', className)} />
        );
    }

    return (
        <div ref={wrapperRef} className={cn('w-full h-full overflow-auto bg-background', className)}>
            <div className="flex justify-center">
                <Document file={url} className="shadow-none">
                    <Page
                        pageNumber={1}
                        width={containerWidth ?? undefined}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        className="border border-border rounded bg-white"
                    />
                </Document>
            </div>
        </div>
    );
}


