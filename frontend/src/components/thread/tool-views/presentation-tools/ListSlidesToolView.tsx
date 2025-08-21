import React from 'react';
import { ToolViewProps } from '../types';
import { extractToolData } from '../utils';
import { PresentationViewer } from './PresentationViewer';

interface ListSlidesData {
  message: string;
  presentation_name: string;
  presentation_title: string;
  slides: any[];
  total_slides: number;
  presentation_path: string;
}

export function ListSlidesToolView({
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
  name,
  project,
}: ToolViewProps) {
  // Extract slides data from tool output
  let slidesData: ListSlidesData | null = null;
  
  try {
    const { toolResult } = extractToolData(toolContent);
    if (toolResult && toolResult.toolOutput) {
      const output = toolResult.toolOutput;
      if (typeof output === 'string') {
        try {
          slidesData = JSON.parse(output);
        } catch (e) {
          console.error('Failed to parse tool output:', e);
        }
      } else {
        slidesData = output as unknown as ListSlidesData;
      }
    }
  } catch (e) {
    console.error('Error parsing slides data:', e);
  }

  return (
    <PresentationViewer
      assistantContent={assistantContent}
      toolContent={toolContent}
      assistantTimestamp={assistantTimestamp}
      toolTimestamp={toolTimestamp}
      isSuccess={isSuccess}
      isStreaming={isStreaming}
      name={name}
      project={project}
      title="Presentation Slides"
      presentationPath={slidesData?.presentation_path}
      presentationName={slidesData?.presentation_name}
    />
  );
}
