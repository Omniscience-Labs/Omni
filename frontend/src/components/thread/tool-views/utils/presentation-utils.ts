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

/**
 * Downloads a presentation as PDF
 * @param sandboxUrl - The sandbox URL for the API endpoint
 * @param presentationPath - The path to the presentation in the workspace
 * @param presentationName - The name of the presentation for the downloaded file
 * @returns Promise that resolves when download is complete
 */
export async function downloadPresentationAsPDF(
  sandboxUrl: string, 
  presentationPath: string, 
  presentationName: string
): Promise<void> {
  try {
    const response = await fetch(`${sandboxUrl}/presentation/convert-to-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        presentation_path: presentationPath,
        download: true
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to download PDF');
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${presentationName}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading PDF:', error);
    throw error; // Re-throw to allow calling code to handle
  }
}

/**
 * Downloads a presentation as PPTX
 * @param sandboxUrl - The sandbox URL for the API endpoint
 * @param presentationPath - The path to the presentation in the workspace
 * @param presentationName - The name of the presentation for the downloaded file
 * @returns Promise that resolves when download is complete
 */
export async function downloadPresentationAsPPTX(
  sandboxUrl: string, 
  presentationPath: string, 
  presentationName: string
): Promise<void> {
  try {
    const response = await fetch(`${sandboxUrl}/presentation/convert-to-pptx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        presentation_path: presentationPath,
        download: true
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to download PPTX');
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${presentationName}.pptx`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading PPTX:', error);
    throw error; // Re-throw to allow calling code to handle
  }
}
