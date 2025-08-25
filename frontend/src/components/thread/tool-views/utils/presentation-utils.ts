/**
 * Utility functions for handling presentation slide file paths
 */

/**
 * Validates and extracts presentation info from a file path in a single operation
 * @param filePath - The file path to validate and extract information from
 * @returns Object containing validation result and extracted data
 */
export function parsePresentationSlidePath(filePath: string | null): {
  isValid: boolean;
  presentationName: string | null;
  slideNumber: number | null;
} {
  if (!filePath) {
    return { isValid: false, presentationName: null, slideNumber: null };
  }
  
  const match = filePath.match(/^presentations\/([^\/]+)\/slide_(\d+)\.html$/i);
  if (match) {
    return {
      isValid: true,
      presentationName: match[1],
      slideNumber: parseInt(match[2], 10)
    };
  }
  
  return { isValid: false, presentationName: null, slideNumber: null };
}

/**
 * Creates modified tool content for PresentationViewer from presentation slide data
 * @param presentationName - Name of the presentation
 * @param filePath - Path to the slide file
 * @param slideNumber - Slide number
 * @returns JSON stringified tool content that matches expected structure
 */
export function createPresentationViewerToolContent(
  presentationName: string,
  filePath: string,
  slideNumber: number
): string {
  const mockToolOutput = {
    presentation_name: presentationName,
    presentation_path: filePath,
    slide_number: slideNumber,
    presentation_title: `Slide ${slideNumber}`
  };

  return JSON.stringify({
    result: {
      output: JSON.stringify(mockToolOutput),
      success: true
    },
    tool_name: 'presentation-viewer'
  });
}
