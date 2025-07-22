import React from 'react';
import { motion } from 'framer-motion';
import { CircleDashed } from 'lucide-react';
import { extractToolNameFromStream } from '@/components/thread/tool-views/xml-parser';
import { getToolIcon, getUserFriendlyToolName } from '@/components/thread/utils';

interface ShowToolStreamProps {
    content: string;
}

export const ShowToolStream: React.FC<ShowToolStreamProps> = ({ content }) => {
    const toolName = extractToolNameFromStream(content);

    if (!toolName) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-2 mb-1"
            >
                <div className="animate-shimmer inline-flex items-center gap-1.5 py-1 px-1 pr-1.5 text-xs font-medium text-primary bg-primary/10 rounded-lg border border-primary/20">
                    <div className='border-2 bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 flex items-center justify-center p-0.5 rounded-sm border-neutral-400/20 dark:border-neutral-600'>
                        <CircleDashed className="h-3.5 w-3.5 text-primary flex-shrink-0 animate-spin animation-duration-2000" />
                    </div>
                    <span className="font-mono text-xs text-primary">Processing...</span>
                </div>
            </motion.div>
        );
    }

    const IconComponent = getToolIcon(toolName);
    const displayName = getUserFriendlyToolName(toolName);

    return (
        <motion.div
            layoutId={`tool-stream-${toolName}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-2 mb-1"
        >
            <div className="animate-shimmer inline-flex items-center gap-1.5 py-1 px-1 pr-1.5 text-xs font-medium text-primary bg-primary/10 rounded-lg border border-primary/20">
                <div className='border-2 bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 flex items-center justify-center p-0.5 rounded-sm border-neutral-400/20 dark:border-neutral-600'>
                    <CircleDashed className="h-3.5 w-3.5 text-primary flex-shrink-0 animate-spin animation-duration-2000" />
                </div>
                <span className="font-mono text-xs text-primary">{displayName}</span>
                <span className="ml-1 text-primary/70 text-xs">running...</span>
            </div>
        </motion.div>
    );
}; 