export interface TaskListData {
  tasks?: Task[]
  updated_tasks?: Task[]
  deleted_tasks?: Task[]
  filter?: string
  total?: number
  [key: string]: any
}

export interface Task {
  id: string
  content: string
  status: "pending" | "completed" | "cancelled"
  created_at?: string
  updated_at?: string
  completed_at?: string
}

export function extractTaskListData(
    assistantContent?: string, 
    toolContent?: string
  ): TaskListData | null {
    const parseContent = (content: any): any => {
      if (typeof content === 'string') {
        try {
          return JSON.parse(content);
        } catch (e) {
          return content;
        }
      }
      return content;
    };
  
    const extractFromNewFormat = (content: any): TaskListData | null => {
      const parsedContent = parseContent(content);
      
      if (!parsedContent || typeof parsedContent !== 'object') {
        return null;
      }
  
      // Check for tool_execution format
      if (parsedContent.tool_execution?.result?.output) {
        const output = parsedContent.tool_execution.result.output;
        const outputData = parseContent(output);
        
        if (outputData?.tasks && Array.isArray(outputData.tasks)) {
          return outputData;
        }
      }
  
      // Check for direct tasks array
      if (parsedContent.tasks && Array.isArray(parsedContent.tasks)) {
        return parsedContent;
      }
  
      // Check for nested content
      if (parsedContent.content) {
        return extractFromNewFormat(parsedContent.content);
      }
  
      return null;
    };
  
    // Try tool content first, then assistant content
    return extractFromNewFormat(toolContent) || extractFromNewFormat(assistantContent);
  }