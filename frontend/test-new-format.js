// Test script to verify new format parsing

// Test data for new format
const newFormatToolMessage = {
  tool_name: "create_file",
  xml_tag_name: "create-file",
  parameters: {
    file_path: "test.txt",
    file_contents: "Hello, World!"
  },
  result: {
    success: true,
    output: 'ToolResult(success=True, output="File \'test.txt\' created successfully.")'
  }
};

// Test data for old format
const oldFormatToolMessage = {
  role: "user",
  content: '<tool_result> <create-file> ToolResult(success=True, output="File \'test.txt\' created successfully.") </create-file> </tool_result>'
};

// Helper function to parse tool content (from useToolCalls.ts)
function parseToolContent(content) {
  try {
    // First try to parse as JSON if it's a string
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    
    // Check if it's the new structured format
    if (parsed && typeof parsed === 'object') {
      // New format: { tool_name, xml_tag_name, parameters, result }
      if ('tool_name' in parsed || 'xml_tag_name' in parsed) {
        return {
          toolName: parsed.tool_name || parsed.xml_tag_name || 'unknown',
          parameters: parsed.parameters || {},
          result: parsed.result || null
        };
      }
      
      // Check if it has a content field that might contain the structured data
      if ('content' in parsed && typeof parsed.content === 'object') {
        const innerContent = parsed.content;
        if ('tool_name' in innerContent || 'xml_tag_name' in innerContent) {
          return {
            toolName: innerContent.tool_name || innerContent.xml_tag_name || 'unknown',
            parameters: innerContent.parameters || {},
            result: innerContent.result || null
          };
        }
      }
    }
  } catch (e) {
    // Continue with old format parsing
  }
  
  return null;
}

// Test new format
console.log('Testing new format:');
const newFormatParsed = parseToolContent(newFormatToolMessage);
console.log('Parsed:', JSON.stringify(newFormatParsed, null, 2));

// Test old format (should return null)
console.log('\nTesting old format:');
const oldFormatParsed = parseToolContent(oldFormatToolMessage);
console.log('Parsed:', oldFormatParsed);

// Test wrapped new format
console.log('\nTesting wrapped new format:');
const wrappedNewFormat = {
  content: newFormatToolMessage
};
const wrappedParsed = parseToolContent(wrappedNewFormat);
console.log('Parsed:', JSON.stringify(wrappedParsed, null, 2));

// Test file operation parsing
console.log('\nTesting file operation parsing:');
const fileOpContent = newFormatToolMessage;
if (fileOpContent.parameters) {
  console.log('File path:', fileOpContent.parameters.file_path);
  console.log('File contents:', fileOpContent.parameters.file_contents);
}

// Test command parsing
console.log('\nTesting command parsing:');
const commandContent = {
  tool_name: "execute_command",
  xml_tag_name: "execute-command",
  parameters: {
    command: "ls -la"
  },
  result: {
    success: true,
    output: 'ToolResult(success=True, output="total 24\\ndrwxr-xr-x 3 user user 4096 Dec 10 10:00 .\\ndrwxr-xr-x 5 user user 4096 Dec 10 09:00 ..", exit_code=0)'
  }
};

if (commandContent.parameters) {
  console.log('Command:', commandContent.parameters.command);
}
if (commandContent.result && commandContent.result.output) {
  const output = commandContent.result.output;
  // Extract exit code
  const exitCodeMatch = output.match(/exit_code=(\d+)/);
  if (exitCodeMatch) {
    console.log('Exit code:', parseInt(exitCodeMatch[1], 10));
  }
  // Extract actual output
  const outputMatch = output.match(/output="([^"]*?)"/);
  if (outputMatch) {
    console.log('Output:', outputMatch[1].replace(/\\n/g, '\n'));
  }
} 