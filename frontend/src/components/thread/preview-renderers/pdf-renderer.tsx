'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import '@/lib/polyfills'; // Import polyfill for Promise.withResolvers
import { Document, Page, pdfjs } from 'react-pdf';

// Import styles for annotations and text layer
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Internal component that uses react-pdf
interface PdfDocumentProps {
    url: string;
    containerWidth: number | null;
}

const PdfDocument = ({ url, containerWidth }: PdfDocumentProps) => {
    const [isLoading, setIsLoading] = React.useState(true);
    const [hasError, setHasError] = React.useState(false);
    
    // Configure PDF.js worker and fonts
    React.useEffect(() => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url,
        ).toString();
        
        // Use CDN for standard fonts to avoid build issues
        if (typeof window !== 'undefined') {
            pdfjs.GlobalWorkerOptions.standardFontDataUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/standard_fonts/';
        }
    }, []);

    const handleLoadSuccess = React.useCallback(() => {
        setIsLoading(false);
        setHasError(false);
    }, []);

    const handleLoadError = React.useCallback((error: Error) => {
        console.error('PDF preview load error:', error);
        setHasError(true);
        setIsLoading(false);
    }, []);

    if (hasError) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-muted/10 rounded border border-border">
                <div className="text-sm text-muted-foreground">Failed to load PDF preview</div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-muted/10 rounded border border-border">
                <div className="text-sm text-muted-foreground">Loading...</div>
            </div>
        );
    }

    return (
        <Document 
            file={url} 
            className="shadow-none"
            onLoadSuccess={handleLoadSuccess}
            onLoadError={handleLoadError}
            options={{
                standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/standard_fonts/',
            }}
        >
            <Page
                pageNumber={1}
                width={containerWidth ?? undefined}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="border border-border rounded bg-white"
            />
        </Document>
    );
};

// Dynamic import to avoid SSR issues
const DynamicPdfDocument = dynamic(() => Promise.resolve(PdfDocument), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center bg-muted/20">
            <div className="text-sm text-muted-foreground">Loading PDF...</div>
        </div>
    )
});

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
                <DynamicPdfDocument url={url} containerWidth={containerWidth} />
            </div>
        </div>
    );
}


