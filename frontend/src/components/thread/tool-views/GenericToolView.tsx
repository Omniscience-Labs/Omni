'use client'

import React from 'react';
import { ToolViewProps } from './types';
import { ToolViewWrapper } from './wrapper';
import { Markdown } from '@/components/ui/markdown';

export function GenericToolView(props: ToolViewProps) {
  const { assistantContent, toolContent } = props;

  const formatContent = (content: string | null) => {
    if (!content) return null;

    try {
      const parsedJson = JSON.parse(content);
      return JSON.stringify(parsedJson, null, 2);
    } catch (e) {
      return content;
    }
  };

  const formattedAssistantContent = React.useMemo(
    () => formatContent(assistantContent),
    [assistantContent],
  );
  const formattedToolContent = React.useMemo(
    () => formatContent(toolContent),
    [toolContent],
  );

  return (
    <ToolViewWrapper {...props}>
      <div className="p-4 space-y-4">
        {assistantContent && !props.isStreaming && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Input
            </div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3">
              <Markdown className="text-xs text-zinc-800 dark:text-zinc-300">
                {formattedAssistantContent}
              </Markdown>
            </div>
          </div>
        )}

        {toolContent && !props.isStreaming && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Output
            </div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3">
              <Markdown className="text-xs text-zinc-800 dark:text-zinc-300">
                {formattedToolContent}
              </Markdown>
            </div>
          </div>
        )}
      </div>
    </ToolViewWrapper>
  );
}
