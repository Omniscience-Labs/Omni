import React from 'react';
import { ToolViewProps } from '../types';
import { extractToolData } from '../utils';
import { PresentationViewer } from './PresentationViewer';

interface CreateSlideData {
  message: string;
  presentation_name: string;
  presentation_path: string;
  slide_number: number;
  slide_title: string;
  slide_file: string;
  preview_url: string;
  total_slides: number;
  note?: string;
  presentation_title?: string;
}

export function CreateSlideToolView({
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
  name,
  project,
}: ToolViewProps) {
  // Extract slide data from tool output
  let slideData: CreateSlideData | null = null;
  
  try {
    const { toolResult } = extractToolData(toolContent);
    if (toolResult && toolResult.toolOutput) {
      const output = toolResult.toolOutput;
      if (typeof output === 'string') {
        try {
          slideData = JSON.parse(output);
        } catch (e) {
          console.error('Failed to parse tool output:', e);
        }
      } else {
        slideData = output as unknown as CreateSlideData;
      }
    }
  } catch (e) {
    console.error('Error parsing slide data:', e);
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
      title="Slide Created"
      currentSlideNumber={slideData?.slide_number}
      presentationPath={slideData?.presentation_path}
      presentationName={slideData?.presentation_name}
    />
  );
}
