export type DiffType = 'unchanged' | 'added' | 'removed';

export interface LineDiff {
  type: DiffType;
  oldLine: string | null;
  newLine: string | null;
  lineNumber: number;
}

export interface CharDiffPart {
  text: string;
  type: DiffType;
}

export interface DiffStats {
  additions: number;
  deletions: number;
}

export interface ExtractedData {
  filePath: string | null;
  oldStr: string | null;
  newStr: string | null;
  success?: boolean;
  timestamp?: string;
}


export const extractFromNewFormat = (content: any): ExtractedData => {
  if (!content) {
    return { filePath: null, oldStr: null, newStr: null };
  }

  if (typeof content === 'string') {
    // Only try to parse if it looks like JSON
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        console.debug('StrReplaceToolView: Attempting to parse JSON string:', content.substring(0, 100) + '...');
        const parsed = JSON.parse(content);
        console.debug('StrReplaceToolView: Successfully parsed JSON:', parsed);
        return extractFromNewFormat(parsed);
      } catch (error) {
        console.error('StrReplaceToolView: JSON parse error:', error, 'Content:', content.substring(0, 200));
        return { filePath: null, oldStr: null, newStr: null };
      }
    } else {
      console.debug('StrReplaceToolView: String content does not look like JSON, skipping parse');
      return { filePath: null, oldStr: null, newStr: null };
    }
  }

  if (typeof content !== 'object') {
    return { filePath: null, oldStr: null, newStr: null };
  }

  if ('tool_execution' in content && typeof content.tool_execution === 'object') {
    const toolExecution = content.tool_execution;
    const args = toolExecution.arguments || {};
    
    console.debug('StrReplaceToolView: Extracted from new format:', {
      filePath: args.file_path,
      oldStr: args.old_str ? `${args.old_str.substring(0, 50)}...` : null,
      newStr: args.new_str ? `${args.new_str.substring(0, 50)}...` : null,
      success: toolExecution.result?.success
    });
    
    return {
      filePath: args.file_path || null,
      oldStr: args.old_str || null,
      newStr: args.new_str || null,
      success: toolExecution.result?.success,
      timestamp: toolExecution.execution_details?.timestamp
    };
  }

  if ('role' in content && 'content' in content && typeof content.content === 'string') {
    console.debug('StrReplaceToolView: Found role/content structure with string content, parsing...');
    return extractFromNewFormat(content.content);
  }

  if ('role' in content && 'content' in content && typeof content.content === 'object') {
    console.debug('StrReplaceToolView: Found role/content structure with object content');
    return extractFromNewFormat(content.content);
  }

  return { filePath: null, oldStr: null, newStr: null };
};


export const extractFromLegacyFormat = (content: any, extractToolData: any, extractFilePath: any, extractStrReplaceContent: any): ExtractedData => {
  const assistantToolData = extractToolData(content);
  
  if (assistantToolData.toolResult) {
    const args = assistantToolData.arguments || {};
    
    console.debug('StrReplaceToolView: Extracted from legacy format (extractToolData):', {
      filePath: assistantToolData.filePath || args.file_path,
      oldStr: args.old_str ? `${args.old_str.substring(0, 50)}...` : null,
      newStr: args.new_str ? `${args.new_str.substring(0, 50)}...` : null
    });
    
    return {
      filePath: assistantToolData.filePath || args.file_path || null,
      oldStr: args.old_str || null,
      newStr: args.new_str || null
    };
  }

  const legacyFilePath = extractFilePath(content);
  const strReplaceContent = extractStrReplaceContent(content);
  
  console.debug('StrReplaceToolView: Extracted from legacy format (fallback):', {
    filePath: legacyFilePath,
    oldStr: strReplaceContent.oldStr ? `${strReplaceContent.oldStr.substring(0, 50)}...` : null,
    newStr: strReplaceContent.newStr ? `${strReplaceContent.newStr.substring(0, 50)}...` : null
  });
  
  return {
    filePath: legacyFilePath,
    oldStr: strReplaceContent.oldStr,
    newStr: strReplaceContent.newStr
  };
};


export const parseNewlines = (text: string): string => {
  return text.replace(/\\n/g, '\n');
};


export const generateLineDiff = (oldText: string, newText: string): LineDiff[] => {
  const parsedOldText = parseNewlines(oldText);
  const parsedNewText = parseNewlines(newText);
  
  const oldLines = parsedOldText.split('\n');
  const newLines = parsedNewText.split('\n');
  
  const diffLines: LineDiff[] = [];
  const maxLines = Math.max(oldLines.length, newLines.length);
  
  for (let i = 0; i < maxLines; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : null;
    const newLine = i < newLines.length ? newLines[i] : null;
    
    if (oldLine === newLine) {
      diffLines.push({ type: 'unchanged', oldLine, newLine, lineNumber: i + 1 });
    } else {
      if (oldLine !== null) {
        diffLines.push({ type: 'removed', oldLine, newLine: null, lineNumber: i + 1 });
      }
      if (newLine !== null) {
        diffLines.push({ type: 'added', oldLine: null, newLine, lineNumber: i + 1 });
      }
    }
  }
  
  return diffLines;
};

export const generateCharDiff = (oldText: string, newText: string): CharDiffPart[] => {
  const parsedOldText = parseNewlines(oldText);
  const parsedNewText = parseNewlines(newText);
  
  let prefixLength = 0;
  while (
    prefixLength < parsedOldText.length &&
    prefixLength < parsedNewText.length &&
    parsedOldText[prefixLength] === parsedNewText[prefixLength]
  ) {
    prefixLength++;
  }

  let oldSuffixStart = parsedOldText.length;
  let newSuffixStart = parsedNewText.length;
  while (
    oldSuffixStart > prefixLength &&
    newSuffixStart > prefixLength &&
    parsedOldText[oldSuffixStart - 1] === parsedNewText[newSuffixStart - 1]
  ) {
    oldSuffixStart--;
    newSuffixStart--;
  }

  const parts: CharDiffPart[] = [];

  if (prefixLength > 0) {
    parts.push({
      text: parsedOldText.substring(0, prefixLength),
      type: 'unchanged',
    });
  }

  if (oldSuffixStart > prefixLength) {
    parts.push({
      text: parsedOldText.substring(prefixLength, oldSuffixStart),
      type: 'removed',
    });
  }
  if (newSuffixStart > prefixLength) {
    parts.push({
      text: parsedNewText.substring(prefixLength, newSuffixStart),
      type: 'added',
    });
  }

  if (oldSuffixStart < parsedOldText.length) {
    parts.push({
      text: parsedOldText.substring(oldSuffixStart),
      type: 'unchanged',
    });
  }

  return parts;
};

export const calculateDiffStats = (lineDiff: LineDiff[]): DiffStats => {
  return {
    additions: lineDiff.filter(line => line.type === 'added').length,
    deletions: lineDiff.filter(line => line.type === 'removed').length
  };
};